/* Pesquisa global local: tarefas, compromissos, registros, notas,
   entrada, categorias, pessoas e locais. */

import * as db from '../core/db.js';
import { normalizeText as norm } from './nlp.js';
import { categories } from '../core/store.js';

const fields = {
  tasks:  t => [t.title, t.description, t.notes, t.place, ...(t.people || []), ...(t.tags || []),
    ...(t.subtasks || []).map(s => s.title)],
  events: e => [e.title, e.description, e.notes, e.location, ...(e.people || []), ...(e.tags || [])],
  logs:   l => [l.text, l.person, l.place, ...(l.tags || [])],
  notes:  n => [n.title, n.body, ...(n.items || []).map(i => i.text), ...(n.tags || [])],
  inbox:  i => [i.text],
  days:   d => [d.reflection, d.mood],
};

const KIND_OF = { tasks: 'task', events: 'event', logs: 'log', notes: 'note', inbox: 'inbox', days: 'day' };

export async function search(query, { limit = 120, stores = Object.keys(fields) } = {}) {
  const q = norm(String(query || '').trim());
  if (q.length < 2) return { total: 0, groups: {}, items: [] };
  const terms = q.split(/\s+/).filter(Boolean);
  const items = [];

  for (const store of stores) {
    const rows = await db.getAll(store).catch(() => []);
    for (const row of rows) {
      const hay = norm(fields[store](row).filter(Boolean).join('  '));
      if (!terms.every(t => hay.includes(t))) continue;
      items.push({
        kind: KIND_OF[store], store, row,
        score: score(hay, terms, row),
        title: titleOf(store, row),
        sub: subOf(store, row),
        date: row.date || (row.createdAt || '').slice(0, 10),
      });
    }
  }
  items.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
  const cut = items.slice(0, limit);
  const groups = {};
  for (const it of cut) (groups[it.kind] ||= []).push(it);
  return { total: items.length, groups, items: cut };
}

function score(hay, terms, row) {
  let s = 0;
  for (const t of terms) {
    const at = hay.indexOf(t);
    if (at === 0) s += 3; else if (at > 0) s += 1;
  }
  if (row.pinned) s += 2;
  if (row.status === 'pendente') s += 0.5;
  return s;
}
function titleOf(store, row) {
  if (store === 'logs' || store === 'inbox') return row.text;
  if (store === 'notes') return row.title || String(row.body || '').slice(0, 60);
  if (store === 'days') return `Fechamento de ${row.date}`;
  return row.title;
}
function subOf(store, row) {
  const cat = row.categoryId ? categories.label(row.categoryId) : '';
  if (store === 'logs') return [row.time, row.person, row.place, cat].filter(Boolean).join(' · ');
  if (store === 'events') return [row.time, row.location, cat].filter(Boolean).join(' · ');
  if (store === 'notes') return [row.type, cat].filter(Boolean).join(' · ');
  if (store === 'days') return String(row.reflection || '').slice(0, 80);
  return [row.time, cat].filter(Boolean).join(' · ');
}

/** Pessoas e locais já mencionados (para sugestões e busca). */
export async function facets() {
  const [tasks, events, logs] = await Promise.all([
    db.getAll('tasks'), db.getAll('events'), db.getAll('logs'),
  ]);
  const people = new Map(), places = new Map();
  const bump = (map, v) => {
    if (!v) return;
    const k = String(v).trim();
    if (k.length < 2) return;
    map.set(k, (map.get(k) || 0) + 1);
  };
  tasks.forEach(t => { (t.people || []).forEach(p => bump(people, p)); bump(places, t.place); });
  events.forEach(e => { (e.people || []).forEach(p => bump(people, p)); bump(places, e.location); });
  logs.forEach(l => { bump(people, l.person); bump(places, l.place); });
  const sort = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  return { people: sort(people), places: sort(places) };
}
