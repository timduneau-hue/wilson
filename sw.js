// Wilson — service worker : l'appli démarre même sans réseau et les modèles de vision ne sont téléchargés qu'une fois.
const VERSION = 'wilson-1.41.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'version.json', 'css/wilson.css',
  'js/analyste.js', 'js/app.js', 'js/audio.js', 'js/brain.js', 'js/claude.js', 'js/crm.js', 'js/eco.js', 'js/face.js', 'js/famille.js', 'js/garde-worker.js', 'js/garde.js', 'js/maison.js', 'js/memoire.js', 'js/memory.js', 'js/oreille.js', 'js/outils.js', 'js/questions.js', 'js/qui-worker.js', 'js/qui.js', 'js/reactions.js', 'js/remote.js', 'js/sensors.js', 'js/settings.js', 'js/stockage.js', 'js/sync.js', 'js/vision-worker.js', 'js/vision.js', 'js/voice.js', 'js/voiture.js', 'vendor/qrcode/qrcode.js',
  'js/faces/bouille.js', 'js/faces/led.js', 'js/faces/lumiere.js', 'js/faces/miel.js', 'js/faces/util.js', 'js/worklets/capture.js', 'visages.html', 'icons/icon-192.png', 'icons/icon-512.png',
];
const HEAVY = 'wilson-lourd-v2';   // modèles de vision + moteurs : gardés d'une version à l'autre
const META = 'wilson-etat';        // état du retour arrière (une seule entrée « etat »)
const DELAI_PRETE = 20000;         // une version fraîchement activée doit se déclarer « prête » dans ce délai (ms), sinon retour à la précédente

// ---------- Retour arrière (W14) ----------
// Une version qui vient d'être activée est « à l'essai » : si la page ne dit pas « prête » à temps (erreur de script au démarrage,
// fichier manquant...), le service worker resert la version précédente, gardée en cache, et le note (la page le met au journal).
// statut : 'essai' (attend « prête »), 'ok' (confirmée), 'retour' (on sert la version précédente jusqu'à la prochaine publication).
const lireEtat = async () => { try { const r = await (await caches.open(META)).match('etat'); return r ? await r.json() : {}; } catch (_) { return {}; } };
let _etat = null;
const etat = async () => _etat || (_etat = await lireEtat());
async function ecrireEtat(m) {
  _etat = m;
  try { await (await caches.open(META)).put('etat', new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } })); } catch (_) {}
}
const num = (k) => k.replace('wilson-', '').split('.').map((x) => parseInt(x, 10) || 0);
const comparer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

let veille = null;   // surveillance en cours : { t: minuteur, fin: fin de l'attente }
function surveiller(e) {
  if (veille) return;
  e.waitUntil(new Promise((fin) => {
    veille = { fin, t: setTimeout(async () => {
      veille = null;
      await basculer('retour', `la page ne s'est pas déclarée prête en ${DELAI_PRETE / 1000} s`);
      fin();
    }, DELAI_PRETE) };
  }));
}
function pretVu() { if (veille) { clearTimeout(veille.t); veille.fin(); veille = null; } }

// Passe en mode « retour » (sert la version précédente) et recharge les pages ouvertes.
async function basculer(statut, raison) {
  const m = await etat();
  if (statut === 'retour') {
    if (!m.precedente || !(await caches.has(m.precedente))) return false;
    await ecrireEtat({ ...m, statut: 'retour', echec: m.version, raison, quand: Date.now(), signale: false });
    try { for (const c of await self.clients.matchAll({ type: 'window' })) { try { await c.navigate(c.url); } catch (_) {} } } catch (_) {}
    return true;
  }
  return false;
}

self.addEventListener('install', (e) => {
  // « reload » : on ignore le cache HTTP du navigateur pour stocker vraiment la nouvelle version.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const m = await lireEtat(), keys = await caches.keys();
    const autres = keys.filter((k) => /^wilson-\d/.test(k) && k !== VERSION).sort(comparer);
    let nouveau = m;
    if (m.version !== VERSION) {                       // première activation de cette version
      // précédente = la dernière version confirmée « prête » ; à défaut la plus récente des anciennes
      const prec = m.bonne && m.bonne !== VERSION && autres.includes(m.bonne) ? m.bonne : (autres[autres.length - 1] || null);
      nouveau = prec ? { version: VERSION, precedente: prec, statut: 'essai', depuis: Date.now(), bonne: m.bonne || null }
                     : { version: VERSION, precedente: null, statut: 'ok', depuis: Date.now(), bonne: m.bonne || null };
    }
    await ecrireEtat(nouveau);
    // On ne garde que la version courante et la précédente (+ le cache lourd et l'état).
    await Promise.all(keys.filter((k) => k !== VERSION && k !== HEAVY && k !== META && k !== nouveau.precedente).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const d = e.data || {}, src = e.source;
  e.waitUntil((async () => {
    const m = await etat();
    if (d.type === 'prete') {
      // Seule la page de la version courante confirme (en mode « retour », c'est l'ancienne page qui tourne : on ne change rien).
      if (m.statut === 'essai' && m.version === VERSION && d.version && 'wilson-' + d.version === VERSION) {
        pretVu(); await ecrireEtat({ ...m, statut: 'ok', bonne: VERSION });
      } else if (m.statut === 'ok' && m.bonne !== VERSION && d.version && 'wilson-' + d.version === VERSION) {
        await ecrireEtat({ ...m, bonne: VERSION });
      }
    } else if (d.type === 'etat') {
      if (src) src.postMessage({ type: 'etat', etat: { ...m, signale: undefined }, version: VERSION });
      if (m.statut === 'retour' && !m.signale) await ecrireEtat({ ...m, signale: true });   // la page l'a lu : une seule fois au journal
    } else if (d.type === 'retour') {                 // demandé à la main (réglages)
      const fait = await basculer('retour', d.raison || 'demandé à la main');
      if (src) src.postMessage({ type: 'retour', fait });
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const heavy = /\/vendor\/(mediapipe|face_detection|models|face-api|audio)\/|mediapipe-models\//.test(url.pathname + url.href);
  if (heavy) {                                     // cache d'abord (fichiers immuables)
    e.respondWith(caches.open(HEAVY).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true }); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const m = await etat();
    // Retour arrière : on sert la version précédente (cache d'abord) tant qu'une nouvelle publication ne remplace pas celle-ci.
    if (m.statut === 'retour' && m.precedente) {
      const hit = await (await caches.open(m.precedente)).match(req, { ignoreSearch: true });
      if (hit) return hit;
    }
    // Version à l'essai : la première page demandée lance le compte à rebours.
    if (m.statut === 'essai' && m.version === VERSION && req.mode === 'navigate') surveiller(e);
    // Appli : réseau d'abord en revalidant auprès du serveur (« no-cache » : jamais de version périmée), cache si hors ligne.
    return fetch(new Request(req, { cache: 'no-cache' })).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }).then((r) => r || c.match('index.html'))));
  })());
});
