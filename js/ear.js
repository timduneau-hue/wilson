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

const SENS = {                 // sensibilité réglable
  large:   { persistMs: 0,   finalConf: 0.55 },
  normale: { persistMs: 160, finalConf: 0.7 },
  stricte: { persistMs: Infinity, finalConf: 0.85 },
};

export class Ear {
  constructor(name = 'wilson') {
    this.name = name.toLowerCase(); this.model = null; this.rec = null;
    this.active = false; this.ready = false; this.sens = SENS.normale;
    this.onWake = null; this.onHeard = null; this.onProgress = null;
    this._chunk = []; this._chunkLen = 0; this._seenAt = 0; this._cooldown = 0;
  }
  setSensitivity(k) { this.sens = SENS[k] || SENS.normale; }

  async load(parts) {
    if (!window.Vosk) throw new Error('Moteur Vosk absent');
    // Le modèle est découpé en morceaux (hébergement) : on les télécharge (ou on les reprend du cache) puis on les recolle.
    const blobs = []; let done = 0;
    const sizes = await Promise.all(parts.map(async (u) => {
      try { const h = await fetch(u, { method: 'HEAD' }); return +h.headers.get('content-length') || 0; } catch { return 0; }
    }));
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    for (const u of parts) {
      const res = await fetch(u); if (!res.ok) throw new Error('Modèle introuvable : ' + u);
      const reader = res.body.getReader(), chunks = [];
      for (;;) { const { done: d, value } = await reader.read(); if (d) break; chunks.push(value); done += value.length; this.onProgress && this.onProgress(Math.min(1, done / total)); }
      blobs.push(new Blob(chunks));
    }
    const url = URL.createObjectURL(new Blob(blobs, { type: 'application/gzip' }));
    this.model = await window.Vosk.createModel(url);
    this.model.setLogLevel(-2);
    this._newRecognizer();
    this.ready = true;
  }

  _newRecognizer() {
    const words = [...new Set([...DECOYS, this.name])];
    this.rec = new this.model.KaldiRecognizer(16000, JSON.stringify([...words, '[unk]']));
    this.rec.setWords(true);
    this.rec.on('partialresult', (m) => this._partial(m.result.partial || ''));
    this.rec.on('result', (m) => this._final(m.result));
  }

  start() { this.active = true; this._seenAt = 0; }
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
    const w = (r.result || []).find((x) => x.word === this.name);
    if (w && w.conf >= this.sens.finalConf) this._wake(text, w.conf);
  }

  _wake(text, conf) {
    const now = performance.now();
    if (now < this._cooldown) return;
    this._cooldown = now + 2500; this._seenAt = 0;
    this.onWake && this.onWake({ text, conf });
  }
}
