// Outils communs aux visages de Wilson.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);

export function roundRectPath(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgbStr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Couleur qui glisse en douceur vers sa cible (changement d'humeur sans à-coup).
export class SmoothColor {
  constructor(hex) { this.c = hexRgb(hex); }
  to(hex, dt, speed = 3) { const t = hexRgb(hex), k = 1 - Math.exp(-speed * dt); for (let i = 0; i < 3; i++) this.c[i] += (t[i] - this.c[i]) * k; return this.c; }
}

// Bouche de dessin animé partagée (Miel, Bouille). Repère virtuel ; k = échelle.
export function drawMouth(g, st, { x = 0, y, k = 1, line, inside, tongue, teeth = 'rgba(250,246,238,0.96)', lw = 9 }) {
  const P = st.P;
  const mx = x + st.lx * 14 * k, my = y + st.ly * 8 * k;
  const open = clamp(P.mouthO + st.talk * 0.95 + st.o.mouth, 0, 1.1);
  const round = clamp(P.round + st.roundTalk * st.talk * 0.8 + st.o.mouth * 0.8, 0, 1);
  const w = 92 * k * P.mouthW * (1 - round * 0.5 * Math.min(1, open * 2 + 0.2)) * (1 - Math.abs(st.lx) * 0.06);
  const s = P.smile, corner = -s * 16 * k;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = line;
  if (open < 0.04) {
    g.lineWidth = lw + 2;
    g.beginPath(); g.moveTo(mx - w, my + corner); g.quadraticCurveTo(mx, my + s * 40 * k, mx + w, my + corner); g.stroke();
    return;
  }
  const h = open * 118 * k, N = 22, ups = [], los = [];
  const ex = lerp(1.0, 0.5, round);
  for (let i = 0; i <= N; i++) {
    const xx = -1 + 2 * i / N, base = 1 - xx * xx, sh = Math.pow(Math.max(base, 0), ex);
    const yU = my + corner + (s * 34 * k - h * 0.12) * base - round * h * 0.38 * sh;
    ups.push([mx + xx * w, yU]); los.push([mx + xx * w, yU + h * sh + round * h * 0.2 * sh]);
  }
  const shape = () => { g.beginPath(); g.moveTo(...ups[0]); for (const p of ups) g.lineTo(...p); for (let i = N; i >= 0; i--) g.lineTo(...los[i]); g.closePath(); };
  shape(); g.save(); g.clip();
  g.fillStyle = inside; g.fillRect(mx - w - 5, my - 200 * k, 2 * w + 10, 420 * k);
  if (open > 0.22) { const bot = los[N / 2][1]; g.fillStyle = tongue; g.beginPath(); g.ellipse(mx, bot + h * 0.08, w * 0.6, h * 0.42, 0, 0, TAU); g.fill(); }
  if (s > 0.45 && open > 0.18) {
    g.fillStyle = teeth; g.beginPath(); g.moveTo(...ups[0]); for (const p of ups) g.lineTo(p[0], p[1]);
    for (let i = N; i >= 0; i--) g.lineTo(ups[i][0], ups[i][1] + 14 * k + h * 0.1); g.closePath(); g.fill();
  }
  g.restore();
  shape(); g.lineWidth = lw; g.stroke();
}

// Sourcils en arc (Miel, Bouille).
export function drawBrows(g, st, { y0, dx = 196, half = 74, lw = 19, color, k = 1 }) {
  const P = st.P; g.strokeStyle = color; g.lineCap = 'round'; g.lineWidth = lw;
  for (const i of [-1, 1]) {
    const bx = i * dx + st.lx * 12 * k, by = y0 + st.ly * 6 * k;
    const up = (P.browY + st.o.brow) * 42 * k + P.browAsym * i * 30 * k, tl = P.browTilt * 24 * k;
    const xi = bx - i * half, xo = bx + i * half, yi = by - up + tl, yo = by - up - tl * 0.6;
    g.beginPath(); g.moveTo(xi, yi); g.quadraticCurveTo(bx, Math.min(yi, yo) - 16 * k + Math.abs(P.browTilt) * 8 * k, xo, yo); g.stroke();
  }
}
