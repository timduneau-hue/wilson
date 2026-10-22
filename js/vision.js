// Wilson — vision : caméra frontale, suivi des visages (MediaPipe) ou du mouvement, images pour Gemini.

const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export class Vision {
  constructor() {
    this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true;
    this.small = document.createElement('canvas'); this.small.width = 64; this.small.height = 48;
    this.sg = this.small.getContext('2d', { willReadFrequently: true });
    this.snap = document.createElement('canvas'); this.snapG = this.snap.getContext('2d');
    this.detector = null; this.mode = 'aucun';
    this.target = null; this.hasPerson = false; this.lastSeen = 0; this.motion = 0; this.light = 0.5;
    this.prev = null; this.fps = 3; this.mirror = true; this._timer = null; this.onPresence = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play();
    this.snap.width = 640; this.snap.height = Math.round(640 * (this.video.videoHeight || 480) / (this.video.videoWidth || 640));
    this._loop();
    this._loadDetector();   // en arrière-plan ; le suivi du mouvement fonctionne en attendant
  }

  async _loadDetector() {
    try {
      const base = new URL('../vendor/mediapipe/', import.meta.url).href;
      const { FaceDetector, FilesetResolver } = await import(base + 'vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
      this.detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.55 });
      this.mode = 'visages';
    } catch (e) {
      console.warn('Détection des visages indisponible, suivi du mouvement à la place', e);
      this.mode = 'mouvement';
    }
  }

  setRate(fps) { this.fps = fps; }

  _loop() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._loop(), 1000 / this.fps);
    if (this.video.readyState < 2) return;
    const now = performance.now();
    // Luminosité de la pièce + mouvement, sur une miniature 64 × 48.
    this.sg.drawImage(this.video, 0, 0, 64, 48);
    const px = this.sg.getImageData(0, 0, 64, 48).data;
    const gray = new Float32Array(64 * 48); let sum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) { gray[j] = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255; sum += gray[j]; }
    this.light = this.light * 0.9 + (sum / gray.length) * 0.1;
    let mx = 0, my = 0, mn = 0;
    if (this.prev) {
      for (let j = 0; j < gray.length; j++) if (Math.abs(gray[j] - this.prev[j]) > 0.09) { mn++; mx += j % 64; my += (j / 64) | 0; }
    }
    this.prev = gray;
    this.motion = this.motion * 0.7 + Math.min(1, mn / 300) * 0.3;

    let found = null;
    if (this.detector) {
      try {
        const r = this.detector.detectForVideo(this.video, now);
        const dets = (r.detections || []).filter((d) => d.boundingBox);
        if (dets.length) {
          // On regarde la personne la plus proche (le plus grand visage).
          const d = dets.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0].boundingBox;
          const vw = this.video.videoWidth, vh = this.video.videoHeight;
          found = [(d.originX + d.width / 2) / vw, (d.originY + d.height * 0.4) / vh, d.width / vw];
          this.faces = dets.length;
        } else this.faces = 0;
      } catch (_) { /* image pas prête */ }
    } else if (mn > 25) {
      found = [mx / mn / 64, my / mn / 48, 0.2];
    }
    if (found) {
      const sx = (found[0] - 0.5) * 2 * (this.mirror ? -1 : 1);
      const sy = (found[1] - 0.45) * 2;
      this.target = [Math.max(-1, Math.min(1, sx * 1.2)), Math.max(-1, Math.min(1, sy * 0.8))];
      this.size = found[2];
      if (!this.hasPerson) { this.hasPerson = true; this.onPresence && this.onPresence(true); }
      this.lastSeen = now;
    } else if (this.hasPerson && now - this.lastSeen > 4000) {
      this.hasPerson = false; this.target = null; this.onPresence && this.onPresence(false);
    }
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
