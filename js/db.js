// Project storage in IndexedDB: project data plus the files that belong to it
// (beat, license document, recorded takes). Everything stays in this browser.
(function (root) {
  'use strict';

  var DB_NAME = 'raim', VERSION = 1;
  var dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('files')) {
            db.createObjectStore('files', { keyPath: 'id' }).createIndex('project', 'project');
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
    return dbPromise;
  }

  function run(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, mode), result;
        var req = fn(tx.objectStore(store));
        if (req) req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function newProject(title) {
    return {
      id: uid(),
      title: title || '',
      status: 'work',      // 'work' (in Arbeit), 'edit' (in Bearbeitung), 'done' (fertig)
      text: '',
      langs: ['de'],       // languages sung in, e.g. ['de', 'en']; codes in app.js LANGS
      lang: 'de',          // the one of them the rhyme engine uses ('de' or 'en')
      genres: [],
      bpm: '',
      key: '',             // e.g. "A-Moll"
      topic: '',           // what the song is about, for the AI
      created: Date.now(),
      updated: Date.now(),
      beat: null,          // { fileId, name }
      youtube: '',
      license: { producer: '', type: '', bpm: '', key: '', date: '', notes: '', fileId: null, fileName: '' },
      rhymes: { saved: [], history: [], blocked: [], langs: [] },  // langs: rhyme languages, empty = all
      takes: []            // [{ fileId, name, created }]
    };
  }

  root.RaimDB = {
    uid: uid,
    newProject: newProject,
    projects: function () { return run('projects', 'readonly', function (s) { return s.getAll(); }); },
    saveProject: function (p) { return run('projects', 'readwrite', function (s) { return s.put(p); }); },
    deleteProject: function (id) {
      return run('files', 'readwrite', function (s) {
        var req = s.index('project').openCursor(IDBKeyRange.only(id));
        req.onsuccess = function () {
          var c = req.result;
          if (c) { c.delete(); c.continue(); }
        };
      }).then(function () {
        return run('projects', 'readwrite', function (s) { return s.delete(id); });
      });
    },
    // file: Blob/File; returns the new file id
    putFile: function (projectId, file, name) {
      var id = uid();
      return run('files', 'readwrite', function (s) {
        return s.put({ id: id, project: projectId, name: name || file.name || 'Datei', type: file.type, blob: file });
      }).then(function () { return id; });
    },
    // restore a file with its original id (import)
    putFileRecord: function (rec) { return run('files', 'readwrite', function (s) { return s.put(rec); }); },
    getFile: function (id) { return run('files', 'readonly', function (s) { return s.get(id); }); },
    deleteFile: function (id) { return id ? run('files', 'readwrite', function (s) { return s.delete(id); }) : Promise.resolve(); }
  };
})(this);
