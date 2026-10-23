// Wilson — vision : caméra frontale, détection des visages jusqu'à ~4 m et du REGARD, images pour Gemini.
//
// Regard en deux étapes (testé sur photos) :
//  1. détecteur « longue portée » (MediaPipe Face Detection, modèle full) : trouve les visages, même loin ;
//  2. pour chaque visage, gros plan → repères fins (MediaPipe Face Landmarker : 478 points + mouvements des yeux)
//     → orientation de la tête + direction des yeux = « la personne regarde la tablette ».

const LANDMARKER = '../vendor/models/face_landmarker.task';
const SHORT_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const LOOK = { yaw: 22, pitchUp: 25, pitchDown: -30, down: 0.55, blink: 0.75 };   // seuils (degrés / scores 0..1)

export class Vision {
  constructor() {
    this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true;
    this.small = document.createElement('canvas'); this.small.width = 64; this.small.height = 48;
    this.sg = this.small.getContext('2d', { willReadFrequently: true });
    this.snap = document.createElement('canvas'); this.snapG = this.snap.getContext('2d');
    this.crop = document.createElement('canvas'); this.crop.width = this.crop.height = 256; this.cg = this.crop.getContext('2d');
    this.detector = null; this.landmarker = null; this.mode = 'aucun';
    this.target = null; this.hasPerson = false; this.lastSeen = 0; this.motion = 0; this.light = 0.5;
    this.prev = null; this.fps = 3; this.mirror = true; this._timer = null; this.onPresence = null; this._busy = false;
    // Regard
    this.looking = false; this.lookAt = 0; this.faceAt = 0; this.gaze = null; this.faces = 0;
    this._facingN = 0; this._awayN = 0; this.onLook = null; this.forceLook = false; this.calib = { yaw: 0, pitch: 0 };
    this.stats = { ms: 0, n: 0 };
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 20 } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play();
    this._loop();
    this._loadModels();   // en arrière-plan ; le suivi du mouvement fonctionne en attendant
  }

  async _loadModels() {
    const base = new URL('../vendor/mediapipe/', import.meta.url).href;
    let tasks = null;
    try {
      tasks = await import(base + 'vision_bundle.mjs');
      this.fileset = await tasks.FilesetResolver.forVisionTasks(base + 'wasm');
    } catch (e) { console.warn('MediaPipe indisponible', e); }
    // 1. Détecteur longue portée
    try {
      await loadScript(new URL('../vendor/face_detection/face_detection.js', import.meta.url).href);
      const dir = new URL('../vendor/face_detection/', import.meta.url).href;
      const fd = new window.FaceDetection({ locateFile: (f) => dir + f });
      fd.setOptions({ model: 'full', minDetectionConfidence: 0.5 });
      fd.onResults((r) => { this._fdResult = r; });
      await fd.initialize();
      this.fd = fd; this.mode = 'visages';
    } catch (e) {
      console.warn('Détecteur longue portée indisponible', e);
      if (tasks && this.fileset) {
        for (const delegate of ['GPU', 'CPU']) {
          try { this.detector = await tasks.FaceDetector.createFromOptions(this.fileset, { baseOptions: { modelAssetPath: SHORT_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 }); this.mode = 'visages'; break; } catch (_) {}
        }
      }
      if (this.mode !== 'visages') this.mode = 'mouvement';
    }
    // 2. Repères fins pour le regard
    if (tasks && this.fileset) {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          this.landmarker = await tasks.FaceLandmarker.createFromOptions(this.fileset, {
            baseOptions: { modelAssetPath: new URL(LANDMARKER, import.meta.url).href, delegate }, runningMode: 'IMAGE', numFaces: 1,
            outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 });
          this.delegate = delegate; break;
        } catch (e) { if (delegate === 'CPU') console.warn('Repères du visage indisponibles', e); }
      }
    }
    this.gazeReady = !!(this.landmarker && this.mode === 'visages');
    this.modelsDone = true;
  }

  setRate(fps) { this.fps = fps; }

  _loop() {
    clearTimeout(this._timer);
    // Jamais plus de ~40 % du temps de la tablette pour la vision : le visage et la voix restent fluides.
    this._timer = setTimeout(() => this._loop(), Math.max(1000 / this.fps, this.stats.ms * 1.5));
    if (this.video.readyState < 2 || this._busy) return;
    this._busy = true;
    this._analyse().catch((e) => console.warn('vision', e)).finally(() => { this._busy = false; });
  }

  async _analyse() {
    const now = performance.now(), t0 = now;
    // Luminosité de la pièce + mouvement, sur une miniature 64 × 48.
    this.sg.drawImage(this.video, 0, 0, 64, 48);
    const px = this.sg.getImageData(0, 0, 64, 48).data;
    const gray = new Float32Array(64 * 48); let sum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) { gray[j] = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255; sum += gray[j]; }
    this.light = this.light * 0.9 + (sum / gray.length) * 0.1;
    let mx = 0, my = 0, mn = 0;
    if (this.prev) for (let j = 0; j < gray.length; j++) if (Math.abs(gray[j] - this.prev[j]) > 0.09) { mn++; mx += j % 64; my += (j / 64) | 0; }
    this.prev = gray;
    this.motion = this.motion * 0.7 + Math.min(1, mn / 300) * 0.3;

    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    let boxes = null;                                  // visages en coordonnées normalisées {cx, cy, w, h}
    if (this.fd) {
      this._fdResult = null;
      await this.fd.send({ image: this.video });
      boxes = ((this._fdResult && this._fdResult.detections) || []).map((d) => ({ cx: d.boundingBox.xCenter, cy: d.boundingBox.yCenter, w: d.boundingBox.width, h: d.boundingBox.height }));
    } else if (this.detector) {
      const r = this.detector.detectForVideo(this.video, now);
      boxes = (r.detections || []).filter((d) => d.boundingBox).map((d) => { const b = d.boundingBox; return { cx: (b.originX + b.width / 2) / vw, cy: (b.originY + b.height / 2) / vh, w: b.width / vw, h: b.height / vh }; });
    }

    let found = null, facing = false;
    if (boxes) {
      boxes.sort((a, b) => b.w * b.h - a.w * a.h);
      this.faces = boxes.length;
      if (boxes.length) {
        const b = boxes[0]; this.faceAt = now;
        found = [b.cx, b.cy - b.h * 0.1, b.w];
        // Regard des 2 visages les plus proches.
        if (this.landmarker) {
          for (let k = 0; k < Math.min(2, boxes.length); k++) {
            const g = this._gazeOf(boxes[k], vw, vh);
            if (k === 0) this.gaze = g;
            if (g && g.facing) facing = true;
          }
        }
      } else this.gaze = null;
    } else if (mn > 25) {
      found = [mx / mn / 64, my / mn / 48, 0.2];
    }
    if (this.forceLook) { facing = true; this.faceAt = now; }

    // Lissage : 2 analyses « regarde » pour s'allumer, 3 « ne regarde pas » pour s'éteindre.
    if (facing) { this._facingN++; this._awayN = 0; this.lookAt = now; } else { this._awayN++; this._facingN = 0; }
    const was = this.looking;
    if (!this.looking && this._facingN >= 2) this.looking = true;
    if (this.looking && this._awayN >= 3) this.looking = false;
    if (was !== this.looking && this.onLook) this.onLook(this.looking);

    if (found) {
      const sx = (found[0] - 0.5) * 2 * (this.mirror ? -1 : 1), sy = (found[1] - 0.45) * 2;
      this.target = [Math.max(-1, Math.min(1, sx * 1.2)), Math.max(-1, Math.min(1, sy * 0.8))];
      this.size = found[2];
      if (!this.hasPerson) { this.hasPerson = true; this.onPresence && this.onPresence(true); }
      this.lastSeen = now;
    } else if (this.hasPerson && now - this.lastSeen > 4000) {
      this.hasPerson = false; this.target = null; this.onPresence && this.onPresence(false);
    }
    const ms = performance.now() - t0; this.stats.ms = this.stats.ms * 0.9 + ms * 0.1; this.stats.n++;
  }

  // Gros plan sur un visage → orientation de la tête + direction des yeux.
  _gazeOf(b, vw, vh) {
    const s = Math.max(b.w * vw, b.h * vh) * 2.0;
    const x0 = b.cx * vw - s / 2, y0 = b.cy * vh - s / 2;
    this.cg.fillStyle = '#000'; this.cg.fillRect(0, 0, 256, 256);
    this.cg.drawImage(this.video, x0, y0, s, s, 0, 0, 256, 256);
    let r; try { r = this.landmarker.detect(this.crop); } catch (_) { return null; }
    if (!r.facialTransformationMatrixes || !r.facialTransformationMatrixes.length) return null;
    const bs = {};
    if (r.faceBlendshapes && r.faceBlendshapes[0]) for (const c of r.faceBlendshapes[0].categories) bs[c.categoryName] = c.score;
    return gazeFrom(r.facialTransformationMatrixes[0].data, bs, b.w, this.calib);
  }

  // Image JPEG (base64) de ce que voit Wilson, pour Gemini.
  snapshot(q = 0.72, max = 640) {
    if (this.video.readyState < 2) return null;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480, k = Math.min(1, max / Math.max(vw, vh));
    const w = Math.round(vw * k), h = Math.round(vh * k);
    if (this.snap.width !== w || this.snap.height !== h) { this.snap.width = w; this.snap.height = h; }
    this.snapG.drawImage(this.video, 0, 0, w, h);
    return this.snap.toDataURL('image/jpeg', q).split(',')[1];
  }
}

// Orientation (matrice 4×4 en colonnes) + mouvements des yeux → regarde-t-il la tablette ?
// yaw > 0 : tête tournée vers la droite de l'image ; les yeux peuvent compenser (« lookIn/Out » des blendshapes).
export function gazeFrom(m, bs, size = 0.1, calib = { yaw: 0, pitch: 0 }) {
  const deg = 180 / Math.PI;
  const yaw = Math.atan2(-m[2], Math.hypot(m[6], m[10])) * deg - calib.yaw;
  const pitch = Math.atan2(m[6], m[10]) * deg - calib.pitch;
  const lookL = ((bs.eyeLookOutLeft || 0) + (bs.eyeLookInRight || 0)) / 2;     // yeux vers la gauche de la personne
  const lookR = ((bs.eyeLookInLeft || 0) + (bs.eyeLookOutRight || 0)) / 2;     // yeux vers la droite de la personne
  const down = ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2;
  const blink = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
  const gazeYaw = yaw + (lookL - lookR) * 30;
  const facing = Math.abs(gazeYaw) <= LOOK.yaw && pitch <= LOOK.pitchUp && pitch >= LOOK.pitchDown && down <= LOOK.down && blink <= LOOK.blink;
  return { yaw, pitch, gazeYaw, down, blink, size, facing };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.FaceDetection) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(s);
  });
}
