/* Tela "Minha semana" — revisão semanal (fase 8).

   Regra de projeto, e ela vale mais que o código: esta tela mostra ONDE a
   semana foi parar, nunca se ela foi produtiva. Por isso não existe aqui
   nenhum percentual de produtividade, nenhuma meta, nenhuma sequência que se
   perde e nenhuma cor julgando resultado. As barras comparam categorias entre
   si — normalizadas pela maior, nunca por um alvo. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty, taskItem } from '../ui/items.js';
import { today, addDays, fmtDate, startOfWeek, DOW, dow } from '../util/date.js';
import { go } from '../core/router.js';
import { ok } from '../ui/toast.js';

export const title = 'Minha semana';

export async function render(root, { params, refresh }) {
  clear(root);
  const weekStart = S.settings.get('weekStart') || 0;
  const ref = params.d || today();
  const from = startOfWeek(ref, weekStart);
  const to = addDays(from, 6);

  const [wk, prevAnswer] = await Promise.all([
    S.weekSummary(from, to),
    S.days.get(`semana:${addDays(from, -7)}`),
  ]);

  /* navegação entre semanas ------------------------------------------- */
  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', 'aria-label': 'Semana anterior',
      onclick: () => go(`#/semana?d=${addDays(from, -7)}`) }, icon('back')),
    el('h2', { class: 'cal__month' }, `${fmtDate(from, 'short')} – ${fmtDate(to, 'short')}`),
    from !== startOfWeek(today(), weekStart)
      ? el('button', { class: 'btn btn--sm btn--ghost', onclick: () => go('#/semana') }, 'Esta semana')
      : null,
    el('button', { class: 'cal__nav', 'aria-label': 'Próxima semana',
      onclick: () => go(`#/semana?d=${addDays(from, 7)}`) }, icon('chev'))));

  if (!wk.total) {
    root.appendChild(empty('Nenhum registro nesta semana ainda. Conforme você for usando o app, esta tela se preenche sozinha.'));
    return;
  }

  /* total --------------------------------------------------------------- */
  root.appendChild(el('div', { class: 'card', style: { marginBottom: '18px' } },
    el('div', { class: 'wk__num' }, String(wk.total)),
    el('p', { class: 'small muted', style: { margin: '2px 0 0' } },
      `${wk.total === 1 ? 'atividade' : 'atividades'} entre tarefas, compromissos e registros`)));

  /* distribuição por categoria ------------------------------------------ */
  const cats = S.categories.all();
  const entradas = cats
    .map(c => ({ c, n: wk.perCat[c.id] || 0 }))
    .filter(x => x.n)
    .sort((a, b) => b.n - a.n);
  const semCat = wk.perCat.sem || 0;
  const maior = Math.max(1, ...entradas.map(x => x.n), semCat);

  root.appendChild(section('Onde a semana foi parar'));
  const bars = el('div', { class: 'wk__bars' });
  for (const { c, n } of entradas) {
    bars.appendChild(el('div', { class: 'wk__bar' },
      el('span', {}, `${c.icon} ${c.name}`),
      el('i', { style: { width: `${(n / maior) * 100}%`, background: c.color } }),
      el('b', {}, String(n))));
  }
  if (semCat) {
    bars.appendChild(el('div', { class: 'wk__bar' },
      el('span', {}, 'sem categoria'),
      el('i', { style: { width: `${(semCat / maior) * 100}%`, background: 'var(--c-text-3)' } }),
      el('b', {}, String(semCat))));
  }
  root.appendChild(el('div', { class: 'card' }, bars));

  /* a semana em acontecimentos ------------------------------------------ */
  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Minha semana em acontecimentos')));
  const diasBox = el('div', { class: 'card' });
  for (const dia of wk.dias) {
    diasBox.appendChild(el('div', { class: 'wk__day' },
      el('span', {}, DOW[dow(dia.date)].replace('-feira', '')),
      dia.itens.length
        ? el('div', {}, dia.itens.join(' + '),
            dia.total > dia.itens.length ? el('em', {}, ` +${dia.total - dia.itens.length}`) : null)
        : el('div', {}, el('em', {}, '—'))));
  }
  root.appendChild(diasBox);

  /* principais realizações ---------------------------------------------- */
  const destaques = [...wk.moments];
  root.appendChild(el('div', { style: { marginTop: '22px' } },
    section('Principais realizações', wk.concluidas.length)));
  if (wk.concluidas.length || destaques.length) {
    const box = el('div', { class: 'stack' });
    destaques.slice(0, 4).forEach(m => box.appendChild(
      el('div', { class: 'item', style: { '--cat': 'var(--c-accent)' } },
        el('div', { style: { minWidth: '28px', fontSize: '18px' } },
          S.MOMENT_KINDS[m.momentKind]?.icon || '⭐'),
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, m.text),
          el('div', { class: 'item__meta' }, fmtDate(m.date, 'short'))))));
    wk.concluidas.slice(0, 8).forEach(t => box.appendChild(taskItem(t, { onChange: refresh })));
    root.appendChild(box);
  } else {
    root.appendChild(empty('Nada marcado como concluído nesta semana.'));
  }

  /* pendências ----------------------------------------------------------- */
  if (wk.pendentes.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } },
      section('Ficou em aberto', wk.pendentes.length)));
    root.appendChild(el('div', { class: 'stack' },
      ...wk.pendentes.slice(0, 8).map(t => taskItem(t, { onChange: refresh }))));
  }

  /* hábitos --------------------------------------------------------------- */
  if (wk.habitos.total) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Atividades recorrentes')));
    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'wk__num' }, `${wk.habitos.feitos} de ${wk.habitos.total}`),
      el('p', { class: 'small muted', style: { margin: '2px 0 0' } },
        'ocorrências cumpridas nesta semana')));
  }

  /* pessoas --------------------------------------------------------------- */
  if (wk.pessoas.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Com quem você esteve')));
    root.appendChild(el('div', { class: 'card' }, el('div', { class: 'wrap' },
      ...wk.pessoas.map(([nome, n]) => el('button', {
        class: 'chip chip--out', onclick: () => go(`#/pessoas?q=${encodeURIComponent(nome)}`),
      }, nome, el('b', { style: { marginLeft: '5px' } }, String(n)))))));
  }

  /* a pergunta do fim ------------------------------------------------------ */
  const chave = `semana:${from}`;
  const guardado = await S.days.get(chave);
  const resposta = el('textarea', {
    class: 'textarea',
    placeholder: 'Ex.: separar uma hora fixa para estudar.',
  }, guardado?.reflection || '');

  root.appendChild(el('div', { style: { marginTop: '24px' } },
    section('O que você gostaria de melhorar na próxima semana?')));
  if (prevAnswer?.reflection) {
    root.appendChild(el('div', { class: 'card card--flat', style: { marginBottom: '10px' } },
      el('p', { class: 'tiny dim', style: { margin: '0 0 4px' } }, 'Na semana passada você escreveu:'),
      el('p', { class: 'small', style: { margin: 0, whiteSpace: 'pre-wrap' } }, prevAnswer.reflection)));
  }
  root.appendChild(resposta);
  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginTop: '10px' },
    onclick: async () => {
      await S.days.save({ date: chave, reflection: resposta.value.trim(), kind: 'week' });
      ok('Guardado');
    },
  }, 'Guardar'));

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '18px' } },
    'Esta tela mostra onde sua semana foi parar. Ela não dá nota.'));
}
