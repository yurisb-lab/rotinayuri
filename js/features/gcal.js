/* Google Agenda e compartilhamento — sem servidor, apenas links e arquivos. */

import { gcalStamp, addMinutes, fmtDate, fmtTime, parseISO } from '../util/date.js';

/** Link "Adicionar ao Google Agenda" (não exige backend nem login prévio). */
export function googleCalendarUrl(item) {
  const date = item.date;
  const start = item.allDay ? null : (item.time || '09:00');
  const end = item.allDay ? null : (item.endTime || addMinutes(start, 60));
  const dates = item.allDay
    ? `${date.replace(/-/g, '')}/${date.replace(/-/g, '')}`
    : `${gcalStamp(date, start)}/${gcalStamp(date, end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.title || 'Compromisso',
    dates,
    details: [item.description, item.notes, item.people?.length ? `Com: ${item.people.join(', ')}` : '']
      .filter(Boolean).join('\n'),
    location: item.location || '',
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  });
  if (item.recurrence) {
    const rrule = toRRule(item.recurrence, item.date);
    if (rrule) params.set('recur', 'RRULE:' + rrule);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function toRRule(rec, anchor) {
  if (!rec) return '';
  const parts = [];
  const int = rec.interval > 1 ? `;INTERVAL=${rec.interval}` : '';
  switch (rec.type) {
    case 'daily': case 'custom': parts.push(`FREQ=DAILY${int}`); break;
    case 'weekdays': parts.push(`FREQ=WEEKLY;BYDAY=${(rec.weekdays?.length ? rec.weekdays : [1,2,3,4,5]).map(d => BYDAY[d]).join(',')}${int}`); break;
    case 'weekly': {
      const days = rec.weekdays?.length ? rec.weekdays : [parseISO(anchor).getDay()];
      parts.push(`FREQ=WEEKLY;BYDAY=${days.map(d => BYDAY[d]).join(',')}${int}`); break;
    }
    case 'monthly': parts.push(`FREQ=MONTHLY;BYMONTHDAY=${rec.monthDay || parseISO(anchor).getDate()}${int}`); break;
    case 'monthlyNth': parts.push(`FREQ=MONTHLY;BYDAY=${rec.nth}${BYDAY[rec.nthDow]}${int}`); break;
    case 'yearly': parts.push(`FREQ=YEARLY${int}`); break;
    default: return '';
  }
  if (rec.until) parts.push(`UNTIL=${rec.until.replace(/-/g, '')}T235900Z`);
  if (rec.count) parts.push(`COUNT=${rec.count}`);
  return parts.join(';');
}

/** Arquivo .ics para importar em qualquer agenda. */
export function toICS(items, calName = 'Rotina') {
  const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotina//PT-BR//', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${calName}`,
  ];
  for (const it of [items].flat()) {
    const start = it.allDay ? null : (it.time || '09:00');
    const end = it.allDay ? null : (it.endTime || addMinutes(start, 60));
    lines.push('BEGIN:VEVENT', `UID:${it.id}@rotina.local`, `DTSTAMP:${now}`);
    if (it.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${it.date.replace(/-/g, '')}`);
    } else {
      lines.push(`DTSTART:${gcalStamp(it.date, start)}`, `DTEND:${gcalStamp(it.date, end)}`);
    }
    lines.push(`SUMMARY:${escICS(it.title || '')}`);
    if (it.location) lines.push(`LOCATION:${escICS(it.location)}`);
    const desc = [it.description, it.notes].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${escICS(desc)}`);
    const rr = toRRule(it.recurrence, it.date);
    if (rr) lines.push(`RRULE:${rr}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
const escICS = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Texto para compartilhamento nativo. */
export function shareText(item) {
  return [
    item.title,
    `${fmtDate(item.date, 'full')}${item.time ? ' às ' + fmtTime(item.time) : ''}`,
    item.location ? `Local: ${item.location}` : '',
    item.people?.length ? `Com: ${item.people.join(', ')}` : '',
    item.description || '',
  ].filter(Boolean).join('\n');
}

export async function share(item) {
  const text = shareText(item);
  if (navigator.share) {
    try { await navigator.share({ title: item.title, text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'canceled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; }
  catch { return 'failed'; }
}

export function download(filename, content, type = 'text/calendar') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
