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

  // API keys are no longer kept in the browser: the AI runs through Barbook's server
  try { localStorage.removeItem('raim.apiKey'); } catch (e) { /* private mode */ }

  root.RaimStore = {
    // songs from the first version, moved into projects once
    legacySongs: function () { return read('raim.songs', []); },
    clearLegacySongs: function () { try { localStorage.removeItem('raim.songs'); localStorage.removeItem('raim.blocked'); } catch (e) { /* ignore */ } },
    // v2: the AI now gets the whole song (up to 80 lines), so it asks again
    consent: function () { return read('raim.aiConsent2', false); },
    saveConsent: function (v) { return write('raim.aiConsent2', v); }
  };
})(this);
