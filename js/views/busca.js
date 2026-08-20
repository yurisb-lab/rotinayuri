/* Pesquisa global — tarefas, compromissos, registros, notas, entrada,
   pessoas e locais. Tudo local e instantâneo. */

import { el, icon, clear, debounce } from '../util/dom.js';
import { search, facets } from '../features/search.js';
import { section, empty, taskItem, eventItem, logItem, noteCard } from '../ui/items.js';
import { go } from '../core/router.js';
import * as S from '../core/store.js';

export const title = 'Pesquisar';

const state = { q: '' };

export async function render(root, { params, refresh }) {
  if (params.q) state.q = params.q;
  clear(root);

  const input = el('input', {
    placeholder: 'Pesquisar em tudo (ex.: João, cartório, relatório)',
    value: state.q, autofocus: true,
    oninput: debounce(e => { state.q = e.target.value; draw(); }, 160),
  });
  root.appendChild(el('div', { class: 'searchbox' }, icon('search'), input,
    el('button', { class: 'btn btn--icon', onclick: () => { input.value = ''; state.q = ''; draw(); } }, icon('close'))));

  const results = el('div');
  root.appendChild(results);
  setTimeout(() => input.focus(), 80);
  await draw();

  async function draw() {
    clear(results);
    if (state.q.trim().length < 2) return suggestions(results);
    const res = await search(state.q);
    if (!res.items.length) { results.appendChild(empty(`Nada encontrado para "${state.q}".`)); return; }
    results.appendChild(section('Resultados', res.total));

    const LABEL = { task: 'Tarefas', event: 'Compromissos', log: 'Registros do dia', note: 'Notas', inbox: 'Entrada', day: 'Fechamentos de dia' };
    for (const [kind, items] of Object.entries(res.groups)) {
      results.appendChild(el('div', { style: { marginTop: '14px' } }, section(LABEL[kind] || kind, items.length)));
      const stack = el('div', { class: kind === 'note' ? 'notegrid' : 'stack' });
      for (const it of items.slice(0, 30)) {
        const inst = { ...it.row, instanceId: it.row.id, isOccurrence: false };
        if (kind === 'task') stack.appendChild(taskItem(inst, { onChange: refresh }));
        else if (kind === 'event') stack.appendChild(eventItem(inst, { onChange: refresh }));
        else if (kind === 'log') stack.appendChild(logItem(it.row, { onChange: refresh }));
        else if (kind === 'note') stack.appendChild(noteCard(it.row, { onChange: refresh }));
        else stack.appendChild(el('button', {
          class: 'item', style: { textAlign: 'left' },
          onclick: () => go(kind === 'day' ? `#/historico?d=${it.row.date}` : '#/entrada'),
        }, el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, it.title),
          it.sub ? el('div', { class: 'item__meta' }, el('span', {}, it.sub)) : null)));
      }
      results.appendChild(stack);
    }
  }

  async function suggestions(box) {
    const { people, places } = await facets();
    if (people.length) {
      box.appendChild(section('Pessoas'));
      box.appendChild(el('div', { class: 'wrap' }, ...people.slice(0, 18).map(p =>
        el('button', { class: 'chip chip--out', onclick: () => { input.value = p.name; state.q = p.name; draw(); } },
          icon('people', 'ic--sm'), `${p.name} (${p.n})`))));
    }
    if (places.length) {
      box.appendChild(el('div', { style: { marginTop: '16px' } }, section('Locais')));
      box.appendChild(el('div', { class: 'wrap' }, ...places.slice(0, 18).map(p =>
        el('button', { class: 'chip chip--out', onclick: () => { input.value = p.name; state.q = p.name; draw(); } },
          icon('pin', 'ic--sm'), `${p.name} (${p.n})`))));
    }
    box.appendChild(el('div', { style: { marginTop: '16px' } }, section('Categorias')));
    box.appendChild(el('div', { class: 'wrap' }, ...S.categories.all().map(c =>
      el('button', {
        class: 'chip', style: { background: c.color + '22', color: c.color },
        onclick: () => { input.value = c.name; state.q = c.name; draw(); },
      }, `${c.icon} ${c.name}`))));
    if (!people.length && !places.length) {
      box.appendChild(empty('Digite ao menos 2 letras para pesquisar.'));
    }
  }
}
