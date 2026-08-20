/* Tela "Tarefas" — lista com filtros por período, status e categoria. */

import { el, icon, clear, debounce } from '../util/dom.js';
import * as S from '../core/store.js';
import { taskItem, section, empty } from '../ui/items.js';
import { editTask } from '../ui/forms.js';
import { today, addDays, fmtRelative, fmtDate } from '../util/date.js';
import { normalizeText } from '../features/nlp.js';

export const title = 'Tarefas';

const state = { period: 'proximas', status: 'abertas', categoryId: null, q: '' };

const PERIODS = [
  ['hoje', 'Hoje'],
  ['proximas', 'Próximos 7 dias'],
  ['mes', 'Este mês'],
  ['atrasadas', 'Atrasadas'],
  ['semdata', 'Sem data'],
  ['todas', 'Todas'],
];
const STATUSES = [
  ['abertas', 'Em aberto'],
  ['concluida', 'Concluídas'],
  ['andamento', 'Em andamento'],
  ['cancelada', 'Canceladas'],
  ['todos', 'Todos'],
];

export async function render(root, { params, refresh }) {
  if (params?.filtro && PERIODS.some(p => p[0] === params.filtro)) {
    state.period = params.filtro;
    if (params.filtro === 'atrasadas') state.status = 'abertas';
  }
  clear(root);

  const listBox = el('div', { class: 'stack' });
  const searchInput = el('input', {
    class: 'input', placeholder: 'Filtrar tarefas…', value: state.q,
    oninput: debounce(e => { state.q = e.target.value; draw(); }, 150),
  });

  root.appendChild(el('div', { class: 'searchbox' }, icon('search'), searchInput));
  root.appendChild(chips(PERIODS, () => state.period, v => { state.period = v; draw(); }));
  root.appendChild(chips(STATUSES, () => state.status, v => { state.status = v; draw(); }));
  root.appendChild(catChips(() => draw()));
  root.appendChild(el('div', { class: 'section' }, el('div', { id: 'taskCount', class: 'section__head' })));
  root.appendChild(listBox);
  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginTop: '16px' },
    onclick: () => editTask(null, { date: today() }).then(refresh),
  }, icon('plus'), 'Nova tarefa'));

  await draw();

  async function draw() {
    clear(listBox);
    const items = await collect();
    const filtered = items.filter(matches);
    const head = root.querySelector('#taskCount');
    clear(head);
    head.appendChild(el('h2', { class: 'section__title' }, labelOf()));
    head.appendChild(el('span', { class: 'section__count' }, String(filtered.length)));

    if (!filtered.length) { listBox.appendChild(empty('Nenhuma tarefa com esses filtros.')); return; }

    const groups = new Map();
    for (const t of filtered) {
      const key = t.date || 'sem-data';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const keys = [...groups.keys()].sort((a, b) =>
      a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : a.localeCompare(b));

    for (const k of keys) {
      listBox.appendChild(el('div', { class: 'section__head', style: { marginTop: '10px' } },
        el('h3', { class: 'section__title' },
          k === 'sem-data' ? 'Sem data' : `${fmtRelative(k)} · ${fmtDate(k, 'short')}`),
        el('span', { class: 'section__count' }, String(groups.get(k).length))));
      groups.get(k).forEach(t => listBox.appendChild(taskItem(t, { onChange: refresh, showDate: false })));
    }
  }

  function matches(t) {
    if (state.categoryId && t.categoryId !== state.categoryId) return false;
    if (state.status === 'abertas' && (t.status === 'concluida' || t.status === 'cancelada')) return false;
    if (['concluida', 'andamento', 'cancelada'].includes(state.status) && t.status !== state.status) return false;
    if (state.q) {
      const hay = normalizeText([t.title, t.description, t.notes, (t.tags || []).join(' ')].join(' '));
      if (!normalizeText(state.q).split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  async function collect() {
    const d = today();
    switch (state.period) {
      case 'hoje':      return S.tasks.forDate(d);
      case 'proximas':  return S.tasks.inRange(d, addDays(d, 7));
      case 'mes':       return S.tasks.inRange(d.slice(0, 8) + '01', addDays(d, 45));
      case 'atrasadas': return S.tasks.overdue(d);
      case 'semdata':   return (await S.tasks.noDate()).map(t => ({ ...t, instanceId: t.id, isOccurrence: false }));
      default: {
        const range = await S.tasks.inRange(addDays(d, -120), addDays(d, 180));
        const nodate = (await S.tasks.noDate()).map(t => ({ ...t, instanceId: t.id, isOccurrence: false }));
        return [...range, ...nodate];
      }
    }
  }
  function labelOf() {
    return (PERIODS.find(p => p[0] === state.period) || [])[1] || 'Tarefas';
  }
}

function chips(options, getter, setter) {
  const wrap = el('div', { class: 'scroller', style: { marginBottom: '8px' } });
  const draw = () => {
    clear(wrap);
    options.forEach(([v, label]) => wrap.appendChild(el('button', {
      class: `chip ${getter() === v ? 'chip--on' : 'chip--out'}`,
      onclick: () => { setter(v); draw(); },
    }, label)));
  };
  draw();
  return wrap;
}

function catChips(onChange) {
  const wrap = el('div', { class: 'scroller', style: { marginBottom: '10px' } });
  const draw = () => {
    clear(wrap);
    wrap.appendChild(el('button', {
      class: `chip ${!state.categoryId ? 'chip--on' : 'chip--out'}`,
      onclick: () => { state.categoryId = null; draw(); onChange(); },
    }, 'Todas as categorias'));
    S.categories.all().forEach(c => wrap.appendChild(el('button', {
      class: `chip ${state.categoryId === c.id ? 'chip--on' : 'chip--out'}`,
      style: state.categoryId === c.id ? { background: c.color, borderColor: c.color, color: '#fff' } : null,
      onclick: () => { state.categoryId = c.id; draw(); onChange(); },
    }, `${c.icon} ${c.name}`)));
  };
  draw();
  return wrap;
}

export { section };
