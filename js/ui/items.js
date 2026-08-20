/* Componentes de lista reutilizados pelas telas. */

import { el, icon } from '../util/dom.js';
import { menu } from './modal.js';
import * as S from '../core/store.js';
import * as R from '../features/recurrence.js';
import { itemActions, editLog, editNote } from './forms.js';
import { fmtRelative, fmtTime, isPast, today } from '../util/date.js';
import { vibrate } from '../util/dom.js';

export function section(title, count, action) {
  return el('div', { class: 'section__head' },
    el('h2', { class: 'section__title' }, title),
    count != null ? el('span', { class: 'section__count' }, String(count)) : null,
    action || null);
}

export function empty(text) { return el('div', { class: 'empty' }, text); }

export function actionLink(label, onClick) {
  return el('button', { class: 'section__action', onclick: onClick }, label);
}

/* ------------------------------------------------------------- tarefa */
export function taskItem(t, { onChange, showDate = true } = {}) {
  const cat = S.categories.get(t.categoryId);
  const done = t.status === 'concluida';
  const canceled = t.status === 'cancelada';
  const late = !done && !canceled && t.date && t.date < today();

  const tick = el('button', {
    class: `tick ${done ? 'tick--on' : t.status === 'andamento' ? 'tick--doing' : canceled ? 'tick--cancel' : ''}`,
    'aria-label': done ? 'Marcar como pendente' : 'Concluir',
    onclick: async e => {
      e.stopPropagation();
      vibrate();
      await S.tasks.setStatus(t, done ? 'pendente' : 'concluida');
      onChange?.();
    },
  }, icon(canceled ? 'close' : 'check'));

  const meta = el('div', { class: 'item__meta' });
  if (showDate && t.date) meta.appendChild(el('span', { class: late ? 'pill pill--danger' : '' }, fmtRelative(t.date)));
  if (t.time) meta.appendChild(el('span', { class: 'row', style: { gap: '3px' } }, icon('clock', 'ic--sm'), fmtTime(t.time)));
  if (cat) meta.appendChild(el('span', { class: 'chip', style: { background: cat.color + '22', color: cat.color, padding: '1px 7px', fontSize: '11px' } }, `${cat.icon} ${cat.name}`));
  if (t.recurrence) meta.appendChild(el('span', { class: 'pill pill--accent' }, R.describe(t.recurrence, t.date)));
  if (t.priority === 'urgente' || t.priority === 'alta') {
    meta.appendChild(el('span', { class: `pill ${t.priority === 'urgente' ? 'pill--danger' : 'pill--warn'}` }, S.PRIORITIES[t.priority].label));
  }
  if (t.subtasks?.length) {
    const d = t.subtasks.filter(s => s.done).length;
    meta.appendChild(el('span', { class: 'pill' }, `${d}/${t.subtasks.length}`));
  }
  if (t.status === 'andamento') meta.appendChild(el('span', { class: 'pill pill--warn' }, 'Em andamento'));

  return el('div', {
    class: `item ${done || canceled ? 'item--done' : ''}`,
    style: cat ? { '--cat': cat.color } : null,
    onclick: () => openActions(t, onChange),
  },
    tick,
    el('div', { class: 'item__body' },
      el('div', { class: 'item__title' }, t.title),
      t.description ? el('div', { class: 'tiny dim', style: { marginTop: '2px' } }, t.description.slice(0, 90)) : null,
      meta),
  );
}

/* -------------------------------------------------------- compromisso */
export function eventItem(e, { onChange, showDate = true } = {}) {
  const cat = S.categories.get(e.categoryId);
  const done = e.status === 'concluida';
  const meta = el('div', { class: 'item__meta' });
  if (showDate) meta.appendChild(el('span', {}, fmtRelative(e.date)));
  if (e.location) meta.appendChild(el('span', { class: 'row', style: { gap: '3px' } }, icon('pin', 'ic--sm'), e.location));
  if (e.people?.length) meta.appendChild(el('span', { class: 'row', style: { gap: '3px' } }, icon('people', 'ic--sm'), e.people.join(', ')));
  if (cat) meta.appendChild(el('span', { class: 'chip', style: { background: cat.color + '22', color: cat.color, padding: '1px 7px', fontSize: '11px' } }, `${cat.icon} ${cat.name}`));
  if (e.recurrence) meta.appendChild(el('span', { class: 'pill pill--accent' }, R.describe(e.recurrence, e.date)));

  const timeBox = el('div', {
    class: 'item__side',
    style: { minWidth: '52px', alignItems: 'flex-start' },
  }, el('b', { style: { fontSize: '15px', fontVariantNumeric: 'tabular-nums' } },
      e.allDay ? 'dia' : fmtTime(e.time) || '--:--'),
     e.endTime ? el('small', { class: 'tiny dim' }, fmtTime(e.endTime)) : null);

  return el('div', {
    class: `item ${done ? 'item--done' : ''}`,
    style: cat ? { '--cat': cat.color } : { '--cat': 'var(--c-info)' },
    onclick: () => openActions(e, onChange),
  },
    timeBox,
    el('div', { class: 'item__body' },
      el('div', { class: 'item__title' }, e.title),
      meta),
    done ? el('span', { class: 'pill pill--ok' }, 'ok')
      : isPast(e.date, e.endTime || e.time) ? el('span', { class: 'pill' }, 'passou') : null,
  );
}

/* ------------------------------------------------------------ registro */
export function logItem(l, { onChange } = {}) {
  const cat = S.categories.get(l.categoryId);
  const meta = el('div', { class: 'item__meta' });
  if (l.person) meta.appendChild(el('span', { class: 'row', style: { gap: '3px' } }, icon('people', 'ic--sm'), l.person));
  if (l.place) meta.appendChild(el('span', { class: 'row', style: { gap: '3px' } }, icon('pin', 'ic--sm'), l.place));
  if (cat) meta.appendChild(el('span', { class: 'chip', style: { background: cat.color + '22', color: cat.color, padding: '1px 7px', fontSize: '11px' } }, `${cat.icon} ${cat.name}`));
  (l.tags || []).forEach(t => meta.appendChild(el('span', { class: 'pill' }, '#' + t)));

  return el('div', {
    class: 'item',
    style: { '--cat': cat?.color || 'var(--c-warn)' },
    onclick: async () => { const r = await editLog(l); if (r !== undefined) onChange?.(); },
  },
    el('div', { style: { minWidth: '46px' } },
      el('b', { style: { fontVariantNumeric: 'tabular-nums' } }, fmtTime(l.time))),
    el('div', { class: 'item__body' },
      el('div', { class: 'item__title', style: { fontWeight: '550' } }, l.text),
      meta),
  );
}

/* ---------------------------------------------------------------- nota */
export function noteCard(n, { onChange } = {}) {
  const cat = S.categories.get(n.categoryId);
  return el('button', {
    class: 'note',
    style: cat ? { borderLeft: `3px solid ${cat.color}` } : null,
    onclick: async () => { const r = await editNote(n); if (r !== undefined) onChange?.(); },
  },
    el('div', { class: 'row' },
      n.pinned ? icon('pin', 'ic--sm') : null,
      el('span', { class: 'note__t grow' }, n.title || '(sem título)')),
    el('div', { class: 'note__b' }, n.body || ''),
    el('div', { class: 'item__meta' },
      el('span', { class: 'pill' }, S.NOTE_TYPES[n.type] || n.type),
      cat ? el('span', { class: 'tiny', style: { color: cat.color } }, cat.icon) : null),
  );
}

/* ---------------------------------------------------- menu contextual */
export function openActions(instance, onChange) {
  menu({
    title: instance.title,
    items: itemActions(instance, { onChange }),
  });
}
