/* Tela "Lugares" — onde você tem estado (fase 5).

   Mesma máquina das pessoas, mais o trajeto do dia. Sem GPS: o registro
   manual dá o trajeto legível com uma fração da complexidade e sem custo de
   privacidade. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty } from '../ui/items.js';
import { ok } from '../ui/toast.js';
import { today, fmtDate, fmtTime, diffDays } from '../util/date.js';
import { go } from '../core/router.js';

export const title = params => params?.id ? 'Lugar' : 'Lugares';

export async function render(root, { params, refresh }) {
  clear(root);
  if (params.id) return ficha(root, params.id, refresh);

  const [rows, trajeto] = await Promise.all([S.places.all(), S.dayRoute(today())]);

  if (trajeto.length > 1) {
    root.appendChild(section('Seu dia'));
    root.appendChild(el('div', { class: 'card', style: { marginBottom: '18px' } },
      el('div', { class: 'route' },
        ...trajeto.flatMap((p, i) => [
          i ? el('span', { class: 'route__arrow' }, '→') : null,
          el('span', { class: 'route__stop' }, p.nome),
        ]).filter(Boolean)),
      el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
        'Montado a partir dos horários dos seus registros.')));
  }

  if (!rows.length) {
    root.appendChild(empty('Nenhum lugar ainda. Sempre que você disser onde esteve num registro, o lugar aparece aqui sozinho.'));
    return;
  }

  root.appendChild(section('Lugares', rows.length));
  const lista = el('div', { class: 'stack' });
  for (const p of rows.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))) {
    const dias = p.lastSeen ? diffDays(p.lastSeen, today()) : null;
    lista.appendChild(el('div', {
      class: 'item', style: { '--cat': 'var(--c-info)' },
      onclick: () => go(`#/lugares?id=${p.id}`),
    },
      icon('pin'),
      el('div', { class: 'item__body' },
        el('div', { class: 'item__title' }, p.name),
        el('div', { class: 'item__meta' },
          p.lastSeen ? (dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`) : 'sem data')),
      icon('chev', 'ic--sm')));
  }
  root.appendChild(lista);
}

async function ficha(root, id, refresh) {
  const p = await S.places.get(id);
  if (!p) { root.appendChild(empty('Lugar não encontrado.')); return; }
  const visitas = await S.visitsOf(p);

  root.appendChild(el('button', { class: 'btn btn--sm btn--ghost', style: { marginBottom: '12px' },
    onclick: () => go('#/lugares') }, icon('back'), 'Todos os lugares'));

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'row', style: { gap: '10px', alignItems: 'center' } },
      icon('pin', 'ic--lg'),
      el('div', { class: 'grow' },
        el('h2', { style: { margin: 0 } }, p.name),
        el('p', { class: 'tiny dim', style: { margin: '2px 0 0' } },
          `${visitas.length} ${visitas.length === 1 ? 'passagem' : 'passagens'}` +
          (p.firstSeen ? ` · desde ${fmtDate(p.firstSeen, 'short')}` : ''))))));

  const nota = el('textarea', { class: 'textarea', placeholder: 'Endereço, referência, o que você quiser lembrar.' }, p.note || '');
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Anotação')));
  root.appendChild(nota);
  root.appendChild(el('button', {
    class: 'btn btn--block', style: { marginTop: '8px' },
    onclick: async () => { await S.places.save({ ...p, note: nota.value.trim() }); ok('Anotação salva'); },
  }, 'Salvar anotação'));

  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Passagens', visitas.length)));
  if (!visitas.length) {
    root.appendChild(empty('Nada registrado neste lugar ainda.'));
  } else {
    root.appendChild(el('div', { class: 'stack' }, ...visitas.slice(0, 60).map(v =>
      el('div', { class: 'item' },
        el('div', { style: { minWidth: '62px' } },
          el('b', { class: 'small' }, fmtDate(v.date, 'num')),
          v.time ? el('div', { class: 'tiny dim' }, fmtTime(v.time)) : null),
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, v.texto),
          el('div', { class: 'item__meta' }, el('span', { class: 'pill' }, v.tipo)))))));
  }
  void refresh;
}
