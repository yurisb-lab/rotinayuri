/* Recorrências — geração de ocorrências virtuais a partir de uma regra.
   Regra: { type, interval, weekdays[], monthDay, nth, nthDow, until, count, exceptions[] } */

import { iso, parseISO, addDays, dow, diffDays, daysInMonth, DOW, DOW_SHORT, MONTHS } from '../util/date.js';

export const TYPES = [
  { id: 'daily',      label: 'Todos os dias' },
  { id: 'weekdays',   label: 'Dias específicos da semana' },
  { id: 'weekly',     label: 'Semanal' },
  { id: 'monthly',    label: 'Mensal (dia do mês)' },
  { id: 'monthlyNth', label: 'Mensal (ex.: 1ª segunda)' },
  { id: 'yearly',     label: 'Anual' },
  { id: 'custom',     label: 'Personalizado (a cada N dias)' },
];

export function normalize(rec) {
  if (!rec || !rec.type || rec.type === 'none') return null;
  return {
    type: rec.type,
    interval: Math.max(1, Number(rec.interval) || 1),
    weekdays: Array.isArray(rec.weekdays) ? [...new Set(rec.weekdays.map(Number))].sort() : [],
    monthDay: rec.monthDay ? Number(rec.monthDay) : null,
    nth: rec.nth ? Number(rec.nth) : 1,
    nthDow: rec.nthDow != null ? Number(rec.nthDow) : 1,
    until: rec.until || null,
    count: rec.count ? Number(rec.count) : null,
    exceptions: Array.isArray(rec.exceptions) ? rec.exceptions : [],
  };
}

/** A regra acontece nesta data? `anchor` é a data inicial do item. */
export function occursOn(rec, anchor, date) {
  rec = normalize(rec);
  if (!rec || !date) return false;
  if (rec.exceptions.includes(date)) return false;
  if (rec.until && date > rec.until) return false;
  const start = anchor || date;
  if (date < start) return false;

  const d = parseISO(date);
  const wd = d.getDay();
  const delta = diffDays(start, date);

  switch (rec.type) {
    case 'daily':
      return delta % rec.interval === 0;
    case 'custom':
      return delta % rec.interval === 0;
    case 'weekdays':
      return rec.weekdays.length ? rec.weekdays.includes(wd) : wd >= 1 && wd <= 5;
    case 'weekly': {
      const days = rec.weekdays.length ? rec.weekdays : [dow(start)];
      if (!days.includes(wd)) return false;
      if (rec.interval === 1) return true;
      const weeks = Math.floor(diffDays(weekAnchor(start), weekAnchor(date)) / 7);
      return weeks % rec.interval === 0;
    }
    case 'monthly': {
      const target = rec.monthDay || parseISO(start).getDate();
      const dim = daysInMonth(d.getFullYear(), d.getMonth());
      if (d.getDate() !== Math.min(target, dim)) return false;
      return monthsBetween(start, date) % rec.interval === 0;
    }
    case 'monthlyNth': {
      if (wd !== rec.nthDow) return false;
      if (nthOfMonth(date) !== rec.nth && !(rec.nth === -1 && isLastOfMonth(date))) return false;
      return monthsBetween(start, date) % rec.interval === 0;
    }
    case 'yearly': {
      const s = parseISO(start);
      if (d.getMonth() !== s.getMonth() || d.getDate() !== s.getDate()) return false;
      return (d.getFullYear() - s.getFullYear()) % rec.interval === 0;
    }
    default: return false;
  }
}

/** Lista as datas da regra entre `from` e `to` (inclusive). */
export function expand(rec, anchor, from, to, limit = 400) {
  const out = [];
  if (!rec) return out;
  let cur = from < anchor ? anchor : from;
  let guard = 0;
  while (cur <= to && out.length < limit && guard++ < 1500) {
    if (occursOn(rec, anchor, cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  if (rec.count) {
    const all = countedDates(rec, anchor, rec.count);
    return out.filter(d => all.includes(d));
  }
  return out;
}
function countedDates(rec, anchor, n) {
  const out = []; let cur = anchor, guard = 0;
  while (out.length < n && guard++ < 4000) {
    if (occursOn({ ...rec, count: null }, anchor, cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
/** Próxima ocorrência a partir de uma data (inclusive). */
export function next(rec, anchor, from) {
  let cur = from < anchor ? anchor : from, guard = 0;
  while (guard++ < 800) {
    if (occursOn(rec, anchor, cur)) return cur;
    cur = addDays(cur, 1);
  }
  return null;
}

function weekAnchor(dateStr) { const d = parseISO(dateStr); d.setDate(d.getDate() - d.getDay()); return iso(d); }
function monthsBetween(a, b) {
  const x = parseISO(a), y = parseISO(b);
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
}
function nthOfMonth(dateStr) { return Math.floor((parseISO(dateStr).getDate() - 1) / 7) + 1; }
function isLastOfMonth(dateStr) {
  const d = parseISO(dateStr);
  return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth());
}

const ORD = { 1: 'primeira', 2: 'segunda', 3: 'terceira', 4: 'quarta', '-1': 'última' };

/** Texto legível da recorrência. */
export function describe(rec, anchor) {
  rec = normalize(rec);
  if (!rec) return '';
  const list = ds => ds.map(d => DOW_SHORT[d]).join(', ');
  switch (rec.type) {
    case 'daily':
      return rec.interval === 1 ? 'Todos os dias' : `A cada ${rec.interval} dias`;
    case 'custom':
      return `A cada ${rec.interval} dias`;
    case 'weekdays': {
      const days = rec.weekdays.length ? rec.weekdays : [1, 2, 3, 4, 5];
      if (days.join() === '1,2,3,4,5') return 'De segunda a sexta';
      if (days.join() === '0,6') return 'Fins de semana';
      return `Toda ${list(days)}`;
    }
    case 'weekly': {
      const days = rec.weekdays.length ? rec.weekdays : (anchor ? [dow(anchor)] : []);
      const base = days.length ? `Toda ${list(days)}` : 'Semanal';
      return rec.interval === 1 ? base : `${base} (a cada ${rec.interval} semanas)`;
    }
    case 'monthly':
      return `Todo dia ${rec.monthDay || (anchor ? parseISO(anchor).getDate() : '')} do mês`;
    case 'monthlyNth':
      return `Toda ${ORD[rec.nth] || rec.nth + 'ª'} ${DOW[rec.nthDow]} do mês`;
    case 'yearly':
      return anchor ? `Todo ano em ${parseISO(anchor).getDate()} de ${MONTHS[parseISO(anchor).getMonth()]}` : 'Anual';
    default: return 'Recorrente';
  }
}
