/* Tela "Hoje" — painel principal do dia. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { taskItem, eventItem, logItem, noteCard, section, empty, actionLink } from '../ui/items.js';
import { openTextCapture, openVoiceCapture, openInboxCapture, instantLog, triageLog } from '../ui/quickadd.js';
import { editTask, editEvent } from '../ui/forms.js';
import { today, fmtDate, addDays, DOW, fmtRelative, nowTime } from '../util/date.js';
import { go } from '../core/router.js';

export const title = 'Hoje';

export async function render(root, { refresh }) {
  const d = today();
  const [stats, overdue, upcoming, notes, pendingInbox, untriaged] = await Promise.all([
    S.dayStats(d),
    S.tasks.overdue(d),
    S.events.upcoming(14, addDays(d, 1)),
    S.notes.recent(4),
    S.inbox.pending(),
    S.logs.untriaged(),
  ]);

  clear(root);

  /* Cabeçalho do dia -------------------------------------------------- */
  const now = new Date();
  const greet = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  root.appendChild(el('div', { class: 'hero' },
    el('div', { class: 'hero__date' }, `${DOW[now.getDay()]} · ${fmtDate(d, 'num')}`),
    el('div', { class: 'hero__title' }, `${greet}!`),
    el('div', { class: 'hero__row' },
      el('div', { class: 'ring', style: { '--p': stats.progress }, 'data-label': `${stats.progress}%` }),
      el('div', { class: 'hero__stats' },
        stat(stats.doneTasks + '/' + stats.plannedTasks, 'tarefas'),
        stat(stats.doneEvents + '/' + stats.plannedEvents, 'compromissos'),
        stat(stats.logCount, 'registros'),
      )),
  ));

  /* Ações rápidas ----------------------------------------------------- */
  root.appendChild(el('div', { class: 'quickbar' },
    quick('log', 'Fiz agora', () => instantLog(refresh)),
    quick('mic', 'Por voz', () => openVoiceCapture(refresh)),
    quick('text', 'Por texto', () => openTextCapture('', refresh)),
    quick('inbox', 'Entrada', async () => { await openInboxCapture(); refresh(); }),
  ));

  /* Registros esperando organização -------------------------------------- */
  if (untriaged.length) {
    root.appendChild(el('section', { class: 'section' },
      section('Registros para organizar', untriaged.length),
      el('p', { class: 'tiny dim', style: { marginTop: '-6px', marginBottom: '10px' } },
        'Capturados no "Fiz agora". Um toque para dar categoria, pessoa e local — ou deixe como está.'),
      el('div', { class: 'stack' }, ...untriaged.slice(0, 8).map(l =>
        el('div', { class: 'item', style: { '--cat': 'var(--c-warn)' }, onclick: () => triageLog(l, refresh) },
          el('div', { style: { minWidth: '46px' } },
            el('b', { style: { fontVariantNumeric: 'tabular-nums' } }, l.time || ''),
            l.date !== d ? el('div', { class: 'tiny dim' }, fmtDate(l.date, 'num')) : null),
          el('div', { class: 'item__body' }, el('div', { class: 'item__title' }, l.text)),
          icon('chev', 'ic--sm'))))));
  }

  /* Compromissos de hoje ---------------------------------------------- */
  const evs = stats.events;
  root.appendChild(el('section', { class: 'section' },
    section('Compromissos de hoje', evs.length, actionLink('novo', () => editEvent(null, { date: d }).then(refresh))),
    evs.length
      ? el('div', { class: 'stack' }, ...evs.map(e => eventItem(e, { onChange: refresh, showDate: false })))
      : empty('Nenhum compromisso hoje.')));

  /* Tarefas de hoje ---------------------------------------------------- */
  const openTasks = stats.tasks.filter(t => t.status !== 'concluida' && t.status !== 'cancelada' && !t.recurrence);
  const recurring = stats.tasks.filter(t => t.recurrence);
  const doneToday = stats.tasks.filter(t => t.status === 'concluida');

  root.appendChild(el('section', { class: 'section' },
    section('Tarefas de hoje', openTasks.length, actionLink('nova', () => editTask(null, { date: d }).then(refresh))),
    openTasks.length
      ? el('div', { class: 'stack' }, ...openTasks.map(t => taskItem(t, { onChange: refresh, showDate: false })))
      : empty('Nada pendente para hoje. 👏')));

  /* Atividades recorrentes --------------------------------------------- */
  if (recurring.length) {
    root.appendChild(el('section', { class: 'section' },
      section('Atividades recorrentes', recurring.length),
      el('div', { class: 'stack' }, ...recurring.map(t => taskItem(t, { onChange: refresh, showDate: false })))));
  }

  /* Tarefas atrasadas --------------------------------------------------- */
  if (overdue.length) {
    root.appendChild(el('section', { class: 'section' },
      section('Tarefas atrasadas', overdue.length,
        actionLink('ver todas', () => go('#/tarefas?filtro=atrasadas'))),
      el('div', { class: 'stack' }, ...overdue.slice(0, 8).map(t => taskItem(t, { onChange: refresh })))));
  }

  /* Concluídas hoje ----------------------------------------------------- */
  if (doneToday.length) {
    root.appendChild(el('section', { class: 'section' },
      section('Concluídas hoje', doneToday.length),
      el('div', { class: 'stack' }, ...doneToday.map(t => taskItem(t, { onChange: refresh, showDate: false })))));
  }

  /* Próximos compromissos ------------------------------------------------ */
  root.appendChild(el('section', { class: 'section' },
    section('Próximos compromissos', upcoming.length, actionLink('agenda', () => go('#/calendario'))),
    upcoming.length
      ? el('div', { class: 'stack' }, ...upcoming.slice(0, 5).map(e => eventItem(e, { onChange: refresh })))
      : empty('Nada nos próximos dias.')));

  /* Registros do dia ------------------------------------------------------ */
  root.appendChild(el('section', { class: 'section' },
    section('O que eu fiz hoje', stats.logCount,
      actionLink('ver tudo', () => go('#/registro'))),
    stats.logs.length
      ? el('div', { class: 'stack' }, ...stats.logs.slice(-6).reverse().map(l => logItem(l, { onChange: refresh })))
      : empty('Nenhum registro ainda. Toque em "Fiz agora" quando fizer algo.')));

  /* Entrada pendente ------------------------------------------------------ */
  if (pendingInbox.length) {
    root.appendChild(el('section', { class: 'section' },
      section('Na entrada, esperando organização', pendingInbox.length,
        actionLink('abrir', () => go('#/entrada'))),
      el('div', { class: 'stack' }, ...pendingInbox.slice(0, 3).map(i =>
        el('div', { class: 'item', onclick: () => go('#/entrada') },
          el('div', { class: 'item__body' }, el('div', { class: 'item__title' }, i.text)),
          icon('chev', 'ic--sm'))))));
  }

  /* Anotações rápidas ----------------------------------------------------- */
  root.appendChild(el('section', { class: 'section' },
    section('Anotações', notes.length, actionLink('ver todas', () => go('#/notas'))),
    notes.length
      ? el('div', { class: 'notegrid' }, ...notes.map(n => noteCard(n, { onChange: refresh })))
      : empty('Nenhuma anotação.')));

  /* Fechar o dia ---------------------------------------------------------- */
  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginTop: '10px' },
    onclick: () => go('#/registro?fechar=1'),
  }, icon('moon'), 'Fechar meu dia'));

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '14px' } },
    `Atualizado às ${nowTime()} · ${fmtRelative(d)}`));
}

function stat(value, label) {
  return el('div', { class: 'hero__stat' }, el('b', {}, String(value)), el('span', {}, label));
}
function quick(ic, label, onClick) {
  return el('button', { onclick: onClick }, icon(ic), el('span', {}, label));
}
