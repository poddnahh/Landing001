// Tiny IndexedDB wrapper. Everything (including video and voice recordings)
// is stored on the device so the app works offline and nothing is uploaded.

const DB_NAME = 'unme';
const DB_VERSION = 2;
export const STORES = ['people', 'posts', 'moods', 'chats', 'messages', 'letters', 'media', 'tools', 'kv'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)).then(() => value),
  del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  async getKV(key, fallback) {
    const row = await this.get('kv', key);
    return row ? row.value : fallback;
  },
  setKV(key, value) {
    return this.put('kv', { key, value });
  },
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── Backup / sharing bundles ──────────────────────────────────

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const dataURLToBlob = async (url) => (await fetch(url)).blob();

export async function exportBundle() {
  const out = { app: 'unme', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const store of STORES) {
    if (store === 'kv') continue;
    const rows = await db.all(store);
    if (store === 'media') {
      out.data.media = await Promise.all(rows.map(async (m) => ({
        id: m.id, type: m.type, dataURL: await blobToDataURL(m.blob),
      })));
    } else {
      out.data[store] = rows;
    }
  }
  return out;
}

// Merges a bundle into this device. Existing rows with the same id are updated,
// so importing the same family bundle twice never duplicates anything.
export async function importBundle(bundle) {
  if (!bundle || (bundle.app !== 'unme' && bundle.app !== 'heartroots')) throw new Error('This is not an UnMe family file.');
  let count = 0;
  for (const [store, rows] of Object.entries(bundle.data || {})) {
    if (!STORES.includes(store) || store === 'kv') continue;
    for (const row of rows) {
      if (store === 'media') {
        await db.put('media', { id: row.id, type: row.type, blob: await dataURLToBlob(row.dataURL) });
      } else {
        const existing = await db.get(store, row.id);
        if (existing && store === 'posts') {
          // Merge likes and comments from both copies.
          row.likes = [...new Set([...(existing.likes || []), ...(row.likes || [])])];
          const seen = new Set((row.comments || []).map((c) => c.id));
          row.comments = [...(row.comments || []), ...(existing.comments || []).filter((c) => !seen.has(c.id))];
        }
        await db.put(store, row);
      }
      count++;
    }
  }
  return count;
}

export { blobToDataURL };
