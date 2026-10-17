// Project storage in IndexedDB: project data plus the files that belong to it
// (beat, license document, recorded takes). With an account (js/cloud.js) this is a local
// copy per user that is kept in sync with the cloud; without one it is all there is.
(function (root) {
  'use strict';

  var DB_NAME = 'raim', VERSION = 1;   // 'raim': projects from before accounts
  var dbPromise = null, cloud = null, user = null;

  function openNamed(name) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, VERSION);
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
  }

  function open() {
    if (!dbPromise) {
      dbPromise = openNamed(DB_NAME);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
    return dbPromise;
  }

  function runOn(dbP, store, mode, fn) {
    return dbP.then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, mode), result;
        var req = fn(tx.objectStore(store));
        if (req) req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function run(store, mode, fn) { return runOn(open(), store, mode, fn); }

  // ---------- changes that still have to reach the cloud (offline, errors) ----------
  function pendingKey() { return 'barbook.pending.' + user; }
  function pending() {
    var x = null;
    try { x = JSON.parse(localStorage.getItem(pendingKey()) || 'null'); } catch (e) { /* private mode */ }
    return x || { projects: [], files: [], delProjects: [], delFiles: [] };
  }
  function setPending(fn) {
    if (!user) return;
    var x = pending();
    fn(x);
    try { localStorage.setItem(pendingKey(), JSON.stringify(x)); } catch (e) { /* private mode */ }
  }
  function add(list, id) { if (list.indexOf(id) < 0) list.push(id); }
  function drop(list, id) { var i = list.indexOf(id); if (i >= 0) list.splice(i, 1); }

  // send one change; on failure remember it for the next sync
  function push(kind, id, send) {
    if (!user) return;
    setPending(function (x) { add(x[kind], id); });
    if (!cloud || !cloud.online()) return;
    send().then(function () {
      setPending(function (x) { drop(x[kind], id); });
    }, function () { /* stays pending */ });
  }

  function localProject(id) { return run('projects', 'readonly', function (s) { return s.get(id); }); }
  function localFile(id) { return run('files', 'readonly', function (s) { return s.get(id); }); }
  function putLocal(store, rec) { return run(store, 'readwrite', function (s) { return s.put(rec); }); }

  function pushProject(p) {
    push('projects', p.id, function () {
      return cloud.saveProject(p).then(function () {
        // remember that the cloud has it: if it disappears there later, it was deleted on another device
        if (!p._cloud) { p._cloud = true; return putLocal('projects', p); }
      });
    });
  }
  function pushFile(rec) {
    push('files', rec.id, function () { return cloud.putFile(rec); });
  }

  // Bring local copy and cloud together: the newer version of each project wins.
  function sync() {
    if (!cloud || !cloud.online()) return Promise.resolve({ offline: true });
    var x = pending();
    // first what is still waiting from last time
    return Promise.all(x.delProjects.map(function (id) {
      return cloud.deleteProject(id).then(function () { setPending(function (y) { drop(y.delProjects, id); }); }, function () {});
    }).concat(x.delFiles.map(function (id) {
      return cloud.deleteFile(id).then(function () { setPending(function (y) { drop(y.delFiles, id); }); }, function () {});
    })).concat(x.files.map(function (id) {
      return localFile(id).then(function (rec) {
        if (!rec) { setPending(function (y) { drop(y.files, id); }); return; }
        return cloud.putFile(rec).then(function () { setPending(function (y) { drop(y.files, id); }); }, function () {});
      });
    }))).then(function () {
      return Promise.all([cloud.listProjects(), run('projects', 'readonly', function (s) { return s.getAll(); })]);
    }).then(function (both) {
      var remote = {}, local = {}, jobs = [], stats = { down: 0, up: 0, removed: 0 };
      both[0].forEach(function (r) { remote[r.id] = r; });
      both[1].forEach(function (p) { local[p.id] = p; });
      Object.keys(remote).forEach(function (id) {
        var r = remote[id], l = local[id];
        if (!l || r.updated > (l.updated || 0)) {
          r.data._cloud = true;
          jobs.push(putLocal('projects', r.data));
          stats.down++;
        }
      });
      Object.keys(local).forEach(function (id) {
        var l = local[id], r = remote[id];
        if (!r && l._cloud) {
          // deleted on another device
          jobs.push(deleteLocal(id));
          stats.removed++;
        } else if (!r || (l.updated || 0) > r.updated || x.projects.indexOf(id) >= 0 && (l.updated || 0) >= r.updated) {
          pushProject(l);
          stats.up++;
        }
      });
      return Promise.all(jobs).then(function () { return stats; });
    });
  }

  function deleteLocal(id) {
    return run('files', 'readwrite', function (s) {
      var req = s.index('project').openCursor(IDBKeyRange.only(id));
      req.onsuccess = function () {
        var c = req.result;
        if (c) { c.delete(); c.continue(); }
      };
    }).then(function () {
      return run('projects', 'readwrite', function (s) { return s.delete(id); });
    });
  }

  // projects saved before accounts existed (database "raim" on this device)
  function legacy() {
    var dbP = openNamed('raim');
    return Promise.all([
      runOn(dbP, 'projects', 'readonly', function (s) { return s.getAll(); }),
      runOn(dbP, 'files', 'readonly', function (s) { return s.getAll(); })
    ]).then(function (r) { return { projects: r[0], files: r[1] }; });
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function newProject(title) {
    return {
      id: uid(),
      title: title || '',
      status: 'edit',      // 'edit' (in Bearbeitung) or 'done' (fertig)
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
    // after login: a local copy for this user, synced through cloud (null while offline)
    useAccount: function (userId, cloudApi) {
      user = userId;
      cloud = cloudApi;
      DB_NAME = 'barbook-' + userId;
      dbPromise = null;
    },
    sync: sync,
    legacy: legacy,
    projects: function () { return run('projects', 'readonly', function (s) { return s.getAll(); }); },
    saveProject: function (p) {
      return putLocal('projects', p).then(function () { pushProject(p); });
    },
    deleteProject: function (id) {
      return deleteLocal(id).then(function () {
        setPending(function (x) { drop(x.projects, id); });
        push('delProjects', id, function () { return cloud.deleteProject(id); });
      });
    },
    // file: Blob/File; returns the new file id
    putFile: function (projectId, file, name) {
      var rec = { id: uid(), project: projectId, name: name || file.name || 'Datei', type: file.type, blob: file };
      return putLocal('files', rec).then(function () { pushFile(rec); return rec.id; });
    },
    // restore a file with its original id (import, taking over old projects)
    putFileRecord: function (rec) {
      return putLocal('files', rec).then(function () { pushFile(rec); });
    },
    // from this device, or downloaded once from the cloud
    getFile: function (id) {
      return localFile(id).then(function (rec) {
        if (rec || !cloud || !cloud.online() || !id) return rec;
        return cloud.getFile(id).then(function (r) {
          if (!r) return null;
          return putLocal('files', r).then(function () { return r; });
        }, function () { return null; });
      });
    },
    deleteFile: function (id) {
      if (!id) return Promise.resolve();
      return run('files', 'readwrite', function (s) { return s.delete(id); }).then(function () {
        setPending(function (x) { drop(x.files, id); });
        push('delFiles', id, function () { return cloud.deleteFile(id); });
      });
    }
  };
})(this);
