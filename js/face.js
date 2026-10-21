// Wilson — visage animé (Canvas 2D).
// Visage original : deux grands yeux couleur miel, sourcils et bouche lumineux sur fond noir (AMOLED).
// Tout bouge par ressorts amortis : aucun saut, aucune image figée (anti-marquage).

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

class Spring {
  constructor(v = 0, k = 120, c = 2 * Math.sqrt(120)) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const a = this.k * (this.t - this.v) - this.c * this.vel;
    this.vel += a * dt; this.v += this.vel * dt;
    return this.v;
  }
}

// Paramètres du visage et leur raideur (plus c'est haut, plus c'est vif).
const PARAMS = {
  open: [1, 260], lower: [0.05, 160], tilt: [0, 140], eyeScale: [1, 180], pupil: [1, 60],
  browY: [0, 170], browTilt: [0, 150], browAsym: [0, 140],
  smile: [0.25, 120], mouthW: [1, 140], mouthO: [0, 200], round: [0, 160],
  blush: [0, 40], headRot: [0, 50], bright: [1, 12],
};

// Expressions : cibles des paramètres (les absents reviennent au neutre).
const NEUTRAL = { open: 1, lower: 0.06, tilt: 0, eyeScale: 1, pupil: 1, browY: 0, browTilt: 0, browAsym: 0,
  smile: 0.28, mouthW: 1, mouthO: 0, round: 0, blush: 0, headRot: 0 };

export const EXPRESSIONS = {
  neutre: {},
  attentif: { open: 1, eyeScale: 1.04, pupil: 1.15, browY: 0.25, smile: 0.3 },
  ecoute: { open: 1, eyeScale: 1.03, pupil: 1.2, browY: 0.15, smile: 0.22, headRot: 0.05 },
  joie: { open: 0.95, lower: 0.42, browY: 0.3, smile: 0.95, mouthW: 1.12, blush: 0.6, pupil: 1.1 },
  rire: { open: 0.7, lower: 0.72, browY: 0.4, smile: 1, mouthO: 0.45, mouthW: 1.15, blush: 0.7 },
  triste: { open: 0.78, lower: 0.12, tilt: -0.65, browY: 0.15, browTilt: -0.85, smile: -0.65, mouthW: 0.78, pupil: 1.3 },
  surprise: { open: 1, eyeScale: 1.16, pupil: 0.72, browY: 0.95, smile: 0, mouthO: 0.5, round: 1, mouthW: 0.62 },
  colere: { open: 0.74, tilt: 0.7, browY: -0.45, browTilt: 0.95, smile: -0.45, mouthW: 0.85, pupil: 0.85 },
  curieux: { open: 1, eyeScale: 1.05, browAsym: 0.75, pupil: 1.2, smile: 0.18, headRot: 0.1 },
  reflexion: { open: 0.86, browAsym: 0.45, smile: 0.02, mouthW: 0.72, round: 0.35, mouthO: 0.04, headRot: -0.05 },
  tendresse: { open: 0.86, lower: 0.36, pupil: 1.38, blush: 0.95, smile: 0.72, headRot: -0.08, browY: 0.1 },
  gene: { open: 0.86, lower: 0.3, blush: 1, smile: 0.4, browTilt: -0.3, headRot: 0.07 },
  confus: { open: 0.92, browAsym: -0.8, tilt: -0.2, smile: -0.12, mouthW: 0.8, headRot: -0.12 },
  peur: { open: 1, eyeScale: 1.1, pupil: 0.62, browY: 0.65, browTilt: -0.65, smile: -0.35, mouthO: 0.22, mouthW: 0.8 },
  fier: { open: 0.82, lower: 0.3, browY: 0.22, smile: 0.62, headRot: 0 },
  ennui: { open: 0.55, lower: 0.1, browY: -0.15, smile: -0.05, mouthW: 0.85 },
  somnolent: { open: 0.38, lower: 0.12, browY: -0.25, smile: 0.12, pupil: 1.15 },
  dort: { open: 0, lower: 0, browY: -0.2, smile: 0.18, mouthW: 0.8, pupil: 1.2 },
};

// Correspondance des émotions que Gemini peut demander.
export const EMOTION_ALIASES = {
  heureux: 'joie', content: 'joie', joyeux: 'joie', amuse: 'rire', amusé: 'rire', triste: 'triste',
  surpris: 'surprise', etonne: 'surprise', étonné: 'surprise', fache: 'colere', fâché: 'colere', colère: 'colere',
  curieux: 'curieux', pensif: 'reflexion', réflexion: 'reflexion', amoureux: 'tendresse', touche: 'tendresse',
  touché: 'tendresse', timide: 'gene', gêné: 'gene', perplexe: 'confus', inquiet: 'peur', effraye: 'peur',
  effrayé: 'peur', fier: 'fier', ennuye: 'ennui', ennuyé: 'ennui', fatigue: 'somnolent', fatigué: 'somnolent',
};

// Palette (couleurs originales de Wilson).
const C = {
  ivory: '#F3EBDD', ivoryDim: 'rgba(243,235,221,0.88)',
  scleraIn: '#FFFBF4', scleraOut: '#E7DCCB', scleraEdge: '#A99A86',
  irisIn: '#FFD889', irisMid: '#E39A3B', irisOut: '#7A3E12', limbal: '#3B1C08',
  mouthIn: '#24090E', tongue: '#D9667A', blush: '255,150,170', listen: '255,190,110',
};

export class Face {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.p = {}; for (const [k, [v, s]] of Object.entries(PARAMS)) this.p[k] = new Spring(v, s, 2 * Math.sqrt(s) * 1.05);
    this.lookX = new Spring(0, 90, 2 * Math.sqrt(90)); this.lookY = new Spring(0, 90, 2 * Math.sqrt(90));
    this.headX = new Spring(0, 30, 2 * Math.sqrt(30)); this.headY = new Spring(0, 30, 2 * Math.sqrt(30));
    this.talk = 0; this.talkTarget = 0; this.roundTalk = 0; this.listen = -1; this.listenShown = 0;
    this.mood = 'neutre'; this.emotion = null; this.emotionUntil = 0; this.intensity = 1;
    this.lookTarget = null; this.nextSaccade = 0; this.idleLook = [0, 0];
    this.blinkT = -1; this.nextBlink = performance.now() + 2500; this.wink = 0; this.winkT = -1;
    this.actions = []; this.zs = []; this.nextZ = 0;
    this.fpsCap = 60; this.lastDraw = 0; this.t0 = performance.now(); this.last = this.t0;
    this.brightTarget = 1;
    this.irisTex = this._makeIris();
    this._resize(); addEventListener('resize', () => this._resize());
    this._applyTargets();
    requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- API publique ----------
  setMood(name) { if (EXPRESSIONS[name]) { this.mood = name; this._applyTargets(); } }
  setEmotion(name, ms = 4000, intensity = 1) {
    name = EMOTION_ALIASES[name] || name;
    if (!EXPRESSIONS[name]) return false;
    this.emotion = name; this.intensity = clamp(intensity, 0.3, 1.2);
    this.emotionUntil = ms > 0 ? performance.now() + ms : Infinity;
    this._applyTargets();
    if (name === 'surprise' || name === 'peur') this.play('startle');
    if (name === 'rire') this.play('giggle');
    if (name === 'joie') this.play('bounce');
    return true;
  }
  clearEmotion() { this.emotion = null; this._applyTargets(); }
  setLook(x, y) { this.lookTarget = (x == null) ? null : [clamp(x, -1, 1), clamp(y, -1, 1)]; }
  setTalk(level, round = 0) { this.talkTarget = clamp(level, 0, 1); this.roundTalk = clamp(round, 0, 1); }
  setListen(level) { this.listen = level; }          // -1 = caché
  setBrightness(b) { this.brightTarget = clamp(b, 0.03, 1); this.p.bright.t = this.brightTarget; }
  setFps(f) { this.fpsCap = f; }
  blink() { if (this.blinkT < 0) this.blinkT = performance.now(); }
  doWink(side = 1) { this.wink = side; this.winkT = performance.now(); }
  play(name) { this.actions.push({ name, t0: performance.now() }); if (name === 'nod' || name === 'shake') this.blink(); }

  // ---------- interne ----------
  _applyTargets() {
    const now = performance.now();
    const base = { ...NEUTRAL, ...EXPRESSIONS[this.mood] };
    let tgt = base;
    if (this.emotion && now < this.emotionUntil) {
      const e = { ...NEUTRAL, ...EXPRESSIONS[this.emotion] };
      tgt = {}; for (const k in base) tgt[k] = lerp(base[k], e[k], this.intensity);
    }
    for (const k in tgt) if (this.p[k]) this.p[k].t = tgt[k];
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    // Le visage est dessiné dans un repère virtuel de 1000 × 740 (bouche grande ouverte comprise).
    this.S = Math.min(this.W / 1000, this.H / 740) * dpr;
  }

  _makeIris() {
    const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), r = s / 2;
    const rg = g.createRadialGradient(r, r, r * 0.18, r, r, r);
    rg.addColorStop(0, C.irisIn); rg.addColorStop(0.42, C.irisMid); rg.addColorStop(0.86, C.irisOut); rg.addColorStop(1, C.limbal);
    g.fillStyle = rg; g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
    // Fibres de l'iris (motif fixe, dessiné une fois).
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * TAU + rand(-0.01, 0.01), r0 = r * rand(0.22, 0.36), r1 = r * rand(0.62, 0.97);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,236,190,0.13)' : 'rgba(90,40,10,0.16)';
      g.lineWidth = rand(1.2, 3.2); g.beginPath();
      g.moveTo(r + Math.cos(a) * r0, r + Math.sin(a) * r0);
      g.quadraticCurveTo(r + Math.cos(a + 0.06) * (r0 + r1) / 2, r + Math.sin(a + 0.06) * (r0 + r1) / 2, r + Math.cos(a) * r1, r + Math.sin(a) * r1);
      g.stroke();
    }
    const ring = g.createRadialGradient(r, r, r * 0.8, r, r, r);
    ring.addColorStop(0, 'rgba(0,0,0,0)'); ring.addColorStop(1, 'rgba(25,10,2,0.75)');
    g.fillStyle = ring; g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
    return c;
  }

  _actionOffsets(now) {
    const o = { hx: 0, hy: 0, rot: 0, scale: 0, eye: 0, mouth: 0, close: 0, brow: 0, lx: 0 };
    this.actions = this.actions.filter((a) => {
      const t = (now - a.t0) / 1000;
      switch (a.name) {
        case 'nod': if (t > 0.9) return false; o.hy += 16 * Math.sin(t / 0.9 * TAU * 2) * (1 - t / 0.9); break;
        case 'shake': if (t > 1) return false; o.hx += 20 * Math.sin(t * TAU * 3) * (1 - t); o.lx += 0.3 * Math.sin(t * TAU * 3) * (1 - t); break;
        case 'bounce': if (t > 0.8) return false; o.hy -= 22 * Math.abs(Math.sin(t / 0.8 * Math.PI * 2)) * (1 - t / 0.8); o.scale += 0.02 * Math.sin(t / 0.8 * Math.PI); break;
        case 'startle': if (t > 0.6) return false; { const k = Math.sin(Math.min(t / 0.6, 1) * Math.PI); o.scale -= 0.03 * k; o.eye += 0.12 * k; o.brow += 0.5 * k; } break;
        case 'giggle': if (t > 1.4) return false; o.hy += 5 * Math.sin(t * TAU * 7) * (1 - t / 1.4); o.rot += 0.03 * Math.sin(t * TAU * 3.5) * (1 - t / 1.4); break;
        case 'yawn': if (t > 2.6) return false; { const k = Math.sin(Math.min(t / 2.6, 1) * Math.PI); o.mouth += 0.85 * k; o.close += 0.75 * k; o.hy -= 8 * k; o.rot -= 0.05 * k; } break;
        case 'wake': if (t > 1.0) return false; { const k = Math.sin(Math.min(t, 1) * Math.PI); o.scale += 0.025 * k; o.brow += 0.4 * k; o.hy -= 10 * k; } break;
        case 'tilt': if (t > 1.8) return false; o.rot += 0.12 * Math.sin(Math.min(t / 1.8, 1) * Math.PI); break;
        default: return false;
      }
      return true;
    });
    return o;
  }

  _frame(now) {
    requestAnimationFrame((t) => this._frame(t));
    if (this.fpsCap < 60 && now - this.lastDraw < 1000 / this.fpsCap - 2) return;
    this.lastDraw = now;
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    const T = (now - this.t0) / 1000;

    if (this.emotion && now >= this.emotionUntil) { this.emotion = null; this._applyTargets(); }

    // Regard : cible (personne suivie) ou petites saccades spontanées.
    if (this.lookTarget) {
      if (now > this.nextSaccade) { this.idleLook = [rand(-0.06, 0.06), rand(-0.05, 0.05)]; this.nextSaccade = now + rand(400, 1400); }
      this.lookX.t = this.lookTarget[0] + this.idleLook[0]; this.lookY.t = this.lookTarget[1] + this.idleLook[1];
    } else if (now > this.nextSaccade) {
      const asleep = this.mood === 'dort';
      this.idleLook = asleep ? [0, 0.1] : (Math.random() < 0.45 ? [0, 0] : [rand(-0.6, 0.6), rand(-0.35, 0.35)]);
      this.nextSaccade = now + rand(1200, 4200);
      this.lookX.t = this.idleLook[0]; this.lookY.t = this.idleLook[1];
    }

    // Clignements naturels (plus rares quand il somnole, jamais quand il dort).
    if (this.mood !== 'dort' && now > this.nextBlink && this.blinkT < 0) {
      this.blinkT = now; this.nextBlink = now + rand(2200, 6500) + (Math.random() < 0.18 ? -1800 : 0);
    }
    let blink = 0;
    if (this.blinkT >= 0) { const b = (now - this.blinkT) / 170; if (b >= 2) this.blinkT = -1; else blink = b < 1 ? b : 2 - b; }
    let wink = 0;
    if (this.winkT >= 0) { const b = (now - this.winkT) / 260; if (b >= 2.2) this.winkT = -1; else wink = b < 1 ? b : (b < 1.2 ? 1 : Math.max(0, 2.2 - b)); }

    // Lèvres : montée rapide, descente plus douce.
    const tk = this.talkTarget; this.talk += (tk - this.talk) * (tk > this.talk ? 0.55 : 0.28);
    this.listenShown += ((this.listen >= 0 ? 1 : 0) - this.listenShown) * 0.08;

    for (const k in this.p) this.p[k].step(dt);
    this.lookX.step(dt); this.lookY.step(dt);
    // Dérive lente du visage entier : vie + protection contre le marquage de l'écran.
    const sleepy = this.mood === 'dort' || this.mood === 'somnolent';
    const drift = sleepy ? 1 : 0.35;
    this.headX.t = this.lookX.v * 26 + Math.sin(T / 37) * 38 * drift + Math.sin(T / 11.3) * 6;
    this.headY.t = this.lookY.v * 14 + Math.sin(T / 53) * 22 * drift + Math.cos(T / 13.7) * 4;
    this.headX.step(dt); this.headY.step(dt);

    this._draw(T, now, blink, wink);
  }

  _draw(T, now, blink, wink) {
    const g = this.ctx, P = {}; for (const k in this.p) P[k] = this.p[k].v;
    const o = this._actionOffsets(now);
    const lx = clamp(this.lookX.v + o.lx, -1.2, 1.2), ly = clamp(this.lookY.v, -1.2, 1.2);
    const sleepy = this.mood === 'dort';
    const breath = 1 + (sleepy ? 0.018 : 0.01) * Math.sin(T * TAU / (sleepy ? 5.5 : 4.2));

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    const S = this.S * (breath + o.scale);
    g.setTransform(S, 0, 0, S, this.cv.width / 2, this.cv.height / 2 - 25 * S);
    g.translate(this.headX.v + o.hx, this.headY.v + o.hy + (sleepy ? 18 : 0));
    g.rotate(P.headRot + o.rot + lx * 0.03);

    // Joues
    if (P.blush > 0.02) {
      for (const i of [-1, 1]) {
        const cx = i * 262 + lx * 18, cy = 110 + ly * 8;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 105);
        rg.addColorStop(0, `rgba(${C.blush},${0.85 * P.blush})`); rg.addColorStop(1, `rgba(${C.blush},0)`);
        g.fillStyle = rg; g.fillRect(cx - 110, cy - 110, 220, 220);
      }
    }

    const openBase = clamp(P.open - o.close, 0, 1.05);
    for (const i of [-1, 1]) {
      let open = openBase * (1 - blink);
      if (this.winkT >= 0 && i === this.wink) open *= (1 - wink);
      this._eye(g, i, P, lx, ly, open, o);
    }
    this._brows(g, P, lx, ly, o);
    this._mouth(g, P, lx, ly, o);
    if (sleepy) this._zzz(g, T, now);

    // Indicateur d'écoute discret (bas de l'écran), seulement en conversation.
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.listenShown > 0.02) {
      const lvl = Math.max(0, this.listen), w = this.cv.width * (0.08 + 0.35 * Math.min(1, lvl * 2.2));
      const cx = this.cv.width / 2, cy = this.cv.height + 6 * this.dpr;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, w);
      rg.addColorStop(0, `rgba(${C.listen},${0.33 * this.listenShown})`); rg.addColorStop(1, `rgba(${C.listen},0)`);
      g.fillStyle = rg; g.fillRect(cx - w, cy - w, 2 * w, w);
    }
    // Luminosité globale (veille) : voile noir — sur AMOLED, le noir = pixels éteints.
    const b = clamp(P.bright, 0.03, 1);
    if (b < 0.995) { g.fillStyle = `rgba(0,0,0,${1 - b})`; g.fillRect(0, 0, this.cv.width, this.cv.height); }
  }

  _eye(g, i, P, lx, ly, open, o) {
    const sx = 1 - 0.09 * lx * i;                       // perspective : l'œil éloigné rétrécit
    const sc = P.eyeScale + o.eye;
    const rx = 118 * sc * sx, ry = 144 * sc;
    const ex = i * 196 + lx * 16, ey = -52 + ly * 10;

    // Ouverture = intersection de l'ovale de l'œil et de l'espace entre les paupières (pas de liseré).
    const yl = ey - ry * 1.08 + (1 - open) * ry * 2.16;
    const tilt = P.tilt * ry * 0.42;
    const inner = ex - i * rx * 1.08, outer = ex + i * rx * 1.08;
    const arch = ry * 0.42 * clamp(open, 0, 1);
    const lw = clamp(P.lower, 0, 1), yb = ey + ry * 1.08 - lw * ry * 0.95;
    const upperLid = (dy = 0) => { g.moveTo(inner, yl + tilt + dy); g.quadraticCurveTo(ex, yl - arch + dy, outer, yl - tilt + dy); };
    const closed = clamp(1 - open * 5, 0, 1);

    if (yb - (yl - arch) > 2 && open > 0.02) {
    g.save();
    g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.clip();
    g.beginPath(); upperLid(); g.lineTo(outer, yb); g.quadraticCurveTo(ex, yb - lw * ry * 0.55, inner, yb); g.closePath(); g.clip();
    // Blanc de l'œil
    const sg = g.createRadialGradient(ex - rx * 0.25, ey - ry * 0.3, ry * 0.1, ex, ey, ry * 1.02);
    sg.addColorStop(0, C.scleraIn); sg.addColorStop(0.72, C.scleraOut); sg.addColorStop(1, C.scleraEdge);
    g.fillStyle = sg; g.fillRect(ex - rx, ey - ry, 2 * rx, 2 * ry);
    // Iris + pupille
    const ri = rx * 0.64 / sx * 0.98, ix = ex + lx * rx * 0.36, iy = ey + ly * ry * 0.3;
    g.save(); g.translate(ix, iy); g.scale(sx * (1 - Math.abs(lx) * 0.06), 1 - Math.abs(ly) * 0.05);
    g.drawImage(this.irisTex, -ri, -ri, 2 * ri, 2 * ri);
    const pr = ri * 0.42 * clamp(P.pupil, 0.55, 1.5);
    const pg = g.createRadialGradient(0, 0, pr * 0.6, 0, 0, pr * 1.08);
    pg.addColorStop(0, '#050201'); pg.addColorStop(1, 'rgba(5,2,1,0)');
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, pr * 1.08, 0, TAU); g.fill();
    g.restore();
    // Reflets (la source de lumière reste fixe : léger décalage inverse au regard)
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.ellipse(ix - ri * 0.36 - lx * ri * 0.08, iy - ri * 0.4, ri * 0.2, ri * 0.17, -0.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.arc(ix + ri * 0.32 - lx * ri * 0.06, iy + ri * 0.3, ri * 0.075, 0, TAU); g.fill();

    // Ombre douce de la paupière supérieure sur le globe
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 46; g.beginPath(); upperLid(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 20; g.beginPath(); upperLid(); g.stroke();
    if (lw > 0.05) { g.strokeStyle = `rgba(0,0,0,${0.2 * lw})`; g.lineWidth = 22; g.beginPath(); g.moveTo(outer, yb); g.quadraticCurveTo(ex, yb - lw * ry * 0.55, inner, yb); g.stroke(); }
    g.restore();
    }

    // Œil fermé : un trait lumineux en arc (sommeil, clin d'œil)
    if (closed > 0.01) {
      g.strokeStyle = `rgba(243,235,221,${0.9 * closed})`; g.lineWidth = 10; g.lineCap = 'round';
      const yc = ey + ry * 0.35;
      g.beginPath(); g.moveTo(ex - rx * 0.78, yc - tilt * 0.4 * i);
      g.quadraticCurveTo(ex, yc + ry * 0.32, ex + rx * 0.78, yc + tilt * 0.4 * i); g.stroke();
    }
  }

  _brows(g, P, lx, ly, o) {
    g.strokeStyle = C.ivoryDim; g.lineCap = 'round';
    for (const i of [-1, 1]) {
      const sc = P.eyeScale + o.eye;
      const bx = i * 196 + lx * 12, by = -52 - 144 * sc - 46 + ly * 6;
      const up = (P.browY + o.brow) * 42 + P.browAsym * i * 30;
      const tl = P.browTilt * 24;
      const xi = bx - i * 74, xo = bx + i * 74;
      const yi = by - up + tl, yo = by - up - tl * 0.6;
      g.lineWidth = 19;
      g.beginPath(); g.moveTo(xi, yi); g.quadraticCurveTo(bx, Math.min(yi, yo) - 16 + Math.abs(P.browTilt) * 8, xo, yo); g.stroke();
    }
  }

  _mouth(g, P, lx, ly, o) {
    const mx = lx * 14, my = 214 + ly * 8;
    const talk = this.talk;
    const open = clamp(P.mouthO + talk * 0.95 + o.mouth, 0, 1.1);
    const round = clamp(P.round + this.roundTalk * talk * 0.8 + o.mouth * 0.8, 0, 1);
    let w = 92 * P.mouthW * (1 - round * 0.5 * Math.min(1, open * 2 + 0.2)) * (1 - Math.abs(lx) * 0.06);
    const s = P.smile;
    const corner = -s * 16;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = C.ivory;
    if (open < 0.04) {
      g.lineWidth = 11;
      g.beginPath(); g.moveTo(mx - w, my + corner); g.quadraticCurveTo(mx, my + s * 40, mx + w, my + corner); g.stroke();
      return;
    }
    // Bouche ouverte : lèvre haute et lèvre basse échantillonnées ; « o » quand elle s'arrondit.
    const h = open * 118, N = 22, ups = [], los = [];
    const ex = lerp(1.0, 0.5, round);                       // 1 = parabole (sourire large), 0.5 = ellipse (« o »)
    for (let k = 0; k <= N; k++) {
      const x = -1 + 2 * k / N, base = 1 - x * x, sh = Math.pow(Math.max(base, 0), ex);
      const yU = my + corner + (s * 34 - h * 0.12) * base - round * h * 0.38 * sh;
      ups.push([mx + x * w, yU]);
      los.push([mx + x * w, yU + h * sh + round * h * 0.2 * sh]);
    }
    const shape = () => { g.beginPath(); g.moveTo(...ups[0]); for (const p of ups) g.lineTo(...p); for (let k = N; k >= 0; k--) g.lineTo(...los[k]); g.closePath(); };
    shape(); g.save(); g.clip();
    g.fillStyle = C.mouthIn; g.fillRect(mx - w - 5, my - 200, 2 * w + 10, 420);
    if (open > 0.22) {
      const bot = los[N / 2][1];
      g.fillStyle = C.tongue; g.beginPath(); g.ellipse(mx, bot + h * 0.08, w * 0.6, h * 0.42, 0, 0, TAU); g.fill();
    }
    if (s > 0.45 && open > 0.18) {       // dents du haut quand il rit
      g.fillStyle = 'rgba(250,246,238,0.96)';
      g.beginPath(); g.moveTo(...ups[0]); for (const p of ups) g.lineTo(p[0], p[1]);
      for (let k = N; k >= 0; k--) g.lineTo(ups[k][0], ups[k][1] + 14 + h * 0.1); g.closePath(); g.fill();
    }
    g.restore();
    shape(); g.lineWidth = 9; g.stroke();
  }

  _zzz(g, T, now) {
    if (now > this.nextZ) { this.zs.push({ t0: now, x: rand(260, 330), s: rand(0.8, 1.2) }); this.nextZ = now + rand(1600, 2600); }
    g.fillStyle = C.ivory; g.textAlign = 'center';
    this.zs = this.zs.filter((z) => {
      const t = (now - z.t0) / 4000; if (t >= 1) return false;
      g.globalAlpha = Math.sin(t * Math.PI) * 0.55;
      g.font = `600 ${Math.round(34 * z.s * (0.7 + t * 0.6))}px system-ui, sans-serif`;
      g.fillText('z', z.x + Math.sin(t * 6) * 14 + t * 40, -230 - t * 140);
      return true;
    });
    g.globalAlpha = 1;
  }
}
