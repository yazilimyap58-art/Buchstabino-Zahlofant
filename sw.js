// Service Worker für PWA-Offline-Fähigkeit
// Cacht die wichtigsten Assets, damit das Spiel auch ohne Internet funktioniert

const CACHE_NAME = 'buchstabino-zahlofant-v10';
const MASCOT_BASE = '/assets/mascots/buchstabino_zahlofant_assets/svg/';
const MASCOT_POSES = ['idle', 'waving', 'thinking', 'celebrating'];
const MASCOT_ASSETS = ['buchstabino', 'zahlofant'].flatMap(
  character => MASCOT_POSES.map(pose => `${MASCOT_BASE}${character}_${pose}.svg`)
);
const JS_MODULES = [
  'utils', 'config', 'state', 'dom', 'tts', 'timings', 'gameEvents', 'rewardStorage',
  'rewardSystem', 'confetti', 'celebration', 'mascot', 'traceDraw', 'rewardUI', 'game'
].map(name => `/js/${name}.js`);
// Audio-Baustein-Keys für die ElevenLabs-TTS (siehe js/tts.js + scripts/tts-texts.mjs).
// MUSS mit den dort erzeugten Keys übereinstimmen - beim Ändern des
// Text-Inventars auch hier nachziehen, sonst fehlen frisch hinzugefügte
// Bausteine im Offline-Cache.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const MOTIF_IDS = ['schmetterling', 'biene', 'apfel', 'birne', 'blume', 'stern', 'herz', 'auto'];
const FIXED_AUDIO_KEYS = [
  'glue_plus', 'glue_add_tail', 'glue_sub_lead', 'glue_sub_mid', 'glue_sub_tail',
  'glue_wie', 'glue_find_lead',
  'feedback_correct_number_lead', 'feedback_wrong_number_lead',
  'feedback_correct_letter_lead', 'feedback_wrong_letter_lead',
  'fixed_count_question', 'fixed_help_hint_buchstabino', 'fixed_help_hint_zahlofant',
  'fixed_draw_success', 'fixed_draw_retry_overflow', 'fixed_draw_retry_coverage',
  'fixed_draw_freehand_pass', 'fixed_draw_freehand_fail',
  'fixed_draw_success_zahlofant', 'fixed_draw_retry_overflow_zahlofant',
  'fixed_draw_retry_coverage_zahlofant', 'fixed_draw_freehand_pass_zahlofant',
  'fixed_draw_freehand_fail_zahlofant',
  'greet_buchstabino', 'greet_zahlofant'
];
const AUDIO_KEYS = [
  ...Array.from({ length: 21 }, (_, n) => `num_${n}`),
  ...LETTERS.map(l => `letter_${l}`),
  ...LETTERS.map(l => `word_${l}`),
  ...MOTIF_IDS.flatMap(id => [`motif_${id}_sg`, `motif_${id}_pl`]),
  ...FIXED_AUDIO_KEYS
];
const AUDIO_ASSETS = AUDIO_KEYS.map(key => `/audio/${key}.mp3`);
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  ...JS_MODULES,
  '/scripts/tts-texts.mjs', // von js/tts.js importiert (Sprachausgabe-Fallback-Text)
  '/manifest.json',
  '/sw.js',
  '/assets/icons/gamelogo.png',
  ...MASCOT_ASSETS,
  ...AUDIO_ASSETS
];

self.addEventListener('install', (event) => {
  // Warte, bis das Caching abgeschlossen ist, bevor der SW als aktiv gilt.
  // Pro Datei einzeln cachen (statt cache.addAll(), das atomar ist und
  // schon an einer einzigen fehlenden URL komplett scheitert) - die
  // Audio-Bausteine (AUDIO_ASSETS) existieren erst, nachdem
  // scripts/generate-tts.mjs gelaufen ist. Ohne diese Auftrennung würde
  // ein Deploy vor der Audio-Generierung die Offline-Fähigkeit des
  // GESAMTEN Spiels brechen (auch CSS/JS/Mascot-Assets), nicht nur die
  // fehlenden Audiodateien.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)));
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.warn('SW: Konnte Asset nicht cachen:', ASSETS_TO_CACHE[i], result.reason);
        }
      });
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