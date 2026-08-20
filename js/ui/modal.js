/* Folhas modais (bottom sheets), confirmações e menus. */

import { el, icon, $ } from '../util/dom.js';

const layer = () => $('#layer');
const stack = [];

export function openSheet({ title, body, foot, onClose, dismissible = true, wide = false }) {
  const sheet = el('div', { class: 'sheet', style: wide ? { maxWidth: '760px' } : null, role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'sheet__grip' }),
    title ? el('div', { class: 'sheet__head' },
      el('h2', { class: 'sheet__title' }, title),
      el('button', { class: 'topbar__btn', 'aria-label': 'Fechar', onclick: () => close() }, icon('close'))
    ) : null,
    body,
    foot ? el('div', { class: 'sheet__foot' }, foot) : null,
  );
  const scrim = el('div', {
    class: 'scrim',
    onclick: e => { if (e.target === scrim && dismissible) close(); },
  }, sheet);

  layer().appendChild(scrim);
  document.body.style.overflow = 'hidden';
  const entry = { scrim, close };
  stack.push(entry);
  setTimeout(() => sheet.querySelector('input,textarea,select,button')?.focus?.({ preventScroll: true }), 60);

  function close(result) {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    scrim.remove();
    if (!stack.length) document.body.style.overflow = '';
    onClose?.(result);
  }
  return { close, sheet, scrim };
}

export function closeTop() {
  const top = stack[stack.length - 1];
  top?.close();
  return !!top;
}
export const hasOpen = () => stack.length > 0;

export function confirm({ title = 'Confirmar', message = '', okLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const { close } = openSheet({
      title,
      body: el('p', { class: 'muted', style: { whiteSpace: 'pre-wrap' } }, message),
      foot: [
        el('button', { class: 'btn btn--ghost', onclick: () => { finish(false); close(); } }, cancelLabel),
        el('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, onclick: () => { finish(true); close(); } }, okLabel),
      ],
      onClose: () => finish(false),
    });
  });
}

export function prompt({ title = '', label = '', value = '', placeholder = '', multiline = false, okLabel = 'Salvar' }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const input = el(multiline ? 'textarea' : 'input', {
      class: multiline ? 'textarea' : 'input', value, placeholder,
      onkeydown: e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); submit(); } },
    });
    const { close } = openSheet({
      title,
      body: el('div', { class: 'field' }, label ? el('label', { class: 'field__label' }, label) : null, input),
      foot: [
        el('button', { class: 'btn btn--ghost', onclick: () => { finish(null); close(); } }, 'Cancelar'),
        el('button', { class: 'btn btn--primary', onclick: submit }, okLabel),
      ],
      onClose: () => finish(null),
    });
    function submit() { finish(input.value.trim()); close(); }
  });
}

export function menu({ title, items }) {
  const { close } = openSheet({
    title,
    body: el('div', { class: 'menu' }, items.filter(Boolean).map(it =>
      el('button', {
        class: 'menu__item',
        onclick: async () => { close(); await it.onClick?.(); },
      },
        it.icon ? el('span', { class: 'menu__ico' }, typeof it.icon === 'string' ? icon(it.icon) : it.icon) : null,
        el('span', { class: 'grow' },
          el('span', {}, it.label),
          it.sub ? el('small', {}, it.sub) : null),
      ))),
  });
  return close;
}
