// Visage « Bouille » : petit personnage rond, couleur pêche, avec deux antennes souples à boules.
// Les antennes réagissent à l'humeur et aux mouvements de la tête (ressorts).
import { TAU, clamp, drawMouth, drawBrows } from './util.js';

const HEAD_R = 250, HEAD_Y = 60;
const SKIN = ['#FFD2B0', '#F7A882', '#E58A66', '#C96F50'];

class Wobble {                         // ressort peu amorti : les antennes oscillent un peu
  constructor(v) { this.v = v; this.t = v; this.vel = 0; }
  step(dt, k = 55, c = 4.2) { const n = Math.max(1, Math.ceil(dt / 0.016)), h = dt / n; for (let j = 0; j < n; j++) { this.vel += (k * (this.t - this.v) - c * this.vel) * h; this.v += this.vel * h; } return this.v; }
}

export class Bouille {
  constructor(face) { this.f = face; this.bg = '#000'; this.ink = '#FFE3C8'; this.listenRGB = '255,200,150'; this.ant = [new Wobble(0.32), new Wobble(0.32)]; }

  _antTargets(st) {
    const e = st.emotion || st.mood, T = st.T;
    let a = 0.32 + Math.sin(T * 0.9) * 0.05, asym = 0, wig = 0;
    if (e === 'joie' || e === 'rire' || e === 'fier') { a = 0.24; wig = 0.16 * Math.sin(T * 8); }
    else if (e === 'triste' || e === 'ennui') a = 1.15;
    else if (e === 'somnolent' || e === 'dort') a = 1.0 + Math.sin(T * 0.6) * 0.04;
    else if (e === 'surprise' || e === 'peur') a = 0.06;
    else if (e === 'colere') a = 0.8 + Math.sin(T * 30) * 0.025;
    else if (e === 'curieux' || e === 'confus') { a = 0.3; asym = 0.32; }
    else if (e === 'tendresse' || e === 'gene') a = 0.45 + Math.sin(T * 1.5) * 0.12;
    else if (e === 'attentif' || e === 'ecoute') a = 0.18;
    return [a - asym + wig, a + asym - wig];
  }

  draw(g, st) {
    const P = st.P, tg = this._antTargets(st);
    for (let j = 0; j < 2; j++) {
      const A = this.ant[j]; A.t = tg[j];
      A.vel += (j === 0 ? 1 : -1) * st.headVX * 0.0025 + st.talk * Math.sin(st.T * 18 + j) * 0.05;
      A.step(st.dt);
    }
    const fill = g.createRadialGradient(-HEAD_R * 0.35, HEAD_Y - HEAD_R * 0.45, HEAD_R * 0.1, 0, HEAD_Y, HEAD_R * 1.05);
    fill.addColorStop(0, SKIN[0]); fill.addColorStop(0.45, SKIN[1]); fill.addColorStop(0.85, SKIN[2]); fill.addColorStop(1, SKIN[3]);
    // Antennes (derrière la tête)
    for (let j = 0; j < 2; j++) {
      const i = j === 0 ? -1 : 1, base = 0.42, a = this.ant[j].v;
      const bx = i * HEAD_R * Math.sin(base), by = HEAD_Y - HEAD_R * Math.cos(base) + 14;
      const L = 125, tx = bx + i * Math.sin(a) * L, ty = by - Math.cos(a) * L;
      const bend = (a - this.ant[j].t) * 60 + i * 10;
      const mx = (bx + tx) / 2 - Math.cos(a) * bend * i, my = (by + ty) / 2 - Math.sin(a) * bend;
      g.strokeStyle = '#8A4E3A'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
      const bg = g.createRadialGradient(tx - 6, ty - 7, 2, tx, ty, 21);
      bg.addColorStop(0, '#FFF6D2'); bg.addColorStop(0.5, '#FFD86E'); bg.addColorStop(1, '#E9A93C');
      g.fillStyle = bg; g.beginPath(); g.arc(tx, ty, 20, 0, TAU); g.fill();
    }
    // Tête
    g.fillStyle = fill; g.beginPath(); g.arc(0, HEAD_Y, HEAD_R, 0, TAU); g.fill();
    // Joues
    for (const i of [-1, 1]) {
      g.fillStyle = `rgba(255,105,120,${0.22 + 0.45 * P.blush})`;
      g.beginPath(); g.ellipse(i * 160 + st.lx * 30, 112 + st.ly * 20, 40, 24, 0, 0, TAU); g.fill();
    }
    this._eye(g, st, -1, st.openL, fill); this._eye(g, st, 1, st.openR, fill);
    const sc = P.eyeScale + st.o.eye;
    drawBrows(g, st, { y0: 20 - 61 * sc - 34, dx: 98, half: 34, lw: 12, color: '#6B3A2A', k: 0.55 });
    drawMouth(g, st, { y: 142, k: 0.55, line: '#5A2A20', inside: '#3A1010', tongue: '#E36F7E', lw: 7 });
  }

  _eye(g, st, i, open, skin) {
    const P = st.P, o = st.o, sc = P.eyeScale + o.eye, sx = 1 - 0.08 * st.lx * i;
    const rx = 47 * sc * sx, ry = 61 * sc, ex = i * 98 + st.lx * 38, ey = 20 + st.ly * 28 - (P.browY + o.brow) * 6;
    const lw = clamp(P.lower, 0, 1), tilt = P.tilt * ry * 0.55 + P.browAsym * i * ry * 0.12;
    const inner = ex - i * rx * 1.25, outer = ex + i * rx * 1.25;
    if (open > 0.04) {
      g.save(); g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.clip();
      const eg = g.createRadialGradient(ex - rx * 0.3, ey - ry * 0.35, 2, ex, ey, ry);
      eg.addColorStop(0, '#3B2B2B'); eg.addColorStop(1, '#0C0707');
      g.fillStyle = eg; g.fillRect(ex - rx, ey - ry, 2 * rx, 2 * ry);
      const hp = Math.sqrt(clamp(P.pupil, 0.6, 1.5));
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(ex - rx * 0.3, ey - ry * 0.36, rx * 0.3 * hp, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(ex + rx * 0.32, ey + ry * 0.3, rx * 0.12, 0, TAU); g.fill();
      // Paupières de la couleur de la peau
      const top = ey - ry * 1.05 + (1 - open) * ry * 2.1 * (1 - lw * 0.7);
      g.fillStyle = skin;
      g.beginPath(); g.moveTo(inner, ey - ry * 1.3); g.lineTo(inner, top + tilt); g.lineTo(outer, top - tilt * 0.5); g.lineTo(outer, ey - ry * 1.3); g.closePath(); g.fill();
      if (lw > 0.08) {
        const yb = ey + ry * 1.05, arc = Math.min(lw * 3.6, 1.8) * ry;
        g.beginPath(); g.moveTo(inner, yb + 2); g.quadraticCurveTo(ex, yb - arc, outer, yb + 2); g.lineTo(outer, ey + ry * 1.3); g.lineTo(inner, ey + ry * 1.3); g.closePath(); g.fill();
      }
      g.restore();
    }
    const closed = clamp(1 - open * 6, 0, 1);
    if (closed > 0.01) {
      g.strokeStyle = `rgba(70,30,22,${closed})`; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - rx * 0.85, ey + 4); g.quadraticCurveTo(ex, ey + 4 + ry * 0.4, ex + rx * 0.85, ey + 4); g.stroke();
    }
  }
}
