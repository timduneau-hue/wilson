// Wilson — analyse de la caméra EN ARRIÈRE-PLAN (Web Worker, sur un autre cœur du processeur).
// Le fil principal ne fait plus que dessiner le visage : il ne se fige plus pendant l'analyse.
//
// 1. lumière et mouvement (miniature 64 × 48) ;
// 2. visages jusqu'à ~4 m : MediaPipe Face Detection, modèle longue portée ;
// 3. pour les 2 visages les plus proches, gros plan → MediaPipe Face Landmarker (orientation de la tête + yeux).
// Le calcul « regarde-t-il la tablette ? » est fait par vision.js (gazeFrom), à partir des valeurs renvoyées ici.
'use strict';

const ROOT = new URL('../', self.location.href).href;
const FD_DIR = ROOT + 'vendor/face_detection/';
const BS = ['eyeLookOutLeft', 'eyeLookInRight', 'eyeLookInLeft', 'eyeLookOutRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeBlinkLeft', 'eyeBlinkRight'];

let fd = null, fdRes = null, landmarker = null, prev = null, V = null, fileset = null;
const info = { mode: 'mouvement', delegate: '', errors: [] };
const LM_OPTS = { runningMode: 'IMAGE', numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true,
  minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 };
const makeLandmarker = (delegate) => V.FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: ROOT + 'vendor/models/face_landmarker.task', delegate }, canvas: new OffscreenCanvas(1, 1), ...LM_OPTS });
const small = new OffscreenCanvas(64, 48), sg = small.getContext('2d', { willReadFrequently: true });
const crop = new OffscreenCanvas(256, 256), cg = crop.getContext('2d');
const DET_W = 640, det = new OffscreenCanvas(DET_W, 360), dg = det.getContext('2d');

async function init() {
  // 1. Repères fins du visage (MediaPipe Tasks), chargés en premier. Processeur d'abord (fonctionne partout) ;
  //    la carte graphique est essayée ensuite et gardée seulement si elle est plus rapide sur cette tablette.
  try {
    importScripts(ROOT + 'vendor/mediapipe/vision_bundle.js');
    V = self.Vision;
    fileset = await V.FilesetResolver.forVisionTasks(ROOT + 'vendor/mediapipe/wasm');
    for (const delegate of ['CPU', 'GPU']) {
      try { landmarker = await makeLandmarker(delegate); info.delegate = delegate; tune.lm.cur = delegate; tune.lm.done = delegate === 'GPU'; break; }
      catch (e) { info.errors.push(`repères (${delegate}) : ` + (e && e.message || e)); }
    }
  } catch (e) { info.errors.push('MediaPipe : ' + (e && e.message || e)); }
  // 2. Détecteur longue portée. Cette ancienne bibliothèque attend une page web : on lui en donne l'illusion
  //    (window, document, balise <script> → importScripts, <canvas> → OffscreenCanvas).
  try {
    pageShim();
    importScripts(FD_DIR + 'face_detection.js');
    const f = new self.FaceDetection({ locateFile: (file) => FD_DIR + file });
    f.setOptions({ model: 'full', minDetectionConfidence: 0.5, useCpuInference: true });
    f.onResults((r) => { if (r.image && r.image.close) r.image.close(); fdRes = r; });
    await f.initialize();
    fd = f; info.mode = 'visages';
  } catch (e) { info.errors.push('détecteur : ' + (e && e.message || e)); }
  postMessage({ type: 'ready', mode: info.mode, delegate: info.delegate, gazeReady: !!(fd && landmarker), errors: info.errors });
}

// ---------- Réglage automatique : processeur ou carte graphique ? On mesure, on garde le plus rapide. ----------
const tune = { fd: { cur: 'CPU', CPU: [], GPU: [], done: false }, lm: { cur: 'CPU', CPU: [], GPU: [], done: false, alt: null } };
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1] || 0; };
const WARM = 2, N = 6;   // 2 mesures ignorées (démarrage), puis 6 mesures

function tuneStep(kind, ms) {
  const t = tune[kind]; if (t.done || ms == null) return;
  const arr = t[t.cur]; arr.push(ms);
  const cpu = t.CPU.slice(WARM);
  if (t.cur === 'CPU' && cpu.length >= N) {           // processeur mesuré → essai de la carte graphique
    if (kind === 'fd') { try { fd.setOptions({ useCpuInference: false }); t.cur = 'GPU'; } catch (_) { finish(kind, 'CPU'); } }
    else if (!t.trying) {
      t.trying = true;
      makeLandmarker('GPU').then((g) => { t.alt = landmarker; landmarker = g; t.cur = 'GPU'; })
        .catch(() => finish(kind, 'CPU'));
    }
    return;
  }
  if (t.cur === 'GPU') {
    const gpu = t.GPU.slice(WARM), ref = median(cpu);
    if (gpu.length && gpu[gpu.length - 1] > ref * 4 + 20) return finish(kind, 'CPU');   // nettement plus lent : on arrête l'essai
    if (gpu.length >= N) finish(kind, median(gpu) < ref ? 'GPU' : 'CPU');
  }
}
function finish(kind, keep) {
  const t = tune[kind]; if (t.done) return; t.done = true;
  if (kind === 'fd') { if (keep !== t.cur) try { fd.setOptions({ useCpuInference: keep === 'CPU' }); } catch (_) {} }
  else if (t.alt) {
    const lose = keep === 'GPU' ? t.alt : landmarker;
    if (keep === 'CPU') landmarker = t.alt;
    try { lose.close(); } catch (_) {}
    t.alt = null; info.delegate = keep;
  }
  t.cur = keep;
  postMessage({ type: 'tuned', kind, keep, cpu: Math.round(median(t.CPU.slice(WARM))), gpu: t.GPU.length > WARM ? Math.round(median(t.GPU.slice(WARM))) : null, delegate: info.delegate });
}

function pageShim() {
  if (self.window) return;
  const noop = () => {};
  const node = (tag) => {
    if (tag === 'canvas') return new OffscreenCanvas(1, 1);
    const ls = {};
    return { tagName: tag.toUpperCase(), style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; if (k === 'src') this.src = v; },
      addEventListener(t, fn) { (ls[t] = ls[t] || []).push(fn); }, removeEventListener: noop, _fire(t) { (ls[t] || []).forEach((fn) => fn({ type: t })); } };
  };
  const append = (el) => {
    if (el && el.tagName === 'SCRIPT') setTimeout(() => { try { importScripts(el.src || el.attrs.src); el._fire('load'); } catch (e) { el._fire('error'); } }, 0);
    return el;
  };
  self.window = self;
  self.document = { createElement: node, body: { appendChild: append }, head: { appendChild: append }, documentElement: { style: {} },
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, getElementById: () => null, createEvent: () => ({ initEvent: noop }), title: '' };
}

async function analyse(bmp, maxFaces) {
  const t0 = performance.now(), W = bmp.width, H = bmp.height;
  // Lumière de la pièce + mouvement.
  sg.drawImage(bmp, 0, 0, 64, 48);
  const px = sg.getImageData(0, 0, 64, 48).data, gray = new Float32Array(64 * 48);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) { gray[j] = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255; sum += gray[j]; }
  let mx = 0, my = 0, mn = 0;
  if (prev) for (let j = 0; j < gray.length; j++) if (Math.abs(gray[j] - prev[j]) > 0.09) { mn++; mx += j % 64; my += (j / 64) | 0; }
  prev = gray;
  const out = { type: 'result', light: sum / gray.length, mn, mx: mn ? mx / mn / 64 : 0, my: mn ? my / mn / 48 : 0, boxes: null, faces: [] };

  if (fd) {
    // Le détecteur travaille en 192 × 192 : une image réduite suffit (envoi plus léger au moteur).
    const tf = performance.now();
    if (det.width !== DET_W || det.height !== Math.round(DET_W * H / W)) { det.width = DET_W; det.height = Math.round(DET_W * H / W); }
    dg.drawImage(bmp, 0, 0, det.width, det.height);
    const dimg = det.transferToImageBitmap();
    fdRes = null;
    await fd.send({ image: dimg });
    dimg.close(); out.fdMs = performance.now() - tf; tuneStep('fd', out.fdMs);
    out.boxes = ((fdRes && fdRes.detections) || []).map((d) => ({ cx: d.boundingBox.xCenter, cy: d.boundingBox.yCenter, w: d.boundingBox.width, h: d.boundingBox.height }))
      .sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 4);
    const tl = performance.now();
    if (landmarker) {
      for (let k = 0; k < Math.min(maxFaces, out.boxes.length); k++) {
        const b = out.boxes[k], s = Math.max(b.w * W, b.h * H) * 2.0;
        cg.fillStyle = '#000'; cg.fillRect(0, 0, 256, 256);
        cg.drawImage(bmp, b.cx * W - s / 2, b.cy * H - s / 2, s, s, 0, 0, 256, 256);
        const img = crop.transferToImageBitmap();
        let r = null; try { r = landmarker.detect(img); } catch (_) {}
        img.close();
        if (!r || !r.facialTransformationMatrixes || !r.facialTransformationMatrixes.length) { out.faces.push(null); continue; }
        const bs = {};
        if (r.faceBlendshapes && r.faceBlendshapes[0]) for (const c of r.faceBlendshapes[0].categories) if (BS.includes(c.categoryName)) bs[c.categoryName] = c.score;
        out.faces.push({ m: Array.from(r.facialTransformationMatrixes[0].data), bs, size: b.w });
      }
    }
    out.lmMs = performance.now() - tl;
    const nf = out.faces.length; if (nf) tuneStep('lm', out.lmMs / nf);
  }
  bmp.close();
  out.ms = performance.now() - t0;
  return out;
}

const ready = init();
let busy = Promise.resolve();
onmessage = (e) => {
  const d = e.data;
  if (d.type !== 'frame') return;
  // Une image à la fois, dans l'ordre ; pendant le chargement des modèles, seulement lumière et mouvement.
  busy = busy.then(async () => {
    try { postMessage(await analyse(d.bmp, d.maxFaces || 2)); }
    catch (err) { try { d.bmp.close(); } catch (_) {} postMessage({ type: 'result', error: String(err && err.message || err), boxes: null, faces: [], ms: 0, light: 0.5, mn: 0 }); }
  });
};
ready.catch(() => {});
