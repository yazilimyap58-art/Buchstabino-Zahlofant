// Service Worker für PWA-Offline-Fähigkeit
// Cacht die wichtigsten Assets, damit das Spiel auch ohne Internet funktioniert

const CACHE_NAME = 'buchstabino-zahlofant-v3';
const MASCOT_BASE = '/assets/mascots/buchstabino_zahlofant_assets/svg/';
const MASCOT_POSES = ['idle', 'waving', 'thinking', 'celebrating'];
const MASCOT_ASSETS = ['buchstabino', 'zahlofant'].flatMap(
  character => MASCOT_POSES.map(pose => `${MASCOT_BASE}${character}_${pose}.svg`)
);
const JS_MODULES = [
  'utils', 'config', 'state', 'dom', 'tts', 'mascot', 'confetti', 'letterDraw', 'game'
].map(name => `/js/${name}.js`);
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  ...JS_MODULES,
  '/manifest.json',
  '/sw.js',
  ...MASCOT_ASSETS
];

self.addEventListener('install', (event) => {
  // Warte, bis das Caching abgeschlossen ist, bevor der SW als aktiv gilt
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Lösche alte Caches, behalte nur den aktuellen
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!cacheWhitelist.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Ignoriere keine-cache-Requests (z.B. API-Calls)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Cache hit – Netzwerk-Request optional als Fallback
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        // Optional: Netzwerk-Response in Cache ablegen (für zukünftige Requests)
        return networkResponse;
      }).catch(() => {
        // Fallback: Eine einfache Offline-Seite (wenn gewünscht)
        return new Response('Offline – bitte später erneut versuchen.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});