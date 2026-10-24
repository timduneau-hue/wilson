// Wilson — vision : caméra frontale, visages jusqu'à ~4 m, REGARD, images pour Gemini.
//
// Toute l'analyse se fait dans un Web Worker (js/vision-worker.js), sur un autre cœur du processeur :
// le fil principal ne fait que prendre l'image de la caméra et la lui passer → l'animation du visage reste fluide.
// Regard en deux étapes (testé sur photos) :
//  1. détecteur « longue portée » (MediaPipe Face Detection, modèle full) : trouve les visages, même loin ;
//  2. pour chaque visage, gros plan → repères fins (MediaPipe Face Landmarker) → orientation de la tête + yeux.

// Seuils (degrés / scores 0..1), après calibrage. Assez larges : on regarde rarement la tablette pile en face.
const LOOK = { yaw: 25, pitchUp: 28, pitchDown: -35, down: 0.6, blink: 0.8 };

export class Vision {
  constructor() {
    this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true;
    this.snap = document.createElement('canvas'); this.snapG = this.snap.getContext('2d');
    this.mode = 'mouvement'; this.delegate = ''; this.gazeReady = false; this.modelsDone = false; this.errors = [];
    this.target = null; this.hasPerson = false; this.lastSeen = 0; this.motion = 0; this.light = 0.5; this.size = 0;
    this.fps = 3; this.mirror = true; this._timer = null; this.onPresence = null; this._busy = false; this._sentAt = 0;
    // Regard
    this.looking = false; this.lookAt = 0; this.faceAt = 0; this.gaze = null; this.faces = 0;
    this._facingN = 0; this._awayN = 0; this.onLook = null; this.forceLook = false; this.calib = { yaw: 0, pitch: 0, down: 0 };
    this.stats = { ms: 0, last: 0, trip: 0, n: 0 };
    this._lastResult = 0; this.restarts = 0; this.fixes = [];
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 20 } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play();
    this._startWorker();
    // Écran éteint / appli en arrière-plan : l'analyse est en pause, ce n'est pas une panne.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._lastResult = performance.now(); });
    this._loop();
  }

  // Analyse en arrière-plan. Si la carte graphique a déjà lâché sur cet appareil, processeur seulement (« ?cpu=1 »).
  _startWorker() {
    try {
      if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('navigateur trop ancien');
      let cpu = false; try { cpu = localStorage.getItem('wilson.vision.cpu') === '1'; } catch (_) {}
      const url = new URL('./vision-worker.js', import.meta.url); if (cpu) url.search = '?cpu=1';
      this.worker = new Worker(url);
      this.worker.onmessage = (e) => this._onMessage(e.data);
      this.worker.onerror = (e) => { this.errors.push('worker : ' + (e.message || 'erreur')); this._stopWorker(); };
      this._busy = false; this._lastResult = performance.now();
    } catch (e) { this.errors.push(e.message); this._stopWorker(); }
  }
  // L'analyse ne répond plus (8 s) : on la relance (Wilson ne doit jamais rester figé).
  _restartWorker(why) {
    this.restarts++;
    this.onInfo && this.onInfo(`Vision : ${why} → analyse relancée`);
    try { this.worker && this.worker.terminate(); } catch (_) {}
    this.worker = null; this.gazeReady = false; this.modelsDone = false; this.looking = false;
    this._startWorker();
  }

  stop() { clearTimeout(this._timer); this._stopWorker(); if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); }
  _stopWorker() {
    if (this.worker) { try { this.worker.terminate(); } catch (_) {} }
    this.worker = null; this.gazeReady = false; this.modelsDone = true; this.mode = 'mouvement'; this._busy = false;
  }

  setRate(fps) { this.fps = fps; }

  _loop() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._loop(), Math.max(1000 / this.fps, (this.stats.last || 0) * 1.5));   // ≤ 2/3 d'un cœur
    if (this.video.readyState < 2 || !this.worker) return;
    const now = performance.now();
    if (this.modelsDone && !document.hidden && now - this._lastResult > 8000 && this.restarts < 20) return this._restartWorker('plus de réponse de l\'analyse depuis 8 s');
    if (this._busy && now - this._sentAt < 4000) return;          // une image à la fois : jamais de file d'attente
    this._busy = true; this._sentAt = now;
    const maxFaces = this.fps >= 8 && this.stats.n % 2 === 0 ? 2 : 1;   // 2e visage une fois sur deux
    createImageBitmap(this.video)
      .then((bmp) => { if (this.worker) this.worker.postMessage({ type: 'frame', bmp, maxFaces }, [bmp]); else bmp.close(); })
      .catch(() => { this._busy = false; });
  }

  _onMessage(d) {
    if (d.type === 'ready') {
      this.mode = d.mode; this.delegate = d.delegate; this.gazeReady = !!d.gazeReady; this.modelsDone = true;
      this.errors.push(...(d.errors || []));
      if (d.errors && d.errors.length) console.warn('Vision :', d.errors.join(' · '));
      return;
    }
    if (d.type === 'health') {
      // La carte graphique a lâché (ou les repères échouaient) : retour au processeur, retenu pour cet appareil.
      this.delegate = d.delegate || this.delegate;
      if (d.from === 'GPU') { try { localStorage.setItem('wilson.vision.cpu', '1'); } catch (_) {} }
      const m = d.error ? `Vision : réparation impossible (${d.error})` : `Vision : ${d.kind === 'fd' ? 'détection des visages' : 'repères du regard'} en échec sur ${d.from === 'GPU' ? 'la carte graphique' : 'le processeur'} (${d.reason}) → repris sur le processeur`;
      this.fixes.push(m); this.onInfo && this.onInfo(m);
      return;
    }
    if (d.type === 'tuned') {
      if (d.kind === 'lm') this.delegate = d.delegate;
      this.tuned = this.tuned || {}; this.tuned[d.kind] = d;
      this.onInfo && this.onInfo(`Vision réglée — ${d.kind === 'fd' ? 'visages' : 'regard'} : ${d.keep === 'GPU' ? 'carte graphique' : 'processeur'} (processeur ${d.cpu} ms${d.gpu != null ? ', carte graphique ' + d.gpu + ' ms' : ''})`);
      return;
    }
    if (d.type !== 'result') return;
    const now = performance.now(); this._lastResult = now;
    this._busy = false;
    this.stats.trip = now - this._sentAt; this.stats.last = d.ms; this.stats.ms = this.stats.ms ? this.stats.ms * 0.6 + d.ms * 0.4 : d.ms; this.stats.n++;
    this.stats.fd = d.fdMs || 0; this.stats.lm = d.lmMs || 0;
    this.light = this.light * 0.9 + d.light * 0.1;
    this.motion = this.motion * 0.7 + Math.min(1, d.mn / 300) * 0.3;

    let found = null, facing = false;
    if (d.boxes) {
      this.faces = d.boxes.length;
      if (d.boxes.length) {
        const b = d.boxes[0]; this.faceAt = now;
        found = [b.cx, b.cy - b.h * 0.1, b.w];
        d.faces.forEach((f, k) => {
          const g = f ? gazeFrom(f.m, f.bs, f.size, this.calib) : null;
          if (k === 0) this.gaze = g;
          if (g && g.facing) facing = true;
        });
      } else this.gaze = null;
    } else if (d.mn > 25) found = [d.mx, d.my, 0.2];
    if (this.forceLook) { facing = true; this.faceAt = now; }

    // Lissage : 2 analyses « regarde » pour s'allumer, 3 « ne regarde pas » pour s'éteindre.
    if (facing) { this._facingN++; this._awayN = 0; this.lookAt = now; } else { this._awayN++; this._facingN = 0; }
    const was = this.looking;
    if (!this.looking && this._facingN >= 2) this.looking = true;
    if (this.looking && this._awayN >= 3) this.looking = false;
    if (was !== this.looking && this.onLook) this.onLook(this.looking);

    if (found) {
      const sx = (found[0] - 0.5) * 2 * (this.mirror ? -1 : 1), sy = (found[1] - 0.45) * 2;
      const tx = Math.max(-1, Math.min(1, sx * 1.2)), ty = Math.max(-1, Math.min(1, sy * 0.8)), o = this.target;
      // Lissage + zone morte : les yeux suivent la personne sans trembler au rythme du détecteur.
      if (!o || Math.abs(tx - o[0]) > 0.25 || Math.abs(ty - o[1]) > 0.25) this.target = [tx, ty];
      else if (Math.abs(tx - o[0]) > 0.015 || Math.abs(ty - o[1]) > 0.015) this.target = [o[0] + (tx - o[0]) * 0.5, o[1] + (ty - o[1]) * 0.5];
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

// Orientation (matrice 4×4 en colonnes) + mouvements des yeux → regarde-t-il la tablette ?
// yaw > 0 : tête tournée vers la droite de l'image ; les yeux peuvent compenser (« lookIn/Out » des blendshapes).
export function gazeFrom(m, bs, size = 0.1, calib = { yaw: 0, pitch: 0, down: 0 }) {
  const deg = 180 / Math.PI;
  const yaw = Math.atan2(-m[2], Math.hypot(m[6], m[10])) * deg - (calib.yaw || 0);
  const pitch = Math.atan2(m[6], m[10]) * deg - (calib.pitch || 0);
  const lookL = ((bs.eyeLookOutLeft || 0) + (bs.eyeLookInRight || 0)) / 2;     // yeux vers la gauche de la personne
  const lookR = ((bs.eyeLookInLeft || 0) + (bs.eyeLookOutRight || 0)) / 2;     // yeux vers la droite de la personne
  const down = ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2 - (calib.down || 0);
  const blink = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
  const gazeYaw = yaw + (lookL - lookR) * 30;
  const facing = Math.abs(gazeYaw) <= LOOK.yaw && pitch <= LOOK.pitchUp && pitch >= LOOK.pitchDown && down <= LOOK.down && blink <= LOOK.blink;
  return { yaw, pitch, gazeYaw, down, blink, size, facing };
}
