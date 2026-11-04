// Wilson — oreille de garde (PLAN.md, section 7 sexies, G2), EN ARRIÈRE-PLAN.
//
// Reconnaît les sons de la maison (YAMNet, Google, 521 sortes de sons, Apache-2.0) avec MediaPipe Audio, sur l'appareil.
// Ne tourne que pendant la garde. Reçoit ~1 s de son (16 kHz) et renvoie les sons les plus probables (numéro, score).
'use strict';

const ROOT = new URL('../', self.location.href).href;
let classifier = null;

async function init() {
  importScripts(ROOT + 'vendor/audio/audio_bundle.js');
  const A = self.Audio;
  const fileset = await A.FilesetResolver.forAudioTasks(ROOT + 'vendor/audio/wasm');
  classifier = await A.AudioClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: ROOT + 'vendor/models/yamnet.tflite' }, maxResults: 10, scoreThreshold: 0.05 });
  postMessage({ type: 'ready' });
}

const ready = init().catch((e) => postMessage({ type: 'ready', error: String(e && e.message || e) }));
let file = Promise.resolve();
onmessage = (e) => {
  const d = e.data;
  if (d.type !== 'son') return;
  file = file.then(async () => {
    await ready;
    if (!classifier) return postMessage({ type: 'sons', n: d.n, error: 'modèle absent' });
    const t0 = performance.now();
    try {
      const r = classifier.classify(d.pcm, 16000) || [];
      // Plusieurs fenêtres de 0,975 s possibles : pour chaque son, le meilleur score.
      const best = new Map();
      for (const x of r) for (const c of ((x.classifications || [])[0] || {}).categories || []) if (!best.has(c.index) || best.get(c.index) < c.score) best.set(c.index, c.score);
      postMessage({ type: 'sons', n: d.n, t: d.t, sons: [...best.entries()].map(([i, s]) => [i, Math.round(s * 1000) / 1000]).sort((a, b) => b[1] - a[1]), ms: Math.round(performance.now() - t0) });
    } catch (err) { postMessage({ type: 'sons', n: d.n, error: String(err && err.message || err) }); }
  });
};
