// Wilson — réactions sans parler (PLAN.md, section 7 sexies, Q) : le visage seulement, jamais un mot ni un son (R1 intacte).
// Jamais pendant une discussion, quand il parle, réglages ouverts, ni endormi la nuit.

const ARRIVEE_VIDE_MS = 5 * 60000;    // quelqu'un arrive dans une pièce vide depuis 5 min
const SOURIRE_MS = 30 * 60000;         // sourire à une personne reconnue : une fois toutes les 30 min
const REGARD_LONG_MS = 6000, CLIN_MS = 2 * 60000;
const SURSAUT_MS = 30000;
const INCONNU_MS = 60000;

export class Reactions {
  constructor(app) {
    this.app = app; this.n = {};
    this._vu = false; this._videDepuis = performance.now() - ARRIVEE_VIDE_MS; this._regardDepuis = 0;
    this._sourires = {}; this._jour = {}; this._clinAt = 0; this._sursautAt = 0; this._inconnuAt = 0;
    this._baillerA = 0; this._matin = '';
  }
  get libre() {
    const A = this.app;
    return A.started && (A.state === 'veille' || (A.state === 'dodo' && !A._isNight())) && !A.settingsOpen && !A.speaking && !A.phone
      && performance.now() - (A.playEndAt || 0) > 1500 && !(A.qui && A.qui.appris);
  }
  _faire(nom, f) { this.n[nom] = (this.n[nom] || 0) + 1; f(this.app.face); }

  // Appelée par l'appli ~4 fois par seconde.
  tick(now = performance.now()) {
    const A = this.app, v = A.vision;
    if (!v) return;
    const libre = this.libre, la = !!v.hasPerson;
    // Quelqu'un arrive (pièce vide depuis 5 min) : il se réveille, curieux ; le matin, le premier visage : il s'étire et sourit.
    if (la && !this._vu) {
      const jour = new Date().toDateString(), h = new Date().getHours();
      if (libre && this._matin !== jour && h >= (A.settings.nightEnd || 7) && h < 12 && !A._isNight()) { this._matin = jour; this._faire('matin', (f) => { f.play('yawn'); setTimeout(() => { f.play('wake'); f.setEmotion('joie', 2200, 0.8); }, 2400); }); }
      else if (libre && now - this._videDepuis > ARRIVEE_VIDE_MS) this._faire('arrivee', (f) => { f.play('wake'); f.setEmotion('curieux', 1800, 0.7); });
    }
    // Tout le monde part : il les suit encore des yeux, puis s'assoupit doucement (l'appli le met en somnolence).
    if (!la && this._vu) { this._videDepuis = now; if (libre) this._faire('depart', (f) => f.setEmotion('ennui', 2500, 0.5)); }
    this._vu = la;
    // Regardé 6 s sans qu'on lui parle : clin d'œil et sourire tendre (toutes les 2 min au plus).
    if (v.looking && libre) {
      if (!this._regardDepuis) this._regardDepuis = now;
      const parle = now - (A.audio.lastVoicedAt || 0) < 4000;
      if (!parle && now - this._regardDepuis > REGARD_LONG_MS && now - this._clinAt > CLIN_MS) { this._clinAt = now; this._faire('clin', (f) => { f.doWink(1); f.setEmotion('tendresse', 2500, 0.8); }); }
    } else this._regardDepuis = 0;
    // Le soir, avec quelqu'un : un bâillement de temps en temps.
    const h = new Date().getHours();
    if (libre && la && A.state === 'veille' && (h >= 22 || A._isNight())) {
      if (!this._baillerA) this._baillerA = now + (8 + Math.random() * 4) * 60000;
      else if (now > this._baillerA) { this._baillerA = 0; this._faire('baille', (f) => f.play('yawn')); }
    } else this._baillerA = 0;
  }

  // Bruit fort soudain (porte qui claque, objet qui tombe) : sursaut.
  son(db, floor) {
    const now = performance.now(), saut = db - (this._dbAvant == null ? db : this._dbAvant);
    this._dbAvant = db;
    if (db > -24 && db - floor > 30 && saut > 18 && now - this._sursautAt > SURSAUT_MS && this.libre) { this._sursautAt = now; this._faire('sursaut', (f) => f.setEmotion('surprise', 1100, 0.9)); }
  }

  // Qui me regarde a changé (qui.js) : sourire à la famille, curiosité pour un inconnu.
  qui(P) {
    if (!P || !this.libre || !P.facing) return;
    const now = performance.now();
    if (P.sur) {
      if (now - (this._sourires[P.nom] || -1e12) < SOURIRE_MS) return;
      this._sourires[P.nom] = now;
      const jour = new Date().toDateString(), premier = this._jour[P.nom] !== jour; this._jour[P.nom] = jour;
      this._faire(premier ? 'bonjour' : 'sourire', (f) => { if (premier) f.play('bounce'); f.setEmotion('joie', premier ? 2200 : 1500, premier ? 0.9 : 0.7); });
    } else if (P.inconnu && now - this._inconnuAt > INCONNU_MS) { this._inconnuAt = now; this._faire('inconnu', (f) => { f.play('tilt'); f.setEmotion('curieux', 2200, 0.8); }); }
  }
  decrire() { const l = Object.entries(this.n); return l.length ? l.map(([k, n]) => `${k} ${n}`).join(', ') : 'aucune pour l\'instant'; }
}
