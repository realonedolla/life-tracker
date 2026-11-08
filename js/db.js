// IndexedDB-Zugriff. Alle Daten der App liegen hier, nichts verlässt das Gerät.

const DB_NAME = 'lifetracker';
export const DB_VERSION = 1;

// Store-Name → keyPath und Indizes.
export const SCHEMA = {
  meta:       { keyPath: 'key' },
  areas:      { keyPath: 'id' },
  goals:      { keyPath: 'id', indexes: ['areaId'] },
  milestones: { keyPath: 'id', indexes: ['goalId'] },
  goalNotes:  { keyPath: 'id', indexes: ['goalId'] },
  goalValues: { keyPath: 'id', indexes: ['goalId', 'date'] },
  routines:   { keyPath: 'id' },
  days:       { keyPath: 'date' },
  entries:    { keyPath: 'id', indexes: ['date', 'routineId'] },
  sessions:   { keyPath: 'id', indexes: ['date', 'areaId', 'goalId'] },
  photos:     { keyPath: 'id', indexes: ['date', 'goalId'] },
  ideas:      { keyPath: 'id', indexes: ['status'] },
};
export const STORE_NAMES = Object.keys(SCHEMA);

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(SCHEMA)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes || []) store.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Eine neuere Version in einem anderen Tab soll nicht blockiert werden.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist in einem anderen Tab geöffnet.'));
  });
  return dbPromise;
}

function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Führt fn(stores) in einer Transaktion aus und wartet, bis sie abgeschlossen ist.
// stores ist ein Objekt { name: IDBObjectStore }.
export async function tx(names, mode, fn) {
  const db = await openDB();
  const list = Array.isArray(names) ? names : [names];
  const t = db.transaction(list, mode);
  const stores = Object.fromEntries(list.map((n) => [n, t.objectStore(n)]));
  const finished = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
  let result;
  try {
    result = await fn(stores, t);
  } catch (err) {
    try { t.abort(); } catch {}
    throw err;
  }
  await finished;
  return result;
}

export const get = (store, key) => tx(store, 'readonly', (s) => done(s[store].get(key)));
export const getAll = (store) => tx(store, 'readonly', (s) => done(s[store].getAll()));
export const getAllBy = (store, index, value) =>
  tx(store, 'readonly', (s) => done(s[store].index(index).getAll(value)));
export const put = (store, value) => tx(store, 'readwrite', (s) => done(s[store].put(value)));
export const del = (store, key) => tx(store, 'readwrite', (s) => done(s[store].delete(key)));
export const count = (store) => tx(store, 'readonly', (s) => done(s[store].count()));

export function putMany(store, values) {
  return tx(store, 'readwrite', (s) => {
    for (const v of values) s[store].put(v);
  });
}

// Liest alle Stores auf einmal (für Export und Übersicht).
export function dumpAll() {
  return tx(STORE_NAMES, 'readonly', async (s) => {
    const out = {};
    for (const name of STORE_NAMES) out[name] = await done(s[name].getAll());
    return out;
  });
}

// Ersetzt den gesamten Datenbestand atomar: entweder alles oder nichts.
export function replaceAll(data) {
  return tx(STORE_NAMES, 'readwrite', (s) => {
    for (const name of STORE_NAMES) {
      s[name].clear();
      for (const v of data[name] || []) s[name].put(v);
    }
  });
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export const setMeta = (key, value) => put('meta', { key, value });

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
