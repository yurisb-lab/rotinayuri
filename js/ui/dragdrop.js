/* Arrastar itens no calendário — funciona com toque e com mouse.
   Alvos de soltura são elementos com data-drop-date (e opcional data-drop-time). */

import { vibrate } from '../util/dom.js';

const HOLD_MS = 300;
const MOVE_TOLERANCE = 10;

export function makeDraggable(node, { onDrop, label } = {}) {
  let holdTimer = null, dragging = false, ghost = null, startX = 0, startY = 0, lastTarget = null;

  node.addEventListener('pointerdown', down);

  function down(ev) {
    if (ev.button != null && ev.button !== 0) return;
    startX = ev.clientX; startY = ev.clientY;
    holdTimer = setTimeout(() => begin(ev), HOLD_MS);
    node.addEventListener('pointermove', maybeCancel);
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointercancel', cancel);
  }
  function maybeCancel(ev) {
    if (dragging) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOLERANCE) cancel();
  }
  function cancel() {
    clearTimeout(holdTimer);
    node.removeEventListener('pointermove', maybeCancel);
    node.removeEventListener('pointerup', cancel);
    node.removeEventListener('pointercancel', cancel);
  }
  function begin(ev) {
    cancel();
    dragging = true;
    vibrate(18);
    node.classList.add('dragging');
    ghost = document.createElement('div');
    ghost.textContent = label || node.textContent.trim().slice(0, 40);
    Object.assign(ghost.style, {
      position: 'fixed', zIndex: 300, pointerEvents: 'none',
      background: 'var(--c-accent)', color: 'var(--c-accent-text)',
      padding: '6px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
      boxShadow: '0 10px 26px rgba(0,0,0,.35)', maxWidth: '65vw',
      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      transform: 'translate(-50%, -140%)',
    });
    document.body.appendChild(ghost);
    move(ev);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function move(ev) {
    if (!dragging) return;
    ev.preventDefault?.();
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    const target = targetAt(ev.clientX, ev.clientY);
    if (target !== lastTarget) {
      lastTarget?.classList.remove('cal__day--over', 'week__cell--over');
      lastTarget = target;
      if (target) target.classList.add(target.classList.contains('week__cell') ? 'week__cell--over' : 'cal__day--over');
    }
  }
  async function up(ev) {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    dragging = false;
    node.classList.remove('dragging');
    ghost?.remove(); ghost = null;
    const target = targetAt(ev.clientX, ev.clientY) || lastTarget;
    lastTarget?.classList.remove('cal__day--over', 'week__cell--over');
    lastTarget = null;
    if (target) {
      const date = target.dataset.dropDate;
      const time = target.dataset.dropTime || undefined;
      if (date) await onDrop?.({ date, time });
    }
  }
  function targetAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const n of stack) {
      const t = n.closest?.('[data-drop-date]');
      if (t) return t;
    }
    return null;
  }
  return () => { cancel(); node.removeEventListener('pointerdown', down); };
}
