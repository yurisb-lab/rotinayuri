/* Tela "Notas" — notas, listas, ideias, estudos, atas e rascunhos. */

import { el, icon, clear, debounce } from '../util/dom.js';
import * as S from '../core/store.js';
import { noteCard, section, empty } from '../ui/items.js';
import { editNote } from '../ui/forms.js';
import { normalizeText } from '../features/nlp.js';

export const title = 'Notas';

const state = { type: 'todas', q: '', categoryId: null };

export async function render(root, { refresh }) {
  clear(root);
  const all = await S.notes.recent(500);

  const grid = el('div', { class: 'notegrid' });

  root.appendChild(el('div', { class: 'searchbox' }, icon('search'),
    el('input', {
      placeholder: 'Buscar nas notas…', value: state.q,
      oninput: debounce(e => { state.q = e.target.value; draw(); }, 150),
    })));

  const typeChips = el('div', { class: 'scroller', style: { marginBottom: '8px' } });
  const drawChips = () => {
    clear(typeChips);
    [['todas', 'Todas'], ...Object.entries(S.NOTE_TYPES)].forEach(([v, l]) =>
      typeChips.appendChild(el('button', {
        class: `chip ${state.type === v ? 'chip--on' : 'chip--out'}`,
        onclick: () => { state.type = v; drawChips(); draw(); },
      }, l)));
  };
  drawChips();
  root.appendChild(typeChips);

  const catChips = el('div', { class: 'scroller', style: { marginBottom: '12px' } });
  const drawCats = () => {
    clear(catChips);
    catChips.appendChild(el('button', {
      class: `chip ${!state.categoryId ? 'chip--on' : 'chip--out'}`,
      onclick: () => { state.categoryId = null; drawCats(); draw(); },
    }, 'Todas as categorias'));
    S.categories.all().forEach(c => catChips.appendChild(el('button', {
      class: `chip ${state.categoryId === c.id ? 'chip--on' : 'chip--out'}`,
      style: state.categoryId === c.id ? { background: c.color, borderColor: c.color, color: '#fff' } : null,
      onclick: () => { state.categoryId = c.id; drawCats(); draw(); },
    }, `${c.icon} ${c.name}`)));
  };
  drawCats();
  root.appendChild(catChips);

  const head = el('div');
  root.appendChild(head);
  root.appendChild(grid);
  root.appendChild(el('button', {
    class: 'btn btn--primary btn--block', style: { marginTop: '16px' },
    onclick: () => editNote().then(refresh),
  }, icon('plus'), 'Nova nota'));

  draw();

  function draw() {
    const list = all.filter(n => {
      if (state.type !== 'todas' && n.type !== state.type) return false;
      if (state.categoryId && n.categoryId !== state.categoryId) return false;
      if (state.q) {
        const hay = normalizeText(`${n.title} ${n.body} ${(n.tags || []).join(' ')}`);
        if (!normalizeText(state.q).split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
    clear(head); clear(grid);
    head.appendChild(section('Notas', list.length));
    if (!list.length) { grid.appendChild(empty('Nenhuma nota encontrada.')); return; }
    list.forEach(n => grid.appendChild(noteCard(n, { onChange: refresh })));
  }
}
