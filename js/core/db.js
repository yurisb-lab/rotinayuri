/* Camada IndexedDB — sem dependências externas, tudo local no dispositivo. */

export const DB_NAME = 'rotina';
export const DB_VERSION = 3;

export const STORES = {
  tasks:       { keyPath: 'id', indexes: [['date','date'], ['status','status'], ['categoryId','categoryId'], ['updatedAt','updatedAt']] },
  events:      { keyPath: 'id', indexes: [['date','date'], ['categoryId','categoryId'], ['updatedAt','updatedAt']] },
  logs:        { keyPath: 'id', indexes: [['date','date'], ['categoryId','categoryId'], ['createdAt','createdAt']] },
  notes:       { keyPath: 'id', indexes: [['type','type'], ['categoryId','categoryId'], ['updatedAt','updatedAt']] },
  inbox:       { keyPath: 'id', indexes: [['status','status'], ['createdAt','createdAt']] },
  categories:  { keyPath: 'id', indexes: [['order','order']] },
  days:        { keyPath: 'date' },
  occurrences: { keyPath: 'id', indexes: [['seriesId','seriesId'], ['date','date']] },
  reminders:   { keyPath: 'id', indexes: [['at','at'], ['refId','refId']] },
  settings:    { keyPath: 'key' },

  /* v2 — base da "Minha Memória" ------------------------------------- */
  people:      { keyPath: 'id', indexes: [['key','key'], ['lastSeen','lastSeen']] },
  places:      { keyPath: 'id', indexes: [['key','key'], ['lastSeen','lastSeen']] },
  moments:     { keyPath: 'id', indexes: [['date','date'], ['createdAt','createdAt']] },
  checkins:    { keyPath: 'id', indexes: [['date','date']] },
};

/* Tabelas que um dia vão sincronizar entre aparelhos.
   Nelas, apagar vira uma marcação (`deletedAt`) em vez de sumiço: uma linha
   apagada de verdade voltaria do outro aparelho na primeira sincronização,
   porque lá ela ainda existe. Tombstone é o tipo de decisão que não dá para
   tomar depois — o que foi apagado antes dela não deixa rastro. */
export const SYNCABLE = new Set([
  'tasks', 'events', 'logs', 'notes', 'inbox', 'categories',
  'days', 'occurrences', 'people', 'places', 'moments', 'checkins',
]);

const isDeleted = r => !!(r && r.deletedAt);
const stamp = () => new Date().toISOString();

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ev => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        let store;
        if (!db.objectStoreNames.contains(name)) store = db.createObjectStore(name, { keyPath: def.keyPath });
        else store = req.transaction.objectStore(name);
        for (const [idxName, path] of (def.indexes || [])) {
          if (!store.indexNames.contains(idxName)) store.createIndex(idxName, path);
        }
      }
      void ev;
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco bloqueado por outra aba aberta.'));
  });
}

function tx(names, mode = 'readonly') {
  return open().then(db => db.transaction(names, mode));
}
const wrap = req => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export async function get(store, key, { includeDeleted = false } = {}) {
  const t = await tx(store);
  const row = await wrap(t.objectStore(store).get(key));
  if (!includeDeleted && SYNCABLE.has(store) && isDeleted(row)) return undefined;
  return row;
}
export async function getAll(store, { includeDeleted = false } = {}) {
  const t = await tx(store);
  const rows = await wrap(t.objectStore(store).getAll());
  if (includeDeleted || !SYNCABLE.has(store)) return rows;
  return rows.filter(r => !isDeleted(r));
}
export async function put(store, value) {
  const t = await tx(store, 'readwrite');
  await wrap(t.objectStore(store).put(value));
  return value;
}
export async function putMany(store, values) {
  if (!values.length) return [];
  const t = await tx(store, 'readwrite');
  const os = t.objectStore(store);
  await Promise.all(values.map(v => wrap(os.put(v))));
  return values;
}
/** Exclusão lógica nas tabelas sincronizáveis; física nas demais. */
export async function del(store, key) {
  if (!SYNCABLE.has(store)) return purge(store, key);
  const row = await get(store, key, { includeDeleted: true });
  if (!row) return;
  const at = stamp();
  await put(store, { ...row, deletedAt: at, updatedAt: at });
}
export async function delMany(store, keys) {
  if (!keys.length) return;
  if (!SYNCABLE.has(store)) return purgeMany(store, keys);
  for (const k of keys) await del(store, k);
}

/** Exclusão física de verdade — usada por "apagar tudo" e pela restauração. */
export async function purge(store, key) {
  const t = await tx(store, 'readwrite'); return wrap(t.objectStore(store).delete(key));
}
export async function purgeMany(store, keys) {
  if (!keys.length) return;
  const t = await tx(store, 'readwrite');
  const os = t.objectStore(store);
  await Promise.all(keys.map(k => wrap(os.delete(k))));
}

/** Remove tombstones antigos (padrão: 180 dias). Só depois que tudo
    sincronizou é que apagar de vez é seguro — por isso a folga larga. */
export async function purgeTombstones(store, olderThanDays = 180) {
  if (!SYNCABLE.has(store)) return 0;
  const limite = new Date(Date.now() - olderThanDays * 86400e3).toISOString();
  const rows = await getAll(store, { includeDeleted: true });
  const alvo = rows.filter(r => r.deletedAt && r.deletedAt < limite);
  const kp = STORES[store].keyPath;
  await purgeMany(store, alvo.map(r => r[kp]));
  return alvo.length;
}
export async function clearStore(store) {
  const t = await tx(store, 'readwrite'); return wrap(t.objectStore(store).clear());
}
/** Consulta por índice: value exato ou IDBKeyRange */
export async function byIndex(store, index, value, { includeDeleted = false } = {}) {
  const t = await tx(store);
  const rows = await wrap(t.objectStore(store).index(index).getAll(value));
  if (includeDeleted || !SYNCABLE.has(store)) return rows;
  return rows.filter(r => !isDeleted(r));
}
export async function count(store) {
  if (!SYNCABLE.has(store)) {
    const t = await tx(store); return wrap(t.objectStore(store).count());
  }
  return (await getAll(store)).length;
}

/** Tudo que mudou depois de um instante — a consulta que a sincronização
    futura vai fazer. Inclui os tombstones de propósito. */
export async function changedSince(store, isoTime) {
  const rows = await getAll(store, { includeDeleted: true });
  return rows.filter(r => (r.updatedAt || r.createdAt || '') > isoTime);
}
export const range = IDBKeyRange;
