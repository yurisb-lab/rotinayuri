/* Tela "Entrada" — captura rápida sem organizar, para transformar depois. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section, empty } from '../ui/items.js';
import { menu, confirm as ask } from '../ui/modal.js';
import { ok } from '../ui/toast.js';
import { editTask, editEvent, editNote, editLog } from '../ui/forms.js';
import { interpret, openConfirm } from '../ui/quickadd.js';
import { fmtRelative, today } from '../util/date.js';

export const title = 'Entrada';

export async function render(root, { refresh }) {
  clear(root);
  const [pending, all] = await Promise.all([S.inbox.pending(), S.inbox.all()]);
  const processed = all.filter(i => i.status === 'processado')
    .sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));

  /* captura rápida ---------------------------------------------------- */
  const input = el('input', {
    class: 'input', placeholder: 'Anote aqui e organize depois…',
    onkeydown: async e => { if (e.key === 'Enter') await add(); },
  });
  const addBtn = el('button', { class: 'btn btn--primary', onclick: () => add() }, icon('plus'));
  root.appendChild(el('div', { class: 'row', style: { marginBottom: '16px', gap: '8px' } },
    el('div', { class: 'grow' }, input), addBtn));

  async function add() {
    const text = input.value.trim();
    if (!text) return;
    await S.inbox.add(text);
    input.value = '';
    ok('Anotado na Entrada');
    refresh();
  }

  /* lista pendente ------------------------------------------------------ */
  root.appendChild(section('Para organizar', pending.length));
  if (!pending.length) {
    root.appendChild(empty('Entrada vazia. Tudo organizado! 🎉'));
  } else {
    const stack = el('div', { class: 'stack' });
    pending.forEach(i => stack.appendChild(el('div', {
      class: 'item',
      style: { '--cat': 'var(--c-accent)' },
      onclick: () => openConvert(i, refresh),
    },
      el('div', { class: 'item__body' },
        el('div', { class: 'item__title' }, i.text),
        el('div', { class: 'item__meta' },
          el('span', {}, fmtRelative((i.createdAt || '').slice(0, 10))),
          i.source !== 'manual' ? el('span', { class: 'pill' }, i.source) : null)),
      icon('chev', 'ic--sm'))));
    root.appendChild(stack);

    root.appendChild(el('button', {
      class: 'btn btn--ghost btn--block', style: { marginTop: '12px' },
      onclick: async () => {
        const items = await interpret(pending.map(p => p.text).join('\n'));
        const n = await openConfirm(items, { source: 'entrada' });
        if (n) {
          for (const p of pending.slice(0, n)) await S.inbox.markConverted(p.id, 'lote', null);
          refresh();
        }
      },
    }, icon('text'), 'Interpretar tudo automaticamente'));
  }

  /* já organizados ------------------------------------------------------- */
  if (processed.length) {
    root.appendChild(el('div', { style: { marginTop: '22px' } },
      section('Já organizados', processed.length)));
    const stack = el('div', { class: 'stack' });
    processed.slice(0, 12).forEach(i => stack.appendChild(el('div', { class: 'item item--done' },
      el('div', { class: 'item__body' },
        el('div', { class: 'item__title' }, i.text),
        el('div', { class: 'item__meta' },
          el('span', { class: 'pill pill--ok' }, KIND_PT[i.convertedTo] || 'organizado'))),
      el('button', {
        class: 'btn btn--icon', 'aria-label': 'Excluir',
        onclick: async e => {
          e.stopPropagation();
          await S.inbox.remove(i.id);
          refresh();
        },
      }, icon('trash', 'ic--sm')))));
    root.appendChild(stack);
  }
}

const KIND_PT = { task: 'virou tarefa', event: 'virou compromisso', note: 'virou nota', log: 'virou registro', lote: 'organizado' };

function openConvert(item, refresh) {
  menu({
    title: item.text,
    items: [
      { icon: 'text', label: 'Interpretar automaticamente', sub: 'Detecta data, hora, pessoa e local',
        onClick: async () => {
          const parsed = await interpret(item.text);
          const n = await openConfirm(parsed, { source: 'entrada' });
          if (n) { await S.inbox.markConverted(item.id, parsed[0]?.kind || 'task', null); refresh(); }
        } },
      { icon: 'check', label: 'Transformar em tarefa',
        onClick: async () => {
          const t = await editTask(null, { title: item.text, date: today() });
          if (t) { await S.inbox.markConverted(item.id, 'task', t.id); refresh(); }
        } },
      { icon: 'calendar', label: 'Transformar em compromisso',
        onClick: async () => {
          const e = await editEvent(null, { title: item.text });
          if (e) { await S.inbox.markConverted(item.id, 'event', e.id); refresh(); }
        } },
      { icon: 'note', label: 'Transformar em nota',
        onClick: async () => {
          const n = await editNote(null, { title: item.text.slice(0, 60), body: item.text });
          if (n) { await S.inbox.markConverted(item.id, 'note', n.id); refresh(); }
        } },
      { icon: 'log', label: 'Transformar em registro do dia',
        onClick: async () => {
          const l = await editLog(null, { text: item.text });
          if (l) { await S.inbox.markConverted(item.id, 'log', l.id); refresh(); }
        } },
      { icon: 'trash', label: 'Excluir da Entrada',
        onClick: async () => {
          if (await ask({ title: 'Excluir', message: 'Remover este item da Entrada?', okLabel: 'Excluir', danger: true })) {
            await S.inbox.remove(item.id); refresh();
          }
        } },
    ],
  });
}
