/* Barramento de eventos simples usado para redesenhar as telas. */
const handlers = new Map();
export function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => handlers.get(evt).delete(fn);
}
export function emit(evt, data) {
  handlers.get(evt)?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
  if (evt !== '*') handlers.get('*')?.forEach(fn => { try { fn(evt, data); } catch (e) { console.error(e); } });
}
