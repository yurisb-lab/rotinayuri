/* Tela "Registro do dia" — o que eu fiz, linha do tempo e fechamento do dia. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { logItem, section, empty, actionLink } from '../ui/items.js';
import { quickLog } from '../ui/quickadd.js';
import { editLog } from '../ui/forms.js';
import { openSheet, confirm as ask } from '../ui/modal.js';
import { ok } from '../ui/toast.js';
import { today, addDays, fmtDate, fmtRelative, DOW_SHORT, parseISO, dow, weekDays } from '../util/date.js';
import { go } from '../core/router.js';

export const title = params => params?.d && params.d !== today() ? 'Registro' : 'Registro do dia';

export async function render(root, { params, refresh }) {
  const d = params.d || today();
  clear(root);

  if (params.fechar === '1') { await closeDay(d, refresh); }

  /* navegação por dias ------------------------------------------------- */
  const strip = el('div', { class: 'scroller', style: { marginBottom: '12px' } });
  weekDays(d, S.settings.get('weekStart') || 0).forEach(x => strip.appendChild(el('button', {
    class: `daychip ${x === d ? 'is-active' : ''}`,
    onclick: () => go(`#/registro?d=${x}`),
  }, el('span', {}, DOW_SHORT[dow(x)]), el('b', {}, String(parseISO(x).getDate())))));

  root.appendChild(el('div', { class: 'cal__head' },
    el('button', { class: 'cal__nav', 'aria-label': 'Dia anterior', onclick: () => go(`#/registro?d=${addDays(d, -1)}`) }, icon('back')),
    el('h2', { class: 'cal__month' }, fmtRelative(d)),
    d !== today() ? el('button', { class: 'btn btn--sm btn--ghost', onclick: () => go('#/registro') }, 'Hoje') : null,
    el('button', { class: 'cal__nav', 'aria-label': 'Próximo dia', onclick: () => go(`#/registro?d=${addDays(d, 1)}`) }, icon('chev'))));
  root.appendChild(strip);
  root.appendChild(el('p', { class: 'tiny dim', style: { marginTop: '-6px', marginBottom: '12px' } }, fmtDate(d, 'full')));

  /* botão principal ----------------------------------------------------- */
  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginBottom: '16px' },
    onclick: () => quickLog(refresh),
  }, icon('plus'), 'Registrar o que fiz'));

  const [stats, tl, day] = await Promise.all([S.dayStats(d), S.timeline(d), S.days.get(d)]);

  /* resumo rápido -------------------------------------------------------- */
  root.appendChild(el('div', { class: 'stats', style: { marginBottom: '18px' } },
    box(stats.doneTasks, 'tarefas feitas'),
    box(stats.doneEvents, 'compromissos'),
    box(stats.logCount, 'registros'),
    box(stats.openTasks, 'pendentes')));

  /* linha do tempo ------------------------------------------------------- */
  root.appendChild(section('Linha do tempo do dia', tl.length));
  if (!tl.length) {
    root.appendChild(empty('Nada registrado neste dia ainda.'));
  } else {
    const tlBox = el('div', { class: 'tl' });
    for (const it of tl) {
      tlBox.appendChild(el('div', { class: 'tl__item', style: { '--dot': it.color } },
        el('span', { class: 'tl__time' }, it.at),
        el('span', { class: 'tl__dot' }),
        el('div', {
          class: 'tl__card',
          onclick: () => openTimelineItem(it, refresh),
        },
          el('div', { class: 'tl__kind' }, it.kind),
          el('div', { class: 'tl__text' }, it.title),
          it.sub ? el('div', { class: 'tiny dim' }, it.sub) : null)));
    }
    root.appendChild(tlBox);
  }

  /* registros do dia ------------------------------------------------------ */
  root.appendChild(el('div', { style: { marginTop: '20px' } },
    section('Registros', stats.logCount,
      actionLink('adicionar', () => quickLog(refresh)))));
  root.appendChild(stats.logs.length
    ? el('div', { class: 'stack' }, ...stats.logs.map(l => logItem(l, { onChange: refresh })))
    : empty('Nenhum registro. Toque em "Registrar o que fiz".'));

  /* fechamento ------------------------------------------------------------ */
  root.appendChild(el('div', { style: { marginTop: '22px' } },
    day?.closedAt
      ? el('div', { class: 'card' },
          el('div', { class: 'row row--between' },
            el('h3', {}, 'Dia fechado'),
            el('span', { class: 'pill pill--ok' }, fmtDate(d, 'short'))),
          day.reflection ? el('p', { class: 'muted', style: { marginTop: '8px', whiteSpace: 'pre-wrap' } }, day.reflection) : null,
          el('button', { class: 'btn btn--ghost btn--block', style: { marginTop: '10px' }, onclick: () => closeDay(d, refresh) },
            icon('edit'), 'Revisar fechamento'))
      : el('button', { class: 'btn btn--primary btn--block', onclick: () => closeDay(d, refresh) },
          icon('moon'), 'Fechar meu dia')));
}

function box(value, label) {
  return el('div', { class: 'stat' }, el('b', {}, String(value)), el('span', {}, label));
}

function openTimelineItem(it, refresh) {
  const ref = it.ref;
  if (ref?.kind === 'log') { editLog(ref).then(r => { if (r !== undefined) refresh(); }); return; }
  import('../ui/items.js').then(m => {
    if (ref?.kind === 'note') return;
    m.openActions(ref, refresh);
  });
}

/* ------------------------------------------------------ fechamento do dia */
export async function closeDay(d, refresh) {
  const [stats, tl, prev] = await Promise.all([S.dayStats(d), S.timeline(d), S.days.get(d)]);
  const pending = stats.tasks.filter(t => t.status === 'pendente' || t.status === 'andamento');

  const reflection = el('textarea', {
    class: 'textarea', placeholder: 'Ex.: Dia produtivo. Consegui finalizar as demandas do trabalho, mas fiquei sem tempo para estudar.',
  }, prev?.reflection || '');

  const moveDate = el('input', { class: 'input', type: 'date', value: addDays(d, 1) });
  const moveChecks = new Map();
  const pendingBox = el('div', { class: 'stack--sm' });
  pending.forEach(t => {
    const cb = el('input', { type: 'checkbox', checked: !t.recurrence });
    moveChecks.set(t.instanceId, { cb, task: t });
    pendingBox.appendChild(el('label', { class: 'sub' }, cb,
      el('span', { class: 'grow small' }, t.title),
      t.recurrence ? el('span', { class: 'pill pill--accent' }, 'recorrente') : null));
  });

  const summary = el('div', { class: 'card card--flat', style: { marginBottom: '14px' } },
    el('h3', { style: { marginBottom: '8px' } }, `Resumo de ${fmtDate(d, 'long')}`),
    line('Planejado', `${stats.plannedTasks} tarefa(s) · ${stats.plannedEvents} compromisso(s)`),
    line('Concluído', `${stats.doneTasks} tarefa(s) · ${stats.doneEvents} compromisso(s)`),
    line('Pendências', `${stats.openTasks} tarefa(s)`),
    line('Registros realizados', String(stats.logCount)),
    line('Anotações', String(stats.noteCount)),
    el('div', { class: 'bar', style: { marginTop: '10px' } },
      el('div', { class: 'bar__fill', style: { width: `${stats.progress}%` } })),
    el('p', { class: 'tiny dim', style: { marginTop: '4px' } }, `${stats.progress}% do que estava planejado`));

  const tlBox = el('div', { class: 'tl', style: { marginTop: '10px' } });
  tl.slice(0, 14).forEach(it => tlBox.appendChild(el('div', { class: 'tl__item', style: { '--dot': it.color } },
    el('span', { class: 'tl__time' }, it.at),
    el('span', { class: 'tl__dot' }),
    el('div', { class: 'tl__card' },
      el('div', { class: 'tl__kind' }, it.kind),
      el('div', { class: 'tl__text' }, it.title)))));

  const { close } = openSheet({
    title: 'Fechar meu dia',
    wide: true,
    body: el('div', {},
      summary,
      section('Linha do tempo resumida', tl.length),
      tl.length ? tlBox : empty('Sem movimentações neste dia.'),
      pending.length
        ? el('div', { style: { marginTop: '18px' } },
            section('Tarefas não concluídas', pending.length),
            el('p', { class: 'tiny dim' }, 'Marque o que deve ir para outra data. Nada é movido sem sua confirmação.'),
            pendingBox,
            el('div', { class: 'grid2', style: { marginTop: '8px' } },
              el('div', { class: 'field' },
                el('label', { class: 'field__label' }, 'Transferir para'),
                moveDate),
              el('div', { class: 'field' },
                el('label', { class: 'field__label' }, 'Atalhos'),
                el('div', { class: 'wrap' },
                  el('button', { class: 'chip chip--out', onclick: () => { moveDate.value = addDays(d, 1); } }, 'Amanhã'),
                  el('button', { class: 'chip chip--out', onclick: () => { moveDate.value = addDays(d, 7); } }, '+7 dias')))))
        : null,
      el('div', { style: { marginTop: '18px' } },
        section('Como foi meu dia?'),
        reflection),
    ),
    foot: [
      el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'Depois'),
      el('button', { class: 'btn btn--primary grow', onclick: finish }, 'Fechar o dia'),
    ],
  });

  async function finish() {
    const toMove = [...moveChecks.values()].filter(x => x.cb.checked);
    if (toMove.length) {
      const okMove = await ask({
        title: 'Transferir tarefas',
        message: `${toMove.length} tarefa(s) serão movidas para ${fmtDate(moveDate.value, 'long')}.`,
        okLabel: 'Transferir',
      });
      if (okMove) {
        for (const { task } of toMove) await S.tasks.move(task, moveDate.value);
      }
    }
    await S.days.save({
      date: d,
      reflection: reflection.value.trim(),
      closedAt: new Date().toISOString(),
      summary: {
        plannedTasks: stats.plannedTasks, doneTasks: stats.doneTasks,
        openTasks: stats.openTasks, plannedEvents: stats.plannedEvents,
        doneEvents: stats.doneEvents, logs: stats.logCount, notes: stats.noteCount,
        progress: stats.progress,
      },
      movedTasks: toMove.length,
      movedTo: toMove.length ? moveDate.value : null,
    });
    ok('Dia fechado');
    close();
    refresh?.();
  }
}

function line(label, value) {
  return el('div', { class: 'row row--between', style: { padding: '3px 0' } },
    el('span', { class: 'small muted' }, label),
    el('span', { class: 'small strong' }, value));
}
