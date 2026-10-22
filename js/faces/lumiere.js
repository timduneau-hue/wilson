// Visage « Lumière » : deux yeux de lumière douce sur fond noir, sans texture (donc sans scintillement).
// La couleur glisse selon l'humeur. Le halo est obtenu en agrandissant une petite image floutée (peu coûteux).
import { clamp, lerp, roundRectPath, SmoothColor, rgbStr } from './util.js';

const COLORS = {
  neutre: '#8FE6FF', attentif: '#9CEBFF', ecoute: '#9CEBFF', curieux: '#A8F0FF', reflexion: '#9FD8FF',
  joie: '#FFD98A', rire: '#FFD98A', fier: '#FFD98A', tendresse: '#FFB8D2', gene: '#FFB0C8',
  triste: '#7FA6FF', ennui: '#86B9E8', confus: '#B6C8FF', peur: '#C9B8FF', surprise: '#B5FFF2',
  colere: '#FF7E6E', somnolent: '#6FC6DC', dort: '#5FB4CC',
};

// Formes en repère virtuel (1000 × 740 centré). Réutilisées par le visage « Rétro ».
export function lightShapes(g, st, { lw = 1, mouth = true } = {}) {
  const P = st.P, o = st.o;
  for (const i of [-1, 1]) {
    const open = clamp(i < 0 ? st.openL : st.openR, 0, 1.05);
    const sc = P.eyeScale + o.eye, sx = 1 - 0.12 * st.lx * i, lift = P.browY + o.brow;
    const w = 128 * sc * sx, h = 190 * sc * (1 + lift * 0.06);
    const cx = i * 172 + st.lx * 70, cy = -40 + st.ly * 50 - lift * 12;
    const x0 = cx - w / 2, y0 = cy - h / 2, r = Math.min(w, h) * 0.46;
    const lower = clamp(P.lower, 0, 1);
    if (open < 0.12) {                               // œil fermé : un arc (sommeil, clin d'œil)
      g.save(); g.globalAlpha *= 1 - open / 0.12; g.lineCap = 'round'; g.lineWidth = 15 * lw;
      g.beginPath(); g.moveTo(cx - w * 0.44, cy + h * 0.06); g.quadraticCurveTo(cx, cy + h * 0.06 + 30, cx + w * 0.44, cy + h * 0.06); g.stroke();
      g.restore();
      if (open < 0.03) continue;
    }
    const top = y0 + (1 - open) * h * 0.92 * (1 - lower * 0.8);
    const tilt = P.tilt * h * 0.32 + P.browAsym * i * h * 0.08;
    const inner = cx - i * (w / 2 + 24), outer = cx + i * (w / 2 + 24);
    const bot = y0 + h + 2, arc = Math.min(lower * 2.8, 1.75) * h;
    g.save();
    g.beginPath(); roundRectPath(g, x0, y0, w, h, r); g.clip();
    g.beginPath(); g.moveTo(inner, top + tilt); g.lineTo(outer, top - tilt * 0.5);
    g.lineTo(outer, bot); g.quadraticCurveTo(cx, bot - arc, inner, bot); g.closePath(); g.fill();
    g.restore();
  }
  if (!mouth) return;
  const open = clamp(P.mouthO + st.talk * 0.95 + o.mouth, 0, 1.1);
  const round = clamp(P.round + st.roundTalk * st.talk * 0.8 + o.mouth * 0.8, 0, 1);
  const mx = st.lx * 40, my = 178 + st.ly * 30, s = P.smile;
  const w = 56 * P.mouthW * (1 - round * 0.45);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 12 * lw;
  if (open < 0.06) {
    g.beginPath(); g.moveTo(mx - w, my - s * 10); g.quadraticCurveTo(mx, my + s * 34, mx + w, my - s * 10); g.stroke();
  } else if (round > 0.5) {                        // « o » : ovale
    const h = 16 + open * 70;
    g.beginPath(); g.ellipse(mx, my + h * 0.2, Math.max(34, w * 0.9), h * 0.62, 0, 0, Math.PI * 2); g.fill();
  } else {
    const h = 16 + open * 70;
    g.beginPath(); g.moveTo(mx - w, my - s * 10);
    g.quadraticCurveTo(mx, my + s * 18 - h * 0.25 - round * h * 0.3, mx + w, my - s * 10);
    g.quadraticCurveTo(mx, my + s * 26 + h, mx - w, my - s * 10); g.closePath(); g.fill();
  }
}

export class Lumiere {
  constructor(face) {
    this.f = face; this.bg = '#000'; this.col = new SmoothColor(COLORS.neutre);
    this.small = [document.createElement('canvas'), document.createElement('canvas')];
  }
  get ink() { return rgbStr(this.col.c); }
  get listenRGB() { return this.col.c.map((v) => v | 0).join(','); }
  resize() {
    const [a, b] = this.small;
    a.width = Math.max(8, Math.ceil(this.f.W / 5)); a.height = Math.max(8, Math.ceil(this.f.H / 5));
    b.width = Math.max(4, Math.ceil(this.f.W / 16)); b.height = Math.max(4, Math.ceil(this.f.H / 16));
  }
  draw(g, st) {
    const c = this.col.to(COLORS[st.emotion] || COLORS[st.mood] || COLORS.neutre, st.dt);
    const glow = rgbStr(c), core = rgbStr([lerp(c[0], 255, 0.55), lerp(c[1], 255, 0.55), lerp(c[2], 255, 0.55)]);
    // Halo : deux couches basse résolution floutées, ajoutées en lumière.
    for (const [cv, alpha, blur] of [[this.small[1], 0.95, 1.2], [this.small[0], 0.75, 1.5]]) {
      const x = cv.getContext('2d'), k = cv.width / this.f.W;
      x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none'; x.clearRect(0, 0, cv.width, cv.height);
      x.filter = `blur(${blur}px)`;
      x.setTransform(st.S * k, 0, 0, st.S * k, st.cx * k, st.cy * k); x.translate(st.hx, st.hy); x.rotate(st.rot);
      x.fillStyle = x.strokeStyle = glow; lightShapes(x, st, { lw: 1.3 });
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(cv, 0, 0, cv.width / k, cv.height / k); g.restore();
    }
    const P = st.P;
    if (P.blush > 0.03) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const i of [-1, 1]) {
        const bx = i * 200 + st.lx * 60, by = 98 + st.ly * 40;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, 70);
        rg.addColorStop(0, `rgba(255,120,170,${0.8 * P.blush})`); rg.addColorStop(1, 'rgba(255,120,170,0)');
        g.fillStyle = rg; g.beginPath(); g.ellipse(bx, by, 70, 40, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    g.fillStyle = g.strokeStyle = core; lightShapes(g, st);
  }
}
