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
  deviceId: null,
  /* check-ins (fase 7) — desligados até a pessoa pedir */
  checkinsEnabled: false,
  checkinTimes: ['08:30', '13:30', '19:30'],
  checkinMaxPerDay: 3,
  checkinQuietFrom: '22:00',
  checkinQuietTo: '07:00',
  checkinIgnored: 0,
  checkinsPaused: false,
  checkinLastPrompt: null,
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
    if (from < 3) await prepareForSync();
    await settings.set('schemaVersion', db.DB_VERSION);
  } catch (e) {
    console.warn('Migração incompleta; será tentada de novo na próxima abertura.', e);
  }
  return seeded;
}

/* -------------------------------------------------- preparação de sincronia
   O app guarda tudo no IndexedDB, que é um banco de verdade e aguenta anos de
   uso. O que ele não faz é sincronizar entre aparelhos — e para isso, um dia,
   duas coisas precisam já existir no histórico: a identificação de qual
   aparelho escreveu, e o rastro das exclusões. As duas não podem ser
   reconstruídas depois, por isso entram agora. Ver docs/sincronizacao.md. */
async function prepareForSync() {
  if (!cache.settings.deviceId) {
    await settings.set('deviceId', uid('dev'));
  }
  /* `unplanned` mudou de significado na fase 3: false passou a querer dizer
     "a pessoa afirmou que estava planejado". Os registros gravados antes
     nunca foram avaliados, então voltam para null (= o app decide). */
  const lgs = await db.getAll('logs').catch(() => []);
  const aCorrigir = lgs.filter(l => l.unplanned === false && !l.linkedTaskId);
  if (aCorrigir.length) {
    await db.putMany('logs', aCorrigir.map(l => ({ ...l, unplanned: null })));
  }
  /* Garante updatedAt em tudo: é a chave de "quem escreveu por último". */
  for (const store of ['tasks', 'events', 'logs', 'notes', 'inbox', 'categories',
                       'days', 'occurrences', 'people', 'places']) {
    const rows = await db.getAll(store, { includeDeleted: true }).catch(() => []);
    const faltando = rows.filter(r => !r.updatedAt);
    if (!faltando.length) continue;
    await db.putMany(store, faltando.map(r => ({
      ...r, updatedAt: r.createdAt || new Date(0).toISOString(),
    })));
  }
}

/** Identificador deste aparelho, para atribuir escritas na sincronização. */
export const deviceId = () => cache.settings.deviceId;

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
      name: cat.name?.trim() || 'Sem nome', icon: cat.icon || '🏷️', color: cat.color || '#4f5bd5',
      createdAt: cat.createdAt || nowISO(), updatedAt: nowISO() };
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

/** Tudo em que uma pessoa aparece, do mais recente para o mais antigo.
    É uma varredura de três tabelas — na escala de uso pessoal custa poucos
    milissegundos, e não vale otimizar antes de doer. */
export async function interactionsOf(person) {
  const chaves = new Set([person.key, ...(person.aliases || []).map(identityKey)]);
  const bate = nomes => (nomes || []).some(n => chaves.has(identityKey(n)));
  const [tk, ev, lg, mm] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('logs'), db.getAll('moments'),
  ]);
  const out = [];
  lg.forEach(l => {
    const nomes = l.people?.length ? l.people : (l.person ? [l.person] : []);
    if (bate(nomes)) out.push({ tipo: 'registro', date: l.date, time: l.time, texto: l.text, ref: l });
  });
  tk.forEach(t => { if (bate(t.people)) out.push({ tipo: 'tarefa', date: t.date, time: t.time, texto: t.title, ref: t }); });
  ev.forEach(e => { if (bate(e.people)) out.push({ tipo: 'compromisso', date: e.date, time: e.time, texto: e.title, ref: e }); });
  mm.forEach(m => { if (bate(m.people)) out.push({ tipo: 'momento', date: m.date, time: m.time, texto: m.text, ref: m }); });
  return out.filter(x => x.date)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}

/** O mesmo para lugares (campo `place` em tarefas e registros, `location` em
    compromissos — a diferença de nome vem do modelo antigo). */
export async function visitsOf(place) {
  const chaves = new Set([place.key, ...(place.aliases || []).map(identityKey)]);
  const bate = v => v && chaves.has(identityKey(v));
  const [tk, ev, lg] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('logs'),
  ]);
  const out = [];
  lg.forEach(l => { if (bate(l.place)) out.push({ tipo: 'registro', date: l.date, time: l.time, texto: l.text, ref: l }); });
  tk.forEach(t => { if (bate(t.place)) out.push({ tipo: 'tarefa', date: t.date, time: t.time, texto: t.title, ref: t }); });
  ev.forEach(e => { if (bate(e.location)) out.push({ tipo: 'compromisso', date: e.date, time: e.time, texto: e.title, ref: e }); });
  return out.filter(x => x.date)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}

/** Junta duas pessoas numa só, reescrevendo os itens. Reescrever custa mais
    que resolver apelido na consulta, mas deixa o dado limpo — e num app que
    pretende durar anos isso importa mais. */
export async function mergePeople(fromId, intoId) {
  const [a, b] = await Promise.all([db.get('people', fromId), db.get('people', intoId)]);
  if (!a || !b || a.id === b.id) return null;
  const troca = nomes => (nomes || []).map(n => identityKey(n) === a.key ? b.name : n);
  const temA = nomes => (nomes || []).some(n => identityKey(n) === a.key);

  let n = 0;
  for (const store of ['tasks', 'events', 'moments']) {
    const rows = await db.getAll(store);
    const alvo = rows.filter(r => temA(r.people));
    await db.putMany(store, alvo.map(r => ({ ...r, people: [...new Set(troca(r.people))], updatedAt: nowISO() })));
    n += alvo.length;
  }
  const lgs = await db.getAll('logs');
  const alvoLg = lgs.filter(l => temA(l.people?.length ? l.people : (l.person ? [l.person] : [])));
  await db.putMany('logs', alvoLg.map(l => {
    const nomes = [...new Set(troca(l.people?.length ? l.people : [l.person]))];
    return { ...l, people: nomes, person: nomes[0] || '', updatedAt: nowISO() };
  }));
  n += alvoLg.length;

  await db.put('people', {
    ...b,
    aliases: [...new Set([...(b.aliases || []), a.name, ...(a.aliases || [])])],
    firstSeen: [a.firstSeen, b.firstSeen].filter(Boolean).sort()[0] || b.firstSeen,
    lastSeen: [a.lastSeen, b.lastSeen].filter(Boolean).sort().pop() || b.lastSeen,
    updatedAt: nowISO(),
  });
  await db.del('people', a.id);
  emit('people'); emit('data');
  return { itens: n, nome: b.name };
}

/** Quantos itens seriam reescritos numa junção — mostrado antes de confirmar. */
export async function mergePreview(fromId) {
  const a = await db.get('people', fromId);
  if (!a) return 0;
  const temA = nomes => (nomes || []).some(n => identityKey(n) === a.key);
  const [tk, ev, mm, lg] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('moments'), db.getAll('logs'),
  ]);
  return tk.filter(r => temA(r.people)).length
    + ev.filter(r => temA(r.people)).length
    + mm.filter(r => temA(r.people)).length
    + lg.filter(l => temA(l.people?.length ? l.people : (l.person ? [l.person] : []))).length;
}

/** Pessoas marcadas para acompanhar e que passaram do prazo sem contato.
    `track` é FALSO por padrão de propósito: avisar sobre todo mundo que já foi
    mencionado transformaria o app numa máquina de cobrança. */
export async function peopleToNudge(ref = today()) {
  const rows = await db.getAll('people');
  return rows
    .filter(p => p.track && p.lastSeen)
    .map(p => ({ p, dias: diffDays(p.lastSeen, ref) }))
    .filter(x => x.dias >= (x.p.trackDays || 30))
    .filter(x => !x.p.snoozeUntil || x.p.snoozeUntil < ref)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 2);
}

/** Trajeto do dia: lugares distintos, na ordem do relógio. */
export async function dayRoute(date) {
  const [lg, ev] = await Promise.all([logs.forDate(date), events.forDate(date)]);
  const pontos = [
    ...lg.filter(l => l.place).map(l => ({ time: l.time || '00:00', nome: l.place })),
    ...ev.filter(e => e.location).map(e => ({ time: e.time || '00:00', nome: e.location })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const out = [];
  for (const p of pontos) {
    if (!out.length || identityKey(out[out.length - 1].nome) !== identityKey(p.nome)) out.push(p);
  }
  return out;
}

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
    triaged: true, unplanned: null, linkedTaskId: null,
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

/* ------------------------------------------------------ momentos (fase 6)
   O que valeu a pena perceber. Não é tarefa (não se conclui) nem registro
   operacional (não descreve execução): é o acontecimento que a pessoa quis
   guardar. Por isso é um tipo próprio e não uma etiqueta em cima de log. */
export const MOMENT_KINDS = {
  bom:      { label: 'Coisa boa',     icon: '🙂' },
  resolvi:  { label: 'Resolvi algo',  icon: '✅' },
  aprendi:  { label: 'Aprendi',       icon: '💡' },
  gratidao: { label: 'Gratidão',      icon: '🙏' },
  outro:    { label: 'Outro',         icon: '⭐' },
};

export function newMoment(patch = {}) {
  return {
    id: uid('mom'), kind: 'moment',
    text: '', momentKind: 'bom', date: today(), time: nowTime(),
    refIds: [], categoryId: null, people: [],
    createdAt: nowISO(), updatedAt: nowISO(),
    ...patch,
  };
}
export const moments = {
  all: () => db.getAll('moments'),
  get: id => db.get('moments', id),
  async save(m) {
    const rec = { ...newMoment(), ...m, kind: 'moment', updatedAt: nowISO() };
    await db.put('moments', rec);
    await people.touchAll(rec.people, rec.date);
    emit('moments'); emit('data');
    return rec;
  },
  remove: async id => { await db.del('moments', id); emit('moments'); emit('data'); },
  async forDate(date) {
    const rows = await db.byIndex('moments', 'date', date);
    return rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  },
  async inRange(from, to) {
    const all = await db.getAll('moments');
    return all.filter(m => m.date >= from && m.date <= to)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  },
};

/* ------------------------------------------------------ check-ins (fase 7) */
export const MOODS = {
  bem:       { label: 'Bem',            icon: '🙂' },
  normal:    { label: 'Normal',         icon: '😐' },
  dificil:   { label: 'Difícil',        icon: '😣' },
  cansativo: { label: 'Cansativo',      icon: '😴' },
  produtivo: { label: 'Muito produtivo', icon: '⚡' },
};
export const checkins = {
  all: () => db.getAll('checkins'),
  async forDate(date) {
    const rows = await db.byIndex('checkins', 'date', date);
    return rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  },
  async add(mood, { note = '', trigger = 'manual', date = today(), time = nowTime() } = {}) {
    const rec = { id: uid('chk'), date, time, mood, note, trigger,
      createdAt: nowISO(), updatedAt: nowISO() };
    await db.put('checkins', rec);
    emit('checkins'); emit('data');
    return rec;
  },
  remove: async id => { await db.del('checkins', id); emit('checkins'); emit('data'); },
  async inRange(from, to) {
    const all = await db.getAll('checkins');
    return all.filter(c => c.date >= from && c.date <= to)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
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

/* ------------------------------------------- fase 3 · planejado × aconteceu

   Decisão que não é óbvia: se o casamento fosse sempre calculado na hora,
   editar o plano mudaria o passado — o dia de ontem se reescreveria ao mexer
   numa tarefa antiga. Num app de memória isso é defeito, não detalhe.

   Por isso: HOJE calcula na hora (o dia ainda está em movimento) e DIAS
   FECHADOS usam o que ficou congelado no fechamento. A correção manual
   vence sempre, nos dois casos. */
export async function matchDay(date) {
  const dia = await days.get(date);
  if (dia?.frozen && date < today()) return dia.frozen;

  const [tk, ev, lg] = await Promise.all([
    tasks.forDate(date), events.forDate(date), logs.forDate(date),
  ]);
  const planejados = [
    ...ev,
    ...tk.filter(t => t.time),
  ];
  const { casarDia } = await import('../features/match.js');
  const r = casarDia(lg, planejados);
  return {
    casados: Object.fromEntries(r.casados),
    foraIds: [...r.foraIds],
    planejados: planejados.length,
  };
}

/** Congela o casamento do dia — chamado no fechamento (fase 6). */
export async function freezeDay(date) {
  const dia = await days.get(date);
  const [tk, ev, lg] = await Promise.all([
    tasks.forDate(date), events.forDate(date), logs.forDate(date),
  ]);
  const planejados = [...ev, ...tk.filter(t => t.time)];
  const { casarDia } = await import('../features/match.js');
  const r = casarDia(lg, planejados);
  void dia;
  return {
    casados: Object.fromEntries(r.casados),
    foraIds: [...r.foraIds],
    planejados: planejados.length,
    at: nowISO(),
  };
}

/** Marca ou desmarca um registro como "fora do plano" — correção manual. */
export async function setUnplanned(log, valor) {
  const rec = await db.get('logs', log.id);
  if (!rec) return null;
  return logs.save({ ...rec, unplanned: valor, linkedTaskId: valor ? null : rec.linkedTaskId });
}

/** Linha do tempo do dia: compromissos + tarefas concluídas + registros + notas. */
export async function timeline(date) {
  const [t, e, l, n] = await Promise.all([
    tasks.forDate(date), events.forDate(date), logs.forDate(date), notes.forDate(date),
  ]);
  const items = [];
  for (const ev of e) {
    items.push({ at: ev.time || '00:00', kind: 'compromisso', color: 'var(--c-info)',
      lane: 'planejado',
      title: ev.title, sub: ev.location, ref: ev, done: ev.status === 'concluida' });
  }
  for (const tk of t) {
    if (tk.status === 'concluida') {
      const at = tk.completedAt ? new Date(tk.completedAt).toTimeString().slice(0, 5) : (tk.time || '23:58');
      items.push({ at, kind: 'tarefa concluída', color: 'var(--c-ok)', lane: 'aconteceu',
        title: tk.title, ref: tk, done: true });
    } else if (tk.recurrence) {
      items.push({ at: tk.time || '00:01', kind: 'atividade recorrente', color: 'var(--c-accent)',
        lane: 'planejado', title: tk.title, ref: tk, done: false });
    }
  }
  const m = await matchDay(date).catch(() => ({ casados: {}, foraIds: [] }));
  const fora = new Set(m.foraIds || []);
  for (const lg of l) {
    const foraDoPlano = fora.has(lg.id);
    items.push({ at: lg.time || '00:00', kind: 'registro',
      color: foraDoPlano ? 'var(--c-warn)' : 'var(--c-ok)',
      lane: foraDoPlano ? 'fora' : 'aconteceu',
      matched: !foraDoPlano,
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

/* ------------------------------------------------- fase 4 · onde estou agora
   Nada de novo no banco: só lê o último registro e o próximo item com hora.
   "Próxima coisa" olha compromissos E tarefas com horário — considerar só
   compromissos é o erro fácil aqui, porque some metade do dia. */
export async function whereAmI(ref = today(), agora = nowTime()) {
  const [lg, ev, tk] = await Promise.all([
    logs.forDate(ref), events.forDate(ref), tasks.forDate(ref),
  ]);
  const min = minutes(agora);

  const ultimo = lg
    .filter(l => minutes(l.time || '00:00') <= min)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .pop() || lg[lg.length - 1] || null;

  const comHora = [
    ...ev.filter(e => e.status !== 'concluida' && e.status !== 'cancelada'),
    ...tk.filter(t => t.time && t.status !== 'concluida' && t.status !== 'cancelada'),
  ].filter(x => x.time).sort((a, b) => a.time.localeCompare(b.time));

  const proximo = comHora.find(x => minutes(x.time) > min) || null;
  const atrasado = proximo ? null : comHora.find(x => minutes(x.time) <= min) || null;

  let amanha = null;
  if (!proximo && !atrasado) {
    const d2 = addDays(ref, 1);
    const [ev2, tk2] = await Promise.all([events.forDate(d2), tasks.forDate(d2)]);
    amanha = [...ev2, ...tk2].filter(x => x.time)
      .sort((a, b) => a.time.localeCompare(b.time))[0] || null;
  }

  return { agora, ultimo, proximo, atrasado, amanha, registros: lg.length };
}

/* ------------------------------------------------- fase 8 · revisão semanal
   Agregação pura. Sem percentual de produtividade, sem meta, sem sequência:
   as barras comparam categorias entre si, nunca com um alvo. */
export async function weekSummary(from, to) {
  const [tk, ev, lg, mm] = await Promise.all([
    tasks.inRange(from, to), events.inRange(from, to),
    logs.inRange(from, to), moments.inRange(from, to),
  ]);

  const perCat = {};
  const bump = id => { perCat[id || 'sem'] = (perCat[id || 'sem'] || 0) + 1; };
  tk.forEach(t => bump(t.categoryId));
  ev.forEach(e => bump(e.categoryId));
  lg.forEach(l => bump(l.categoryId));

  const concluidas = tk.filter(t => t.status === 'concluida');
  const pendentes = tk.filter(t => t.status === 'pendente' || t.status === 'andamento');

  /* hábitos: ocorrências de itens recorrentes cumpridas no período */
  const recorrentes = tk.filter(t => t.recurrence);
  const habitos = {
    total: recorrentes.length,
    feitos: recorrentes.filter(t => t.status === 'concluida').length,
  };

  /* uma linha por dia, em texto */
  const dias = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const doDia = [
      ...ev.filter(x => x.date === d).map(x => x.title),
      ...tk.filter(x => x.date === d && x.status === 'concluida').map(x => x.title),
      ...lg.filter(x => x.date === d).map(x => x.text),
    ];
    dias.push({ date: d, itens: [...new Set(doDia)].slice(0, 4), total: doDia.length });
  }

  const pessoas = {};
  [...tk, ...ev].forEach(x => (x.people || []).forEach(n => { pessoas[n] = (pessoas[n] || 0) + 1; }));
  lg.forEach(l => (l.people || []).forEach(n => { pessoas[n] = (pessoas[n] || 0) + 1; }));

  return {
    from, to,
    total: tk.length + ev.length + lg.length,
    tasks: tk, events: ev, logs: lg, moments: mm,
    perCat, concluidas, pendentes, habitos, dias,
    pessoas: Object.entries(pessoas).sort((a, b) => b[1] - a[1]).slice(0, 8),
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
