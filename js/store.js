// Local persistence. Everything stays in this browser.
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
    songs: function () { return read('raim.songs', []); },
    saveSongs: function (songs) { return write('raim.songs', songs); },
    blocked: function () { return new Set(read('raim.blocked', [])); },
    saveBlocked: function (set) { return write('raim.blocked', Array.from(set)); },
    apiKey: function () { return read('raim.apiKey', ''); },
    saveApiKey: function (k) { return write('raim.apiKey', k); },
    consent: function () { return read('raim.aiConsent', false); },
    saveConsent: function (v) { return write('raim.aiConsent', v); }
  };
})(this);
