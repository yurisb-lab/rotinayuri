/* Camada IndexedDB — sem dependências externas, tudo local no dispositivo. */

export const DB_NAME = 'rotina';
export const DB_VERSION = 1;

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
};

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

export async function get(store, key) {
  const t = await tx(store); return wrap(t.objectStore(store).get(key));
}
export async function getAll(store) {
  const t = await tx(store); return wrap(t.objectStore(store).getAll());
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
export async function del(store, key) {
  const t = await tx(store, 'readwrite'); return wrap(t.objectStore(store).delete(key));
}
export async function delMany(store, keys) {
  if (!keys.length) return;
  const t = await tx(store, 'readwrite');
  const os = t.objectStore(store);
  await Promise.all(keys.map(k => wrap(os.delete(k))));
}
export async function clearStore(store) {
  const t = await tx(store, 'readwrite'); return wrap(t.objectStore(store).clear());
}
/** Consulta por índice: value exato ou IDBKeyRange */
export async function byIndex(store, index, value) {
  const t = await tx(store);
  return wrap(t.objectStore(store).index(index).getAll(value));
}
export async function count(store) {
  const t = await tx(store); return wrap(t.objectStore(store).count());
}
export const range = IDBKeyRange;
