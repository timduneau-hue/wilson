// Wilson — service worker : l'appli démarre même sans réseau et les modèles de vision ne sont téléchargés qu'une fois.
const VERSION = 'wilson-1.19.2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'version.json', 'css/wilson.css',
  'js/app.js', 'js/vision-worker.js', 'js/voice.js', 'js/eco.js', 'js/face.js', 'js/audio.js', 'js/brain.js', 'js/vision.js', 'js/memory.js', 'js/sensors.js', 'js/settings.js', 'js/remote.js', 'js/sync.js', 'js/crm.js', 'js/analyste.js', 'js/maison.js', 'js/oreille.js', 'vendor/qrcode/qrcode.js',
  'js/faces/util.js', 'js/faces/lumiere.js', 'js/faces/bouille.js', 'js/faces/led.js', 'js/faces/miel.js', 'visages.html',
  'js/worklets/capture.js', 'icons/icon-192.png', 'icons/icon-512.png',
];
const HEAVY = 'wilson-lourd-v2';   // modèles de vision + moteurs : gardés d'une version à l'autre

self.addEventListener('install', (e) => {
  // « reload » : on ignore le cache HTTP du navigateur pour stocker vraiment la nouvelle version.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== HEAVY).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const heavy = /\/vendor\/(mediapipe|face_detection|models)\/|mediapipe-models\//.test(url.pathname + url.href);
  if (heavy) {                                     // cache d'abord (fichiers immuables)
    e.respondWith(caches.open(HEAVY).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true }); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Appli : réseau d'abord en revalidant auprès du serveur (« no-cache » : jamais de version périmée), cache si hors ligne.
  e.respondWith(fetch(new Request(req, { cache: 'no-cache' })).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
