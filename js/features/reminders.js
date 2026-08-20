/* Lembretes e notificações locais.
   Os lembretes ficam gravados no IndexedDB e são disparados enquanto o
   aplicativo estiver aberto (ou ao reabrir, para os que ficaram para trás). */

import * as db from '../core/db.js';
import { emit } from '../core/bus.js';
import { today, addDays, toDate, fmtDate, fmtTime } from '../util/date.js';
import * as R from './recurrence.js';

export const PRESETS = [
  { id: 'd-7',            label: '7 dias antes' },
  { id: 'd-3',            label: '3 dias antes' },
  { id: 'd-1',            label: '1 dia antes' },
  { id: 'same-day-09:00', label: 'No dia, às 09:00' },
  { id: 'h-1',            label: '1 hora antes' },
  { id: 'm-30',           label: '30 minutos antes' },
  { id: 'm-10',           label: '10 minutos antes' },
];

export function labelOf(id) {
  const p = PRESETS.find(x => x.id === id);
  if (p) return p.label;
  let m;
  if ((m = /^d-(\d+)$/.exec(id))) return `${m[1]} dia(s) antes`;
  if ((m = /^h-(\d+)$/.exec(id))) return `${m[1]} hora(s) antes`;
  if ((m = /^m-(\d+)$/.exec(id))) return `${m[1]} minuto(s) antes`;
  if ((m = /^same-day-(\d{2}:\d{2})$/.exec(id))) return `No dia, às ${m[1]}`;
  if ((m = /^at-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/.exec(id))) return `${fmtDate(m[1], 'short')} às ${m[2]}`;
  return id;
}

/** Converte um preset em Date, dado o dia/hora do item. */
export function resolve(presetId, date, time) {
  const base = toDate(date, time || '09:00');
  if (!base) return null;
  let m;
  if ((m = /^d-(\d+)$/.exec(presetId))) {
    const d = toDate(addDays(date, -Number(m[1])), time || '09:00');
    return d;
  }
  if ((m = /^h-(\d+)$/.exec(presetId))) return new Date(base.getTime() - Number(m[1]) * 3600e3);
  if ((m = /^m-(\d+)$/.exec(presetId))) return new Date(base.getTime() - Number(m[1]) * 60e3);
  if ((m = /^same-day-(\d{2}):(\d{2})$/.exec(presetId))) return toDate(date, `${m[1]}:${m[2]}`);
  if ((m = /^at-(\d{4}-\d{2}-\d{2})-(\d{2}):(\d{2})$/.exec(presetId))) return toDate(m[1], `${m[2]}:${m[3]}`);
  return null;
}

/** Recria os lembretes agendados de um item (tarefa ou compromisso). */
export async function syncReminders(item) {
  const old = await db.byIndex('reminders', 'refId', item.id).catch(() => []);
  await db.delMany('reminders', old.map(r => r.id));
  if (!item.reminders?.length) return [];
  if (item.status === 'concluida' || item.status === 'cancelada') return [];

  const from = today();
  const dates = item.recurrence
    ? R.expand(item.recurrence, item.date || from, from, addDays(from, 90), 30)
    : (item.date && item.date >= addDays(from, -7) ? [item.date] : []);

  const rows = [];
  for (const d of dates) {
    for (const preset of item.reminders) {
      const at = resolve(preset, d, item.time);
      if (!at || at.getTime() < Date.now() - 6 * 3600e3) continue;
      rows.push({
        id: `${item.id}|${d}|${preset}`,
        refId: item.id, refKind: item.kind || 'task', refDate: d,
        at: at.toISOString(), preset, fired: false,
        title: item.title,
        body: `${item.kind === 'event' ? 'Compromisso' : 'Tarefa'} · ${fmtDate(d, 'short')}${item.time ? ' às ' + fmtTime(item.time) : ''}`,
      });
    }
  }
  await db.putMany('reminders', rows);
  return rows;
}

export async function pending() {
  const all = await db.getAll('reminders');
  return all.filter(r => !r.fired).sort((a, b) => a.at.localeCompare(b.at));
}

export async function upcoming(limit = 20) {
  const all = await pending();
  const now = Date.now();
  return all.filter(r => new Date(r.at).getTime() > now).slice(0, limit);
}

/* -------------------------------------------------------- notificações */
export function supported() {
  return typeof Notification !== 'undefined';
}
export async function requestPermission() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
export async function notify(title, body, data = {}) {
  if (!supported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
        tag: data.tag || title, data, vibrate: [80, 40, 80],
      });
    } else {
      new Notification(title, { body, icon: 'icons/icon-192.png', data });
    }
    return true;
  } catch (e) { console.warn('notificação falhou', e); return false; }
}

let timer = null;
/** Verifica lembretes vencidos; dispara notificação e marca como enviados. */
export async function check() {
  const due = (await pending()).filter(r => new Date(r.at).getTime() <= Date.now());
  if (!due.length) return [];
  for (const r of due) {
    await notify(r.title, r.body, { tag: r.id, refId: r.refId, refKind: r.refKind });
    await db.put('reminders', { ...r, fired: true, firedAt: new Date().toISOString() });
  }
  emit('reminders', due);
  return due;
}
export function start(intervalMs = 30000) {
  stop();
  check();
  timer = setInterval(check, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
}
export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
function onVisible() { if (document.visibilityState === 'visible') check(); }

/** Reagenda tudo (usado após importar backup). */
export async function rebuildAll() {
  await db.clearStore('reminders');
  const [tasks, events] = await Promise.all([db.getAll('tasks'), db.getAll('events')]);
  for (const t of [...tasks, ...events]) await syncReminders(t);
}
