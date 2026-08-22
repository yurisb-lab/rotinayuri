/* Tela "Registro do dia" — o que eu fiz, linha do tempo e fechamento do dia. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { logItem, section, empty, actionLink } from '../ui/items.js';
import { quickLog } from '../ui/quickadd.js';
import { editLog, field } from '../ui/forms.js';
import { openSheet, confirm as ask } from '../ui/modal.js';
import { ok } from '../ui/toast.js';
import { today, addDays, fmtDate, fmtRelative, DOW_SHORT, parseISO, dow, weekDays } from '../util/date.js';
import { go } from '../core/router.js';
import { resumoDoDia } from '../features/summary.js';

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

  const [stats, tl, day, mm] = await Promise.all([
    S.dayStats(d), S.timeline(d), S.days.get(d), S.moments.forDate(d),
  ]);

  /* resumo rápido -------------------------------------------------------- */
  root.appendChild(el('div', { class: 'stats', style: { marginBottom: '18px' } },
    box(stats.doneTasks, 'tarefas feitas'),
    box(stats.doneEvents, 'compromissos'),
    box(stats.logCount, 'registros'),
    box(stats.openTasks, 'pendentes')));

  /* resumo do dia em prosa (fase 9a) ------------------------------------- */
  const resumo = await resumoDoDia(d).catch(() => null);
  if (resumo && !resumo.vazio) {
    root.appendChild(section('Seu dia em ' + fmtDate(d, 'short')));
    root.appendChild(el('div', { class: 'narr', style: { marginBottom: '18px' } },
      ...resumo.paragrafos.map(t => el('p', {}, t))));
  }

  /* linha do tempo ------------------------------------------------------- */
  root.appendChild(section('Linha do tempo do dia', tl.length));
  if (!tl.length) {
    root.appendChild(empty('Nada registrado neste dia ainda.'));
  } else {
    const tlBox = el('div', { class: 'tl' });
    for (const it of tl) {
      /* O selo é tocável: alternar entre "fora do plano" e "estava previsto"
         grava a correção, e a correção manual vence o automático para sempre. */
      const selo = it.lane
        ? el('button', {
            class: 'tl__lane', 'data-l': it.lane,
            onclick: async ev => {
              ev.stopPropagation();
              if (it.kind !== 'registro') return;
              await S.setUnplanned(it.ref, it.lane !== 'fora');
              refresh();
            },
          }, it.lane === 'fora' ? 'fora do plano' : it.lane)
        : null;

      tlBox.appendChild(el('div', { class: 'tl__item', style: { '--dot': it.color } },
        el('span', { class: 'tl__time' }, it.at),
        el('span', { class: 'tl__dot' }),
        el('div', {
          class: 'tl__card',
          onclick: () => openTimelineItem(it, refresh),
        },
          el('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
            el('div', { class: 'tl__kind grow' }, it.kind), selo),
          el('div', { class: 'tl__text' }, it.title),
          it.sub ? el('div', { class: 'tiny dim' }, it.sub) : null)));
    }
    root.appendChild(tlBox);

    const nFora = tl.filter(x => x.lane === 'fora').length;
    const nPrev = tl.filter(x => x.lane === 'planejado').length;
    root.appendChild(el('div', { class: 'tl__foot' },
      el('span', {}, el('b', {}, String(nPrev)), ' previstas'),
      el('span', {}, el('b', {}, String(stats.doneTasks + stats.doneEvents)), ' concluídas'),
      el('span', {}, el('b', {}, String(nFora)), nFora === 1 ? ' fora do plano' : ' fora do plano')));
  }

  /* registros do dia ------------------------------------------------------ */
  root.appendChild(el('div', { style: { marginTop: '20px' } },
    section('Registros', stats.logCount,
      actionLink('adicionar', () => quickLog(refresh)))));
  root.appendChild(stats.logs.length
    ? el('div', { class: 'stack' }, ...stats.logs.map(l => logItem(l, { onChange: refresh })))
    : empty('Nenhum registro. Toque em "Registrar o que fiz".'));

  /* momentos do dia ------------------------------------------------------- */
  if (mm.length) {
    root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Momentos', mm.length)));
    root.appendChild(el('div', { class: 'stack' }, ...mm.map(m =>
      el('div', { class: 'moment' },
        el('span', { class: 'moment__ic' }, S.MOMENT_KINDS[m.momentKind]?.icon || '⭐'),
        el('div', { class: 'grow' },
          el('div', { class: 'moment__t' }, m.text),
          el('div', { class: 'tiny dim' }, S.MOMENT_KINDS[m.momentKind]?.label || ''))))));
  }

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
          icon('moon'), 'Perceber meu dia')));
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

/* ------------------------------------------------- fechamento guiado (fase 6)

   O fechamento antigo era um formulário só. Virou uma conversa de cinco
   passos — e TODOS são puláveis.

   "Não lembro" e "Pular" aparecem em todos os passos, no mesmo lugar da tela,
   sem letra menor e sem cor apagada. É esse botão que separa registro de
   cobrança: sem ele, o fechamento vira uma prova que a pessoa sente que
   reprovou, e em duas semanas ela para de abrir o app à noite. */

export async function closeDay(d, refresh) {
  const [stats, tl, prev, momentosDoDia] = await Promise.all([
    S.dayStats(d), S.timeline(d), S.days.get(d), S.moments.forDate(d),
  ]);
  const pending = stats.tasks.filter(t => t.status === 'pendente' || t.status === 'andamento');

  /* estado acumulado ao longo dos passos */
  const est = {
    destaques: new Set(prev?.highlights || []),
    naoLembro: false,
    nadaImportante: false,
    naoEsquecer: '',
    reflexao: prev?.reflection || '',
    humor: prev?.mood || null,
    mover: new Set(),
    moverPara: addDays(d, 1),
  };

  let passo = 0;
  const TOTAL = 5;
  const corpo = el('div');
  const rodape = el('div', { class: 'sheet__foot' });

  const dots = el('div', { class: 'steps' },
    ...Array.from({ length: TOTAL }, () => el('i')));

  const { close } = openSheet({
    title: 'Perceber meu dia',
    wide: true,
    body: el('div', {}, dots, corpo),
    foot: [rodape],
  });

  function marca() {
    [...dots.children].forEach((i2, n) => i2.classList.toggle('is-on', n <= passo));
  }

  /* Botões: "pular" tem exatamente o mesmo peso visual de "continuar". */
  function nav(rotuloPular = 'Pular') {
    clear(rodape);
    rodape.appendChild(el('button', {
      class: 'btn btn--ghost', onclick: () => avanca(),
    }, rotuloPular));
    rodape.appendChild(el('button', {
      class: 'btn btn--primary grow', onclick: () => avanca(),
    }, passo === TOTAL - 1 ? 'Terminar' : 'Continuar'));
  }

  async function avanca() {
    if (passo >= TOTAL - 1) return finish();
    passo++; desenha();
  }

  function cabeca(pergunta, ajuda) {
    clear(corpo);
    marca();
    corpo.appendChild(el('p', { class: 'step__q' }, pergunta));
    if (ajuda) corpo.appendChild(el('p', { class: 'step__h' }, ajuda));
  }

  function desenha() {
    if (passo === 0) return passoImprevisto();
    if (passo === 1) return passoDestaques();
    if (passo === 2) return passoNaoEsquecer();
    if (passo === 3) return passoAmanha();
    return passoComoFoi();
  }

  /* 1 ── o que fugiu do plano ------------------------------------------- */
  function passoImprevisto() {
    cabeca('Aconteceu algo hoje que não estava planejado?',
      `Você registrou ${stats.logCount} ${stats.logCount === 1 ? 'coisa' : 'coisas'} hoje.`);
    corpo.appendChild(el('div', { class: 'btnbar', style: { flexDirection: 'column', gap: '8px' } },
      el('button', { class: 'btn btn--primary btn--block', onclick: async () => {
        close(); await quickLog(() => { refresh?.(); });
      } }, icon('plus'), 'Registrar agora'),
      el('button', { class: 'btn btn--block', onclick: () => { est.nadaImportante = true; avanca(); } },
        'Nada importante'),
      el('button', { class: 'btn btn--block', onclick: () => { est.naoLembro = true; avanca(); } },
        'Não lembro')));
    clear(rodape);
    rodape.appendChild(el('button', { class: 'btn btn--ghost grow', onclick: () => avanca() }, 'Pular'));
  }

  /* 2 ── até 3 destaques ------------------------------------------------- */
  function passoDestaques() {
    cabeca('Escolha até 3 coisas que marcaram seu dia',
      'Pode marcar o que você já registrou — não precisa escrever de novo.');

    const candidatos = [
      ...stats.logs.map(l => ({ id: l.id, texto: l.text, tipo: 'registro' })),
      ...stats.tasks.filter(t => t.status === 'concluida')
        .map(t => ({ id: t.instanceId || t.id, texto: t.title, tipo: 'tarefa' })),
      ...momentosDoDia.map(m => ({ id: m.id, texto: m.text, tipo: 'momento' })),
    ];

    if (!candidatos.length) {
      corpo.appendChild(empty('Nada registrado hoje para escolher.'));
    } else {
      const box = el('div', { class: 'stack--sm' });
      for (const c of candidatos) {
        const node = el('div', { class: `pickitem ${est.destaques.has(c.id) ? 'is-on' : ''}` },
          el('span', {}, est.destaques.has(c.id) ? '★' : '☆'),
          el('span', { class: 'pickitem__t grow' }, c.texto),
          el('span', { class: 'pill' }, c.tipo));
        node.onclick = () => {
          if (est.destaques.has(c.id)) est.destaques.delete(c.id);
          else if (est.destaques.size < 3) est.destaques.add(c.id);
          else return;
          passoDestaques();
        };
        box.appendChild(node);
      }
      corpo.appendChild(box);
    }

    const novo = el('input', { class: 'input', placeholder: 'Ou escreva um momento: "boa conversa com meus filhos"' });
    const tipo = el('select', { class: 'input' },
      ...Object.entries(S.MOMENT_KINDS).map(([k, v]) => el('option', { value: k }, `${v.icon} ${v.label}`)));
    corpo.appendChild(el('div', { style: { marginTop: '14px' } },
      field('Registrar um momento', novo),
      el('div', { class: 'grid2' },
        field('Tipo', tipo),
        field(' ', el('button', {
          class: 'btn btn--block',
          onclick: async () => {
            const t = novo.value.trim();
            if (!t) return;
            const m = await S.moments.save(S.newMoment({ text: t, momentKind: tipo.value, date: d }));
            momentosDoDia.push(m);
            if (est.destaques.size < 3) est.destaques.add(m.id);
            novo.value = '';
            passoDestaques();
          },
        }, 'Adicionar')))));
    nav();
  }

  /* 3 ── o que não pode ser esquecido ------------------------------------- */
  function passoNaoEsquecer() {
    cabeca('Existe alguma coisa que você não quer esquecer?',
      'Vira um momento, guardado neste dia.');
    const ta = el('textarea', { class: 'textarea' }, est.naoEsquecer);
    ta.oninput = () => { est.naoEsquecer = ta.value; };
    corpo.appendChild(ta);
    nav('Não lembro');
  }

  /* 4 ── o que vai para amanhã -------------------------------------------- */
  function passoAmanha() {
    cabeca('Algo precisa ir para outro dia?',
      pending.length ? 'Nada é movido sem você confirmar.' : 'Nenhuma tarefa ficou em aberto hoje.');

    if (pending.length) {
      const box = el('div', { class: 'stack--sm' });
      pending.forEach(t => {
        const cb = el('input', { type: 'checkbox', checked: est.mover.has(t.instanceId) });
        cb.onchange = () => { cb.checked ? est.mover.add(t.instanceId) : est.mover.delete(t.instanceId); };
        box.appendChild(el('label', { class: 'sub' }, cb,
          el('span', { class: 'grow small' }, t.title),
          t.recurrence ? el('span', { class: 'pill pill--accent' }, 'recorrente') : null));
      });
      corpo.appendChild(box);
      const data = el('input', { class: 'input', type: 'date', value: est.moverPara });
      data.oninput = () => { est.moverPara = data.value; };
      corpo.appendChild(el('div', { class: 'grid2', style: { marginTop: '10px' } },
        field('Transferir para', data),
        field('Atalhos', el('div', { class: 'wrap' },
          el('button', { class: 'chip chip--out', onclick: () => { data.value = addDays(d, 1); est.moverPara = data.value; } }, 'Amanhã'),
          el('button', { class: 'chip chip--out', onclick: () => { data.value = addDays(d, 7); est.moverPara = data.value; } }, '+7 dias')))));
    }
    nav();
  }

  /* 5 ── como foi -------------------------------------------------------- */
  function passoComoFoi() {
    cabeca('Como foi seu dia?', 'Uma palavra basta. Ou nenhuma.');
    const barra = el('div', { class: 'moodbar' });
    for (const [k, v] of Object.entries(S.MOODS)) {
      const b = el('button', { class: est.humor === k ? 'is-on' : '' },
        el('b', {}, v.icon), el('span', {}, v.label));
      if (est.humor === k) b.style.borderColor = 'var(--c-accent)';
      b.onclick = () => { est.humor = est.humor === k ? null : k; passoComoFoi(); };
      barra.appendChild(b);
    }
    corpo.appendChild(barra);

    const ta = el('textarea', { class: 'textarea', style: { marginTop: '14px' },
      placeholder: 'Se quiser escrever alguma coisa sobre o dia.' }, est.reflexao);
    ta.oninput = () => { est.reflexao = ta.value; };
    corpo.appendChild(ta);

    corpo.appendChild(el('div', { class: 'card card--flat', style: { marginTop: '16px' } },
      linha('Planejado', `${stats.plannedTasks} tarefa(s) · ${stats.plannedEvents} compromisso(s)`),
      linha('Concluído', `${stats.doneTasks} tarefa(s) · ${stats.doneEvents} compromisso(s)`),
      linha('Registros', String(stats.logCount)),
      linha('Momentos', String(momentosDoDia.length))));
    nav();
  }

  /* fim ------------------------------------------------------------------- */
  async function finish() {
    if (est.naoEsquecer.trim()) {
      await S.moments.save(S.newMoment({ text: est.naoEsquecer.trim(), momentKind: 'outro', date: d }));
    }
    const mover = pending.filter(t => est.mover.has(t.instanceId));
    if (mover.length) {
      const okMove = await ask({
        title: 'Transferir tarefas',
        message: `${mover.length} tarefa(s) serão movidas para ${fmtDate(est.moverPara, 'long')}.`,
        okLabel: 'Transferir',
      });
      if (okMove) for (const t of mover) await S.tasks.move(t, est.moverPara);
    }

    /* Congela o casamento planejado × aconteceu (fase 3): a partir daqui,
       editar uma tarefa antiga não reescreve mais o passado deste dia. */
    let frozen = null;
    try { frozen = await S.freezeDay(d); } catch { /* opcional */ }

    await S.days.save({
      date: d,
      reflection: est.reflexao.trim(),
      mood: est.humor,
      highlights: [...est.destaques],
      nothingImportant: est.nadaImportante,
      notRemembered: est.naoLembro,
      closedAt: new Date().toISOString(),
      frozen,
      summary: {
        plannedTasks: stats.plannedTasks, doneTasks: stats.doneTasks,
        openTasks: stats.openTasks, plannedEvents: stats.plannedEvents,
        doneEvents: stats.doneEvents, logs: stats.logCount, notes: stats.noteCount,
        moments: momentosDoDia.length, progress: stats.progress,
      },
      movedTasks: mover.length,
      movedTo: mover.length ? est.moverPara : null,
    });
    ok('Dia registrado');
    close();
    refresh?.();
  }

  desenha();
  void tl;
}

function linha(label, value) {
  return el('div', { class: 'row row--between', style: { padding: '3px 0' } },
    el('span', { class: 'small muted' }, label),
    el('span', { class: 'small strong' }, value));
}


