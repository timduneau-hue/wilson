// Wilson — moteur du visage animé (Canvas 2D), commun à tous les styles de visage.
// Tout bouge par ressorts amortis : aucun saut, aucune image figée (anti-marquage).
//
// Anti-scintillement :
//  - rendu Canvas synchronisé avec l'écran (le mode « desynchronized » de la 1re version provoquait du déchirement) ;
//  - cadence régulière : 60, 30 ou 20 images/s exactement (une image sur 1, 2 ou 3), jamais de saut irrégulier ;
//  - aucune texture fine (qui crénelle en bougeant) ; ressorts calculés en petits pas stables.

import { TAU, clamp, lerp, rand } from './faces/util.js';
import { Lumiere } from './faces/lumiere.js';
import { Bouille } from './faces/bouille.js';
import { Led } from './faces/led.js';
import { Miel } from './faces/miel.js';

export const STYLES = {
  lumiere: { label: 'Lumière', desc: 'Deux yeux de lumière douce, épurés', cls: Lumiere },
  bouille: { label: 'Bouille', desc: 'Petit personnage rond à antennes', cls: Bouille },
  led: { label: 'Rétro', desc: 'Écran à LED ambrées', cls: Led },
  miel: { label: 'Miel', desc: 'Grands yeux réalistes (corrigé)', cls: Miel },
};

class Spring {
  constructor(v = 0, k = 120, c = 2 * Math.sqrt(120)) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (let i = 0; i < n; i++) { this.vel += (this.k * (this.t - this.v) - this.c * this.vel) * h; this.v += this.vel * h; }
    return this.v;
  }
}

const PARAMS = {
  open: [1, 260], lower: [0.05, 160], tilt: [0, 140], eyeScale: [1, 180], pupil: [1, 60],
  browY: [0, 170], browTilt: [0, 150], browAsym: [0, 140],
  smile: [0.25, 120], mouthW: [1, 140], mouthO: [0, 200], round: [0, 160],
  blush: [0, 40], headRot: [0, 50], bright: [1, 12],
};

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

export const EMOTION_ALIASES = {
  heureux: 'joie', content: 'joie', joyeux: 'joie', amuse: 'rire', amusé: 'rire',
  surpris: 'surprise', etonne: 'surprise', étonné: 'surprise', fache: 'colere', fâché: 'colere', colère: 'colere',
  pensif: 'reflexion', réflexion: 'reflexion', amoureux: 'tendresse', touche: 'tendresse',
  touché: 'tendresse', timide: 'gene', gêné: 'gene', perplexe: 'confus', inquiet: 'peur', effraye: 'peur',
  effrayé: 'peur', ennuye: 'ennui', ennuyé: 'ennui', fatigue: 'somnolent', fatigué: 'somnolent',
};

export class Face {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.maxDpr = opts.maxDpr || 1.5;
    this.p = {}; for (const [k, [v, s]] of Object.entries(PARAMS)) this.p[k] = new Spring(v, s, 2 * Math.sqrt(s) * 1.05);
    this.lookX = new Spring(0, 90, 2 * Math.sqrt(90)); this.lookY = new Spring(0, 90, 2 * Math.sqrt(90));
    this.headX = new Spring(0, 30, 2 * Math.sqrt(30)); this.headY = new Spring(0, 30, 2 * Math.sqrt(30));
    this.talk = 0; this.talkTarget = 0; this.roundTalk = 0; this.listen = -1; this.listenShown = 0;
    this.mood = 'neutre'; this.emotion = null; this.emotionUntil = 0; this.intensity = 1;
    this.lookTarget = null; this.nextSaccade = 0; this.idleLook = [0, 0];
    this.blinkT = -1; this.nextBlink = performance.now() + 2500; this.wink = 0; this.winkT = -1;
    this.actions = []; this.zs = []; this.nextZ = 0;
    this.fpsDiv = 1; this._n = 0; this.t0 = performance.now(); this.last = this.t0;
    this.setStyle(opts.style);
    this._resize();
    addEventListener('resize', () => this._resize());
    if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
    this._applyTargets();
    requestAnimationFrame((t) => this._frame(t));
  }

  // ---------- API publique ----------
  setStyle(name) {
    this.styleName = STYLES[name] ? name : 'lumiere';
    this.style = new STYLES[this.styleName].cls(this);
    if (this.W && this.style.resize) this.style.resize();
  }
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
  setListen(level) { this.listen = level; }
  setBrightness(b) { this.p.bright.t = clamp(b, 0.03, 1); }
  setFps(f) { this.fpsDiv = f >= 50 ? 1 : f >= 28 ? 2 : 3; }          // 60, 30 ou 20 images/s, régulières
  setMaxDpr(d) { this.maxDpr = d; this.W = 0; this._resize(); }
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
    const dpr = Math.min(devicePixelRatio || 1, this.maxDpr);
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    if (W === this.W && H === this.H) return;
    this.dpr = dpr; this.cv.width = this.W = W; this.cv.height = this.H = H;
    // Repère virtuel 1000 × 740. En portrait, le visage occupe toute la largeur (marges latérales réduites).
    this.S = H > W * 1.1 ? Math.min(W / 640, H / 740) : Math.min(W / 1000, H / 740);
    if (this.style.resize) this.style.resize();
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
    const div = Math.max(this.fpsDiv, this.style.maxFps === 30 || this.maxFpsLight ? 2 : 1);
    if (++this._n % div) return;
    this.drawn = (this.drawn || 0) + 1; this.div = div;          // images réellement dessinées (surveillance de la fluidité)
    const dt = Math.min((now - this.last) / 1000, 0.1); this.last = now;
    const T = (now - this.t0) / 1000;
    if (this.emotion && now >= this.emotionUntil) { this.emotion = null; this._applyTargets(); }

    if (this.lookTarget) {
      if (now > this.nextSaccade) { this.idleLook = [rand(-0.06, 0.06), rand(-0.05, 0.05)]; this.nextSaccade = now + rand(400, 1400); }
      this.lookX.t = this.lookTarget[0] + this.idleLook[0]; this.lookY.t = this.lookTarget[1] + this.idleLook[1];
    } else if (now > this.nextSaccade) {
      this.idleLook = this.mood === 'dort' ? [0, 0.1] : (Math.random() < 0.45 ? [0, 0] : [rand(-0.6, 0.6), rand(-0.35, 0.35)]);
      this.nextSaccade = now + rand(1200, 4200);
      this.lookX.t = this.idleLook[0]; this.lookY.t = this.idleLook[1];
    }
    if (this.mood !== 'dort' && now > this.nextBlink && this.blinkT < 0) {
      this.blinkT = now; this.nextBlink = now + rand(2200, 6500) + (Math.random() < 0.18 ? -1800 : 0);
    }
    let blink = 0;
    if (this.blinkT >= 0) { const b = (now - this.blinkT) / 170; if (b >= 2) this.blinkT = -1; else blink = b < 1 ? b : 2 - b; }
    let wink = 0;
    if (this.winkT >= 0) { const b = (now - this.winkT) / 260; if (b >= 2.2) this.winkT = -1; else wink = b < 1 ? b : (b < 1.2 ? 1 : Math.max(0, 2.2 - b)); }

    const kt = 1 - Math.exp(-dt * (this.talkTarget > this.talk ? 48 : 20));       // lèvres indépendantes de la cadence
    this.talk += (this.talkTarget - this.talk) * kt;
    this.listenShown += ((this.listen >= 0 ? 1 : 0) - this.listenShown) * (1 - Math.exp(-dt * 5));

    for (const k in this.p) this.p[k].step(dt);
    this.lookX.step(dt); this.lookY.step(dt);
    const sleepy = this.mood === 'dort' || this.mood === 'somnolent', drift = sleepy ? 1 : 0.35;
    this.headX.t = this.lookX.v * 26 + Math.sin(T / 37) * 38 * drift + Math.sin(T / 11.3) * 6;
    this.headY.t = this.lookY.v * 14 + Math.sin(T / 53) * 22 * drift + Math.cos(T / 13.7) * 4;
    this.headX.step(dt); this.headY.step(dt);

    this._draw(T, now, dt, blink, wink);
  }

  _draw(T, now, dt, blink, wink) {
    const g = this.ctx, P = {}; for (const k in this.p) P[k] = this.p[k].v;
    const o = this._actionOffsets(now);
    const lx = clamp(this.lookX.v + o.lx, -1.2, 1.2), ly = clamp(this.lookY.v, -1.2, 1.2);
    const asleep = this.mood === 'dort';
    const breath = 1 + (asleep ? 0.018 : 0.01) * Math.sin(T * TAU / (asleep ? 5.5 : 4.2));
    const openBase = clamp(P.open - o.close, 0, 1.05) * (1 - blink);
    const st = {
      T, now, dt, P, o, lx, ly, mood: this.mood, emotion: this.emotion, sleepy: asleep,
      openL: openBase * (this.winkT >= 0 && this.wink === -1 ? 1 - wink : 1),
      openR: openBase * (this.winkT >= 0 && this.wink === 1 ? 1 - wink : 1),
      talk: this.talk, roundTalk: this.roundTalk, headVX: this.headX.vel,
      S: this.S * (breath + o.scale), cx: this.W / 2, cy: this.H / 2 - 25 * this.S,
      hx: this.headX.v + o.hx, hy: this.headY.v + o.hy + (asleep ? 18 : 0), rot: P.headRot + o.rot + lx * 0.03,
    };
    const head = () => { g.setTransform(st.S, 0, 0, st.S, st.cx, st.cy); g.translate(st.hx, st.hy); g.rotate(st.rot); };
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    g.fillStyle = this.style.bg || '#000'; g.fillRect(0, 0, this.W, this.H);
    head(); this.style.draw(g, st);
    if (asleep) { head(); this._zzz(g, now); }

    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (this.listenShown > 0.02) {
      const rgb = this.style.listenRGB || '255,190,110';
      const lvl = Math.max(0, this.listen), w = this.W * (0.08 + 0.35 * Math.min(1, lvl * 2.2));
      const cx = this.W / 2, cy = this.H + 6 * this.dpr;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, w);
      rg.addColorStop(0, `rgba(${rgb},${0.33 * this.listenShown})`); rg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = rg; g.fillRect(cx - w, cy - w, 2 * w, w);
    }
    const b = clamp(P.bright, 0.03, 1);           // veille : voile noir (sur AMOLED, noir = pixels éteints)
    if (b < 0.995) { g.fillStyle = `rgba(0,0,0,${1 - b})`; g.fillRect(0, 0, this.W, this.H); }
  }

  _zzz(g, now) {
    if (now > this.nextZ) { this.zs.push({ t0: now, x: rand(260, 330), s: rand(0.8, 1.2) }); this.nextZ = now + rand(1600, 2600); }
    g.fillStyle = this.style.ink || '#F3EBDD'; g.textAlign = 'center';
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
