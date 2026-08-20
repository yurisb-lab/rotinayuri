/* Histórico — consultar dias anteriores e pesquisar no que já aconteceu. */

import { el, icon, clear, debounce } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty, taskItem, eventItem, logItem, noteCard } from '../ui/items.js';
import { search } from '../features/search.js';
import { today, addDays, fmtDate, fmtRelative, iso, parseISO } from '../util/date.js';
import { go } from '../core/router.js';

export const title = 'Histórico';

const state = { range: 'hoje', date: today(), q: '' };

const RANGES = [
  ['hoje', 'Hoje'],
  ['ontem', 'Ontem'],
  ['7', 'Últimos 7 dias'],
  ['mes', 'Este mês'],
  ['data', 'Data específica'],
];

export async function render(root, { params, refresh }) {
  if (params.d) { state.range = 'data'; state.date = params.d; }
  clear(root);

  root.appendChild(el('div', { class: 'searchbox' }, icon('search'),
    el('input', {
      placeholder: 'Pesquisar no histórico (ex.: João)', value: state.q,
      oninput: debounce(e => { state.q = e.target.value; draw(); }, 200),
    })));

  const chips = el('div', { class: 'scroller', style: { marginBottom: '10px' } });
  const drawChips = () => {
    clear(chips);
    RANGES.forEach(([v, l]) => chips.appendChild(el('button', {
      class: `chip ${state.range === v ? 'chip--on' : 'chip--out'}`,
      onclick: () => { state.range = v; drawChips(); draw(); },
    }, l)));
  };
  drawChips();
  root.appendChild(chips);

  const datePick = el('input', {
    class: 'input', type: 'date', value: state.date,
    oninput: e => { state.date = e.target.value || today(); state.range = 'data'; drawChips(); draw(); },
  });
  root.appendChild(el('div', { class: 'field' }, datePick));

  const body = el('div');
  root.appendChild(body);
  await draw();

  async function draw() {
    clear(body);
    if (state.q.trim().length >= 2) return drawSearch(body, state.q, refresh);
    const { from, to } = bounds();
    if (from === to) return drawDay(body, from, refresh);
    return drawRange(body, from, to, refresh);
  }
}

function bounds() {
  const d = today();
  switch (state.range) {
    case 'hoje':  return { from: d, to: d };
    case 'ontem': return { from: addDays(d, -1), to: addDays(d, -1) };
    case '7':     return { from: addDays(d, -6), to: d };
    case 'mes':   return { from: d.slice(0, 8) + '01', to: d };
    default:      return { from: state.date, to: state.date };
  }
}

/* ------------------------------------------------------------- um dia */
async function drawDay(root, d, refresh) {
  const [stats, day, tl] = await Promise.all([S.dayStats(d), S.days.get(d), S.timeline(d)]);

  root.appendChild(el('div', { class: 'card', style: { marginBottom: '16px' } },
    el('div', { class: 'row row--between' },
      el('h3', {}, fmtDate(d, 'long')),
      el('span', { class: 'pill' }, fmtRelative(d))),
    el('div', { class: 'stats', style: { marginTop: '12px' } },
      mini(stats.doneTasks, 'feitas'), mini(stats.openTasks, 'pendentes'),
      mini(stats.plannedEvents, 'compromissos'), mini(stats.logCount, 'registros')),
    day?.reflection
      ? el('p', { class: 'muted', style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, `“${day.reflection}”`)
      : null,
    day?.closedAt ? el('span', { class: 'pill pill--ok', style: { marginTop: '8px', display: 'inline-block' } }, 'dia fechado') : null));

  if (tl.length) {
    root.appendChild(section('Linha do tempo', tl.length));
    const tlBox = el('div', { class: 'tl' });
    tl.forEach(it => tlBox.appendChild(el('div', { class: 'tl__item', style: { '--dot': it.color } },
      el('span', { class: 'tl__time' }, it.at),
      el('span', { class: 'tl__dot' }),
      el('div', { class: 'tl__card' },
        el('div', { class: 'tl__kind' }, it.kind),
        el('div', { class: 'tl__text' }, it.title)))));
    root.appendChild(tlBox);
  }

  block(root, 'Tarefas planejadas', stats.tasks, t => taskItem(t, { onChange: refresh, showDate: false }));
  block(root, 'Compromissos', stats.events, e => eventItem(e, { onChange: refresh, showDate: false }));
  block(root, 'Registros realizados', stats.logs, l => logItem(l, { onChange: refresh }));
  if (stats.notes.length) {
    root.appendChild(el('div', { style: { marginTop: '18px' } }, section('Anotações do dia', stats.notes.length)));
    root.appendChild(el('div', { class: 'notegrid' }, ...stats.notes.map(n => noteCard(n, { onChange: refresh }))));
  }

  root.appendChild(el('button', {
    class: 'btn btn--ghost btn--block', style: { marginTop: '18px' },
    onclick: () => go(`#/registro?d=${d}`),
  }, icon('log'), 'Abrir registro deste dia'));
}

function block(root, title, items, renderer) {
  root.appendChild(el('div', { style: { marginTop: '18px' } }, section(title, items.length)));
  root.appendChild(items.length
    ? el('div', { class: 'stack' }, ...items.map(renderer))
    : empty('Nada aqui.'));
}
function mini(v, l) { return el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, l)); }

/* ---------------------------------------------------------- vários dias */
async function drawRange(root, from, to, refresh) {
  const days = [];
  for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);

  root.appendChild(section(`${fmtDate(from, 'short')} – ${fmtDate(to, 'short')}`, days.length));
  for (const d of days) {
    const s = await S.dayStats(d);
    const day = await S.days.get(d);
    const has = s.plannedTasks || s.plannedEvents || s.logCount;
    root.appendChild(el('button', {
      class: 'item',
      style: { width: '100%', textAlign: 'left', '--cat': has ? 'var(--c-accent)' : 'transparent' },
      onclick: () => { state.range = 'data'; state.date = d; go(`#/historico?d=${d}`); },
    },
      el('div', { class: 'item__body' },
        el('div', { class: 'item__title' }, `${fmtDate(d, 'long')}`),
        el('div', { class: 'item__meta' },
          el('span', {}, `${s.doneTasks}/${s.plannedTasks} tarefas`),
          el('span', {}, `${s.plannedEvents} compromissos`),
          el('span', {}, `${s.logCount} registros`),
          day?.closedAt ? el('span', { class: 'pill pill--ok' }, 'fechado') : null)),
      el('div', { class: 'ring', style: { '--p': s.progress, width: '42px', height: '42px' }, 'data-label': `${s.progress}` }),
      icon('chev', 'ic--sm')));
  }
  void refresh;
}

/* -------------------------------------------------------------- pesquisa */
async function drawSearch(root, q, refresh) {
  const res = await search(q);
  root.appendChild(section(`Resultados para "${q}"`, res.total));
  if (!res.items.length) { root.appendChild(empty('Nada encontrado.')); return; }

  const LABEL = { task: 'Tarefas', event: 'Compromissos', log: 'Registros', note: 'Notas', inbox: 'Entrada', day: 'Fechamentos' };
  for (const [kind, items] of Object.entries(res.groups)) {
    root.appendChild(el('div', { style: { marginTop: '14px' } }, section(LABEL[kind] || kind, items.length)));
    const stack = el('div', { class: 'stack' });
    for (const it of items) {
      if (kind === 'task') stack.appendChild(taskItem({ ...it.row, instanceId: it.row.id, isOccurrence: false }, { onChange: refresh }));
      else if (kind === 'event') stack.appendChild(eventItem({ ...it.row, instanceId: it.row.id, isOccurrence: false }, { onChange: refresh }));
      else if (kind === 'log') stack.appendChild(logItem(it.row, { onChange: refresh }));
      else if (kind === 'note') stack.appendChild(noteCard(it.row, { onChange: refresh }));
      else stack.appendChild(el('button', {
        class: 'item', style: { textAlign: 'left' },
        onclick: () => go(kind === 'day' ? `#/historico?d=${it.row.date}` : '#/entrada'),
      },
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, it.title),
          it.sub ? el('div', { class: 'item__meta' }, el('span', {}, it.sub)) : null)));
    }
    root.appendChild(stack);
  }
}

export { iso, parseISO };
