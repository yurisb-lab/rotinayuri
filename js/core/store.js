/* Camada de domínio: categorias, tarefas, compromissos, registros, notas,
   entrada, fechamento do dia. Toda a persistência é local (IndexedDB). */

import * as db from './db.js';
import { emit } from './bus.js';
import { iso, today, nowISO, nowTime, addDays, diffDays, minutes } from '../util/date.js';
import * as R from '../features/recurrence.js';
import { normalizeText } from '../features/nlp.js';

export const uid = (p = 'i') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ---------------------------------------------------------------- estado */
const cache = { categories: [], settings: {} };

export const DEFAULT_CATEGORIES = [
  { name: 'Trabalho',   icon: '💼', color: '#4f7fd5' },
  { name: 'Pessoal',    icon: '🙂', color: '#d5734f' },
  { name: 'Igreja',     icon: '⛪', color: '#7a5fd5' },
  { name: 'Família',    icon: '👨‍👩‍👧', color: '#d54f8f' },
  { name: 'Estudos',    icon: '📚', color: '#2f9e6e' },
  { name: 'Fotografia', icon: '📷', color: '#c9a227' },
  { name: 'Casa',       icon: '🏠', color: '#8a8f9e' },
  { name: 'Projetos',   icon: '🚀', color: '#e0552e' },
];

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  weekStart: 0,
  dayStartHour: 6,
  dayEndHour: 22,
  defaultReminders: ['same-day-09:00'],
  notificationsEnabled: false,
  aiEnabled: false,
  aiEndpoint: '',
  aiKey: '',
  aiModel: '',
  lastBackup: null,
  onboarded: false,
  schemaVersion: 1,
};

export const STATUS = {
  pendente:  { label: 'Pendente',    pill: '' },
  andamento: { label: 'Em andamento', pill: 'pill--warn' },
  concluida: { label: 'Concluída',   pill: 'pill--ok' },
  cancelada: { label: 'Cancelada',   pill: 'pill--danger' },
};
export const PRIORITIES = {
  baixa:  { label: 'Baixa',   color: 'var(--c-text-3)' },
  media:  { label: 'Média',   color: 'var(--c-info)' },
  alta:   { label: 'Alta',    color: 'var(--c-warn)' },
  urgente:{ label: 'Urgente', color: 'var(--c-danger)' },
};
export const NOTE_TYPES = {
  nota:     'Nota simples',
  lista:    'Lista',
  ideia:    'Ideia',
  estudo:   'Estudo',
  ata:      'Ata de reunião',
  rascunho: 'Rascunho',
};

/* ------------------------------------------------------------ inicialização */
export async function init() {
  await db.open();
  const cats = await db.getAll('categories');
  if (!cats.length) {
    const seeded = DEFAULT_CATEGORIES.map((c, i) => ({ id: uid('cat'), order: i, ...c }));
    await db.putMany('categories', seeded);
    cache.categories = seeded;
  } else {
    cache.categories = cats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  const rows = await db.getAll('settings');
  cache.settings = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { cache.settings[r.key] = r.value; });
  await migrate();
  return cache;
}

/* ---------------------------------------------------------------- migração
   Roda uma vez por versão de esquema. A v2 semeia os registros de pessoas e
   lugares a partir do que já foi escrito em tarefas, compromissos e registros —
   nada é perdido nem precisa ser digitado de novo. */
async function migrate() {
  const from = cache.settings.schemaVersion || 1;
  if (from >= db.DB_VERSION) return null;
  let seeded = null;
  try {
    if (from < 2) seeded = await seedRegistries();
    await settings.set('schemaVersion', db.DB_VERSION);
  } catch (e) {
    console.warn('Migração incompleta; será tentada de novo na próxima abertura.', e);
  }
  return seeded;
}

/** Extrai pessoas e lugares já mencionados e grava nos registros novos.
    Idempotente: só cria o que ainda não existe, então pode rodar de novo
    depois de restaurar um backup. */
export async function seedRegistries() {
  const [tsk, evt, lg] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('logs'),
  ]);
  const pMap = new Map(), lMap = new Map();
  const bump = (map, name, date) => {
    const key = identityKey(name);
    if (key.length < 2) return;
    const d = date || today();
    const cur = map.get(key);
    if (!cur) map.set(key, { name: String(name).trim(), firstSeen: d, lastSeen: d });
    else {
      if (d < cur.firstSeen) cur.firstSeen = d;
      if (d > cur.lastSeen) cur.lastSeen = d;
    }
  };
  for (const t of tsk) { (t.people || []).forEach(n => bump(pMap, n, t.date)); bump(lMap, t.place, t.date); }
  for (const e of evt) { (e.people || []).forEach(n => bump(pMap, n, e.date)); bump(lMap, e.location, e.date); }
  for (const l of lg) {
    const names = l.people?.length ? l.people : (l.person ? [l.person] : []);
    names.forEach(n => bump(pMap, n, l.date));
    bump(lMap, l.place, l.date);
  }

  const [havePeople, havePlaces] = await Promise.all([db.getAll('people'), db.getAll('places')]);
  const rowsOf = (map, prefix, have) => [...map.entries()]
    .filter(([key]) => !have.has(key))
    .map(([key, v]) => ({ id: uid(prefix), key, name: v.name, aliases: [], note: '',
      firstSeen: v.firstSeen, lastSeen: v.lastSeen }));

  const pRows = rowsOf(pMap, 'per', new Set(havePeople.map(r => r.key)));
  const lRows = rowsOf(lMap, 'plc', new Set(havePlaces.map(r => r.key)));
  await db.putMany('people', pRows);
  await db.putMany('places', lRows);
  if (pRows.length || lRows.length) { emit('people'); emit('places'); emit('data'); }
  return { people: pRows.length, places: lRows.length };
}

/* ------------------------------------------------------------- configurações */
export const settings = {
  all: () => ({ ...cache.settings }),
  get: k => cache.settings[k],
  async set(k, v) {
    cache.settings[k] = v;
    await db.put('settings', { key: k, value: v });
    emit('settings', { key: k, value: v });
    return v;
  },
};

/* ------------------------------------------------------------- categorias */
export const categories = {
  all: () => cache.categories,
  get: id => cache.categories.find(c => c.id === id) || null,
  color: id => categories.get(id)?.color || 'var(--c-text-3)',
  label: id => { const c = categories.get(id); return c ? `${c.icon} ${c.name}` : ''; },
  async save(cat) {
    const rec = { id: cat.id || uid('cat'), order: cat.order ?? cache.categories.length,
      name: cat.name?.trim() || 'Sem nome', icon: cat.icon || '🏷️', color: cat.color || '#4f5bd5' };
    await db.put('categories', rec);
    const i = cache.categories.findIndex(c => c.id === rec.id);
    if (i >= 0) cache.categories[i] = rec; else cache.categories.push(rec);
    cache.categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    emit('categories'); emit('data');
    return rec;
  },
  async remove(id) {
    await db.del('categories', id);
    cache.categories = cache.categories.filter(c => c.id !== id);
    for (const s of ['tasks', 'events', 'logs', 'notes']) {
      const rows = await db.byIndex(s, 'categoryId', id).catch(() => []);
      await db.putMany(s, rows.map(r => ({ ...r, categoryId: null })));
    }
    emit('categories'); emit('data');
  },
  /** Adivinha a categoria pelo texto (palavras-chave do nome da categoria). */
  guess(text) {
    const t = (text || '').toLowerCase();
    const hints = {
      Trabalho: ['trabalho','expediente','chefe','relatório','relatorio','escritório','escritorio','serviço','servico','seção','secao','reunião de equipe','ofício','oficio','protocolo','cartório','cartorio'],
      Igreja:   ['igreja','culto','devocional','célula','celula','ministério','ministerio','louvor','pastor','oração','oracao','ensaio','ceia','congregação'],
      Estudos:  ['estudar','estudo','curso','prova','faculdade','aula','ler ','leitura','apostila'],
      Família:  ['família','familia','esposa','filho','filha','mãe','mae','pai','sogra','aniversário da','almoço em família'],
      Fotografia:['foto','fotografia','ensaio fotográfico','câmera','camera','lightroom','edição de fotos'],
      Casa:     ['casa','mercado','limpeza','conserto','faxina','contas','aluguel','luz','água','agua'],
      Projetos: ['projeto','site','aplicativo','app ','sistema','protótipo','prototipo'],
      Pessoal:  ['médico','medico','dentista','academia','banco','pessoal','barbeiro','cabeleireiro'],
    };
    for (const [name, words] of Object.entries(hints)) {
      if (words.some(w => t.includes(w))) {
        const c = cache.categories.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (c) return c.id;
      }
    }
    return null;
  },
};

/* ------------------------------------------------- pessoas e lugares (v2)
   Registro de identidade, não de contagem: guarda quem/onde existe e quando
   apareceu pela primeira e pela última vez. Quantas vezes é calculado na
   hora, para que reeditar um item não infle nenhum número. */

/** Chave de identidade: sem acento, minúscula, espaços normalizados. */
export const identityKey = name =>
  normalizeText(String(name || '').trim()).replace(/\s+/g, ' ');

function registry(storeName, prefix, event) {
  const api = {
    all: () => db.getAll(storeName),
    get: id => db.get(storeName, id),
    async byName(name) {
      const key = identityKey(name);
      if (!key) return null;
      const rows = await db.byIndex(storeName, 'key', key).catch(() => []);
      return rows[0] || null;
    },
    /** Cria ou atualiza a partir de uma menção. Não conta ocorrências. */
    async touch(name, date = today()) {
      const key = identityKey(name);
      if (key.length < 2) return null;
      const found = await api.byName(name);
      const rec = found
        ? { ...found,
            name: found.name || String(name).trim(),
            firstSeen: found.firstSeen && found.firstSeen < date ? found.firstSeen : date,
            lastSeen: found.lastSeen && found.lastSeen > date ? found.lastSeen : date }
        : { id: uid(prefix), key, name: String(name).trim(), aliases: [], note: '',
            firstSeen: date, lastSeen: date };
      await db.put(storeName, rec);
      return rec;
    },
    /** Registra várias menções de uma vez (usado ao salvar itens). */
    async touchAll(names, date = today()) {
      const list = [...new Set((names || []).map(n => String(n || '').trim()).filter(Boolean))];
      if (!list.length) return [];
      const out = [];
      for (const n of list) { const r = await api.touch(n, date); if (r) out.push(r); }
      if (out.length) { emit(event); emit('data'); }
      return out;
    },
    async save(rec) {
      const saved = { ...rec, key: identityKey(rec.name) };
      await db.put(storeName, saved);
      emit(event); emit('data');
      return saved;
    },
    remove: async id => { await db.del(storeName, id); emit(event); emit('data'); },
  };
  return api;
}

export const people = registry('people', 'per', 'people');
export const places = registry('places', 'plc', 'places');

/* -------------------------------------------------------------- ocorrências */
const occId = (itemId, date) => `${itemId}|${date}`;

async function occurrencesFor(itemId, from, to) {
  const rows = await db.byIndex('occurrences', 'seriesId', itemId).catch(() => []);
  return rows.filter(o => (!from || o.date >= from) && (!to || o.date <= to));
}
export async function getOccurrence(itemId, date) {
  return db.get('occurrences', occId(itemId, date));
}
export async function setOccurrence(item, date, patch) {
  const id = occId(item.id, date);
  const prev = (await db.get('occurrences', id)) || {
    id, seriesId: item.id, kind: item.kind || 'task', date, status: 'pendente',
  };
  const rec = { ...prev, ...patch, updatedAt: nowISO() };
  await db.put('occurrences', rec);
  emit('data');
  return rec;
}

/** Instância (real ou virtual) de um item recorrente numa data. */
function instantiate(base, date, occ) {
  if (!base.recurrence) return { ...base, instanceId: base.id, isOccurrence: false };
  return {
    ...base,
    date,
    instanceId: occId(base.id, date),
    isOccurrence: true,
    seriesId: base.id,
    status: occ?.status || 'pendente',
    completedAt: occ?.completedAt || null,
    occNotes: occ?.notes || '',
  };
}

/* ------------------------------------------------------------------ tarefas */
export function newTask(patch = {}) {
  return {
    id: uid('tsk'), kind: 'task',
    title: '', description: '', categoryId: null,
    date: today(), time: null, due: null,
    priority: 'media', status: 'pendente',
    recurrence: null, reminders: [], subtasks: [], notes: '',
    people: [], place: '', tags: [],
    postponeCount: 0, history: [],
    createdAt: nowISO(), updatedAt: nowISO(), completedAt: null,
    ...patch,
  };
}

export const tasks = {
  all: () => db.getAll('tasks'),
  get: id => db.get('tasks', id),
  async save(task) {
    const rec = { ...newTask(), ...task, kind: 'task', updatedAt: nowISO() };
    rec.recurrence = R.normalize(rec.recurrence);
    if (rec.status === 'concluida' && !rec.completedAt) rec.completedAt = nowISO();
    if (rec.status !== 'concluida') rec.completedAt = null;
    await db.put('tasks', rec);
    await people.touchAll(rec.people, rec.date);
    await places.touchAll([rec.place], rec.date);
    const { syncReminders } = await import('../features/reminders.js');
    await syncReminders(rec);
    emit('tasks'); emit('data');
    return rec;
  },
  async remove(id) {
    await db.del('tasks', id);
    const occ = await db.byIndex('occurrences', 'seriesId', id).catch(() => []);
    await db.delMany('occurrences', occ.map(o => o.id));
    const rem = await db.byIndex('reminders', 'refId', id).catch(() => []);
    await db.delMany('reminders', rem.map(r => r.id));
    emit('tasks'); emit('data');
  },
  /** Instâncias de tarefas (inclui recorrentes) no intervalo. */
  async inRange(from, to) {
    const all = await db.getAll('tasks');
    const out = [];
    for (const t of all) {
      if (t.recurrence) {
        const dates = R.expand(t.recurrence, t.date || from, from, to);
        if (!dates.length) continue;
        const occs = await occurrencesFor(t.id, from, to);
        for (const d of dates) out.push(instantiate(t, d, occs.find(o => o.date === d)));
      } else if (t.date && t.date >= from && t.date <= to) {
        out.push(instantiate(t, t.date));
      }
    }
    return out.sort(cmpTime);
  },
  forDate(date) { return tasks.inRange(date, date); },
  /** Tarefas não concluídas com data anterior a `ref` (sem recorrentes). */
  async overdue(ref = today()) {
    const all = await db.getAll('tasks');
    return all
      .filter(t => !t.recurrence && t.date && t.date < ref &&
        (t.status === 'pendente' || t.status === 'andamento'))
      .map(t => instantiate(t, t.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async noDate() {
    const all = await db.getAll('tasks');
    return all.filter(t => !t.date && !t.recurrence && t.status !== 'concluida' && t.status !== 'cancelada');
  },
  /** Marca status respeitando instâncias recorrentes. */
  async setStatus(instance, status) {
    if (instance.isOccurrence) {
      return setOccurrence(instance, instance.date, {
        status, completedAt: status === 'concluida' ? nowISO() : null,
      });
    }
    const base = await db.get('tasks', instance.id);
    if (!base) return null;
    return tasks.save({ ...base, status, completedAt: status === 'concluida' ? nowISO() : null });
  },
  /** Move a tarefa para outra data (usado no arrastar do calendário e no fechamento).
      Adiar (mover para a frente) fica registrado — é o que permite responder
      "quais tarefas eu mais adiei" mais tarde. Antecipar não conta como adiamento. */
  async move(instance, date, time = undefined) {
    if (instance.isOccurrence) {
      const base = await db.get('tasks', instance.id);
      const rec = { ...base.recurrence, exceptions: [...(base.recurrence?.exceptions || []), instance.date] };
      await db.put('tasks', { ...base, recurrence: rec, updatedAt: nowISO() });
      const postponed = date > instance.date;
      const copy = newTask({
        ...base, id: uid('tsk'), recurrence: null, date, status: 'pendente',
        time: time !== undefined ? time : base.time, createdAt: nowISO(),
        postponeCount: postponed ? 1 : 0,
        history: postponed ? [{ at: nowISO(), from: instance.date, to: date }] : [],
      });
      await db.put('tasks', copy);
      emit('tasks'); emit('data');
      return copy;
    }
    const base = await db.get('tasks', instance.id);
    if (!base) return null;
    const postponed = base.date && date > base.date;
    return tasks.save({
      ...base, date, ...(time !== undefined ? { time } : {}),
      postponeCount: (base.postponeCount || 0) + (postponed ? 1 : 0),
      history: postponed
        ? [...(base.history || []), { at: nowISO(), from: base.date, to: date }].slice(-40)
        : (base.history || []),
    });
  },
};

/* ------------------------------------------------------------ compromissos */
export function newEvent(patch = {}) {
  return {
    id: uid('evt'), kind: 'event',
    title: '', description: '', categoryId: null,
    date: today(), time: '09:00', endTime: null, allDay: false,
    location: '', people: [], tags: [],
    status: 'pendente', recurrence: null, reminders: [], notes: '',
    createdAt: nowISO(), updatedAt: nowISO(),
    ...patch,
  };
}
export const events = {
  all: () => db.getAll('events'),
  get: id => db.get('events', id),
  async save(evt) {
    const rec = { ...newEvent(), ...evt, kind: 'event', updatedAt: nowISO() };
    rec.recurrence = R.normalize(rec.recurrence);
    await db.put('events', rec);
    await people.touchAll(rec.people, rec.date);
    await places.touchAll([rec.location], rec.date);
    const { syncReminders } = await import('../features/reminders.js');
    await syncReminders(rec);
    emit('events'); emit('data');
    return rec;
  },
  async remove(id) {
    await db.del('events', id);
    const occ = await db.byIndex('occurrences', 'seriesId', id).catch(() => []);
    await db.delMany('occurrences', occ.map(o => o.id));
    const rem = await db.byIndex('reminders', 'refId', id).catch(() => []);
    await db.delMany('reminders', rem.map(r => r.id));
    emit('events'); emit('data');
  },
  async inRange(from, to) {
    const all = await db.getAll('events');
    const out = [];
    for (const e of all) {
      if (e.recurrence) {
        const dates = R.expand(e.recurrence, e.date || from, from, to);
        if (!dates.length) continue;
        const occs = await occurrencesFor(e.id, from, to);
        for (const d of dates) out.push(instantiate(e, d, occs.find(o => o.date === d)));
      } else if (e.date && e.date >= from && e.date <= to) {
        out.push(instantiate(e, e.date));
      }
    }
    return out.sort(cmpTime);
  },
  forDate(date) { return events.inRange(date, date); },
  async upcoming(days = 14, from = today()) {
    const list = await events.inRange(from, addDays(from, days));
    const nowMin = minutes(nowTime());
    return list.filter(e => e.date > from || !e.time || minutes(e.time) >= nowMin);
  },
  async setStatus(instance, status) {
    if (instance.isOccurrence) return setOccurrence(instance, instance.date, { status });
    const base = await db.get('events', instance.id);
    return base ? events.save({ ...base, status }) : null;
  },
  async move(instance, date, time = undefined) {
    if (instance.isOccurrence) {
      const base = await db.get('events', instance.id);
      const rec = { ...base.recurrence, exceptions: [...(base.recurrence?.exceptions || []), instance.date] };
      await db.put('events', { ...base, recurrence: rec, updatedAt: nowISO() });
      const copy = newEvent({ ...base, id: uid('evt'), recurrence: null, date,
        time: time !== undefined ? time : base.time, createdAt: nowISO() });
      await db.put('events', copy);
      emit('events'); emit('data');
      return copy;
    }
    const base = await db.get('events', instance.id);
    if (!base) return null;
    return events.save({ ...base, date, ...(time !== undefined ? { time } : {}) });
  },
};

/* ------------------------------------------------- registros (o que fiz hoje) */
export function newLog(patch = {}) {
  return {
    id: uid('log'), kind: 'log',
    text: '', date: today(), time: nowTime(),
    categoryId: null, person: '', people: [], place: '', tags: [],
    source: 'manual', durationMin: null,
    triaged: true, unplanned: false, linkedTaskId: null,
    createdAt: nowISO(), updatedAt: nowISO(),
    ...patch,
  };
}
export const logs = {
  all: () => db.getAll('logs'),
  get: id => db.get('logs', id),
  async save(log) {
    const rec = { ...newLog(), ...log, kind: 'log', updatedAt: nowISO() };
    /* compatibilidade: `person` (texto) e `people` (lista) andam juntos, para
       que telas antigas continuem lendo o campo que já conheciam. */
    if (rec.people?.length) rec.person = rec.people[0];
    else if (rec.person) rec.people = [rec.person];
    else rec.people = [];
    /* organizar em qualquer tela conclui a triagem */
    if (rec.categoryId) rec.triaged = true;
    await db.put('logs', rec);
    await people.touchAll(rec.people, rec.date);
    await places.touchAll([rec.place], rec.date);
    emit('logs'); emit('data');
    return rec;
  },
  /** Registros ainda sem organização (capturados no "Fiz agora"), mais
      recentes primeiro. Sem data, devolve os de todos os dias — deixar um
      registro esquecido num dia anterior anularia o sentido da triagem. */
  async untriaged(date) {
    const rows = date ? await db.byIndex('logs', 'date', date) : await db.getAll('logs');
    return rows.filter(l => l.triaged === false)
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  },
  remove: async id => { await db.del('logs', id); emit('logs'); emit('data'); },
  async forDate(date) {
    const rows = await db.byIndex('logs', 'date', date);
    return rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  },
  async inRange(from, to) {
    const all = await db.getAll('logs');
    return all.filter(l => l.date >= from && l.date <= to)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  },
};

/* -------------------------------------------------------------------- notas */
export function newNote(patch = {}) {
  return {
    id: uid('not'), kind: 'note',
    title: '', body: '', type: 'nota', items: [],
    categoryId: null, linkedTaskId: null, linkedEventId: null,
    tags: [], pinned: false,
    createdAt: nowISO(), updatedAt: nowISO(),
    ...patch,
  };
}
export const notes = {
  all: () => db.getAll('notes'),
  get: id => db.get('notes', id),
  async save(note) {
    const rec = { ...newNote(), ...note, kind: 'note', updatedAt: nowISO() };
    await db.put('notes', rec);
    emit('notes'); emit('data');
    return rec;
  },
  remove: async id => { await db.del('notes', id); emit('notes'); emit('data'); },
  async recent(n = 50) {
    const all = await db.getAll('notes');
    return all.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      b.updatedAt.localeCompare(a.updatedAt)).slice(0, n);
  },
  async forDate(date) {
    const all = await db.getAll('notes');
    return all.filter(n => (n.createdAt || '').slice(0, 10) === date);
  },
};

/* ------------------------------------------------------------------ entrada */
export const inbox = {
  all: () => db.getAll('inbox'),
  async pending() {
    const all = await db.getAll('inbox');
    return all.filter(i => i.status !== 'processado')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async add(text, source = 'manual') {
    const rec = { id: uid('inb'), text: String(text).trim(), status: 'aberto',
      source, convertedTo: null, convertedId: null, createdAt: nowISO() };
    if (!rec.text) return null;
    await db.put('inbox', rec);
    emit('inbox'); emit('data');
    return rec;
  },
  async save(item) { await db.put('inbox', item); emit('inbox'); emit('data'); return item; },
  remove: async id => { await db.del('inbox', id); emit('inbox'); emit('data'); },
  async markConverted(id, kind, refId) {
    const rec = await db.get('inbox', id);
    if (!rec) return;
    await db.put('inbox', { ...rec, status: 'processado', convertedTo: kind, convertedId: refId,
      processedAt: nowISO() });
    emit('inbox'); emit('data');
  },
};

/* ------------------------------------------------------- fechamento do dia */
export const days = {
  get: date => db.get('days', date),
  async save(day) {
    const rec = { ...day, date: day.date, updatedAt: nowISO() };
    await db.put('days', rec);
    emit('days'); emit('data');
    return rec;
  },
  all: () => db.getAll('days'),
  remove: async date => { await db.del('days', date); emit('days'); emit('data'); },
};

/* ------------------------------------------------------------- agregações */
function cmpTime(a, b) {
  const ta = a.time || a.start || '99:99', tb = b.time || b.start || '99:99';
  return ta.localeCompare(tb) || (a.title || '').localeCompare(b.title || '');
}

export async function dayStats(date) {
  const [t, e, l, n] = await Promise.all([
    tasks.forDate(date), events.forDate(date), logs.forDate(date), notes.forDate(date),
  ]);
  const done = t.filter(x => x.status === 'concluida');
  const cancel = t.filter(x => x.status === 'cancelada');
  const open = t.filter(x => x.status === 'pendente' || x.status === 'andamento');
  const evDone = e.filter(x => x.status === 'concluida');
  return {
    date,
    tasks: t, events: e, logs: l, notes: n,
    plannedTasks: t.length, doneTasks: done.length, openTasks: open.length,
    canceledTasks: cancel.length,
    plannedEvents: e.length, doneEvents: evDone.length,
    logCount: l.length, noteCount: n.length,
    progress: t.length + e.length === 0 ? 0
      : Math.round(((done.length + evDone.length) / (t.length + e.length)) * 100),
  };
}

/** Linha do tempo do dia: compromissos + tarefas concluídas + registros + notas. */
export async function timeline(date) {
  const [t, e, l, n] = await Promise.all([
    tasks.forDate(date), events.forDate(date), logs.forDate(date), notes.forDate(date),
  ]);
  const items = [];
  for (const ev of e) {
    items.push({ at: ev.time || '00:00', kind: 'compromisso', color: 'var(--c-info)',
      title: ev.title, sub: ev.location, ref: ev, done: ev.status === 'concluida' });
  }
  for (const tk of t) {
    if (tk.status === 'concluida') {
      const at = tk.completedAt ? new Date(tk.completedAt).toTimeString().slice(0, 5) : (tk.time || '23:58');
      items.push({ at, kind: 'tarefa concluída', color: 'var(--c-ok)', title: tk.title, ref: tk, done: true });
    } else if (tk.recurrence) {
      items.push({ at: tk.time || '00:01', kind: 'atividade recorrente', color: 'var(--c-accent)',
        title: tk.title, ref: tk, done: false });
    }
  }
  for (const lg of l) {
    items.push({ at: lg.time || '00:00', kind: 'registro', color: 'var(--c-warn)',
      title: lg.text, sub: [lg.person, lg.place].filter(Boolean).join(' · '), ref: lg, done: true });
  }
  for (const nt of n) {
    items.push({ at: (nt.createdAt || '').slice(11, 16) || '00:00', kind: 'nota',
      color: 'var(--c-text-3)', title: nt.title || nt.body.slice(0, 60), ref: nt });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Estatísticas para o painel. */
export async function dashboard(from, to) {
  const [allTasks, evs, lgs] = await Promise.all([db.getAll('tasks'), events.inRange(from, to), logs.inRange(from, to)]);
  const inst = await tasks.inRange(from, to);
  const overdue = await tasks.overdue();
  const perCat = {};
  const bump = (id, n = 1) => { perCat[id || 'sem'] = (perCat[id || 'sem'] || 0) + n; };
  inst.forEach(t => bump(t.categoryId));
  evs.forEach(e => bump(e.categoryId));
  lgs.forEach(l => bump(l.categoryId));
  return {
    pending: inst.filter(t => t.status === 'pendente').length,
    doing: inst.filter(t => t.status === 'andamento').length,
    done: inst.filter(t => t.status === 'concluida').length,
    overdue: overdue.length,
    events: evs.length,
    logs: lgs.length,
    total: allTasks.length,
    perCat,
    instances: inst,
  };
}

/** Progresso dos últimos N dias (para o gráfico semanal). */
export async function weeklyProgress(days = 7, ref = today()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(ref, -i);
    const s = await dayStats(d);
    out.push({ date: d, done: s.doneTasks + s.doneEvents, planned: s.plannedTasks + s.plannedEvents, logs: s.logCount });
  }
  return out;
}

export { db, R, diffDays, iso };
