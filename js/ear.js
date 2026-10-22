// Wilson — oreille locale : reconnaît « Wilson » sur la tablette, sans rien envoyer sur Internet.
// Moteur : Vosk (Kaldi en WebAssembly) + modèle français léger, limité à une liste de mots :
// « wilson » est en concurrence avec ~150 mots courants, ce qui évite les faux réveils.

const DECOYS = `il elle son sont on oui non vous nous ils je tu le la les de du des un une et est en au aux ce ça qui que quoi
où pas plus bien bon bonne ville vision maison garçon poisson boisson raison saison chanson leçon liaison million avion lion
selon bonbon blouson ballon salon wagon fils film volume voilà voici merci bonjour salut maman papa manger viens venir
regarde télé chat chien heure quelle quel temps beau fait jour soir matin table mains enfants laver allez allons dis moi
toi lui eux mon ma mes ton ta tes sa ses notre votre leur ouais hein bah alors donc mais aussi encore déjà
tout tous rien chose faire dire voir savoir pouvoir vouloir aller avoir être petit grand vite parc vacances
mis perdu dans sur sous avec pour par chez comme quand comment pourquoi combien`.split(/\s+/).filter(Boolean);

// Mots qui font taire Wilson pendant qu'il parle (reconnus sur la tablette, insensibles à sa propre voix).
const STOP_WORDS = ['stop', 'stoppe', 'chut', 'arrête', 'arrete', 'tais'];

const SENS = {                 // sensibilité réglable
  large:   { persistMs: 0,   finalConf: 0.55 },
  normale: { persistMs: 160, finalConf: 0.7 },
  stricte: { persistMs: Infinity, finalConf: 0.85 },
};

export class Ear {
  constructor(name = 'wilson') {
    this.name = name.toLowerCase(); this.model = null; this.rec = null;
    this.active = false; this.ready = false; this.sens = SENS.normale;
    this.onWake = null; this.onHeard = null; this.onProgress = null; this.onPhase = null; this.onStop = null; this.mode = 'wake';
    this._chunk = []; this._chunkLen = 0; this._seenAt = 0; this._cooldown = 0;
  }
  setSensitivity(k) { this.sens = SENS[k] || SENS.normale; }

  async load(parts) {
    if (!window.Vosk) throw new Error('Moteur Vosk absent');
    // Le modèle est découpé en morceaux (hébergement) : on les reprend de la mémoire de la tablette,
    // sinon on les télécharge (une seule fois) en les y rangeant, puis on les recolle.
    let cache = null; try { cache = await caches.open('wilson-lourd-v1'); } catch (_) {}
    const hits = await Promise.all(parts.map((u) => (cache ? cache.match(u).catch(() => null) : null)));
    const blobs = []; let done = 0, total = 1;
    if (hits.some((h) => !h)) {
      const sizes = await Promise.all(parts.map(async (u, i) => {
        if (hits[i]) return 0;
        try { const h = await fetch(u, { method: 'HEAD', cache: 'no-store' }); return +h.headers.get('content-length') || 0; } catch { return 0; }
      }));
      total = sizes.reduce((a, b) => a + b, 0) || 1;
    }
    for (let i = 0; i < parts.length; i++) {
      const u = parts[i];
      if (hits[i]) { blobs.push(await hits[i].blob()); continue; }
      const res = await fetch(u); if (!res.ok) throw new Error('Modèle introuvable : ' + u);
      const saving = cache ? cache.put(u, res.clone()).catch(() => {}) : null;     // rangé en mémoire pendant le téléchargement
      const reader = res.body.getReader(), chunks = [];
      for (;;) { const { done: d, value } = await reader.read(); if (d) break; chunks.push(value); done += value.length; this.onProgress && this.onProgress(Math.min(1, done / total)); }
      blobs.push(new Blob(chunks));
      if (saving) await saving;
    }
    const url = URL.createObjectURL(new Blob(blobs, { type: 'application/gzip' }));
    this.onPhase && this.onPhase('init');          // décompression + mise en route du moteur (quelques secondes)
    this.model = await window.Vosk.createModel(url);
    this.model.setLogLevel(-2);
    this._newRecognizer();
    this.ready = true;
  }

  _newRecognizer() {
    const words = [...new Set([...DECOYS, this.name, ...STOP_WORDS])];
    this.rec = new this.model.KaldiRecognizer(16000, JSON.stringify([...words, '[unk]']));
    this.rec.setWords(true);
    this.rec.on('partialresult', (m) => this._partial(m.result.partial || ''));
    this.rec.on('result', (m) => this._final(m.result));
  }

  // mode 'wake' : attend « Wilson » ; mode 'stop' : pendant que Wilson parle, attend « stop », « chut », « arrête »…
  start(mode = 'wake') { if (this.active && this.mode !== mode) this.pause(); this.mode = mode; this.active = true; this._seenAt = 0; }
  pause() { this.active = false; this._chunk = []; this._chunkLen = 0; try { this.rec && this.rec.retrieveFinalResult(); } catch (_) {} }

  // Reçoit l'audio 16 kHz (Float32, -1..1) par blocs de 20 ms ; envoie au moteur par blocs de 100 ms.
  feed(f32) {
    if (!this.active || !this.ready) return;
    this._chunk.push(f32); this._chunkLen += f32.length;
    if (this._chunkLen < 1600) return;
    const buf = new Float32Array(this._chunkLen); let o = 0;
    for (const c of this._chunk) { buf.set(c, o); o += c.length; }
    this._chunk = []; this._chunkLen = 0;
    try { this.rec.acceptWaveformFloat(buf, 16000); } catch (e) { console.warn('ear', e); }
  }

  _partial(text) {
    if (!this.active) return;
    if (this.mode === 'stop') { if (text.split(' ').some((w) => STOP_WORDS.includes(w))) this._stop(); return; }
    const has = text.split(' ').includes(this.name);
    const now = performance.now();
    if (!has) { this._seenAt = 0; return; }
    if (!this._seenAt) this._seenAt = now;
    if (now - this._seenAt >= this.sens.persistMs) this._wake(text, null);
  }

  _final(r) {
    const text = (r && r.text) || '';
    if (text && this.onHeard) this.onHeard(text);
    this._seenAt = 0;
    if (!this.active) return;
    if (this.mode === 'stop') { if ((r.result || []).some((x) => STOP_WORDS.includes(x.word) && x.conf >= 0.5)) this._stop(); return; }
    const w = (r.result || []).find((x) => x.word === this.name);
    if (w && w.conf >= this.sens.finalConf) this._wake(text, w.conf);
  }

  _stop() {
    const now = performance.now();
    if (now < this._stopCooldown) return;
    this._stopCooldown = now + 1500;
    this.onStop && this.onStop();
  }

  _wake(text, conf) {
    const now = performance.now();
    if (now < this._cooldown) return;
    this._cooldown = now + 2500; this._seenAt = 0;
    this.onWake && this.onWake({ text, conf });
  }
}
