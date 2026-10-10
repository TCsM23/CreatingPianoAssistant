// Saved songs live in the visitor's own browser (IndexedDB), never on the server.
// list() / get(id) / add(song, source) / remove(id), and MAX_SAVED is the limit.
window.SongStore = (function () {
  "use strict";

  const MAX_SAVED = 10;
  const DB_NAME = "tcsmusic";
  const STORE = "songs";
  let opening = null;

  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("unavailable"));
          return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("unavailable"));
      });
    }
    return opening;
  }

  function run(mode, make) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const request = make(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(request ? request.result : undefined);
          tx.onerror = tx.onabort = () => reject(new Error("unavailable"));
        })
    );
  }

  function list() {
    return run("readonly", (store) => store.getAll()).then((items) => items.sort((a, b) => b.created - a.created));
  }

  function get(id) {
    return run("readonly", (store) => store.get(id));
  }

  function remove(id) {
    return run("readwrite", (store) => store.delete(id));
  }

  async function add(song, source) {
    const items = await list();
    if (items.length >= MAX_SAVED) throw new Error("full");
    const record = {
      id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: song.title,
      source: source,
      created: Date.now(),
      duration: song.duration,
      // small arrays instead of objects keep each song compact: [midi, start, length, velocity]
      notes: song.notes.map((n) => [n.midi, Math.round(n.t * 1000) / 1000, Math.round(n.dur * 1000) / 1000, n.vel]),
    };
    await run("readwrite", (store) => store.add(record));
    return record;
  }

  return { MAX_SAVED, list, get, add, remove };
})();
