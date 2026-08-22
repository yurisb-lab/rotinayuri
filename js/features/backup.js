/* Backup local: exportar / importar / restaurar / apagar.
   O arquivo é um JSON com todos os dados necessários para restaurar o app. */

import * as db from '../core/db.js';
import { emit } from '../core/bus.js';
import { nowISO } from '../util/date.js';
import { settings, init as initStore, seedRegistries } from '../core/store.js';

const STORES = ['categories', 'tasks', 'events', 'logs', 'notes', 'inbox', 'days', 'occurrences',
  'reminders', 'settings', 'people', 'places', 'moments', 'checkins'];
export const FORMAT = 'rotina-backup';
export const FORMAT_VERSION = 1;

export async function collect() {
  const data = {};
  /* inclui os tombstones: um backup que perdesse as exclusões faria itens
     apagados ressuscitarem ao restaurar em outro aparelho. */
  for (const s of STORES) data[s] = await db.getAll(s, { includeDeleted: true }).catch(() => []);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    app: 'Rotina',
    exportedAt: nowISO(),
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    data,
  };
}

export async function exportJSON() {
  const payload = await collect();
  const json = JSON.stringify(payload, null, 2);
  const name = `rotina-backup-${payload.exportedAt.slice(0, 10)}.json`;
  await settings.set('lastBackup', payload.exportedAt);
  return { json, name, payload };
}

export function saveFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function validate(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Arquivo inválido.');
  if (payload.format !== FORMAT) throw new Error('Este arquivo não é um backup do Rotina.');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('Backup sem dados.');
  return true;
}

/** mode: 'merge' mantém o que existe; 'replace' apaga tudo antes. */
export async function importJSON(payload, mode = 'merge') {
  validate(payload);
  if (mode === 'replace') {
    for (const s of STORES) await db.clearStore(s);
  }
  const report = {};
  for (const s of STORES) {
    const rows = payload.data[s] || [];
    if (!rows.length) { report[s] = 0; continue; }
    if (mode === 'merge') {
      const existing = await db.getAll(s, { includeDeleted: true });
      const key = s === 'days' ? 'date' : s === 'settings' ? 'key' : 'id';
      const have = new Set(existing.map(r => r[key]));
      const add = rows.filter(r => !have.has(r[key]));
      await db.putMany(s, add);
      report[s] = add.length;
    } else {
      await db.putMany(s, rows);
      report[s] = rows.length;
    }
  }
  await initStore();
  /* Um backup antigo não traz pessoas nem lugares: reconstrói a partir do que
     foi restaurado, para que a memória não volte vazia. */
  await seedRegistries().catch(() => {});
  const { rebuildAll } = await import('./reminders.js');
  await rebuildAll();
  emit('data');
  emit('imported', report);
  return report;
}

export async function readFile(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error('Não foi possível ler o arquivo (JSON inválido).'); }
  validate(payload);
  return payload;
}

export async function wipe({ keepCategories = false, keepSettings = false } = {}) {
  for (const s of STORES) {
    if (keepCategories && s === 'categories') continue;
    if (keepSettings && s === 'settings') continue;
    await db.clearStore(s);
  }
  await initStore();
  emit('data');
  emit('wiped');
}

/* Exportações auxiliares em CSV ---------------------------------------- */
const csv = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';

export async function exportLogsCSV(from, to) {
  const rows = (await db.getAll('logs'))
    .filter(l => (!from || l.date >= from) && (!to || l.date <= to))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const head = ['data', 'hora', 'registro', 'pessoa', 'local', 'tags'];
  const body = rows.map(l => [l.date, l.time, l.text,
    (l.people?.length ? l.people.join(', ') : l.person || ''), l.place || '', (l.tags || []).join(' ')]
    .map(csv).join(';'));
  return [head.join(';'), ...body].join('\n');
}

export async function exportTasksCSV() {
  const rows = await db.getAll('tasks');
  const head = ['titulo', 'data', 'hora', 'status', 'prioridade', 'prazo', 'descricao'];
  const body = rows.map(t => [t.title, t.date || '', t.time || '', t.status, t.priority, t.due || '', t.description || '']
    .map(csv).join(';'));
  return [head.join(';'), ...body].join('\n');
}

/** Estimativa de uso de armazenamento. */
export async function usage() {
  const counts = {};
  for (const s of STORES) counts[s] = await db.count(s).catch(() => 0);
  let quota = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) quota = { used: est.usage, total: est.quota };
  } catch { /* sem suporte */ }
  return { counts, quota };
}
