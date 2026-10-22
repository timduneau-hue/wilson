// Wilson — voix du mode économique : synthèse vocale de la tablette (gratuite, sans quota).
// Les phrases sont lues une par une (Chrome coupe parfois les textes longs) ; la bouche est animée par un rythme de syllabes.

export class Voice {
  constructor() {
    this.ok = 'speechSynthesis' in window;
    this.speaking = false; this.voiceName = ''; this._gen = 0; this._t0 = 0; this._pulse = 0;
    if (this.ok) speechSynthesis.addEventListener?.('voiceschanged', () => { this._voices = null; });
  }

  // Voix françaises disponibles (les voix Google du téléphone en premier).
  voices() {
    if (!this.ok) return [];
    const all = speechSynthesis.getVoices().filter((v) => /^fr([-_]|$)/i.test(v.lang));
    return all.sort((a, b) => score(b) - score(a));
  }
  _pick() {
    const vs = this.voices();
    return vs.find((v) => v.name === this.voiceName) || vs[0] || null;
  }

  // Lit le texte ; se résout à la fin (ou à l'arrêt). Rejette { code: 'not-allowed' } si le navigateur refuse.
  speak(text, { rate = 1.04, pitch = 1.02 } = {}) {
    if (!this.ok) return Promise.reject({ code: 'unsupported' });
    this.cancel();
    const gen = ++this._gen, parts = splitSentences(text);
    if (!parts.length) return Promise.resolve();
    this.speaking = true; this._t0 = performance.now();
    return new Promise((resolve, reject) => {
      let i = 0, watchdog;
      let settled = false;
      const done = (err) => {                     // se résout toujours, même après une coupure (sinon Wilson resterait « occupé »)
        clearTimeout(watchdog); if (settled) return; settled = true;
        if (gen === this._gen) this.speaking = false;
        if (this._finish === finish) this._finish = null;
        err ? reject(err) : resolve();
      };
      const finish = () => done();
      this._finish = finish;
      const next = () => {
        if (gen !== this._gen) return done();
        if (i >= parts.length) return done();
        const u = new SpeechSynthesisUtterance(parts[i++]);
        const v = this._pick(); if (v) { try { u.voice = v; } catch (_) {} }
        u.lang = (v && v.lang) || 'fr-FR'; u.rate = rate; u.pitch = pitch;
        u.onboundary = () => { this._pulse = 1; };
        let moved = false;                          // « onend » et le filet de sécurité ne doivent passer qu'une fois
        const go = () => { if (moved) return; moved = true; clearTimeout(watchdog); try { next(); } catch (e) { done({ code: 'erreur', message: e.message }); } };
        u.onend = go;
        u.onerror = (e) => {
          clearTimeout(watchdog); moved = true;
          if (e.error === 'interrupted' || e.error === 'canceled') return done();
          done({ code: e.error || 'erreur' });
        };
        // Filet de sécurité : sur certains Android, « onend » n'arrive jamais.
        const est = 1500 + u.text.length * 85 / rate;
        const check = () => { if (gen !== this._gen || moved) return; if (!speechSynthesis.speaking && !speechSynthesis.pending) go(); else watchdog = setTimeout(check, 400); };
        watchdog = setTimeout(check, est);
        speechSynthesis.speak(u);
      };
      try { next(); } catch (e) { done({ code: 'erreur', message: e.message }); }
    });
  }

  cancel() {
    this._gen++; this.speaking = false;
    const f = this._finish; this._finish = null;
    if (this.ok) speechSynthesis.cancel();
    if (f) f();
  }

  // Ouverture de la bouche simulée (0..1) pendant la parole.
  mouth(now = performance.now()) {
    if (!this.speaking) return 0;
    const t = (now - this._t0) / 1000;
    this._pulse *= 0.86;
    const syll = Math.max(0, Math.sin(t * Math.PI * 2 * 4.6 + Math.sin(t * 1.7) * 2));
    return Math.min(1, 0.15 + syll * (0.5 + 0.25 * Math.sin(t * 2.9)) + this._pulse * 0.3);
  }
}

function score(v) {
  let s = 0;
  if (/fr[-_]FR/i.test(v.lang)) s += 4;
  if (/google/i.test(v.name)) s += 3;
  if (v.localService) s += 1;
  if (/network|réseau|neural|natural/i.test(v.name)) s += 1;
  return s;
}

function splitSentences(text) {
  const clean = (text || '').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  for (const s of clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean]) {
    let p = s.trim(); if (!p) continue;
    while (p.length > 200) { const cut = p.lastIndexOf(',', 200) > 60 ? p.lastIndexOf(',', 200) + 1 : 200; out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); }
    if (p) out.push(p);
  }
  return out;
}
