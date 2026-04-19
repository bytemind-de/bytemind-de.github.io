// NoCord-P2P — Service Worker
// Provides app-shell caching for PWA stability on flaky connections

// ═══════════════════════════════════════════════════════════════
//   DEV FLAG — auf true setzen um den SW beim Testen zu umgehen.
//   Der SW bleibt registriert, leitet aber alle Requests direkt
//   ans Netzwerk durch und ueberspringt jegliches Caching.
//   Fuer Produktion wieder auf false setzen.
// ═══════════════════════════════════════════════════════════════
const DEV_BYPASS = true;

const CACHE_NAME = 'nocord-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: pre-cache app shell (wird bei DEV_BYPASS uebersprungen)
self.addEventListener('install', event => {
  if (DEV_BYPASS) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

// Activate: alte Caches aufraeumen + bei DEV_BYPASS alle loeschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const toDelete = DEV_BYPASS
        ? keys                                          // alle Caches loeschen
        : keys.filter(k => k !== CACHE_NAME);          // nur alte Versionen
      return Promise.all(toDelete.map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Fetch: bei DEV_BYPASS immer direkt ans Netzwerk
self.addEventListener('fetch', event => {
  if (DEV_BYPASS) return; // SW komplett aus dem Weg

  // WebSockets nie abfangen
  if (event.request.url.startsWith('ws:') || event.request.url.startsWith('wss:')) return;

  // Network-first fuer Navigations
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first fuer statische Assets (Scripts, Styles, Fonts)
  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style'  ||
    event.request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        }).catch(() => cached);
      })
    );
  }
});
