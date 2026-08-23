/* Tela "Hoje" — painel principal do dia. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { taskItem, eventItem, logItem, noteCard, section, empty, actionLink } from '../ui/items.js';
import { openTextCapture, openVoiceCapture, openInboxCapture, instantLog, triageLog } from '../ui/quickadd.js';
import { editTask, editEvent } from '../ui/forms.js';
import { today, fmtDate, addDays, DOW, fmtRelative, nowTime } from '../util/date.js';
import { go } from '../core/router.js';
import * as Checkins from '../features/checkins.js';
import { resumoCurto } from '../features/summary.js';

export const title = 'Hoje';

export async function render(root, { refresh }) {
  const d = today();
  const [stats, overdue, upcoming, notes, pendingInbox, untriaged, onde] = await Promise.all([
    S.dayStats(d),
    S.tasks.overdue(d),
    S.events.upcoming(14, addDays(d, 1)),
    S.notes.recent(4),
    S.inbox.pending(),
    S.logs.untriaged(),
    S.whereAmI(d),
  ]);
  const [mostraHumor, nudges] = await Promise.all([
    Checkins.mostrarFaixa(d).catch(() => false),
    S.peopleToNudge(d).catch(() => []),
  ]);
  /* "Você lembra?" — só de manhã, só uma vez por dia, só se ontem teve algo.
     Transforma o registro em percepção, em vez de armazenamento. */
  const ontem = addDays(d, -1);
  const jaMostrou = S.settings.get('lastRecallShown') === d;
  const recall = (!jaMostrou && new Date().getHours() < 12)
    ? await resumoCurto(ontem).catch(() => null) : null;

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

  /* Você lembra? (fase 6) ------------------------------------------------ */
  if (recall) {
    root.appendChild(el('section', { class: 'card', style: { marginBottom: '14px' } },
      el('div', { class: 'row row--between' },
        el('h3', { style: { margin: 0, fontSize: '15px' } }, 'Ontem'),
        el('button', {
          class: 'topbar__btn', 'aria-label': 'Dispensar',
          onclick: async () => { await S.settings.set('lastRecallShown', d); refresh(); },
        }, icon('close'))),
      el('p', { class: 'small', style: { margin: '6px 0 0' } }, recall.contagem),
      recall.detalhe ? el('p', { class: 'small muted', style: { margin: '2px 0 0' } }, recall.detalhe) : null,
      el('button', {
        class: 'btn btn--ghost btn--block', style: { marginTop: '10px' },
        onclick: async () => {
          await S.settings.set('lastRecallShown', d);
          go(`#/registro?d=${ontem}`);
        },
      }, 'Revisar em 1 min')));
  }

  /* Onde estou no meu dia (fase 4) -------------------------------------- */
  root.appendChild(ondeEstou(onde, refresh));

  /* Como está seu dia? (fase 7) ----------------------------------------- */
  if (mostraHumor) root.appendChild(faixaHumor(refresh));

  /* Faz tempo que você não fala com… (fase 5) ---------------------------- */
  for (const { p, dias } of nudges) {
    root.appendChild(el('div', { class: 'nudge', style: { marginBottom: '10px' } },
      el('div', { class: 'avatar' }, (p.name[0] || '?').toUpperCase()),
      el('div', { class: 'nudge__t grow' },
        `Faz ${dias} dias que você não registra contato com `, el('b', {}, p.name), '.'),
      el('button', { class: 'btn btn--sm', onclick: () => go(`#/pessoas?id=${p.id}`) }, 'Abrir'),
      el('button', {
        class: 'btn btn--sm btn--ghost',
        onclick: async () => {
          await S.people.save({ ...p, snoozeUntil: addDays(d, 7) });
          refresh();
        },
      }, 'Agora não')));
  }

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
        el('div', { class: 'item', style: { '--cat': 'var(--c-accent-2)' }, onclick: () => triageLog(l, refresh) },
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
  }, icon('moon'), 'Perceber meu dia'));

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '14px' } },
    `Atualizado às ${nowTime()} · ${fmtRelative(d)}`));
}

/* Cartão "onde estou agora". Tudo derivado — nenhum dado novo no banco.
   O texto nunca cobra: um dia vazio é um dia vazio, não uma falha. */
function ondeEstou(o, refresh) {
  const linha = (rot, valor, sub) => el('div', { class: 'now__row' },
    el('span', { class: 'now__k' }, rot),
    el('span', { class: 'now__v' }, valor, sub ? el('small', {}, sub) : null));

  const box = el('section', { class: 'now' });
  box.appendChild(el('div', { class: 'now__head' },
    el('span', {}, 'Agora'),
    el('b', {}, o.agora)));

  if (o.ultimo) {
    box.appendChild(linha('Última coisa registrada', o.ultimo.text, o.ultimo.time));
  } else {
    box.appendChild(el('div', { class: 'now__empty' },
      el('span', {}, 'Seu dia ainda não tem registros.'),
      el('button', { class: 'btn btn--sm btn--primary', onclick: () => instantLog(refresh) }, 'Fiz agora')));
  }

  if (o.proximo) {
    box.appendChild(linha('Próxima coisa', o.proximo.title, o.proximo.time));
  } else if (o.atrasado) {
    box.appendChild(linha('Ainda em aberto', o.atrasado.title, `estava para ${o.atrasado.time}`));
  } else if (o.amanha) {
    box.appendChild(linha('Amanhã começa com', o.amanha.title, o.amanha.time));
  } else {
    box.appendChild(linha('Próxima coisa', 'Nada mais marcado para hoje.'));
  }

  if (o.registros) {
    box.appendChild(el('p', { class: 'now__foot' },
      `Hoje você já registrou ${o.registros} ${o.registros === 1 ? 'acontecimento' : 'acontecimentos'}.`));
  }
  return box;
}

/* Uma pergunta, resposta de um toque, e some. O "por quê?" nunca é exigido. */
function faixaHumor(refresh) {
  const box = el('section', { class: 'card', style: { marginBottom: '14px' } },
    el('h3', { style: { margin: 0, fontSize: '15px' } }, 'Como está seu dia até aqui?'));
  const barra = el('div', { class: 'moodbar' });
  for (const [k, v] of Object.entries(S.MOODS)) {
    barra.appendChild(el('button', {
      onclick: async () => {
        await Checkins.registrar(k, { trigger: 'manual' });
        refresh();
      },
    }, el('b', {}, v.icon), el('span', {}, v.label)));
  }
  box.appendChild(barra);
  return box;
}

function stat(value, label) {
  return el('div', { class: 'hero__stat' }, el('b', {}, String(value)), el('span', {}, label));
}
function quick(ic, label, onClick) {
  return el('button', { onclick: onClick }, icon(ic), el('span', {}, label));
}
