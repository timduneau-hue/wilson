// Wilson — son : micro 16 kHz, tampon circulaire, détection de voix, lecture de la voix de Wilson (24 kHz).

const TARGET = 16000;

export class AudioIO {
  constructor() {
    this.ctx = null; this.stream = null;
    this.ring = new Int16Array(TARGET * 6); this.ringPos = 0; this.ringFilled = 0;   // 6 s de tampon
    this.level = 0; this.db = -100; this.floor = -60; this.speaking = false; this.lastVoicedAt = 0;
    this._onCnt = 0; this._offCnt = 0;
    this.listeners = { frame: [], speechstart: [], speechend: [], drained: [] };
    this.sources = []; this.nextTime = 0; this.outLevel = 0; this.outRound = 0;
    this.gainDb = 0; this.aec = false; this.playedSec = 0;
  }
  on(ev, fn) { this.listeners[ev].push(fn); }
  off(ev, fn) { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }
  _emit(ev, ...a) { for (const fn of this.listeners[ev]) fn(...a); }

  // aec : annulation d'écho du micro. Sur Android, elle fait passer TOUT le son de la page en « mode appel »
  // (volume d'appel, écouteur du téléphone) : la voix du mode direct devenait inaudible (23/10/26). Elle n'est donc
  // utilisée qu'avec la coupure « directe » ; en « prudente », Wilson n'écoute pas pendant qu'il parle, l'écho ne gêne pas.
  async start({ aec = false } = {}) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.aec = !!aec;
    this.stream = await this._openMic(this.aec);
    await this.ctx.audioWorklet.addModule(new URL('./worklets/capture.js', import.meta.url));
    const node = this.node = new AudioWorkletNode(this.ctx, 'wilson-capture');
    node.port.onmessage = (e) => this._onCapture(e.data);
    this.src = this.ctx.createMediaStreamSource(this.stream); this.src.connect(node);
    // Le nœud de capture doit être relié à la sortie pour être cadencé (gain nul : rien n'est audible).
    const mute = this.ctx.createGain(); mute.gain.value = 0; node.connect(mute); mute.connect(this.ctx.destination);
    // Chaîne de sortie : voix de Wilson → analyseur (lèvres) → haut-parleur.
    this.out = this.ctx.createGain(); this.out.gain.value = 1;
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.35;
    this.out.connect(this.an); this.an.connect(this.ctx.destination);
    this._td = new Float32Array(this.an.fftSize); this._fd = new Float32Array(this.an.frequencyBinCount);
    this.ratio = this.ctx.sampleRate / TARGET; this._frac = 0;
    return this;
  }

  _openMic(aec) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: aec, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
  }
  // Change l'annulation d'écho : l'ancien micro est fermé AVANT d'ouvrir le nouveau (sinon Android reste en « mode appel »).
  async setEchoCancel(aec) {
    aec = !!aec;
    if (!this.ctx || !this.node || aec === this.aec) return false;
    if (this.src) { try { this.src.disconnect(); } catch (_) {} }
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    this.stream = await this._openMic(aec); this.aec = aec;
    this.src = this.ctx.createMediaStreamSource(this.stream); this.src.connect(this.node);
    return true;
  }
  // Son d'essai (trois notes) par le même chemin que la voix du mode direct.
  chime() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0, t0 + i * 0.22); g.gain.linearRampToValueAtTime(0.5, t0 + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.22 + 0.5);
      o.connect(g); g.connect(this.out); o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.55);
    });
  }
  // État du son pour le journal à distance.
  describe() {
    const c = this.ctx; if (!c) return 'pas démarré';
    const lat = Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000);
    return `${c.state}, ${c.sampleRate} Hz, latence de sortie ${lat} ms, annulation d'écho ${this.aec ? 'oui (Android : son en mode appel)' : 'non (haut-parleur normal)'}, voix du direct jouée : ${Math.round(this.playedSec)} s`;
  }

  get running() { return this.ctx && this.ctx.state === 'running'; }
  async resume() { if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume(); }

  // ----- capture -----
  _onCapture(f) {
    // Rééchantillonnage vers 16 kHz : moyenne sur une fenêtre de largeur `ratio` (filtre anti-repliement simple).
    const r = this.ratio, half = r / 2, out = new Float32Array(Math.ceil(f.length / r) + 2);
    let n = 0, pos = this._frac;
    while (pos < f.length) {
      const a = Math.max(0, Math.floor(pos - half + 0.5)), b = Math.min(f.length - 1, Math.floor(pos + half - 0.5));
      let s = 0; for (let i = a; i <= b; i++) s += f[i];
      out[n++] = s / Math.max(1, b - a + 1); pos += r;
    }
    this._frac = pos - f.length;
    const pcm = out.subarray(0, n);
    // Niveau et détection de voix (seuil qui s'adapte au bruit de fond de la pièce).
    let s = 0; for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
    const rms = Math.sqrt(s / Math.max(1, pcm.length)); const db = 20 * Math.log10(rms + 1e-9);
    this.db = db; this.level = Math.min(1, Math.max(0, (db + 60) / 45));
    if (db < this.floor) this.floor += (db - this.floor) * 0.2; else this.floor += 0.015;
    this.floor = Math.max(-75, Math.min(this.floor, -25));
    const voiced = db > this.floor + 11 && db > -52;
    if (voiced) this.lastVoicedAt = performance.now();          // voix brute, image par image (fin de phrase plus rapide)
    if (voiced) { this._onCnt++; this._offCnt = 0; } else { this._offCnt++; this._onCnt = 0; }
    if (!this.speaking && this._onCnt >= 3) { this.speaking = true; this._emit('speechstart'); }
    if (this.speaking && this._offCnt >= 22) { this.speaking = false; this._emit('speechend'); }
    // Tampon circulaire int16
    const i16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const v = Math.max(-1, Math.min(1, pcm[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.ring[this.ringPos] = i16[i]; this.ringPos = (this.ringPos + 1) % this.ring.length;
    }
    this.ringFilled = Math.min(this.ring.length, this.ringFilled + i16.length);
    this._emit('frame', pcm, i16, db);
  }

  // Les `ms` dernières millisecondes du micro (pour ne pas perdre la phrase qui contenait « Wilson »).
  recent(ms) {
    const n = Math.min(this.ringFilled, Math.round(TARGET * ms / 1000));
    const out = new Int16Array(n);
    let p = (this.ringPos - n + this.ring.length) % this.ring.length;
    for (let i = 0; i < n; i++) { out[i] = this.ring[p]; p = (p + 1) % this.ring.length; }
    return out;
  }

  // ----- lecture de la voix (PCM 16 bits 24 kHz) -----
  play(int16, rate = 24000) {
    const f = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
    const buf = this.ctx.createBuffer(1, f.length, rate); buf.copyToChannel(f, 0);
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.out);
    const now = this.ctx.currentTime;
    if (this.nextTime < now + 0.03) this.nextTime = now + 0.06;   // petite avance pour une voix sans à-coups
    src.start(this.nextTime); this.nextTime += buf.duration; this.playedSec += buf.duration;
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((x) => x !== src);
      if (!this.sources.length) this._emit('drained');
    };
  }
  get playing() { return this.sources.length > 0; }
  // Silence immédiat (on lui coupe la parole).
  flush() {
    for (const s of this.sources) { try { s.onended = null; s.stop(); } catch (_) {} }
    this.sources = []; this.nextTime = 0; this._emit('drained');
  }

  // Niveau de la voix de Wilson pour animer la bouche ; « round » ≈ voyelles sombres (o, ou).
  outputLevels() {
    if (!this.an) return [0, 0];
    this.an.getFloatTimeDomainData(this._td);
    let s = 0; for (let i = 0; i < this._td.length; i++) s += this._td[i] * this._td[i];
    const rms = Math.sqrt(s / this._td.length);
    const lvl = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-9) + 48) / 34));
    this.an.getFloatFrequencyData(this._fd);
    const bin = this.ctx.sampleRate / this.an.fftSize;
    let lo = 0, hi = 0;
    for (let i = 1; i < this._fd.length; i++) {
      const hz = i * bin, e = Math.pow(10, this._fd[i] / 20);
      if (hz > 200 && hz < 900) lo += e; else if (hz >= 900 && hz < 3500) hi += e;
    }
    const round = lo + hi > 0 ? Math.min(1, Math.max(0, (lo / (lo + hi) - 0.45) * 2.2)) : 0;
    this.outLevel = lvl; this.outRound = round;
    return [lvl, round];
  }
}

export function int16ToBase64(i16) {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
export function base64ToInt16(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer, 0, u8.length >> 1);
}
