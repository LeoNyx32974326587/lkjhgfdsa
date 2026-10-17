// Barbook offline: pages and code come fresh from the network when there is one (fallback: the
// last copy), word lists, pictures and libraries from the cache (refreshed in the background).
// Accounts and project data (Supabase) always go to the network.
var CACHE = 'barbook-v1';
var SHELL = ['app.html', 'login.html', 'index.html', 'app.css', 'styles.css', 'script.js', 'manifest.webmanifest',
  'assets/icon.svg', 'assets/icon-192.png', 'js/config.js', 'js/cloud.js', 'js/login.js', 'js/words.js', 'js/rhyme.js',
  'js/song.js', 'js/store.js', 'js/db.js', 'js/ai.js', 'js/license-reader.js', 'js/wav.js', 'js/prompter.js',
  'js/analyze.js', 'js/beats.js', 'js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromNetwork(req) {
  return fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  });
}
function networkFirst(req) {
  return fromNetwork(req).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || Response.error(); });
  });
}
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    var fresh = fromNetwork(req).catch(function () { return hit; });
    return hit || fresh;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || /supabase\.co$/.test(url.hostname)) return;
  var same = url.origin === location.origin;
  if (same && /\/js\/(words|thesaurus)/.test(url.pathname)) return e.respondWith(cacheFirst(req));
  if (same && /\/assets\//.test(url.pathname)) return e.respondWith(cacheFirst(req));
  if (same) return e.respondWith(networkFirst(req));
  // libraries and fonts from CDNs
  if (/(jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    return e.respondWith(cacheFirst(req));
  }
});
