/* Helpers de DOM ------------------------------------------------------- */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') setStyle(node, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}
/* Custom properties (--cat, --dot, --p) precisam de setProperty: passá-las
   por Object.assign vira uma propriedade JS solta e o navegador ignora — foi
   por isso que as cores de categoria nunca apareceram. */
function setStyle(node, styles) {
  for (const [k, v] of Object.entries(styles)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('--')) node.style.setProperty(k, String(v));
    else node.style[k] = v;
  }
}
function append(node, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
/** Ícone do sprite SVG */
export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `ic ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function frag(...children) { const f = document.createDocumentFragment(); append(f, children); return f; }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Destaca ocorrências do termo (retorna nó) */
export function highlight(text, term) {
  const span = el('span');
  if (!term) { span.textContent = text; return span; }
  const low = text.toLowerCase(), q = term.toLowerCase();
  let i = 0, at;
  while ((at = low.indexOf(q, i)) !== -1) {
    span.appendChild(document.createTextNode(text.slice(i, at)));
    span.appendChild(el('mark', {}, text.slice(at, at + q.length)));
    i = at + q.length;
  }
  span.appendChild(document.createTextNode(text.slice(i)));
  return span;
}
export function vibrate(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* opcional */ } }
export function debounce(fn, wait = 180) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
}
