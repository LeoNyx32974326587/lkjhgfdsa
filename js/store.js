// Small settings in localStorage. Projects live in IndexedDB (db.js).
(function (root) {
  'use strict';

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  root.RaimStore = {
    // songs from the first version, moved into projects once
    legacySongs: function () { return read('raim.songs', []); },
    clearLegacySongs: function () { try { localStorage.removeItem('raim.songs'); localStorage.removeItem('raim.blocked'); } catch (e) { /* ignore */ } },
    apiKey: function () { return read('raim.apiKey', ''); },
    saveApiKey: function (k) { return write('raim.apiKey', k); },
    consent: function () { return read('raim.aiConsent', false); },
    saveConsent: function (v) { return write('raim.aiConsent', v); }
  };
})(this);
