/* Tela "Pessoas" — com quem você tem falado (fase 5).

   Os registros de pessoas são preenchidos sozinhos desde a fase 0, sempre que
   uma tarefa, compromisso, registro ou momento é salvo. Aqui eles ganham
   ficha, histórico e a opção de acompanhar.

   "Acompanhar" é desligado por padrão: avisar sobre todo mundo que já foi
   mencionado transformaria o app numa máquina de cobrança — e é isso que faz
   desinstalar. O aviso só existe para quem a pessoa convidou. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty } from '../ui/items.js';
import { openSheet, confirm as ask } from '../ui/modal.js';
import { field } from '../ui/forms.js';
import { ok } from '../ui/toast.js';
import { today, fmtDate, fmtTime, diffDays, addDays } from '../util/date.js';
import { go } from '../core/router.js';

export const title = params => params?.id ? 'Pessoa' : 'Pessoas';

export async function render(root, { params, refresh }) {
  clear(root);
  if (params.id) return ficha(root, params.id, refresh);

  const rows = await S.people.all();
  if (!rows.length) {
    root.appendChild(empty('Ninguém por aqui ainda. Sempre que você citar alguém num registro ou compromisso, a pessoa aparece nesta lista sozinha.'));
    return;
  }

  const busca = el('input', { class: 'input', type: 'search', placeholder: 'Procurar pessoa', value: params.q || '' });
  root.appendChild(el('div', { style: { marginBottom: '14px' } }, busca));

  const lista = el('div', { class: 'stack' });
  root.appendChild(section('Pessoas', rows.length));
  root.appendChild(lista);

  const desenha = () => {
    clear(lista);
    const termo = S.identityKey(busca.value);
    const vis = rows
      .filter(p => !termo || p.key.includes(termo) || (p.aliases || []).some(a => S.identityKey(a).includes(termo)))
      .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
    if (!vis.length) { lista.appendChild(empty('Ninguém com esse nome.')); return; }
    for (const p of vis) {
      const dias = p.lastSeen ? diffDays(p.lastSeen, today()) : null;
      lista.appendChild(el('div', {
        class: 'item', style: { '--cat': p.track ? 'var(--c-accent)' : 'var(--c-text-3)' },
        onclick: () => go(`#/pessoas?id=${p.id}`),
      },
        el('div', { class: 'avatar' }, (p.name[0] || '?').toUpperCase()),
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, p.name),
          el('div', { class: 'item__meta' },
            p.lastSeen
              ? el('span', {}, dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`)
              : el('span', {}, 'sem data'),
            p.track ? el('span', { class: 'pill pill--accent' }, 'acompanhando') : null)),
        icon('chev', 'ic--sm')));
    }
  };
  desenha();
  busca.oninput = desenha;
  void refresh;
}

/* ------------------------------------------------------------------ ficha */
async function ficha(root, id, refresh) {
  const p = await S.people.get(id);
  if (!p) { root.appendChild(empty('Pessoa não encontrada.')); return; }
  const inter = await S.interactionsOf(p);
  const dias = p.lastSeen ? diffDays(p.lastSeen, today()) : null;

  root.appendChild(el('button', { class: 'btn btn--sm btn--ghost', style: { marginBottom: '12px' },
    onclick: () => go('#/pessoas') }, icon('back'), 'Todas as pessoas'));

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } },
      el('div', { class: 'avatar avatar--lg' }, (p.name[0] || '?').toUpperCase()),
      el('div', { class: 'grow' },
        el('h2', { style: { margin: 0 } }, p.name),
        el('p', { class: 'tiny dim', style: { margin: '2px 0 0' } },
          inter.length
            ? `${inter.length} ${inter.length === 1 ? 'interação' : 'interações'}${dias != null ? ` · última ${dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`}` : ''}`
            : 'nenhuma interação registrada'))),
    (p.aliases || []).length
      ? el('p', { class: 'tiny dim', style: { marginTop: '8px' } }, `Também conhecido como: ${p.aliases.join(', ')}`)
      : null));

  /* próxima ação --------------------------------------------------------- */
  const acaoTexto = el('input', { class: 'input', placeholder: 'Ex.: retomar conversa sobre os equipamentos',
    value: p.nextAction?.text || '' });
  const acaoData = el('input', { class: 'input', type: 'date', value: p.nextAction?.date || '' });
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Próxima ação')));
  root.appendChild(el('div', { class: 'card' },
    field(null, acaoTexto),
    el('div', { class: 'grid2' },
      field('Quando', acaoData),
      field(' ', el('button', {
        class: 'btn btn--primary btn--block',
        onclick: async () => {
          const txt = acaoTexto.value.trim();
          await S.people.save({ ...p, nextAction: txt ? { text: txt, date: acaoData.value || null } : null });
          ok(txt ? 'Próxima ação guardada' : 'Próxima ação removida');
          refresh();
        },
      }, 'Guardar')))));

  /* acompanhar ------------------------------------------------------------ */
  const track = el('input', { type: 'checkbox', checked: !!p.track });
  const trackDays = el('input', { class: 'input', type: 'number', min: '7', max: '365',
    value: String(p.trackDays || 30), style: { maxWidth: '110px' } });
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Acompanhar')));
  root.appendChild(el('div', { class: 'card' },
    el('label', { class: 'switch' }, track, el('span', {}, 'Avisar quando passar muito tempo sem contato')),
    el('div', { class: 'row', style: { gap: '10px', alignItems: 'center', marginTop: '10px' } },
      el('span', { class: 'small muted' }, 'Depois de'), trackDays, el('span', { class: 'small muted' }, 'dias')),
    el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
      'Desligado por padrão. O aviso aparece em Hoje, no máximo dois por vez, e sempre com a opção de adiar.'),
    el('button', {
      class: 'btn btn--block', style: { marginTop: '10px' },
      onclick: async () => {
        await S.people.save({ ...p, track: track.checked, trackDays: Number(trackDays.value) || 30, snoozeUntil: null });
        ok(track.checked ? 'Acompanhando' : 'Não acompanha mais');
        refresh();
      },
    }, 'Salvar')));

  /* anotação --------------------------------------------------------------- */
  const nota = el('textarea', { class: 'textarea', placeholder: 'Qualquer coisa que você queira lembrar sobre esta pessoa.' }, p.note || '');
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Anotação')));
  root.appendChild(nota);
  root.appendChild(el('button', {
    class: 'btn btn--block', style: { marginTop: '8px' },
    onclick: async () => { await S.people.save({ ...p, note: nota.value.trim() }); ok('Anotação salva'); },
  }, 'Salvar anotação'));

  /* histórico --------------------------------------------------------------- */
  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Interações', inter.length)));
  if (!inter.length) {
    root.appendChild(empty('Nada registrado com esta pessoa ainda.'));
  } else {
    const box = el('div', { class: 'stack' });
    for (const it of inter.slice(0, 60)) {
      box.appendChild(el('div', { class: 'item' },
        el('div', { style: { minWidth: '62px' } },
          el('b', { class: 'small' }, fmtDate(it.date, 'num')),
          it.time ? el('div', { class: 'tiny dim' }, fmtTime(it.time)) : null),
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, it.texto),
          el('div', { class: 'item__meta' }, el('span', { class: 'pill' }, it.tipo)))));
    }
    root.appendChild(box);
  }

  /* juntar duplicadas -------------------------------------------------------- */
  root.appendChild(el('button', {
    class: 'btn btn--ghost btn--block', style: { marginTop: '22px' },
    onclick: () => juntar(p, refresh),
  }, icon('people'), 'Juntar com outra pessoa'));
}

/* Junção: mostra quantos itens serão reescritos ANTES de confirmar. Sem esse
   número a pessoa não tem como avaliar o que está aceitando. */
async function juntar(p, refresh) {
  const todas = (await S.people.all()).filter(x => x.id !== p.id);
  if (!todas.length) { ok('Não há outra pessoa para juntar.'); return; }
  const n = await S.mergePreview(p.id);

  const sel = el('select', { class: 'input' },
    ...todas.sort((a, b) => a.name.localeCompare(b.name))
      .map(x => el('option', { value: x.id }, x.name)));

  const { close } = openSheet({
    title: 'Juntar pessoas',
    body: el('div', {},
      el('p', { class: 'small' }, `Tudo que hoje cita `, el('b', {}, p.name),
        ` passará a citar a pessoa escolhida. O nome "${p.name}" fica guardado como apelido, para a busca continuar encontrando.`),
      field('Manter esta pessoa', sel),
      el('p', { class: 'tiny', style: { color: 'var(--c-warn)', marginTop: '10px' } },
        `${n} ${n === 1 ? 'item será reescrito' : 'itens serão reescritos'}.`)),
    foot: [
      el('button', { class: 'btn btn--ghost', onclick: () => close() }, 'Cancelar'),
      el('button', {
        class: 'btn btn--primary grow',
        onclick: async () => {
          const alvo = todas.find(x => x.id === sel.value);
          const okDo = await ask({
            title: 'Confirmar junção',
            message: `${p.name} passa a ser ${alvo.name} em ${n} ${n === 1 ? 'item' : 'itens'}. Isso não tem desfazer.`,
            okLabel: 'Juntar',
          });
          if (!okDo) return;
          const r = await S.mergePeople(p.id, alvo.id);
          close();
          ok(`${r.itens} ${r.itens === 1 ? 'item atualizado' : 'itens atualizados'}`);
          go(`#/pessoas?id=${alvo.id}`);
          refresh();
        },
      }, 'Juntar'),
    ],
  });
}

export { addDays };
