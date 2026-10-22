// Wilson — service worker : l'appli démarre même sans réseau et le modèle vocal (46 Mo) n'est téléchargé qu'une fois.
const VERSION = 'wilson-1.1.2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/wilson.css',
  'js/app.js', 'js/face.js', 'js/audio.js', 'js/ear.js', 'js/brain.js', 'js/vision.js', 'js/memory.js', 'js/sensors.js', 'js/settings.js',
  'js/faces/util.js', 'js/faces/lumiere.js', 'js/faces/bouille.js', 'js/faces/led.js', 'js/faces/miel.js', 'visages.html',
  'js/worklets/capture.js', 'vendor/vosk.js', 'icons/icon-192.png', 'icons/icon-512.png',
];
const HEAVY = 'wilson-lourd-v1';   // modèle vocal + moteurs : gardés d'une version à l'autre

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== HEAVY).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const heavy = /\/model\/|\/vendor\/mediapipe\/|mediapipe-models\/|blaze_face/.test(url.pathname + url.href);
  if (heavy) {                                     // cache d'abord (fichiers immuables)
    e.respondWith(caches.open(HEAVY).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true }); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Appli : réseau d'abord (mises à jour), cache si hors ligne.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
