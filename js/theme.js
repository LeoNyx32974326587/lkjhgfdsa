// Light or dark design, set before the page paints. 'dark' (default), 'light' or 'auto' (like the device).
(function (root) {
  'use strict';
  var KEY = 'barbook.theme';
  function choice() { try { return localStorage.getItem(KEY) || 'dark'; } catch (e) { return 'dark'; } }
  function apply() {
    var c = choice(), light = c === 'light' || (c === 'auto' && root.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = light ? '#f4f1ff' : '#07060f';
  }
  apply();
  if (root.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  root.RaimTheme = {
    get: choice,
    set: function (c) { try { localStorage.setItem(KEY, c); } catch (e) { /* private mode */ } apply(); },
    isLight: function () { return document.documentElement.dataset.theme === 'light'; }
  };
})(this);
