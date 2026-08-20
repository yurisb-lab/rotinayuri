/* Formulários de criação/edição: tarefa, compromisso, registro, nota e categoria. */

import { el, icon, clear } from '../util/dom.js';
import { openSheet, confirm as ask } from './modal.js';
import { ok, err } from './toast.js';
import * as S from '../core/store.js';
import * as R from '../features/recurrence.js';
import * as Rem from '../features/reminders.js';
import * as G from '../features/gcal.js';
import { today, nowTime, fmtDate, DOW_SHORT, addDays, iso } from '../util/date.js';

/* ------------------------------------------------------------ auxiliares */
export function field(label, ...nodes) {
  return el('div', { class: 'field' },
    label ? el('label', { class: 'field__label' }, label) : null, ...nodes);
}

export function categoryPicker(value) {
  const state = { value: value || null };
  const wrap = el('div', { class: 'scroller' });
  const render = () => {
    clear(wrap);
    wrap.appendChild(chip('— nenhuma —', null));
    S.categories.all().forEach(c => wrap.appendChild(chip(`${c.icon} ${c.name}`, c.id, c.color)));
  };
  const chip = (label, id, color) => el('button', {
    type: 'button',
    class: `chip ${state.value === id ? 'chip--on' : 'chip--out'}`,
    style: state.value === id && color ? { background: color, borderColor: color, color: '#fff' } : null,
    onclick: () => { state.value = id; render(); },
  }, label);
  render();
  return { node: wrap, get: () => state.value };
}

export function peopleInput(value = []) {
  const input = el('input', { class: 'input', placeholder: 'Ex.: João, Carlos', value: (value || []).join(', ') });
  return { node: input, get: () => input.value.split(/[,;]/).map(s => s.trim()).filter(Boolean) };
}

export function tagsInput(value = []) {
  const input = el('input', { class: 'input', placeholder: 'Ex.: equipamentos, relatório', value: (value || []).join(', ') });
  return { node: input, get: () => input.value.split(/[,;]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean) };
}

/* ---------------------------------------------------------- recorrência */
export function recurrenceEditor(value) {
  let rec = R.normalize(value);
  const select = el('select', { class: 'select' },
    el('option', { value: '' }, 'Não repetir'),
    ...R.TYPES.map(t => el('option', { value: t.id, selected: rec?.type === t.id }, t.label)));
  const detail = el('div');
  const summary = el('p', { class: 'tiny dim' });

  const state = {
    weekdays: rec?.weekdays?.length ? [...rec.weekdays] : [],
    interval: rec?.interval || 1,
    monthDay: rec?.monthDay || new Date().getDate(),
    nth: rec?.nth || 1,
    nthDow: rec?.nthDow ?? 1,
    until: rec?.until || '',
  };

  function build() {
    clear(detail);
    const type = select.value;
    if (!type) { summary.textContent = ''; return; }

    if (type === 'weekdays' || type === 'weekly') {
      const chips = el('div', { class: 'wrap' });
      DOW_SHORT.forEach((d, i) => {
        const b = el('button', {
          type: 'button',
          class: `chip ${state.weekdays.includes(i) ? 'chip--on' : 'chip--out'}`,
          onclick: () => {
            state.weekdays = state.weekdays.includes(i)
              ? state.weekdays.filter(x => x !== i) : [...state.weekdays, i].sort();
            build();
          },
        }, d);
        chips.appendChild(b);
      });
      detail.appendChild(field('Dias da semana', chips));
    }
    if (type === 'weekly' || type === 'custom' || type === 'daily' || type === 'monthly' || type === 'yearly') {
      const unit = type === 'weekly' ? 'semana(s)' : type === 'monthly' ? 'mês(es)' : type === 'yearly' ? 'ano(s)' : 'dia(s)';
      const inp = el('input', {
        class: 'input', type: 'number', min: 1, max: 60, value: state.interval,
        oninput: e => { state.interval = Math.max(1, Number(e.target.value) || 1); refresh(); },
      });
      detail.appendChild(field(`Repetir a cada … ${unit}`, inp));
    }
    if (type === 'monthly') {
      const inp = el('input', {
        class: 'input', type: 'number', min: 1, max: 31, value: state.monthDay,
        oninput: e => { state.monthDay = Number(e.target.value) || 1; refresh(); },
      });
      detail.appendChild(field('Dia do mês', inp));
    }
    if (type === 'monthlyNth') {
      const nth = el('select', { class: 'select', onchange: e => { state.nth = Number(e.target.value); refresh(); } },
        ...[[1, 'Primeira'], [2, 'Segunda'], [3, 'Terceira'], [4, 'Quarta'], [-1, 'Última']]
          .map(([v, l]) => el('option', { value: v, selected: state.nth === v }, l)));
      const wd = el('select', { class: 'select', onchange: e => { state.nthDow = Number(e.target.value); refresh(); } },
        ...DOW_SHORT.map((d, i) => el('option', { value: i, selected: state.nthDow === i }, d)));
      detail.appendChild(el('div', { class: 'grid2' }, field('Ocorrência', nth), field('Dia', wd)));
    }
    const until = el('input', {
      class: 'input', type: 'date', value: state.until,
      oninput: e => { state.until = e.target.value; refresh(); },
    });
    detail.appendChild(field('Repetir até (opcional)', until));
    refresh();
  }
  function refresh() { summary.textContent = R.describe(get(), today()); }

  function get() {
    const type = select.value;
    if (!type) return null;
    return R.normalize({
      type, interval: state.interval, weekdays: state.weekdays,
      monthDay: state.monthDay, nth: state.nth, nthDow: state.nthDow,
      until: state.until || null, exceptions: rec?.exceptions || [],
    });
  }
  select.addEventListener('change', build);
  build();
  return { node: el('div', {}, field('Recorrência', select), detail, summary), get };
}

/* ------------------------------------------------------------ lembretes */
export function remindersEditor(value = []) {
  let list = [...(value || [])];
  const wrap = el('div', { class: 'wrap' });
  const extra = el('div', { class: 'wrap', style: { marginTop: '6px' } });

  function render() {
    clear(wrap);
    Rem.PRESETS.forEach(p => wrap.appendChild(el('button', {
      type: 'button',
      class: `chip ${list.includes(p.id) ? 'chip--on' : 'chip--out'}`,
      onclick: () => { list = list.includes(p.id) ? list.filter(x => x !== p.id) : [...list, p.id]; render(); },
    }, p.label)));
    clear(extra);
    list.filter(id => !Rem.PRESETS.some(p => p.id === id)).forEach(id => {
      extra.appendChild(el('button', {
        type: 'button', class: 'chip chip--on',
        onclick: () => { list = list.filter(x => x !== id); render(); },
      }, Rem.labelOf(id), icon('close', 'ic--sm')));
    });
    extra.appendChild(el('button', { type: 'button', class: 'chip chip--out', onclick: addCustom },
      icon('clock', 'ic--sm'), 'Horário definido'));
  }
  async function addCustom() {
    const d = el('input', { class: 'input', type: 'date', value: today() });
    const t = el('input', { class: 'input', type: 'time', value: '08:00' });
    const { close } = openSheet({
      title: 'Lembrete em horário definido',
      body: el('div', { class: 'grid2' }, field('Data', d), field('Hora', t)),
      foot: [el('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => {
          if (d.value && t.value) { list.push(`at-${d.value}-${t.value}`); render(); }
          close();
        },
      }, 'Adicionar')],
    });
  }
  render();
  return { node: el('div', {}, wrap, extra), get: () => [...new Set(list)] };
}

/* ------------------------------------------------------------ subtarefas */
export function subtasksEditor(value = []) {
  let items = (value || []).map(s => ({ ...s }));
  const list = el('div', { class: 'stack--sm' });
  function render() {
    clear(list);
    items.forEach((s, i) => {
      const row = el('label', { class: `sub ${s.done ? 'sub--done' : ''}` },
        el('input', { type: 'checkbox', checked: !!s.done, onchange: e => { items[i].done = e.target.checked; render(); } }),
        el('input', { type: 'text', value: s.title, placeholder: 'Subtarefa', oninput: e => { items[i].title = e.target.value; } }),
        el('button', { type: 'button', class: 'btn btn--icon', 'aria-label': 'Remover',
          onclick: () => { items.splice(i, 1); render(); } }, icon('close', 'ic--sm')));
      list.appendChild(row);
    });
    list.appendChild(el('button', {
      type: 'button', class: 'btn btn--sm btn--ghost',
      onclick: () => { items.push({ id: S.uid('sub'), title: '', done: false }); render(); },
    }, icon('plus', 'ic--sm'), 'Adicionar subtarefa'));
  }
  render();
  return { node: list, get: () => items.filter(s => s.title.trim()).map(s => ({ ...s, title: s.title.trim() })) };
}

/* ================================================================ TAREFA */
export function editTask(task = null, preset = {}) {
  const t = task ? { ...task } : S.newTask({ ...preset });
  return new Promise(resolve => {
    const title = el('input', { class: 'input', placeholder: 'O que precisa ser feito?', value: t.title });
    const desc = el('textarea', { class: 'textarea', placeholder: 'Descrição (opcional)', style: { minHeight: '70px' } }, t.description || '');
    const date = el('input', { class: 'input', type: 'date', value: t.date || '' });
    const time = el('input', { class: 'input', type: 'time', value: t.time || '' });
    const due = el('input', { class: 'input', type: 'date', value: t.due || '' });
    const prio = el('select', { class: 'select' },
      ...Object.entries(S.PRIORITIES).map(([k, v]) => el('option', { value: k, selected: t.priority === k }, v.label)));
    const status = el('select', { class: 'select' },
      ...Object.entries(S.STATUS).map(([k, v]) => el('option', { value: k, selected: t.status === k }, v.label)));
    const cat = categoryPicker(t.categoryId);
    const rec = recurrenceEditor(t.recurrence);
    const rem = remindersEditor(t.reminders);
    const subs = subtasksEditor(t.subtasks);
    const people = peopleInput(t.people);
    const place = el('input', { class: 'input', placeholder: 'Local (opcional)', value: t.place || '' });
    const notes = el('textarea', { class: 'textarea', placeholder: 'Observações', style: { minHeight: '60px' } }, t.notes || '');

    const { close } = openSheet({
      title: task ? 'Editar tarefa' : 'Nova tarefa',
      body: el('div', {},
        field('Título', title),
        field('Categoria', cat.node),
        el('div', { class: 'grid2' }, field('Data', date), field('Horário', time)),
        field('Descrição', desc),
        el('div', { class: 'grid2' }, field('Prioridade', prio), field('Status', status)),
        field('Prazo final', due),
        rec.node,
        field('Lembretes', rem.node),
        field('Subtarefas', subs.node),
        el('div', { class: 'grid2' }, field('Pessoas', people.node), field('Local', place)),
        field('Observações', notes),
      ),
      foot: [
        task ? el('button', {
          class: 'btn btn--danger', onclick: async () => {
            if (await ask({ title: 'Excluir tarefa', message: `"${t.title}" será removida.`, okLabel: 'Excluir', danger: true })) {
              await S.tasks.remove(t.id); ok('Tarefa excluída'); close(); resolve(null);
            }
          },
        }, icon('trash')) : null,
        el('button', { class: 'btn btn--primary grow', onclick: save }, 'Salvar'),
      ],
      onClose: () => resolve(undefined),
    });

    async function save() {
      if (!title.value.trim()) { err('Informe um título.'); title.focus(); return; }
      const saved = await S.tasks.save({
        ...t,
        title: title.value.trim(), description: desc.value.trim(),
        date: date.value || null, time: time.value || null, due: due.value || null,
        priority: prio.value, status: status.value,
        categoryId: cat.get(), recurrence: rec.get(), reminders: rem.get(),
        subtasks: subs.get(), people: people.get(), place: place.value.trim(),
        notes: notes.value.trim(),
      });
      ok(task ? 'Tarefa atualizada' : 'Tarefa criada');
      close(); resolve(saved);
    }
  });
}

/* ========================================================== COMPROMISSO */
export function editEvent(evt = null, preset = {}) {
  const e = evt ? { ...evt } : S.newEvent({ ...preset });
  return new Promise(resolve => {
    const title = el('input', { class: 'input', placeholder: 'Ex.: Reunião com João', value: e.title });
    const date = el('input', { class: 'input', type: 'date', value: e.date || today() });
    const time = el('input', { class: 'input', type: 'time', value: e.time || '' });
    const endTime = el('input', { class: 'input', type: 'time', value: e.endTime || '' });
    const allDay = el('input', { type: 'checkbox', checked: !!e.allDay });
    const local = el('input', { class: 'input', placeholder: 'Local', value: e.location || '' });
    const desc = el('textarea', { class: 'textarea', placeholder: 'Descrição', style: { minHeight: '70px' } }, e.description || '');
    const cat = categoryPicker(e.categoryId);
    const rec = recurrenceEditor(e.recurrence);
    const rem = remindersEditor(e.reminders?.length ? e.reminders : (evt ? [] : S.settings.get('defaultReminders')));
    const people = peopleInput(e.people);
    const status = el('select', { class: 'select' },
      ...Object.entries(S.STATUS).map(([k, v]) => el('option', { value: k, selected: e.status === k }, v.label)));

    const { close } = openSheet({
      title: evt ? 'Editar compromisso' : 'Novo compromisso',
      body: el('div', {},
        field('Título', title),
        field('Categoria', cat.node),
        field('Data', date),
        el('label', { class: 'switch' }, allDay, el('span', {}, 'Dia inteiro')),
        el('div', { class: 'grid2' }, field('Início', time), field('Fim', endTime)),
        field('Local', local),
        field('Pessoas', people.node),
        field('Descrição', desc),
        field('Status', status),
        rec.node,
        field('Lembretes', rem.node),
      ),
      foot: [
        evt ? el('button', {
          class: 'btn btn--danger', onclick: async () => {
            if (await ask({ title: 'Excluir compromisso', message: `"${e.title}" será removido.`, okLabel: 'Excluir', danger: true })) {
              await S.events.remove(e.id); ok('Compromisso excluído'); close(); resolve(null);
            }
          },
        }, icon('trash')) : null,
        el('button', { class: 'btn btn--primary grow', onclick: save }, 'Salvar'),
      ],
      onClose: () => resolve(undefined),
    });

    async function save() {
      if (!title.value.trim()) { err('Informe um título.'); title.focus(); return; }
      const saved = await S.events.save({
        ...e,
        title: title.value.trim(), date: date.value || today(),
        time: allDay.checked ? null : (time.value || null),
        endTime: allDay.checked ? null : (endTime.value || null),
        allDay: allDay.checked, location: local.value.trim(),
        description: desc.value.trim(), categoryId: cat.get(),
        recurrence: rec.get(), reminders: rem.get(), people: people.get(),
        status: status.value,
      });
      ok(evt ? 'Compromisso atualizado' : 'Compromisso criado');
      close(); resolve(saved);
    }
  });
}

/* =============================================================== REGISTRO */
export function editLog(log = null, preset = {}) {
  const l = log ? { ...log } : S.newLog({ ...preset });
  return new Promise(resolve => {
    const text = el('textarea', { class: 'textarea', placeholder: 'O que você fez? Ex.: Falei com João sobre os equipamentos.' }, l.text || '');
    const date = el('input', { class: 'input', type: 'date', value: l.date || today() });
    const time = el('input', { class: 'input', type: 'time', value: l.time || nowTime() });
    const person = el('input', { class: 'input', placeholder: 'Pessoa (opcional)', value: l.person || '' });
    const place = el('input', { class: 'input', placeholder: 'Local (opcional)', value: l.place || '' });
    const cat = categoryPicker(l.categoryId);
    const tags = tagsInput(l.tags);

    const { close } = openSheet({
      title: log ? 'Editar registro' : 'Registrar o que fiz',
      body: el('div', {},
        field('Registro', text),
        el('div', { class: 'grid2' }, field('Data', date), field('Horário', time)),
        field('Categoria', cat.node),
        el('div', { class: 'grid2' }, field('Pessoa', person), field('Local', place)),
        field('Tags', tags.node),
      ),
      foot: [
        log ? el('button', {
          class: 'btn btn--danger', onclick: async () => {
            if (await ask({ title: 'Excluir registro', message: 'Este registro será removido.', okLabel: 'Excluir', danger: true })) {
              await S.logs.remove(l.id); ok('Registro excluído'); close(); resolve(null);
            }
          },
        }, icon('trash')) : null,
        el('button', { class: 'btn btn--primary grow', onclick: save }, 'Salvar'),
      ],
      onClose: () => resolve(undefined),
    });

    async function save() {
      if (!text.value.trim()) { err('Escreva o que foi feito.'); text.focus(); return; }
      const saved = await S.logs.save({
        ...l, text: text.value.trim(), date: date.value || today(), time: time.value || nowTime(),
        person: person.value.trim(), place: place.value.trim(),
        categoryId: cat.get(), tags: tags.get(),
      });
      ok('Registrado');
      close(); resolve(saved);
    }
  });
}

/* =================================================================== NOTA */
export function editNote(note = null, preset = {}) {
  const n = note ? { ...note } : S.newNote({ ...preset });
  return new Promise(resolve => {
    const title = el('input', { class: 'input', placeholder: 'Título', value: n.title || '' });
    const type = el('select', { class: 'select' },
      ...Object.entries(S.NOTE_TYPES).map(([k, v]) => el('option', { value: k, selected: n.type === k }, v)));
    const body = el('textarea', { class: 'textarea', style: { minHeight: '180px' }, placeholder: 'Escreva aqui…' }, n.body || '');
    const cat = categoryPicker(n.categoryId);
    const tags = tagsInput(n.tags);
    const pinned = el('input', { type: 'checkbox', checked: !!n.pinned });

    const { close } = openSheet({
      title: note ? 'Editar nota' : 'Nova nota',
      body: el('div', {},
        field('Título', title),
        el('div', { class: 'grid2' }, field('Tipo', type), field('Categoria', el('div', {}, cat.node))),
        field('Conteúdo', body),
        field('Tags', tags.node),
        el('label', { class: 'switch' }, pinned, el('span', {}, 'Fixar no topo')),
        note ? el('button', {
          class: 'btn btn--ghost btn--block', onclick: async () => {
            const sel = window.getSelection?.().toString().trim() ||
              body.value.slice(body.selectionStart, body.selectionEnd).trim();
            if (!sel) { err('Selecione um trecho do texto primeiro.'); return; }
            const t = await editTask(null, { title: sel.slice(0, 120), categoryId: cat.get() });
            if (t) ok('Tarefa criada a partir da nota');
          },
        }, icon('check'), 'Transformar trecho selecionado em tarefa') : null,
      ),
      foot: [
        note ? el('button', {
          class: 'btn btn--danger', onclick: async () => {
            if (await ask({ title: 'Excluir nota', message: 'Esta nota será removida.', okLabel: 'Excluir', danger: true })) {
              await S.notes.remove(n.id); ok('Nota excluída'); close(); resolve(null);
            }
          },
        }, icon('trash')) : null,
        el('button', { class: 'btn btn--primary grow', onclick: save }, 'Salvar'),
      ],
      onClose: () => resolve(undefined),
    });

    async function save() {
      if (!title.value.trim() && !body.value.trim()) { err('Escreva algo na nota.'); return; }
      const saved = await S.notes.save({
        ...n, title: title.value.trim(), body: body.value, type: type.value,
        categoryId: cat.get(), tags: tags.get(), pinned: pinned.checked,
      });
      ok(note ? 'Nota atualizada' : 'Nota criada');
      close(); resolve(saved);
    }
  });
}

/* ============================================================== CATEGORIA */
const ICON_CHOICES = ['💼','🙂','⛪','👨‍👩‍👧','📚','📷','🏠','🚀','💡','🎯','🛒','💰','🏥','🚗','🍽️','🏋️','✏️','📞','🎵','🌱'];
const COLOR_CHOICES = ['#4f7fd5','#d5734f','#7a5fd5','#d54f8f','#2f9e6e','#c9a227','#8a8f9e','#e0552e','#2b9ec9','#c94f4f'];

export function editCategory(cat = null) {
  const c = cat ? { ...cat } : { name: '', icon: '🏷️', color: '#4f5bd5' };
  return new Promise(resolve => {
    const name = el('input', { class: 'input', placeholder: 'Nome da categoria', value: c.name });
    const iconWrap = el('div', { class: 'wrap' });
    const colorWrap = el('div', { class: 'wrap' });
    let curIcon = c.icon, curColor = c.color;
    const renderIcons = () => {
      clear(iconWrap);
      ICON_CHOICES.forEach(i => iconWrap.appendChild(el('button', {
        type: 'button', class: `chip ${curIcon === i ? 'chip--on' : 'chip--out'}`,
        onclick: () => { curIcon = i; renderIcons(); },
      }, i)));
    };
    const renderColors = () => {
      clear(colorWrap);
      COLOR_CHOICES.forEach(col => colorWrap.appendChild(el('button', {
        type: 'button',
        class: 'chip',
        style: { background: col, color: '#fff', outline: curColor === col ? '2px solid var(--c-text)' : 'none' },
        onclick: () => { curColor = col; renderColors(); },
      }, ' ')));
    };
    renderIcons(); renderColors();

    const { close } = openSheet({
      title: cat ? 'Editar categoria' : 'Nova categoria',
      body: el('div', {}, field('Nome', name), field('Ícone', iconWrap), field('Cor', colorWrap)),
      foot: [
        cat ? el('button', {
          class: 'btn btn--danger', onclick: async () => {
            if (await ask({ title: 'Excluir categoria', message: 'Os itens dessa categoria ficarão sem categoria.', okLabel: 'Excluir', danger: true })) {
              await S.categories.remove(c.id); ok('Categoria excluída'); close(); resolve(null);
            }
          },
        }, icon('trash')) : null,
        el('button', {
          class: 'btn btn--primary grow', onclick: async () => {
            if (!name.value.trim()) { err('Informe o nome.'); return; }
            const saved = await S.categories.save({ ...c, name: name.value.trim(), icon: curIcon, color: curColor });
            ok('Categoria salva'); close(); resolve(saved);
          },
        }, 'Salvar'),
      ],
      onClose: () => resolve(undefined),
    });
  });
}

/* ===================================================== menu de ações do item */
export function itemActions(instance, { onChange } = {}) {
  const isEvent = instance.kind === 'event';
  const items = [];

  items.push({
    icon: 'edit', label: 'Editar',
    onClick: async () => {
      const base = isEvent ? await S.events.get(instance.id) : await S.tasks.get(instance.id);
      if (!base) return;
      const r = isEvent ? await editEvent(base) : await editTask(base);
      if (r !== undefined) onChange?.();
    },
  });

  if (!isEvent) {
    items.push({
      icon: 'check', label: instance.status === 'concluida' ? 'Marcar como pendente' : 'Marcar como concluída',
      onClick: async () => {
        await S.tasks.setStatus(instance, instance.status === 'concluida' ? 'pendente' : 'concluida');
        onChange?.();
      },
    });
    items.push({
      icon: 'clock', label: 'Em andamento',
      onClick: async () => { await S.tasks.setStatus(instance, 'andamento'); onChange?.(); },
    });
  } else {
    items.push({
      icon: 'check', label: instance.status === 'concluida' ? 'Desmarcar' : 'Marcar como realizado',
      onClick: async () => {
        await S.events.setStatus(instance, instance.status === 'concluida' ? 'pendente' : 'concluida');
        onChange?.();
      },
    });
  }

  items.push({
    icon: 'arrowr', label: 'Mover para outra data',
    sub: instance.isOccurrence ? 'Cria uma cópia fora da recorrência' : null,
    onClick: () => moveDialog(instance, onChange),
  });

  items.push({
    icon: 'log', label: 'Registrar como feito agora',
    onClick: async () => {
      await S.logs.save(S.newLog({
        text: instance.title, categoryId: instance.categoryId,
        place: instance.location || instance.place || '',
        person: (instance.people || [])[0] || '',
      }));
      if (!isEvent) await S.tasks.setStatus(instance, 'concluida');
      else await S.events.setStatus(instance, 'concluida');
      ok('Registrado no diário do dia');
      onChange?.();
    },
  });

  if (isEvent) {
    items.push({
      icon: 'google', label: 'Adicionar ao Google Agenda',
      onClick: () => window.open(G.googleCalendarUrl(instance), '_blank', 'noopener'),
    });
    items.push({
      icon: 'share', label: 'Compartilhar',
      onClick: async () => {
        const r = await G.share(instance);
        if (r === 'copied') ok('Copiado para a área de transferência');
      },
    });
    items.push({
      icon: 'calendar', label: 'Baixar arquivo .ics',
      onClick: () => G.download(`${slug(instance.title)}.ics`, G.toICS(instance)),
    });
  }

  items.push({
    icon: 'note', label: 'Criar nota vinculada',
    onClick: async () => {
      await editNote(null, {
        title: instance.title, categoryId: instance.categoryId,
        [isEvent ? 'linkedEventId' : 'linkedTaskId']: instance.id,
      });
      onChange?.();
    },
  });

  items.push({
    icon: 'trash', label: instance.isOccurrence ? 'Pular esta ocorrência' : 'Excluir',
    onClick: async () => {
      if (instance.isOccurrence) {
        const store = isEvent ? S.events : S.tasks;
        const base = isEvent ? await S.events.get(instance.id) : await S.tasks.get(instance.id);
        const rec = { ...base.recurrence, exceptions: [...(base.recurrence.exceptions || []), instance.date] };
        await store.save({ ...base, recurrence: rec });
        ok('Ocorrência removida');
      } else {
        const conf = await ask({
          title: 'Excluir', message: `"${instance.title}" será removido.`,
          okLabel: 'Excluir', danger: true,
        });
        if (!conf) return;
        if (isEvent) await S.events.remove(instance.id); else await S.tasks.remove(instance.id);
        ok('Excluído');
      }
      onChange?.();
    },
  });

  return items;
}

export function moveDialog(instance, onChange) {
  const isEvent = instance.kind === 'event';
  const date = el('input', { class: 'input', type: 'date', value: instance.date || today() });
  const time = el('input', { class: 'input', type: 'time', value: instance.time || '' });
  const quick = el('div', { class: 'wrap' },
    ...[['Amanhã', addDays(today(), 1)], ['Depois de amanhã', addDays(today(), 2)],
      ['Próxima semana', addDays(today(), 7)]].map(([label, d]) =>
      el('button', { type: 'button', class: 'chip chip--out', onclick: () => { date.value = d; } }, label)));

  const { close } = openSheet({
    title: 'Mover para outra data',
    body: el('div', {}, field('Nova data', date), quick, field('Horário', time)),
    foot: [el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        const store = isEvent ? S.events : S.tasks;
        await store.move(instance, date.value, time.value || null);
        ok(`Movido para ${fmtDate(date.value, 'short')}`);
        close(); onChange?.();
      },
    }, 'Mover')],
  });
}

const slug = s => String(s || 'item').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 40);

export { iso };
