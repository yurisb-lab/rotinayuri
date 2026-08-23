/* Painel — visão geral de tarefas, compromissos, registros e categorias. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty, eventItem, taskItem } from '../ui/items.js';
import { today, addDays, fmtDate, DOW_SHORT, dow } from '../util/date.js';
import { go } from '../core/router.js';

export const title = 'Painel';

export async function render(root, { refresh }) {
  clear(root);
  const d = today();
  const from = addDays(d, -6), to = addDays(d, 14);

  const [dash, week, upcoming, overdue] = await Promise.all([
    S.dashboard(from, to),
    S.weeklyProgress(7, d),
    S.events.upcoming(14, d),
    S.tasks.overdue(d),
  ]);

  root.appendChild(section('Situação atual'));
  root.appendChild(el('div', { class: 'stats' },
    stat(dash.pending, 'pendentes', 'var(--c-accent)'),
    stat(dash.doing, 'em andamento', 'var(--c-warn)'),
    stat(dash.done, 'concluídas', 'var(--c-ok)'),
    stat(dash.overdue, 'atrasadas', 'var(--c-danger)'),
    stat(dash.events, 'compromissos', 'var(--c-info)'),
    stat(dash.logs, 'registros', 'var(--c-text-2)')));

  /* progresso semanal --------------------------------------------------- */
  const max = Math.max(1, ...week.map(w => Math.max(w.planned, w.done, w.logs)));
  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Progresso dos últimos 7 dias')));
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'spark' }, ...week.map(w => el('div', {},
      el('i', { style: { height: `${Math.round((w.done / max) * 100)}%`, background: w.date === d ? 'var(--c-accent)' : 'var(--c-ok)' },
        title: `${w.done} de ${w.planned}` }),
      el('small', {}, DOW_SHORT[dow(w.date)])))),
    el('p', { class: 'tiny dim center', style: { marginTop: '8px' } },
      `${week.reduce((a, w) => a + w.done, 0)} itens concluídos · ${week.reduce((a, w) => a + w.logs, 0)} registros na semana`)));

  /* distribuição por categoria ------------------------------------------- */
  const cats = S.categories.all();
  const total = Object.values(dash.perCat).reduce((a, b) => a + b, 0);
  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Distribuição por categoria')));
  if (!total) {
    root.appendChild(empty('Sem dados no período.'));
  } else {
    const bar = el('div', { class: 'catbar' });
    const legend = el('div', { class: 'wrap', style: { marginTop: '10px' } });
    for (const c of cats) {
      const n = dash.perCat[c.id] || 0;
      if (!n) continue;
      bar.appendChild(el('i', { style: { width: `${(n / total) * 100}%`, background: c.color }, title: `${c.name}: ${n}` }));
      legend.appendChild(el('span', { class: 'chip chip--cat', style: { '--cat': c.color } },
        `${c.icon} ${c.name}`, el('b', { style: { marginLeft: '4px' } }, String(n))));
    }
    const semCat = dash.perCat.sem || 0;
    if (semCat) {
      bar.appendChild(el('i', { style: { width: `${(semCat / total) * 100}%`, background: 'var(--c-text-3)' } }));
      legend.appendChild(el('span', { class: 'chip' }, 'sem categoria', el('b', { style: { marginLeft: '4px' } }, String(semCat))));
    }
    root.appendChild(el('div', { class: 'card' }, bar, legend));
  }

  /* atrasadas ------------------------------------------------------------ */
  if (overdue.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Tarefas atrasadas', overdue.length)));
    root.appendChild(el('div', { class: 'stack' }, ...overdue.slice(0, 6).map(t => taskItem(t, { onChange: refresh }))));
  }

  /* próximos compromissos ------------------------------------------------- */
  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Próximos compromissos', upcoming.length)));
  root.appendChild(upcoming.length
    ? el('div', { class: 'stack' }, ...upcoming.slice(0, 6).map(e => eventItem(e, { onChange: refresh })))
    : empty('Nada agendado.'));

  root.appendChild(el('button', {
    class: 'btn btn--ghost btn--block', style: { marginTop: '20px' },
    onclick: () => go('#/historico'),
  }, icon('history'), 'Ver histórico completo'));

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '12px' } },
    `Período analisado: ${fmtDate(from, 'short')} a ${fmtDate(to, 'short')}`));
}

function stat(value, label, color) {
  return el('div', { class: 'stat' },
    el('b', { style: { color } }, String(value)),
    el('span', {}, label));
}
