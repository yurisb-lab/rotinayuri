/* Tela "Calendário" — visualizações de mês, semana, dia e lista/agenda.
   Permite arrastar itens (segure e arraste) para mudar data/horário. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { taskItem, eventItem, section, empty } from '../ui/items.js';
import { editTask, editEvent } from '../ui/forms.js';
import { makeDraggable } from '../ui/dragdrop.js';
import { menu } from '../ui/modal.js';
import { ok } from '../ui/toast.js';
import {
  today, iso, parseISO, addDays, addMonths, monthMatrix, weekDays, startOfWeek,
  fmtDate, fmtTime, DOW_SHORT, MONTHS, dow,
} from '../util/date.js';

export const title = 'Calendário';

const state = { view: 'mes', cursor: today(), selected: today() };

export async function render(root, { refresh }) {
  clear(root);

  root.appendChild(el('div', { class: 'cal__views' },
    ...[['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Agenda']].map(([v, l]) =>
      el('button', {
        class: state.view === v ? 'is-active' : '',
        onclick: () => { state.view = v; refresh(); },
      }, l))));

  const body = el('div');
  root.appendChild(body);

  if (state.view === 'mes') await renderMonth(body, refresh);
  if (state.view === 'semana') await renderWeek(body, refresh);
  if (state.view === 'dia') await renderDay(body, refresh);
  if (state.view === 'lista') await renderAgenda(body, refresh);

  root.appendChild(el('div', { class: 'btnbar', style: { marginTop: '16px' } },
    el('button', { class: 'btn btn--primary grow', onclick: () => editEvent(null, { date: state.selected }).then(refresh) },
      icon('plus'), 'Compromisso'),
    el('button', { class: 'btn grow', onclick: () => editTask(null, { date: state.selected }).then(refresh) },
      icon('check'), 'Tarefa')));
}

/* ------------------------------------------------------------------- mês */
async function renderMonth(root, refresh) {
  const cur = parseISO(state.cursor);
  const y = cur.getFullYear(), m = cur.getMonth();
  const weekStart = S.settings.get('weekStart') || 0;
  const cells = monthMatrix(y, m, weekStart);
  const from = cells[0], to = cells[cells.length - 1];

  const [tasks, events] = await Promise.all([S.tasks.inRange(from, to), S.events.inRange(from, to)]);
  const byDate = new Map();
  const push = it => {
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  };
  events.forEach(push); tasks.forEach(push);

  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', 'aria-label': 'Mês anterior', onclick: () => { state.cursor = addMonths(state.cursor, -1); refresh(); } },
      icon('back')),
    el('h2', { class: 'cal__month' }, `${MONTHS[m]} ${y}`),
    el('button', { class: 'btn btn--sm btn--ghost', onclick: () => { state.cursor = today(); state.selected = today(); refresh(); } }, 'Hoje'),
    el('button', { class: 'cal__nav', 'aria-label': 'Próximo mês', onclick: () => { state.cursor = addMonths(state.cursor, 1); refresh(); } },
      icon('chev'))));

  const dowRow = el('div', { class: 'cal__dow' });
  for (let i = 0; i < 7; i++) dowRow.appendChild(el('span', {}, DOW_SHORT[(i + weekStart) % 7]));
  root.appendChild(dowRow);

  const grid = el('div', { class: 'cal__grid' });
  for (const d of cells) {
    const items = byDate.get(d) || [];
    const inMonth = parseISO(d).getMonth() === m;
    const cell = el('button', {
      class: `cal__day ${inMonth ? '' : 'cal__day--out'} ${d === today() ? 'cal__day--today' : ''} ${d === state.selected ? 'cal__day--sel' : ''}`,
      dataset: { dropDate: d },
      onclick: () => { state.selected = d; state.view = 'dia'; state.cursor = d; refresh(); },
    },
      el('span', {}, String(parseISO(d).getDate())),
      el('span', { class: 'cal__dots' }, ...items.slice(0, 4).map(it =>
        el('i', { style: { background: S.categories.color(it.categoryId) || (it.kind === 'event' ? 'var(--c-info)' : 'var(--c-accent)') } }))));
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  /* lista do dia selecionado */
  const dayBox = el('div', { style: { marginTop: '16px' } });
  root.appendChild(dayBox);
  await renderDayList(dayBox, state.selected, refresh);
}

/* ----------------------------------------------------------------- semana */
async function renderWeek(root, refresh) {
  const weekStart = S.settings.get('weekStart') || 0;
  const days = weekDays(state.cursor, weekStart);
  const [tasks, events] = await Promise.all([
    S.tasks.inRange(days[0], days[6]), S.events.inRange(days[0], days[6]),
  ]);
  const startH = S.settings.get('dayStartHour') ?? 6;
  const endH = S.settings.get('dayEndHour') ?? 22;

  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', onclick: () => { state.cursor = addDays(state.cursor, -7); refresh(); } }, icon('back')),
    el('h2', { class: 'cal__month' }, `${fmtDate(days[0], 'dm')} – ${fmtDate(days[6], 'dm')}`),
    el('button', { class: 'btn btn--sm btn--ghost', onclick: () => { state.cursor = today(); refresh(); } }, 'Hoje'),
    el('button', { class: 'cal__nav', onclick: () => { state.cursor = addDays(state.cursor, 7); refresh(); } }, icon('chev'))));

  const grid = el('div', { class: 'week' });
  grid.appendChild(el('div', { class: 'week__hd' }, ''));
  days.forEach(d => grid.appendChild(el('button', {
    class: `week__hd ${d === today() ? 'is-today' : ''}`,
    onclick: () => { state.selected = d; state.cursor = d; state.view = 'dia'; refresh(); },
  }, el('small', {}, DOW_SHORT[dow(d)]), String(parseISO(d).getDate()))));

  const allDayItems = [...events.filter(e => e.allDay || !e.time), ...tasks.filter(t => !t.time)];
  if (allDayItems.length) {
    grid.appendChild(el('div', { class: 'week__hour' }, 'dia'));
    days.forEach(d => {
      const cell = el('div', { class: 'week__cell', dataset: { dropDate: d } });
      allDayItems.filter(i => i.date === d).forEach(i => cell.appendChild(chipFor(i, refresh)));
      grid.appendChild(cell);
    });
  }

  for (let h = startH; h <= endH; h++) {
    grid.appendChild(el('div', { class: 'week__hour' }, `${String(h).padStart(2, '0')}h`));
    for (const d of days) {
      const cell = el('div', {
        class: 'week__cell',
        dataset: { dropDate: d, dropTime: `${String(h).padStart(2, '0')}:00` },
        ondblclick: () => editEvent(null, { date: d, time: `${String(h).padStart(2, '0')}:00` }).then(refresh),
      });
      const hourItems = [
        ...events.filter(e => e.date === d && e.time && Number(e.time.slice(0, 2)) === h),
        ...tasks.filter(t => t.date === d && t.time && Number(t.time.slice(0, 2)) === h),
      ];
      hourItems.forEach(i => cell.appendChild(chipFor(i, refresh)));
      grid.appendChild(cell);
    }
  }
  root.appendChild(grid);
  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '10px' } },
    'Segure e arraste um item para mudar o dia e o horário.'));
}

function chipFor(item, refresh) {
  const node = el('div', {
    class: 'week__ev',
    style: { '--cat': S.categories.color(item.categoryId) || (item.kind === 'event' ? 'var(--c-info)' : 'var(--c-accent)') },
    onclick: e => { e.stopPropagation(); openItem(item, refresh); },
  }, item.title);
  makeDraggable(node, {
    label: item.title,
    onDrop: async ({ date, time }) => {
      const store = item.kind === 'event' ? S.events : S.tasks;
      await store.move(item, date, time ?? item.time);
      ok(`Movido para ${fmtDate(date, 'short')}${time ? ' ' + time : ''}`);
      refresh();
    },
  });
  return node;
}

function openItem(item, refresh) {
  menu({
    title: item.title,
    items: [
      { icon: 'edit', label: 'Abrir', onClick: async () => {
        const base = item.kind === 'event' ? await S.events.get(item.id) : await S.tasks.get(item.id);
        if (!base) return;
        const r = item.kind === 'event' ? await editEvent(base) : await editTask(base);
        if (r !== undefined) refresh();
      } },
      { icon: 'check', label: 'Marcar como concluído', onClick: async () => {
        const store = item.kind === 'event' ? S.events : S.tasks;
        await store.setStatus(item, 'concluida'); refresh();
      } },
    ],
  });
}

/* --------------------------------------------------------------------- dia */
async function renderDay(root, refresh) {
  const d = state.selected;
  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', onclick: () => { state.selected = addDays(d, -1); state.cursor = state.selected; refresh(); } }, icon('back')),
    el('h2', { class: 'cal__month' }, fmtDate(d, 'long')),
    el('button', { class: 'btn btn--sm btn--ghost', onclick: () => { state.selected = today(); state.cursor = today(); refresh(); } }, 'Hoje'),
    el('button', { class: 'cal__nav', onclick: () => { state.selected = addDays(d, 1); state.cursor = state.selected; refresh(); } }, icon('chev'))));

  /* faixa de dias da semana para navegação rápida */
  const strip = el('div', { class: 'scroller', style: { marginBottom: '12px' } });
  weekDays(d, S.settings.get('weekStart') || 0).forEach(x => strip.appendChild(el('button', {
    class: `daychip ${x === d ? 'is-active' : ''}`,
    onclick: () => { state.selected = x; state.cursor = x; refresh(); },
  }, el('span', {}, DOW_SHORT[dow(x)]), el('b', {}, String(parseISO(x).getDate())))));
  root.appendChild(strip);

  const [tasks, events] = await Promise.all([S.tasks.forDate(d), S.events.forDate(d)]);
  const startH = S.settings.get('dayStartHour') ?? 6;
  const endH = S.settings.get('dayEndHour') ?? 22;

  const box = el('div');
  const untimed = [...events.filter(e => !e.time), ...tasks.filter(t => !t.time)];
  if (untimed.length) {
    box.appendChild(el('div', { class: 'dayview__hour', dataset: { dropDate: d } },
      el('b', {}, 'dia'),
      el('div', { class: 'stack--sm' }, ...untimed.map(i => rowFor(i, refresh)))));
  }
  for (let h = startH; h <= endH; h++) {
    const hh = `${String(h).padStart(2, '0')}:00`;
    const items = [...events, ...tasks].filter(i => i.time && Number(i.time.slice(0, 2)) === h);
    box.appendChild(el('div', {
      class: 'dayview__hour',
      dataset: { dropDate: d, dropTime: hh },
      ondblclick: () => editEvent(null, { date: d, time: hh }).then(refresh),
    },
      el('b', {}, `${String(h).padStart(2, '0')}h`),
      el('div', { class: 'stack--sm' }, ...items.map(i => rowFor(i, refresh)))));
  }
  root.appendChild(box);
}

function rowFor(item, refresh) {
  const node = item.kind === 'event'
    ? eventItem(item, { onChange: refresh, showDate: false })
    : taskItem(item, { onChange: refresh, showDate: false });
  makeDraggable(node, {
    label: item.title,
    onDrop: async ({ date, time }) => {
      const store = item.kind === 'event' ? S.events : S.tasks;
      await store.move(item, date, time ?? item.time);
      ok('Item movido');
      refresh();
    },
  });
  return node;
}

async function renderDayList(root, d, refresh) {
  const [tasks, events] = await Promise.all([S.tasks.forDate(d), S.events.forDate(d)]);
  root.appendChild(section(fmtDate(d, 'long'), tasks.length + events.length));
  if (!tasks.length && !events.length) { root.appendChild(empty('Nada marcado neste dia.')); return; }
  const stack = el('div', { class: 'stack' });
  events.forEach(e => stack.appendChild(eventItem(e, { onChange: refresh, showDate: false })));
  tasks.forEach(t => stack.appendChild(taskItem(t, { onChange: refresh, showDate: false })));
  root.appendChild(stack);
}

/* ------------------------------------------------------------------ agenda */
async function renderAgenda(root, refresh) {
  const from = state.cursor;
  const to = addDays(from, 30);
  const [tasks, events] = await Promise.all([S.tasks.inRange(from, to), S.events.inRange(from, to)]);
  const all = [...events, ...tasks].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));

  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', onclick: () => { state.cursor = addDays(state.cursor, -30); refresh(); } }, icon('back')),
    el('h2', { class: 'cal__month' }, `${fmtDate(from, 'dm')} – ${fmtDate(to, 'dm')}`),
    el('button', { class: 'cal__nav', onclick: () => { state.cursor = addDays(state.cursor, 30); refresh(); } }, icon('chev'))));

  if (!all.length) { root.appendChild(empty('Nada nos próximos 30 dias.')); return; }

  let lastDate = null;
  const stack = el('div', { class: 'stack' });
  for (const it of all) {
    if (it.date !== lastDate) {
      lastDate = it.date;
      stack.appendChild(el('div', { class: 'section__head', style: { marginTop: '10px' } },
        el('h3', { class: 'section__title' }, `${DOW_SHORT[dow(it.date)]} · ${fmtDate(it.date, 'num')}`)));
    }
    stack.appendChild(it.kind === 'event'
      ? eventItem(it, { onChange: refresh, showDate: false })
      : taskItem(it, { onChange: refresh, showDate: false }));
  }
  root.appendChild(stack);
}

export { fmtTime, iso, startOfWeek };
