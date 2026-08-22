/* Retrospectiva de mês, trimestre e ano (fase 11).

   O ganho de arquitetura já estava pronto sem ninguém ter planejado: o
   fechamento do dia grava um resumo em `days.summary`. Ou seja, `days` já é
   uma tabela de agregados diários pré-calculados.

   A retrospectiva lê `days` primeiro — 30 linhas em vez de milhares — e só
   cai para os itens brutos nos dias que não foram fechados. É isso que faz um
   ano de dados abrir sem travar no celular.

   Enquanto não houver meses de histórico, esta tela vai render magra. Isso é
   esperado: o código fica pronto enquanto o banco enche. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty } from '../ui/items.js';
import { today, addDays, addMonths, fmtDate, MONTHS, parseISO, iso } from '../util/date.js';
import { go } from '../core/router.js';

export const title = 'Retrospectiva';

const PERIODOS = {
  mes:       { label: 'Mês',       meses: 1 },
  trimestre: { label: 'Trimestre', meses: 3 },
  ano:       { label: 'Ano',       meses: 12 },
};

export async function render(root, { params }) {
  clear(root);
  const modo = PERIODOS[params.p] ? params.p : 'mes';
  const fim = params.d || today();
  const inicio = addMonths(fim, -PERIODOS[modo].meses);

  /* seletor de período --------------------------------------------------- */
  root.appendChild(el('div', { class: 'scroller', style: { marginBottom: '14px' } },
    ...Object.entries(PERIODOS).map(([k, v]) => el('button', {
      class: `chip ${k === modo ? 'chip--on' : 'chip--out'}`,
      onclick: () => go(`#/retrospectiva?p=${k}${params.d ? `&d=${params.d}` : ''}`),
    }, v.label))));

  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', 'aria-label': 'Anterior',
      onclick: () => go(`#/retrospectiva?p=${modo}&d=${addMonths(fim, -PERIODOS[modo].meses)}`) }, icon('back')),
    el('h2', { class: 'cal__month' }, `${fmtDate(inicio, 'short')} – ${fmtDate(fim, 'short')}`),
    params.d ? el('button', { class: 'btn btn--sm btn--ghost', onclick: () => go(`#/retrospectiva?p=${modo}`) }, 'Agora') : null,
    el('button', { class: 'cal__nav', 'aria-label': 'Próximo',
      onclick: () => go(`#/retrospectiva?p=${modo}&d=${addMonths(fim, PERIODOS[modo].meses)}`) }, icon('chev'))));

  const dados = await agregar(inicio, fim);

  if (!dados.total) {
    root.appendChild(empty('Nada registrado neste período ainda. Esta tela se preenche sozinha conforme os dias vão passando.'));
    return;
  }

  /* totais ---------------------------------------------------------------- */
  root.appendChild(el('div', { class: 'stats', style: { marginBottom: '18px' } },
    box(dados.total, 'acontecimentos'),
    box(dados.concluidas, 'concluídas'),
    box(dados.momentos, 'momentos'),
    box(dados.diasComRegistro, 'dias com registro')));

  /* categorias ------------------------------------------------------------ */
  const cats = S.categories.all()
    .map(c => ({ c, n: dados.perCat[c.id] || 0 }))
    .filter(x => x.n).sort((a, b) => b.n - a.n);
  if (cats.length) {
    const maior = Math.max(...cats.map(x => x.n));
    root.appendChild(section('Onde o período foi parar'));
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'wk__bars' },
      ...cats.map(({ c, n }) => el('div', { class: 'wk__bar' },
        el('span', {}, `${c.icon} ${c.name}`),
        el('i', { style: { width: `${(n / maior) * 100}%`, background: c.color } }),
        el('b', {}, String(n)))))));
  }

  /* mês a mês -------------------------------------------------------------- */
  if (dados.porMes.length > 1) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Mês a mês')));
    const maiorM = Math.max(...dados.porMes.map(m => m.n));
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'wk__bars' },
      ...dados.porMes.map(m => el('div', { class: 'wk__bar' },
        el('span', {}, m.rot),
        el('i', { style: { width: `${(m.n / Math.max(1, maiorM)) * 100}%`, background: 'var(--c-accent)' } }),
        el('b', {}, String(m.n)))))));
  }

  /* pessoas e lugares ------------------------------------------------------ */
  if (dados.pessoas.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Quem esteve mais presente')));
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'wrap' },
      ...dados.pessoas.map(([nome, n]) => el('span', { class: 'chip chip--out' },
        nome, el('b', { style: { marginLeft: '5px' } }, String(n)))))));
  }
  if (dados.lugares.length) {
    root.appendChild(el('div', { style: { marginTop: '18px' } }, section('Onde você mais esteve')));
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'wrap' },
      ...dados.lugares.map(([nome, n]) => el('span', { class: 'chip chip--out' },
        nome, el('b', { style: { marginLeft: '5px' } }, String(n)))))));
  }

  /* momentos --------------------------------------------------------------- */
  if (dados.listaMomentos.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Momentos', dados.listaMomentos.length)));
    root.appendChild(el('div', { class: 'stack' }, ...dados.listaMomentos.slice(0, 12).map(m =>
      el('div', { class: 'moment' },
        el('span', { class: 'moment__ic' }, S.MOMENT_KINDS[m.momentKind]?.icon || '⭐'),
        el('div', { class: 'grow' },
          el('div', { class: 'moment__t' }, m.text),
          el('div', { class: 'tiny dim' }, fmtDate(m.date, 'short')))))));
  }

  /* há um ano ---------------------------------------------------------------- */
  const haUmAno = addMonths(today(), -12);
  const dAno = await S.dayStats(haUmAno).catch(() => null);
  if (dAno && (dAno.logCount || dAno.doneTasks)) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Há um ano')));
    root.appendChild(el('div', { class: 'card' },
      el('p', { class: 'small' }, `Em ${fmtDate(haUmAno, 'long')} você registrou ${dAno.logCount} ${dAno.logCount === 1 ? 'acontecimento' : 'acontecimentos'}.`),
      el('button', { class: 'btn btn--ghost btn--block', style: { marginTop: '8px' },
        onclick: () => go(`#/registro?d=${haUmAno}`) }, 'Ver aquele dia')));
  }

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '20px' } },
    `${dados.viaResumo} de ${dados.diasNoPeriodo} dias vieram de fechamentos já gravados.`));
}

/* Lê `days` primeiro; só varre os itens dos dias que não foram fechados. */
async function agregar(inicio, fim) {
  const [tk, ev, lg, mm, dias] = await Promise.all([
    S.tasks.inRange(inicio, fim), S.events.inRange(inicio, fim),
    S.logs.inRange(inicio, fim), S.moments.inRange(inicio, fim),
    S.days.all(),
  ]);
  const fechados = new Map(dias
    .filter(d => d.closedAt && d.date >= inicio && d.date <= fim && d.summary)
    .map(d => [d.date, d]));

  const perCat = {};
  const bump = id => { perCat[id || 'sem'] = (perCat[id || 'sem'] || 0) + 1; };
  tk.forEach(t => bump(t.categoryId));
  ev.forEach(e => bump(e.categoryId));
  lg.forEach(l => bump(l.categoryId));

  const pessoas = {}, lugares = {};
  const p = (n) => { if (n) pessoas[n] = (pessoas[n] || 0) + 1; };
  const q = (n) => { if (n) lugares[n] = (lugares[n] || 0) + 1; };
  lg.forEach(l => { (l.people?.length ? l.people : (l.person ? [l.person] : [])).forEach(p); q(l.place); });
  tk.forEach(t => { (t.people || []).forEach(p); q(t.place); });
  ev.forEach(e => { (e.people || []).forEach(p); q(e.location); });

  /* mês a mês */
  const porMes = [];
  let cursor = iso(new Date(parseISO(inicio).getFullYear(), parseISO(inicio).getMonth(), 1));
  while (cursor <= fim) {
    const dt = parseISO(cursor);
    const proximo = addMonths(cursor, 1);
    const n = [...tk, ...ev, ...lg].filter(x => x.date >= cursor && x.date < proximo).length;
    porMes.push({ rot: `${MONTHS[dt.getMonth()].slice(0, 3)}/${String(dt.getFullYear()).slice(2)}`, n });
    cursor = proximo;
  }

  const diasComRegistro = new Set(lg.map(l => l.date)).size;
  let diasNoPeriodo = 0;
  for (let d = inicio; d <= fim; d = addDays(d, 1)) diasNoPeriodo++;

  return {
    total: tk.length + ev.length + lg.length,
    concluidas: tk.filter(t => t.status === 'concluida').length,
    momentos: mm.length,
    listaMomentos: mm,
    diasComRegistro, diasNoPeriodo,
    viaResumo: fechados.size,
    perCat, porMes,
    pessoas: Object.entries(pessoas).sort((a, b) => b[1] - a[1]).slice(0, 10),
    lugares: Object.entries(lugares).sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

function box(v, l) {
  return el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, l));
}
