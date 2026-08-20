import { el, $ } from '../util/dom.js';

const host = () => $('#toasts');

export function toast(message, { action, onAction, timeout = 3200 } = {}) {
  const node = el('div', { class: 'toast' }, message,
    action ? el('button', { onclick: () => { onAction?.(); close(); } }, action) : null);
  host().appendChild(node);
  const t = setTimeout(close, timeout);
  function close() { clearTimeout(t); node.remove(); }
  return close;
}

export const ok = m => toast(m);
export const err = m => toast('⚠ ' + m, { timeout: 4600 });
