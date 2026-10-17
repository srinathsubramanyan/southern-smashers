// ShuttleUp Service Worker — offline use + PWA install
// Bump the number below whenever you deploy, so old caches are cleared.
const CACHE = 'shuttleup-v7';
const ASSETS = [
  './index.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './tshirt.jpg',
  './sponsor-logo.png',
];

// Install — pre-cache the app shell. Each file is fetched fresh (bypassing the
// browser's HTTP cache) and a missing file (e.g. a logo not uploaded yet) no
// longer makes the whole install fail.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a =>
        fetch(new Request(a, { cache: 'reload' }))
          .then(r => (r && r.ok) ? c.put(a, r) : null)
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete old caches and take control of open pages straight away
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SHELL = /(^|\/)(index\.html|config\.js|manifest\.json)?$/;

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Supabase API — always network, empty JSON if offline
  if (url.hostname.endsWith('.supabase.co')) {
    e.respondWith(
      fetch(req).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  if (req.method !== 'GET') return;

  // App shell (page, config.js, manifest) — NETWORK FIRST so updates appear
  // immediately; fall back to the saved copy only when offline.
  const isShell = req.mode === 'navigate' ||
                  (url.origin === location.origin && SHELL.test(url.pathname));
  if (isShell) {
    e.respondWith(
      fetch(req.mode === 'navigate' ? url.href : req, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (icons, images, fonts) — cache first, refresh in background
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
