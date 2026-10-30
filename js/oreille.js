// Wilson — oreille locale du mode voiture (PLAN.md, section 2 quater, C5) : reconnaît « Wilson » dit par Timothée.
// En voiture, pas de regard possible : Wilson dort et se réveille à son nom. Rien n'est envoyé tant qu'il ne l'a pas entendu.
//  - Empreintes : Timothée dit 5 fois « Wilson » (Réglages → CRM et voiture). Chacune devient une suite de coefficients
//    MFCC (bande 150–3 800 Hz : même rendu avec le micro du téléphone ou celui de la voiture en Bluetooth).
//  - À chaque début de phrase (détection de voix d'audio.js), les 2,6 premières secondes sont comparées aux empreintes
//    par DTW (alignement souple dans le temps) : « Wilson » peut être dit vite, lentement, suivi de la question.
//  - Seuil calculé à l'apprentissage (écarts entre ses propres « Wilson », et avec une phrase sans le nom).
// Pur calcul (pas de DOM) : utilisable dans le navigateur comme dans les tests (Node).

export const SR = 16000;
const WIN = 400, HOP = 160, NFFT = 512, NMEL = 24, NCEP = 12, FMIN = 150, FMAX = 3800;
const MAX_SEG_S = 2.6, STEP_FRAMES = 8, KEY = 'wilson.oreille', VERSION = 1;
export const SENS = { strict: 0.9, normal: 1, sensible: 1.1 };
const PRESQUE = 1.2;          // au-dessus de la limite mais tout près : « presque » (Gemini peut donner un second avis)

// ---------- caractéristiques (MFCC + dérivées) ----------
const hamming = Float32Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));
const mel = (f) => 2595 * Math.log10(1 + f / 700), imel = (m) => 700 * (10 ** (m / 2595) - 1);
const FB = (() => {
  const lo = mel(FMIN), hi = mel(FMAX), pts = Array.from({ length: NMEL + 2 }, (_, i) => imel(lo + ((hi - lo) * i) / (NMEL + 1)));
  const bins = pts.map((f) => Math.floor(((NFFT + 1) * f) / SR));
  return Array.from({ length: NMEL }, (_, m) => {
    const w = new Float32Array(NFFT / 2 + 1);
    for (let k = bins[m]; k < bins[m + 1]; k++) w[k] = (k - bins[m]) / Math.max(1, bins[m + 1] - bins[m]);
    for (let k = bins[m + 1]; k < bins[m + 2]; k++) w[k] = (bins[m + 2] - k) / Math.max(1, bins[m + 2] - bins[m + 1]);
    return w;
  });
})();
const DCT = Array.from({ length: NCEP }, (_, i) => Float32Array.from({ length: NMEL }, (_, j) => Math.cos((Math.PI * (i + 1) * (j + 0.5)) / NMEL)));
const LIFT = Float32Array.from({ length: NCEP }, (_, i) => 1 + 11 * Math.sin((Math.PI * (i + 1)) / 22));

function fft(re, im) {          // FFT radix 2 en place
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// Une trame de 25 ms → { p: énergie des 24 bandes, e: énergie totale en dB }
function trame(x, off) {
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT);
  let e = 0, prev = off > 0 ? x[off - 1] : 0;
  for (let i = 0; i < WIN; i++) { const v = x[off + i] - 0.97 * prev; prev = x[off + i]; re[i] = v * hamming[i]; e += x[off + i] * x[off + i]; }
  fft(re, im);
  const p = new Float32Array(NFFT / 2 + 1);
  for (let k = 0; k <= NFFT / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  const pm = new Float32Array(NMEL);
  for (let m = 0; m < NMEL; m++) { let s = 0; const w = FB[m]; for (let k = 0; k < w.length; k++) s += w[k] * p[k]; pm[m] = s; }
  return { p: pm, e: 10 * Math.log10(e / WIN + 1e-12) };
}

// Bruit de fond (voiture, ventilation) : moyenne des 10 trames les plus faibles, bande par bande.
function bruit(tr) {
  const n = Math.min(10, tr.length), N = new Float32Array(NMEL);
  if (!n) return N;
  const faibles = [...tr].sort((a, b) => a.e - b.e).slice(0, n);
  for (const t of faibles) for (let m = 0; m < NMEL; m++) N[m] += t.p[m] / n;
  return N;
}

// Coefficients d'une suite de trames : bruit soustrait, puis plage limitée à 27,5 dB sous le plus fort (au calme comme
// dans le bruit, les sons faibles sont « noyés » pareil : les empreintes apprises au calme restent comparables).
function cepstres(tr, N) {
  let peak = 0;
  const Q = tr.map((t) => { const q = new Float32Array(NMEL); for (let m = 0; m < NMEL; m++) { q[m] = Math.max(t.p[m] - 1.5 * N[m], 0); if (q[m] > peak) peak = q[m]; } return q; });
  const floor = peak * 10 ** -2.75 + 1e-12;
  return Q.map((q) => {
    const c = new Float32Array(NCEP);
    for (let i = 0; i < NCEP; i++) { let s = 0; for (let j = 0; j < NMEL; j++) s += DCT[i][j] * Math.log(q[j] + floor); c[i] = s * LIFT[i]; }
    return c;
  });
}

// Trames d'un son (Float32 16 kHz) : [{ c, e }]
export function trames(x) {
  const out = [];
  for (let off = 0; off + WIN <= x.length; off += HOP) out.push(trame(x, off));
  return out;
}

// Vecteurs comparés : coefficients moins leur moyenne (micro et pièce effacés), + dérivées (le mouvement de la voix).
// N : bruit de fond (par défaut, estimé sur ces mêmes trames).
export function vecteurs(tr, N = bruit(tr)) {
  const n = tr.length, mu = new Float32Array(NCEP), cc = cepstres(tr, N);
  for (const t of cc) for (let i = 0; i < NCEP; i++) mu[i] += t[i] / Math.max(1, n);
  const c = cc.map((t) => Float32Array.from(t, (v, i) => v - mu[i]));
  return c.map((v, k) => {
    const out = new Float32Array(2 * NCEP);
    const a = c[Math.max(0, k - 2)], b = c[Math.max(0, k - 1)], d = c[Math.min(n - 1, k + 1)], f = c[Math.min(n - 1, k + 2)];
    for (let i = 0; i < NCEP; i++) { out[i] = v[i]; out[NCEP + i] = ((d[i] - b[i]) + 2 * (f[i] - a[i])) / 10 * 2; }
    return out;
  });
}

// Partie parlée d'un enregistrement (trames assez fortes), avec un peu de marge.
export function partieParlee(tr) {
  if (!tr.length) return tr;
  const max = Math.max(...tr.map((t) => t.e)), seuil = Math.max(max - 28, -62);
  let a = tr.findIndex((t) => t.e > seuil), b = tr.length - 1 - [...tr].reverse().findIndex((t) => t.e > seuil);
  if (a < 0) return [];
  return tr.slice(Math.max(0, a - 3), Math.min(tr.length, b + 4));
}

// Fenêtre comparée aux empreintes : du début de la voix (au plus une seconde et demie). Le bruit de fond est estimé
// sur tout ce qui a été entendu (les 250 ms d'avant la voix comprises). « Wilson » se dit en tête de phrase.
const FEN = 150;
export function fenetre(tr) {
  const N = bruit(tr);
  if (!tr.length) return [];
  const max = Math.max(...tr.map((t) => t.e)), seuil = Math.max(max - 28, -62);
  const a = Math.max(0, tr.findIndex((t) => t.e > seuil) - 3);
  return vecteurs(tr.slice(a, a + FEN), N);
}

// DTW « sous-séquence » : meilleure place de l'empreinte T dans le son X (début et fin libres dans X).
// Coût moyen par pas du meilleur chemin (plus petit = plus ressemblant).
export function dtw(T, X) {
  const M = T.length, N = X.length;
  if (!M || !N) return Infinity;
  const D = new Float32Array(N), L = new Uint16Array(N), Dp = new Float32Array(N), Lp = new Uint16Array(N);
  const d = (i, j) => { const a = T[i], b = X[j]; let s = 0; for (let k = 0; k < a.length; k++) { const z = a[k] - b[k]; s += z * z; } return Math.sqrt(s); };
  for (let j = 0; j < N; j++) { Dp[j] = d(0, j); Lp[j] = 1; }
  for (let i = 1; i < M; i++) {
    for (let j = 0; j < N; j++) {
      const c = d(i, j);
      // pas : diagonale, empreinte seule (son étiré), son seul (son accéléré), chacun pondéré
      let best = Dp[j] + c, bl = Lp[j] + 1;
      if (j > 0) {
        const dg = Dp[j - 1] + 2 * c; if (dg / (Lp[j - 1] + 2) < best / bl) { best = dg; bl = Lp[j - 1] + 2; }
        const h = D[j - 1] + c; if (h / (L[j - 1] + 1) < best / bl) { best = h; bl = L[j - 1] + 1; }
      }
      D[j] = best; L[j] = bl;
    }
    Dp.set(D); Lp.set(L);
  }
  let m = Infinity;
  for (let j = 0; j < N; j++) m = Math.min(m, Dp[j] / Lp[j]);
  return m;
}

const toF32 = (pcm) => (pcm instanceof Float32Array ? pcm : Float32Array.from(pcm, (v) => v / 32768));

export class Oreille {
  constructor(store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.store = store; this.templates = []; this.seuil = 0; this.sens = 'normal'; this.info = null;
    this.onDetect = null; this._pre = new Float32Array(0); this._seg = null; this.last = []; this.calc = 0;
    this._load();
  }
  get ready() { return this.templates.length >= 3 && this.seuil > 0; }
  get limite() { return this.seuil * (SENS[this.sens] || 1); }
  get presque() { return this.limite * PRESQUE; }

  _load() {
    try {
      const o = JSON.parse((this.store && this.store.getItem(KEY)) || 'null');
      if (o && o.v === VERSION && Array.isArray(o.t)) { this.templates = o.t.map((t) => t.map((v) => Float32Array.from(v))); this.seuil = o.s; this.info = o.i || null; }
    } catch (_) {}
  }
  _save() {
    try { this.store && this.store.setItem(KEY, JSON.stringify({ v: VERSION, s: this.seuil, i: this.info, t: this.templates.map((t) => t.map((v) => Array.from(v, (x) => Math.round(x * 1000) / 1000))) })); } catch (_) {}
  }
  oublier() { this.templates = []; this.seuil = 0; this.info = null; try { this.store && this.store.removeItem(KEY); } catch (_) {} }

  // Apprentissage : noms = enregistrements de « Wilson » (Int16 ou Float32, 16 kHz) ; autres = phrases sans le nom (facultatif).
  apprendre(noms, autres = []) {
    const T = [];
    for (const n of noms) {
      const tout = trames(toF32(n)), tr = partieParlee(tout);
      const s = tr.length / 100;
      if (s < 0.25 || s > 1.6) continue;              // trop court (bruit) ou trop long (phrase entière)
      T.push(vecteurs(tr, bruit(tout)));
    }
    if (T.length < 3) return { ok: false, why: `${T.length} « Wilson » utilisable(s) sur ${noms.length} : recommence en disant seulement « Wilson »` };
    // écarts entre ses propres « Wilson » : chacun comparé aux autres
    const pos = [];
    for (let i = 0; i < T.length; i++) { let m = Infinity; for (let j = 0; j < T.length; j++) if (i !== j) m = Math.min(m, dtw(T[i], T[j])); pos.push(m); }
    // Dans une vraie phrase (« Wilson, qui je vois demain ? »), le nom s'écarte plus des empreintes qu'entre deux « Wilson »
    // dits seuls : le seuil est placé entre ses « Wilson » et sa phrase sans le nom (55 % du chemin, vers la phrase).
    // Une fausse alerte coûte peu (Gemini vérifie que le nom a bien été dit, C6) ; un nom manqué agace.
    const pmax = Math.max(...pos);
    let seuil = pmax * 1.8, neg = null;
    if (autres.length) {
      neg = Math.min(...autres.map((a) => this._meilleur(T, fenetre(trames(toF32(a)).slice(0, MAX_SEG_S * 100)))));
      seuil = neg > pmax * 1.2 ? pmax + 0.55 * (neg - pmax) : pmax * 1.15;      // phrase trop proche : seuil serré
    }
    this.templates = T; this.seuil = seuil;
    this.info = { n: T.length, pos: pos.map((x) => Math.round(x * 100) / 100), neg: neg == null ? null : Math.round(neg * 100) / 100, le: Date.now() };
    this._save();
    return { ok: true, n: T.length, seuil, pos, neg };
  }

  _meilleur(T, X) { let m = Infinity; for (const t of T) m = Math.min(m, dtw(t, X)); return m; }

  // Score d'un son entier (tests, « Tester l'oreille ») : plus petit = plus ressemblant ; détecté si < limite.
  score(pcm) {
    const X = fenetre(trames(toF32(pcm)).slice(0, MAX_SEG_S * 100));
    const s = this._meilleur(this.templates, X);
    return { score: s, oui: s < this.limite };
  }

  // Flux du micro (Float32 16 kHz) en veille dans la voiture. speaking : voix détectée (audio.js).
  // À chaque début de phrase, les premières secondes sont comparées aux empreintes ; onDetect({ score }) au plus une fois par phrase.
  feed(f32, speaking) {
    if (!this.ready) return;
    if (!this._seg) {
      // garde les 250 dernières ms : le début du mot n'est pas perdu
      const keep = Math.round(SR * 0.25), pre = new Float32Array(Math.min(keep, this._pre.length + f32.length));
      const all = new Float32Array(this._pre.length + f32.length); all.set(this._pre); all.set(f32, this._pre.length);
      pre.set(all.subarray(all.length - pre.length)); this._pre = pre;
      if (!speaking) return;
      this._seg = { x: new Float32Array(SR * (MAX_SEG_S + 0.5)), n: 0, tr: [], quiet: 0, best: Infinity, done: false, lastCalc: 0 };
      this._push(this._pre);
      return;
    }
    const S = this._seg;
    this._push(f32);
    S.quiet = speaking ? 0 : S.quiet + f32.length;
    if (S.quiet > SR * 0.6 || S.n >= S.x.length) return this._end();
  }
  _push(f) {
    const S = this._seg, room = S.x.length - S.n, k = Math.min(room, f.length);
    S.x.set(f.subarray(0, k), S.n); S.n += k;
    while ((S.tr.length * HOP) + WIN <= S.n) S.tr.push(trame(S.x, S.tr.length * HOP));
    if (!S.done && S.tr.length >= 45 && S.tr.length - S.lastCalc >= STEP_FRAMES && S.tr.length <= MAX_SEG_S * 100) {
      S.lastCalc = S.tr.length;
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const s = this._meilleur(this.templates, fenetre(S.tr));
      this.calc = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      S.best = Math.min(S.best, s);
      if (s < this.limite) { S.done = true; if (this.onDetect) this.onDetect({ score: s, limite: this.limite }); }
    }
  }
  _end() {
    const S = this._seg; this._seg = null; this._pre = new Float32Array(0);
    // presque reconnu : l'appli peut demander un second avis (le son est encore dans le tampon du micro)
    if (S && !S.done && S.best < this.presque && this.onPresque) this.onPresque({ score: S.best, limite: this.limite, duree: S.n / SR });
    if (S && S.tr.length >= 30) { this.last.push({ s: Math.round(S.best * 100) / 100, oui: S.done, d: Math.round(S.n / SR * 10) / 10 }); if (this.last.length > 20) this.last.shift(); }
    if (this.onSegment && S) this.onSegment({ score: S.best, oui: S.done, duree: S.n / SR });
  }
  reset() { this._seg = null; this._pre = new Float32Array(0); }
}

// Le nom de Wilson dans une transcription (vérification de Gemini, C6) : « Wilson », « Vilson », « Wilsonne »…
export function nomDit(txt) {
  const t = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b(w|v|ou)h?il+s[oa]n+e?\b|\bwills?on\b|\bwilso\b/.test(t);
}
