/* Utilitários de data — tudo em horário local, datas como 'YYYY-MM-DD'. */

export const DOW = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
export const DOW_SHORT = ['dom','seg','ter','qua','qui','sex','sáb'];
export const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

const pad = n => String(n).padStart(2, '0');

/** Data local -> 'YYYY-MM-DD' */
export function iso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** 'YYYY-MM-DD' -> Date local (meio-dia evita problemas de DST) */
export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
export const today = () => iso();
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const nowISO = () => new Date().toISOString();

export function addDays(dateStr, n) {
  const d = parseISO(dateStr); d.setDate(d.getDate() + n); return iso(d);
}
export function addMonths(dateStr, n) {
  const d = parseISO(dateStr); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return iso(d);
}
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const dow = dateStr => parseISO(dateStr).getDay();
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

/** Segunda-feira da semana da data */
export function startOfWeek(dateStr, weekStart = 0) {
  const d = parseISO(dateStr);
  const delta = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - delta);
  return iso(d);
}
export function weekDays(dateStr, weekStart = 0) {
  const s = startOfWeek(dateStr, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}
export function monthMatrix(year, month, weekStart = 0) {
  const first = new Date(year, month, 1);
  const start = addDays(iso(first), -(((first.getDay() - weekStart) + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/* Formatação --------------------------------------------------------- */
export function fmtDate(dateStr, style = 'long') {
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  if (style === 'long')  return `${DOW[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  if (style === 'full')  return `${DOW[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  if (style === 'short') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (style === 'num')   return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (style === 'dm')    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return dateStr;
}
/** "hoje", "amanhã", "ontem", "sexta", "12 ago" */
export function fmtRelative(dateStr) {
  if (!dateStr) return 'sem data';
  const n = diffDays(today(), dateStr);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n === 2) return 'depois de amanhã';
  if (n > 2 && n < 7) return DOW_SHORT[dow(dateStr)] + ', ' + fmtDate(dateStr, 'dm');
  if (n < 0) return `${Math.abs(n)} dia${Math.abs(n) > 1 ? 's' : ''} atrás`;
  return fmtDate(dateStr, 'dm');
}
export function fmtTime(t) { return t ? t.slice(0, 5) : ''; }
export function fmtDateTime(dateStr, t) {
  return [fmtRelative(dateStr), t ? fmtTime(t) : ''].filter(Boolean).join(' · ');
}
export function minutes(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function fromMinutes(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function addMinutes(t, n) { return fromMinutes(minutes(t) + n); }
/** Combina data+hora local em Date */
export function toDate(dateStr, time) {
  const d = parseISO(dateStr); if (!d) return null;
  if (time) { const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); }
  else d.setHours(0, 0, 0, 0);
  return d;
}
/** Formato compacto do Google Agenda: 20260827T140000 */
export function gcalStamp(dateStr, time) {
  const d = parseISO(dateStr);
  const [h, m] = (time || '00:00').split(':').map(Number);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
}
export function isPast(dateStr, time) {
  const d = toDate(dateStr, time || '23:59');
  return d && d.getTime() < Date.now();
}
export { pad };
