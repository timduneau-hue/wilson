// Wilson — voix du mode économique : synthèse vocale de la tablette (gratuite, sans quota).
// Les phrases sont lues une par une, dès qu'elles arrivent (lecture en flux) ; la bouche suit un rythme de syllabes.

export class Voice {
  constructor() {
    this.ok = 'speechSynthesis' in window;
    this.speaking = false; this.voiceName = ''; this._gen = 0; this._t0 = 0; this._pulse = 0; this._session = null;
  }

  // Voix françaises disponibles : voix installées sur la tablette d'abord (plus rapides à démarrer).
  voices() {
    if (!this.ok) return [];
    return speechSynthesis.getVoices().filter((v) => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a));
  }
  _pick() { const vs = this.voices(); return vs.find((v) => v.name === this.voiceName) || vs[0] || null; }

  // Lecture en flux : push(phrase) autant de fois que nécessaire, puis end(). done se résout à la fin ou à l'arrêt.
  stream({ rate = 1.06, pitch = 1.02 } = {}) {
    this.cancel();
    const gen = ++this._gen, self = this;
    let queued = 0, finished = 0, ended = false, settled = false, watchdog = null, resolveDone, rejectDone;
    const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
    const settle = (err) => {
      if (settled) return; settled = true; clearTimeout(watchdog);
      if (gen === self._gen) self.speaking = false;
      if (self._session === session) self._session = null;
      err ? rejectDone(err) : resolveDone();
    };
    const maybeDone = () => { if (ended && finished >= queued) settle(); };
    // Filet de sécurité si « onend » n'arrive jamais : on se fie à la durée estimée de la parole,
    // pas à speechSynthesis.speaking (peu fiable sur certains Android, ce qui faisait réécouter Wilson pendant qu'il parlait).
    let expectedEnd = performance.now();
    const arm = () => {
      clearTimeout(watchdog);
      const wait = Math.max(0, expectedEnd - performance.now()) * 1.5 + 2500;
      watchdog = setTimeout(() => { if (!settled && gen === self._gen) { finished = queued; maybeDone(); } }, wait);
    };
    const session = {
      done,
      push(text) {
        if (settled || gen !== self._gen || !self.ok) return;
        for (const part of splitSentences(text)) {
          const u = new SpeechSynthesisUtterance(part);
          const v = self._pick(); if (v) { try { u.voice = v; } catch (_) {} }
          u.lang = (v && v.lang) || 'fr-FR'; u.rate = rate; u.pitch = pitch;
          let counted = false;
          const fin = () => { if (counted) return; counted = true; finished++; arm(); maybeDone(); };
          u.onboundary = () => { self._pulse = 1; };
          u.onend = fin;
          u.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') return settle();
            if (e.error === 'not-allowed') return settle({ code: 'not-allowed' });
            fin();
          };
          queued++;
          expectedEnd = Math.max(expectedEnd, performance.now()) + (400 + part.length * 72 / rate);
          if (!self.speaking) { self.speaking = true; self._t0 = performance.now(); }
          try { speechSynthesis.speak(u); } catch (e) { fin(); }
        }
        arm();
      },
      end() { ended = true; maybeDone(); },
      cancel() { settle(); },
    };
    this._session = session;
    if (!this.ok) settle({ code: 'unsupported' });
    return session;
  }

  speak(text, opts) { const s = this.stream(opts); s.push(text); s.end(); return s.done; }

  cancel() {
    this._gen++; this.speaking = false;
    const s = this._session; this._session = null;
    if (this.ok) speechSynthesis.cancel();
    if (s) s.cancel();
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
  if (v.localService) s += 3;
  if (/google/i.test(v.name)) s += 2;
  return s;
}

export function splitSentences(text) {
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
