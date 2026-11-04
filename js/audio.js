// Wilson — son : micro 16 kHz, tampon circulaire, détection de voix, lecture de la voix de Wilson (24 kHz).

const TARGET = 16000;

export class AudioIO {
  constructor() {
    this.ctx = null; this.stream = null;
    this.ring = new Int16Array(TARGET * 6); this.ringPos = 0; this.ringFilled = 0;   // 6 s de tampon
    this.level = 0; this.db = -100; this.floor = -60; this.speaking = false; this.lastVoicedAt = 0;
    this._onCnt = 0; this._offCnt = 0;
    this.listeners = { frame: [], speechstart: [], speechend: [], drained: [], mic: [], info: [] };
    // Micro pris par le téléphone (appel) : Android ne donne plus que du silence numérique (zéros), ou coupe la piste.
    this.micTaken = false; this.takenN = 0; this._muted = false; this._zero = false; this._zeroMs = 0; this._liveMs = 0;
    this.sources = []; this.nextTime = 0; this.outLevel = 0; this.outRound = 0;
    this.gainDb = 0; this.aec = false; this.playedSec = 0;
    this.micDevice = null; this.micInfo = ''; this.btIn = false;
  }
  on(ev, fn) { this.listeners[ev].push(fn); }
  off(ev, fn) { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }
  _emit(ev, ...a) { for (const fn of this.listeners[ev]) fn(...a); }

  // aec : annulation d'écho du micro. Sur Android, elle fait passer TOUT le son de la page en « mode appel »
  // (volume d'appel, écouteur du téléphone) : la voix du mode direct devenait inaudible (23/10/26). Elle n'est donc
  // utilisée qu'avec la coupure « directe » ; en « prudente », Wilson n'écoute pas pendant qu'il parle, l'écho ne gêne pas.
  async start({ aec = false } = {}) {
    // Téléphone (remarque du 04/11/26, 11h32 : « des grésillements, des scintillements, peu importe la voix ») : sortie à
    // 8-12 ms de latence, trop juste pour un téléphone occupé (caméra, visage, réseau) → craquements. Tampon « lecture »
    // sur téléphone (~0,1 s de plus, inaudible dans une discussion), et une avance plus grande au début de chaque réponse.
    this.mobile = /Mobile/.test(navigator.userAgent);
    this.ctx = new AudioContext({ latencyHint: this.mobile ? 'playback' : 'interactive' });
    this.aec = !!aec;
    this.stream = await this._openMic(this.aec); this._watchTrack();
    this.ctx.onstatechange = () => this._emit('info', `son : ${this.ctx.state}`);
    if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', () => {
      clearTimeout(this._devT); this._devT = setTimeout(() => this._onDevices(), 1000);   // la voiture se connecte ou se déconnecte
    });
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

  // Micro Bluetooth (voiture en Android Auto, kit mains libres) — journal du 02/11/26, 16h43, téléphone dans la voiture :
  // « j'ai pas entendu la réponse » alors que 17 s de voix avaient été jouées. Si Chrome prend le micro de la voiture,
  // Android ouvre le canal « appel » du Bluetooth et tout le son de la page y part ; la voiture ne le joue que pendant un
  // vrai appel → silence. Quand un micro Bluetooth est présent, Wilson écoute donc avec le micro du téléphone : le son reste
  // sur le canal « musique » (Android Auto, A2DP), que la voiture joue.
  static isBluetooth(label) { return /bluetooth|\bsco\b|hands.?free|mains.?libres|\bbt\b|\bhfp\b/i.test(label || ''); }
  static pickBuiltIn(inputs) {
    const ok = inputs.filter((d) => d.label && !AudioIO.isBluetooth(d.label) && !['default', 'communications'].includes(d.deviceId));
    const by = (re) => ok.find((d) => re.test(d.label));
    return by(/speakerphone|haut.?parleur|built.?in|intégr|integr|bottom|internal|interne|phone mic|micro du/i)
      || by(/earpiece|écouteur|ecouteur|receiver/i) || ok.find((d) => !/wired|filaire|usb/i.test(d.label)) || null;
  }
  async _chooseMic() {
    this.micDevice = null; this.btIn = false;
    try {
      const ins = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      this.btIn = ins.some((d) => AudioIO.isBluetooth(d.label));
      this._inputs = ins.map((d) => d.label || '(sans nom)').join(', ');
      if (this.btIn) this.micDevice = AudioIO.pickBuiltIn(ins);
    } catch (_) {}
  }
  async _openMic(aec) {
    await this._chooseMic();
    const base = { echoCancellation: aec, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    let st = null;
    if (this.micDevice) {
      try { st = await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: this.micDevice.deviceId } }, video: false }); }
      catch (e) { this._emit('info', `micro du téléphone impossible à choisir (${e.message}) : micro par défaut`); }
    }
    if (!st) st = await navigator.mediaDevices.getUserMedia({ audio: base, video: false });
    const t = st.getAudioTracks()[0], lab = (t && t.label) || '?';
    this.micInfo = `micro « ${lab} »${this.btIn ? (AudioIO.isBluetooth(lab) ? ' (Bluetooth : son en canal appel, muet en voiture !)' : ' (micro Bluetooth présent, évité)') : ''}`;
    // Après le premier accès au micro, les noms des appareils sont connus : si un micro Bluetooth est là et qu'on l'a pris
    // faute de nom (premier démarrage), on recommence une fois avec le bon micro.
    if (!this._retried && !this.micDevice && t && AudioIO.isBluetooth(lab)) {
      this._retried = true; await this._chooseMic();
      if (this.micDevice) { st.getTracks().forEach((x) => x.stop()); return this._openMic(aec); }
    }
    return st;
  }
  // La voiture se connecte (ou se déconnecte) pendant que Wilson tourne : si le micro en cours n'est pas le bon, il est rouvert.
  async _onDevices() {
    if (!this.ctx || !this.node) return;
    let ins = [];
    try { ins = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch (_) {}
    const bt = ins.some((d) => AudioIO.isBluetooth(d.label)), t = this.stream && this.stream.getAudioTracks()[0];
    const curBt = !!(t && AudioIO.isBluetooth(t.label)), want = bt ? AudioIO.pickBuiltIn(ins) : null;
    const curId = t && t.getSettings ? t.getSettings().deviceId : '';
    this._emit('info', `appareils audio changés : ${bt ? 'micro Bluetooth présent (voiture ?)' : 'pas de micro Bluetooth'} — micros : ${ins.map((d) => d.label || '?').join(', ')}`);
    if ((bt && want && (curBt || (curId && curId !== want.deviceId))) || (!bt && this.micDevice)) {
      this._retried = true;
      await this._reopen();
      this._emit('info', `son : ${this.micInfo}`);
    }
  }
  // Change l'annulation d'écho : l'ancien micro est fermé AVANT d'ouvrir le nouveau (sinon Android reste en « mode appel »).
  async setEchoCancel(aec) {
    aec = !!aec;
    if (!this.ctx || !this.node || aec === this.aec) return false;
    if (this.src) { try { this.src.disconnect(); } catch (_) {} }
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    this.stream = await this._openMic(aec); this.aec = aec; this._watchTrack();
    this.src = this.ctx.createMediaStreamSource(this.stream); this.src.connect(this.node);
    return true;
  }
  // Piste du micro : coupée par le système (appel…), ou arrêtée (Bluetooth qui change) → rouverte, sinon Wilson resterait sourd.
  _watchTrack() {
    const t = this.stream && this.stream.getAudioTracks()[0]; if (!t) return;
    t.onmute = () => { this._muted = true; this._micUpdate('micro coupé par le système'); };
    t.onunmute = () => { this._muted = false; this._micUpdate('micro rendu'); };
    t.onended = () => {
      if (!this.stream || this.stream.getAudioTracks()[0] !== t) return;          // ancienne piste, fermée par nous (ou en cours de réouverture)
      this._emit('info', 'micro arrêté par le système : je le rouvre'); this._muted = false;
      setTimeout(() => this._reopen(), 800);
    };
    if (t.muted) { this._muted = true; this._micUpdate('micro coupé par le système'); }
  }
  async _reopen(n = 0) {
    try {
      if (this.src) { try { this.src.disconnect(); } catch (_) {} }
      const old = this.stream; this.stream = null;
      if (old) old.getTracks().forEach((tr) => { if (tr.readyState !== 'ended') tr.stop(); });
      this.stream = await this._openMic(this.aec); this._watchTrack();
      this.src = this.ctx.createMediaStreamSource(this.stream); this.src.connect(this.node);
      this._emit('info', 'micro rouvert');
    } catch (e) {
      this._emit('info', 'micro impossible à rouvrir : ' + e.message);
      if (n < 5) setTimeout(() => this._reopen(n + 1), 3000);
    }
  }
  _micUpdate(why) {
    const taken = this._muted || this._zero;
    if (taken === this.micTaken) return;
    this.micTaken = taken;
    if (taken) { this.takenAt = performance.now(); this.takenN++; }
    this._emit('mic', { taken, why });
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
  // Deux notes : « perdu » (descendantes, réseau coupé) ou « revenu » (montantes). Marche sans Internet.
  // ---------- Lecteur multimédia pour la voiture (journal du 03/11/26, 09h25, téléphone en Android Auto : « Et ben non,
  // tu m'entends pas », alors que le micro du téléphone était bien pris) ----------
  // Le son fabriqué par la page (Web Audio) ne demande pas la main sur la musique à Android : Android Auto n'ouvre pas son
  // canal, et comme tout le son du téléphone part vers la voiture, rien ne sort nulle part. Un vrai lecteur (balise audio,
  // comme une musique) demande cette main : pendant une discussion en voiture, il joue en boucle un son inaudible ; la
  // voiture ouvre son canal « musique » (la radio ou la musique se coupe) et la voix de Wilson y passe. Arrêté → la
  // musique reprend. Les boutons du volant (pause, stop) coupent Wilson.
  static silenceWav(sec = 10, rate = 16000) {
    const n = sec * rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let x = 12345;                                    // souffle à ±2 (sur 32 768) : inaudible, mais ce n'est pas du « rien »
    for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; v.setInt16(44 + i * 2, (x % 5) - 2, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async mediaHold(on, onStop) {
    if (!on) {
      if (this._hold && !this._hold.paused) { this._hold.pause(); this._emit('info', 'lecteur multimédia arrêté (la musique de la voiture peut reprendre)'); }
      try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'; } catch (_) {}
      return;
    }
    try {
      if (!this._hold) {
        const el = this._hold = document.createElement('audio');
        el.id = 'media-hold'; el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', '');
        el.src = URL.createObjectURL(AudioIO.silenceWav());
        el.style.display = 'none'; document.body.appendChild(el);
      }
      if (navigator.mediaSession) {
        try {
          if (window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Wilson', artist: 'Je t\'écoute', album: 'Wilson' });
          for (const a of ['pause', 'stop']) navigator.mediaSession.setActionHandler(a, () => { if (onStop) onStop(a); });
          navigator.mediaSession.playbackState = 'playing';
        } catch (_) {}
      }
      if (this.ctx && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (_) {} }
      if (this._hold.paused) {
        await this._hold.play();
        this._emit('info', `lecteur multimédia en route (pour qu'Android Auto ouvre le son), sortie ${this.ctx && this.ctx.outputLatency ? Math.round(this.ctx.outputLatency * 1000) + ' ms' : '?'}`);
      }
      this.holdErr = '';
    } catch (e) {
      this.holdErr = e.message || String(e);
      this._emit('info', `lecteur multimédia impossible (${this.holdErr}) : touche l'écran une fois`);
    }
  }
  get holding() { return !!(this._hold && !this._hold.paused); }

  tone(kind) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.03, f = kind === 'ecoute' ? [880] : kind === 'reflexion' ? [587.33, 698.46] : kind === 'dodo' ? [698.46, 523.25] : kind === 'revenu' ? [523.25, 783.99] : [659.25, 440];
    const doux = kind === 'ecoute' || kind === 'reflexion' || kind === 'dodo';
    f.forEach((hz, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = t0 + i * 0.18;
      o.frequency.value = hz; o.type = 'sine';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(doux ? 0.15 : 0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + (doux ? 0.18 : 0.3));
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.32);
    });
  }
  // État du son pour le journal à distance.
  describe() {
    const c = this.ctx; if (!c) return 'pas démarré';
    const lat = Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000);
    return `${c.state}, ${c.sampleRate} Hz, latence de sortie ${lat} ms, annulation d'écho ${this.aec ? 'oui (Android : son en mode appel)' : 'non (haut-parleur normal)'}, voix du direct jouée : ${Math.round(this.playedSec)} s${this.micInfo ? ', ' + this.micInfo : ''}${this.holding ? ', lecteur multimédia en route' : this.holdErr ? ', lecteur multimédia refusé (' + this.holdErr.slice(0, 60) + ')' : ''}${this.takenN ? `, micro pris par le téléphone ${this.takenN} fois${this.micTaken ? ' (EN CE MOMENT)' : ''}` : ''}`;
  }

  get running() { return this.ctx && this.ctx.state === 'running'; }
  async resume() { if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume(); }

  // ----- capture -----
  _onCapture(f) {
    // Silence numérique (que des zéros) pendant 1,2 s : un vrai micro a toujours un peu de souffle → le téléphone l'a pris.
    let pk = 0; for (let i = 0; i < f.length; i++) { const a = f[i] < 0 ? -f[i] : f[i]; if (a > pk) pk = a; }
    const dur = (f.length / this.ctx.sampleRate) * 1000;
    if (pk < 1e-6) { this._zeroMs += dur; this._liveMs = 0; if (!this._zero && this._zeroMs >= 1200) { this._zero = true; this._micUpdate('silence numérique'); } }
    else { this._zeroMs = 0; if (this._zero && (this._liveMs += dur) >= 200) { this._zero = false; this._micUpdate('son rendu'); } }
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
    if (this.nextTime < now + 0.03) {                               // petite avance pour une voix sans à-coups
      if (this.nextTime > 0 && this.sources.length) this.trous = (this.trous || 0) + 1;   // trou en pleine réponse (réseau en retard)
      this.nextTime = now + (this.mobile ? 0.18 : 0.06);
    }
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
