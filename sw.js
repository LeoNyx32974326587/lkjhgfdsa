// Barbook offline: pages and code come fresh from the network when there is one (fallback: the
// last copy), word lists, pictures and libraries from the cache (refreshed in the background).
// Accounts and project data (Supabase) always go to the network.
var CACHE = 'barbook-v4';
var SHELL = ['app.html', 'login.html', 'index.html', 'app.css', 'styles.css', 'script.js', 'manifest.webmanifest', 'assets/fonts/fonts.css',
  'assets/icon.svg', 'assets/icon-192.png', 'js/config.js', 'js/cloud.js', 'js/login.js', 'js/words.js', 'js/rhyme.js',
  'js/song.js', 'js/store.js', 'js/db.js', 'js/ai.js', 'js/license-reader.js', 'js/wav.js', 'js/prompter.js',
  'js/analyze.js', 'js/beats.js', 'js/dictate.js', 'js/theme.js', 'js/app.js'];

self.addEventListener('install', function (e) {
  // 'reload' skips the browser's HTTP cache, so the offline copy is one consistent version
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// fresh: ask the server every time (cheap with ETags), never mix a cached page with newer code
function fromNetwork(req, fresh) {
  return fetch(fresh ? new Request(req, { cache: 'no-cache' }) : req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  });
}
function networkFirst(req) {
  return fromNetwork(req, true).catch(function () {
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
  // libraries from CDNs
  if (/(jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh)$/.test(url.hostname)) {
    return e.respondWith(cacheFirst(req));
  }
});

// ---------- push notifications (sent by the Supabase function "push") ----------
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    // Barbook open and in front: the app shows it itself (live update + small banner)
    if (list.some(function (c) { return c.focused && c.visibilityState === 'visible' && /app\.html/.test(c.url); })) return;
    return self.registration.showNotification(data.title || 'Barbook', {
      body: data.body || '', tag: data.tag || undefined, renotify: !!data.tag,
      icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', data: { url: data.url || 'app.html' }
    });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || 'app.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var open = list.filter(function (c) { return /app\.html/.test(c.url); })[0];
    if (open) return open.navigate(url).then(function (c) { return (c || open).focus(); }).catch(function () { return open.focus(); });
    return self.clients.openWindow(url);
  }));
});
