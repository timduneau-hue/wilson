// Wilson — qui me regarde (PLAN.md, section 7 sexies, V) : empreinte d'un visage, EN ARRIÈRE-PLAN.
//
// Reçoit un visage redressé 150 × 150 (fait par vision-worker.js) et renvoie son « empreinte » : 128 nombres (réseau de
// reconnaissance de face-api, d'après dlib, MIT). Deux photos de la même personne donnent des empreintes proches.
// Tout se fait ici, sur l'appareil ; aucune image n'est gardée. Travailleur à part : le regard (vision-worker.js) n'attend jamais.
'use strict';

const ROOT = new URL('../', self.location.href).href;
const DIR = ROOT + 'vendor/face-api/';
let tf = null, net = null, backend = '';

async function init() {
  importScripts(DIR + 'face-api.js');
  tf = self.faceapi.tf;
  // face-api attend une page web : on lui donne un environnement de travailleur (OffscreenCanvas, fetch).
  class Rien {}
  self.faceapi.env.setEnv({ Canvas: OffscreenCanvas, CanvasRenderingContext2D: self.OffscreenCanvasRenderingContext2D || Rien, Image: Rien, ImageData, Video: Rien,
    createCanvasElement: () => new OffscreenCanvas(1, 1), createImageElement: () => new Rien(), createVideoElement: () => new Rien(), fetch: (...a) => fetch(...a), readFile: () => Promise.reject(new Error('pas de fichier')) });
  const errors = [];
  // Carte graphique si possible (≈ 0,1 s par visage sur la tablette), sinon processeur (≈ 1 s : rare, ça suffit).
  for (const b of ['webgl', 'cpu']) {
    try { if (await tf.setBackend(b)) { await tf.ready(); backend = b; break; } } catch (e) { errors.push(`${b} : ${e && e.message || e}`); }
  }
  // Poids chargés directement (le chargeur de face-api attend une page web, pas un travailleur).
  const manifest = await (await fetch(DIR + 'face_recognition_model-weights_manifest.json')).json();
  const buf = await (await fetch(DIR + 'face_recognition_model.bin')).arrayBuffer();
  net = new self.faceapi.FaceRecognitionNet();
  net.loadFromWeightMap(tf.io.decodeWeights(buf, manifest[0].weights));
  // Premier passage (compilation) pour que le premier vrai visage ne soit pas lent.
  const t0 = performance.now();
  const z = tf.zeros([150, 150, 3], 'int32'); (await net.computeFaceDescriptor(z)); z.dispose();
  postMessage({ type: 'ready', backend, warm: Math.round(performance.now() - t0), errors });
}

const pix = new OffscreenCanvas(150, 150), pg = pix.getContext('2d', { willReadFrequently: true });
async function empreinte(bmp) {
  pg.drawImage(bmp, 0, 0, 150, 150); bmp.close();
  const px = pg.getImageData(0, 0, 150, 150).data, rgb = new Int32Array(150 * 150 * 3);
  let lum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; lum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; }
  const t = tf.tensor3d(rgb, [150, 150, 3], 'int32');
  try { return { desc: Array.from(await net.computeFaceDescriptor(t)), lum: lum / (150 * 150 * 255) }; } finally { t.dispose(); }
}

const ready = init().catch((e) => postMessage({ type: 'ready', error: String(e && e.message || e) }));
let file = Promise.resolve();
onmessage = (e) => {
  const d = e.data;
  if (d.type !== 'visage') return;
  file = file.then(async () => {
    await ready;
    const t0 = performance.now();
    if (!net) { try { d.bmp.close(); } catch (_) {} return postMessage({ type: 'empreinte', n: d.n, error: 'modèle absent' }); }
    try { const r = await empreinte(d.bmp); postMessage({ type: 'empreinte', n: d.n, ...r, ms: Math.round(performance.now() - t0), backend }); }
    catch (err) { postMessage({ type: 'empreinte', n: d.n, error: String(err && err.message || err) }); }
  });
};
