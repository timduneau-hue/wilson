// Wilson — qui me regarde (PLAN.md, section 7 sexies, V) : reconnaissance des visages de la famille, SUR L'APPAREIL.
//
// vision-worker.js redresse le visage (150 × 150) ; qui-worker.js en tire une « empreinte » (128 nombres) ; ici on compare
// avec les empreintes apprises. Règles :
//  V1 — les empreintes restent dans le stockage de cet appareil (`wilson.visages`) : jamais synchronisées ni envoyées ;
//  V3 — « sûr » seulement si 2 des 3 dernières analyses donnent la même personne, assez près et nettement devant la suivante ;
//  V4 — une analyse toutes les 1,5 s au plus, toutes les 20 s une fois la personne sûre ; rien de chargé tant que personne
//       n'a été appris.

const KEY = 'wilson.visages';
export const SUR = 0.5;          // distance maximale pour un prénom « sûr »
export const PROBABLE = 0.58;    // au-delà : ce n'est personne de connu (« inconnu », si c'est net deux fois)
export const ECART = 0.06;       // la personne suivante doit être nettement plus loin
const PAUSE_MS = 1500, REVOIR_MS = 20000, OUBLI_MS = 4000;
const APPRENDRE = { n: 12, min: 6, ms: 20000, max: 45000, pas: 0.05, ecartMs: 1200 };   // 20 s, ou jusqu'à 45 s sur un appareil lent tant qu'il n'a pas 6 empreintes
const QUALITE = { eye: 22, yaw: 32, pitch: 32 };    // œil à œil en pixels, angles en degrés

export const distance = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
const norm = (x) => String(x || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const joliNom = (x) => String(x || '').trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 30);

// Personne la plus proche (et la suivante) : distance d'une personne = la plus petite sur ses empreintes.
export function identifier(desc, personnes) {
  const l = personnes.map((p) => ({ nom: p.nom, d: Math.min(...p.desc.map((x) => distance(desc, x))) })).sort((a, b) => a.d - b.d);
  return { nom: l[0] ? l[0].nom : null, d: l[0] ? l[0].d : 9, d2: l[1] ? l[1].d : 9 };
}

export class Qui {
  constructor({ log = () => {} } = {}) {
    this.log = log; this.vision = null; this.worker = null; this.ready = false; this.backend = '';
    this.personnes = []; try { this.personnes = (JSON.parse(localStorage.getItem(KEY) || '{}').personnes || []).filter((p) => p && p.nom && (p.desc || []).length); } catch (_) {}
    this.actuel = null;            // { nom, sur, inconnu, d, at, faces } : le visage regardé (ou le plus proche)
    this.hist = []; this.n = 0; this._attente = null; this._demandeAt = 0; this.stats = { n: 0, ms: 0, refus: 0 };
    this.appris = null;            // apprentissage en cours
    this.onChange = null;          // (actuel) : prénom sûr trouvé, perdu, ou inconnu
  }
  get on() { return this.personnes.length > 0 || !!this.appris; }
  liste() { return this.personnes.map((p) => p.nom); }
  trouver(nom) { const n = norm(nom); return this.personnes.find((p) => norm(p.nom) === n) || null; }

  // Branché à la vision ; le travailleur n'est créé que s'il y a quelqu'un à reconnaître (ou à apprendre).
  attacher(vision) {
    this.vision = vision;
    if (vision) vision.onFaceId = (f) => this._visage(f);
    if (this.on) this._demarrer();
  }
  _demarrer() {
    if (this.worker || !this.vision) return;
    try {
      this.worker = new Worker(new URL('./qui-worker.js', import.meta.url));
      this.worker.onmessage = (e) => this._message(e.data);
      this.worker.onerror = (e) => { this.log('Visages : erreur du travailleur (' + (e.message || 'inconnue') + ')'); this._arreter(); };
    } catch (e) { this.log('Visages : impossible de démarrer (' + e.message + ')'); }
  }
  _arreter() { try { this.worker && this.worker.terminate(); } catch (_) {} this.worker = null; this.ready = false; this._attente = null; }

  // Appelé par l'appli ~4 fois par seconde : faut-il un nouveau visage ?
  tick(now = performance.now()) {
    const v = this.vision;
    if (!v || !this.on) return;
    if (!this.worker) this._demarrer();
    if (!this.ready) return;
    if (this._attente && now - this._attente > 4000) this._attente = null;          // empreinte perdue : on repart
    if (this._attente || v.idWanted) { if (v.idWanted && now - this._demandeAt > 1500) v.idWanted = false; else return; }
    // Personne devant lui depuis un moment : on oublie qui c'était.
    if (!v.faces) { if (this.actuel && now - this.actuel.at > OUBLI_MS) this._poser(null); this.hist = []; return; }
    const A = this.actuel;
    const attendre = this.appris ? 500 : A && (A.sur || A.inconnu) && A.faces === v.faces ? REVOIR_MS : PAUSE_MS;
    if (now - this._demandeAt < attendre) return;
    this._demandeAt = now; v.idWanted = true;
  }

  _visage(f) {
    if (!f) return;
    const ok = f.eye >= QUALITE.eye && Math.abs(f.yaw) <= QUALITE.yaw && Math.abs(f.pitch) <= QUALITE.pitch;
    if (!ok || !this.worker || !this.ready) {
      try { f.bmp.close(); } catch (_) {}
      if (!ok) { this.stats.refus++; this._dernierRefus = f; this._demandeAt = performance.now() - PAUSE_MS + 400; }   // trop loin ou de profil : on réessaie vite
      return;
    }
    const n = ++this.n; this._attente = performance.now();
    this._meta = { n, faces: f.faces, facing: f.facing, eye: f.eye, yaw: f.yaw };
    this.worker.postMessage({ type: 'visage', bmp: f.bmp, n }, [f.bmp]);
  }

  _message(d) {
    if (d.type === 'ready') {
      if (d.error) { this.log('Visages : modèle indisponible (' + d.error + ')'); this._arreter(); this.panne = d.error; return; }
      this.ready = true; this.backend = d.backend;
      this.log(`Visages : reconnaissance prête (${d.backend === 'webgl' ? 'carte graphique' : 'processeur'}, ${d.warm} ms au premier passage)`);
      return;
    }
    if (d.type !== 'empreinte') return;
    this._attente = null;
    const M = this._meta && this._meta.n === d.n ? this._meta : {};
    if (d.error || !d.desc) { this.log('Visages : empreinte impossible (' + (d.error || 'vide') + ')'); return; }
    this.stats.n++; this.stats.ms = this.stats.ms ? this.stats.ms * 0.7 + d.ms * 0.3 : d.ms;
    if (this.appris) return this._apprendreUne(d.desc, M);
    if (!this.personnes.length) return;
    const r = identifier(d.desc, this.personnes), now = performance.now();
    this.hist.push({ ...r, at: now }); if (this.hist.length > 3) this.hist.shift();
    const bons = this.hist.filter((h) => h.nom === r.nom && h.d < SUR && h.d2 - h.d >= ECART && now - h.at < 15000);
    const loin = this.hist.filter((h) => h.d >= PROBABLE && now - h.at < 15000);
    const sur = bons.length >= 2, inconnu = !sur && loin.length >= 2 && r.d >= PROBABLE;
    this._poser({ nom: sur ? r.nom : null, sur, inconnu, d: Math.round(r.d * 100) / 100, at: now, faces: M.faces || (this.vision ? this.vision.faces : 1), facing: !!M.facing, probable: !sur && r.d < PROBABLE ? r.nom : null });
  }

  _poser(A) {
    const avant = this.actuel, cle = (x) => (x ? `${x.nom || ''}|${x.sur}|${x.inconnu}` : '');
    this.actuel = A;
    if (cle(avant) !== cle(A)) {
      if (A && A.sur) this.log(`Visages : c'est ${A.nom} (distance ${A.d})`);
      else if (A && A.inconnu) this.log(`Visages : visage inconnu (distance ${A.d} de la personne la plus proche)`);
      if (this.onChange) this.onChange(A, avant);
    }
  }

  // Le visage regardé en ce moment, s'il est récent (pour Wilson : « à qui je parle ? »).
  qui(now = performance.now()) {
    const A = this.actuel;
    return A && now - A.at < 25000 && this.vision && this.vision.faces ? A : null;
  }

  // ---------- V2 : apprendre un visage ----------
  // onPas(texte, fait, total) : consigne à dire ou afficher. Résout { ok, n, raison }.
  apprendre(nom, { onPas = () => {} } = {}) {
    nom = joliNom(nom);
    if (!nom) return Promise.resolve({ ok: false, raison: 'Il me faut un prénom.' });
    if (!this.vision) return Promise.resolve({ ok: false, raison: 'La caméra est coupée.' });
    if (this.appris) return Promise.resolve({ ok: false, raison: 'J\'apprends déjà un visage.' });
    return new Promise((fin) => {
      const t0 = performance.now(), A = this.appris = { nom, desc: [], t0, fin, onPas, dernierAt: 0, unSeul: 0, autre: null };
      this.log(`Visages : j'apprends le visage de ${nom}`);
      this._demarrer();
      onPas('Regarde-moi bien, de face…', 0, APPRENDRE.n);
      const consignes = ['Regarde-moi bien, de face…', 'Tourne un tout petit peu la tête à gauche…', 'Maintenant un peu à droite…', 'Lève un peu le menton…', 'Souris !', 'Encore un peu, de face…'];
      let k = 0;
      A.timer = setInterval(() => {
        // Premier apprentissage : le modèle se charge (quelques secondes) ; le temps ne compte qu'une fois prêt (60 s au plus).
        if (!this.ready) { if (performance.now() - t0 > 60000 || this.panne) return this._finApprendre(); A.t0 += 700; onPas('Un instant, je me prépare…', 0, APPRENDRE.n); return; }
        const t = performance.now() - A.t0;
        if (t > APPRENDRE.max || (t > APPRENDRE.ms && A.desc.length >= APPRENDRE.min)) return this._finApprendre();
        if (this.vision && this.vision.faces > 1) { A.unSeul++; onPas('Un seul visage devant moi, s\'il te plaît…', A.desc.length, APPRENDRE.n); return; }
        if (this.vision && !this.vision.faces) { onPas('Je ne te vois pas : mets-toi devant moi…', A.desc.length, APPRENDRE.n); return; }
        if (this._dernierRefus && performance.now() - (this._refusVu || 0) > 2500 && this._dernierRefus.eye < QUALITE.eye) { this._refusVu = performance.now(); onPas('Approche-toi un peu…', A.desc.length, APPRENDRE.n); return; }
        const kk = Math.min(consignes.length - 1, Math.floor(A.desc.length / 2));
        if (kk !== k) { k = kk; onPas(consignes[k], A.desc.length, APPRENDRE.n); }
      }, 700);
    });
  }
  _apprendreUne(desc, M) {
    const A = this.appris, now = performance.now();
    if (!A) return;
    if ((M.faces || 1) > 1) return;                                                        // un seul visage (V2)
    // Ce visage est déjà celui de quelqu'un d'autre : on arrête (jamais deux prénoms pour la même personne).
    const autres = this.personnes.filter((p) => norm(p.nom) !== norm(A.nom));
    if (autres.length) { const r = identifier(desc, autres); if (r.d < SUR - 0.05) { A.autreN = (A.autreN || 0) + 1; if (A.autreN >= 2) { A.autre = r.nom; return this._finApprendre(); } return; } }
    const pas = A.desc.every((x) => distance(x, desc) >= APPRENDRE.pas);
    if (!pas && now - A.dernierAt < APPRENDRE.ecartMs) return;                              // trop pareil, trop tôt : on attend un autre angle
    A.desc.push(desc.map((x) => Math.round(x * 10000) / 10000)); A.dernierAt = now;
    A.onPas(null, A.desc.length, APPRENDRE.n);
    if (A.desc.length >= APPRENDRE.n) this._finApprendre();
  }
  _finApprendre() {
    const A = this.appris; if (!A) return;
    clearInterval(A.timer); this.appris = null;
    if (A.autre) { this.log(`Visages : apprentissage de ${A.nom} arrêté, c'est le visage de ${A.autre}`); return A.fin({ ok: false, raison: `C'est le visage de ${A.autre} que je vois : ${A.nom} doit se mettre seul devant moi.`, autre: A.autre }); }
    if (A.desc.length < APPRENDRE.min) {
      this.log(`Visages : apprentissage de ${A.nom} raté (${A.desc.length} empreinte(s))`);
      if (!this.personnes.length) this._arreter();
      return A.fin({ ok: false, raison: this.panne ? 'La reconnaissance des visages ne marche pas sur cet appareil (' + this.panne + ').' : A.unSeul > 3 ? 'Il y avait plusieurs visages devant moi : il faut être seul.' : 'Je ne t\'ai pas assez bien vu : mets-toi bien en face, assez près, avec de la lumière.', n: A.desc.length });
    }
    const p = this.trouver(A.nom);
    if (p) { p.desc = p.desc.concat(A.desc).slice(-24); p.t = Date.now(); } else this.personnes.push({ nom: A.nom, desc: A.desc, t: Date.now() });
    this._sauver(); this.hist = [];
    this.log(`Visages : ${A.nom} appris (${A.desc.length} empreintes) — gardées sur cet appareil seulement`);
    A.fin({ ok: true, n: A.desc.length, nom: A.nom, encore: !!p });
  }
  annulerApprendre() { if (this.appris) { this.appris.desc = []; this._finApprendre(); } }

  oublier(nom) {
    const p = this.trouver(nom); if (!p) return false;
    this.personnes = this.personnes.filter((x) => x !== p); this._sauver(); this.hist = [];
    if (this.actuel && this.actuel.nom === p.nom) this._poser(null);
    this.log(`Visages : ${p.nom} oublié`);
    if (!this.personnes.length) this._arreter();
    return true;
  }
  _sauver() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, personnes: this.personnes })); } catch (e) { this.log('Visages : stockage impossible (' + e.message + ')'); } }

  // Bilan (onglet État) : jamais les empreintes elles-mêmes.
  decrire() {
    if (!this.personnes.length && !this.appris) return 'personne d\'appris';
    const A = this.qui();
    return `${this.personnes.length} visage(s) appris (${this.liste().join(', ')}), ${this.ready ? (this.backend === 'webgl' ? 'carte graphique' : 'processeur') : this.panne ? 'PANNE : ' + this.panne : 'en chargement'}`
      + `, ${this.stats.n} analyse(s), ${Math.round(this.stats.ms || 0)} ms chacune, ${this.stats.refus} visage(s) trop loin ou de profil`
      + `${A ? ` — en ce moment : ${A.sur ? A.nom : A.inconnu ? 'inconnu' : 'pas sûr'} (${A.d})` : ''}`;
  }
}
