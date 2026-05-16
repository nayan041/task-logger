// db.js — IndexedDB wrapper for the offline sync queue.
//
// When the app is offline (or a save fails on the network), the new note or
// finance record is stored here — including any image blobs — and uploaded to
// GitHub later when the connection returns.

const DB_NAME = 'taskLogger';
const DB_VERSION = 1;
const STORE = 'queue';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'queueId', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Add one item to the queue. Returns the new auto-generated queueId.
export async function queueAdd(item) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite')
      .objectStore(STORE)
      .add({ ...item, createdAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Return every queued item, oldest first.
export async function queueAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly')
      .objectStore(STORE)
      .getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Remove one item by its queueId.
export async function queueRemove(queueId) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite')
      .objectStore(STORE)
      .delete(queueId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// How many items are waiting to sync.
export async function queueCount() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly')
      .objectStore(STORE)
      .count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
