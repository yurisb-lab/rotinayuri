/* Categorias personalizadas: nome, ícone e cor. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty } from '../ui/items.js';
import { editCategory } from '../ui/forms.js';
import * as db from '../core/db.js';

export const title = 'Categorias';

export async function render(root, { refresh }) {
  clear(root);
  const cats = S.categories.all();
  const [tasks, events, logs, notes] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('logs'), db.getAll('notes'),
  ]);
  const countOf = id => [tasks, events, logs, notes]
    .reduce((a, arr) => a + arr.filter(x => x.categoryId === id).length, 0);

  root.appendChild(section('Suas categorias', cats.length));
  if (!cats.length) root.appendChild(empty('Nenhuma categoria.'));

  const stack = el('div', { class: 'stack' });
  cats.forEach(c => stack.appendChild(el('button', {
    class: 'item', style: { '--cat': c.color, textAlign: 'left', width: '100%' },
    onclick: async () => { const r = await editCategory(c); if (r !== undefined) refresh(); },
  },
    el('span', { style: { fontSize: '22px' } }, c.icon),
    el('span', { class: 'item__body' },
      el('span', { class: 'item__title' }, c.name),
      el('span', { class: 'item__meta' }, el('span', {}, `${countOf(c.id)} item(ns)`))),
    el('span', { class: 'chip', style: { background: c.color, color: '#fff', minWidth: '26px' } }, ' '),
  )));
  root.appendChild(stack);

  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginTop: '16px' },
    onclick: async () => { const r = await editCategory(); if (r !== undefined) refresh(); },
  }, icon('plus'), 'Nova categoria'));

  root.appendChild(el('p', { class: 'tiny dim', style: { marginTop: '12px' } },
    'Ao excluir uma categoria, os itens continuam existindo — apenas ficam sem categoria.'));
}
