// Visage « Miel » : grands yeux réalistes couleur miel (version corrigée : iris lisse, sans motif fin qui scintille).
import { TAU, clamp, drawMouth, drawBrows } from './util.js';

const C = {
  ivory: '#F3EBDD', ivoryDim: 'rgba(243,235,221,0.88)',
  scleraIn: '#FFFBF4', scleraOut: '#E7DCCB', scleraEdge: '#A99A86',
  irisIn: '#FFD889', irisMid: '#E39A3B', irisOut: '#7A3E12', limbal: '#3B1C08',
  blush: '255,150,170',
};

export class Miel {
  constructor(face) { this.f = face; this.bg = '#000'; this.ink = C.ivory; this.iris = makeIris(); }

  draw(g, st) {
    const P = st.P;
    if (P.blush > 0.02) {
      for (const i of [-1, 1]) {
        const cx = i * 262 + st.lx * 18, cy = 110 + st.ly * 8;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 105);
        rg.addColorStop(0, `rgba(${C.blush},${0.85 * P.blush})`); rg.addColorStop(1, `rgba(${C.blush},0)`);
        g.fillStyle = rg; g.fillRect(cx - 110, cy - 110, 220, 220);
      }
    }
    this._eye(g, st, -1, st.openL); this._eye(g, st, 1, st.openR);
    const sc = P.eyeScale + st.o.eye;
    drawBrows(g, st, { y0: -52 - 144 * sc - 46, color: C.ivoryDim });
    drawMouth(g, st, { y: 214, line: C.ivory, inside: '#24090E', tongue: '#D9667A' });
  }

  _eye(g, st, i, open) {
    const P = st.P, lx = st.lx, ly = st.ly;
    const sx = 1 - 0.09 * lx * i, sc = P.eyeScale + st.o.eye;
    const rx = 118 * sc * sx, ry = 144 * sc, ex = i * 196 + lx * 16, ey = -52 + ly * 10;
    const yl = ey - ry * 1.08 + (1 - open) * ry * 2.16, tilt = P.tilt * ry * 0.42;
    const inner = ex - i * rx * 1.08, outer = ex + i * rx * 1.08, arch = ry * 0.42 * clamp(open, 0, 1);
    const lw = clamp(P.lower, 0, 1), yb = ey + ry * 1.08 - lw * ry * 0.95;
    const upperLid = () => { g.moveTo(inner, yl + tilt); g.quadraticCurveTo(ex, yl - arch, outer, yl - tilt); };
    const closed = clamp(1 - open * 5, 0, 1);
    if (yb - (yl - arch) > 2 && open > 0.02) {
      g.save();
      g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.clip();
      g.beginPath(); upperLid(); g.lineTo(outer, yb); g.quadraticCurveTo(ex, yb - lw * ry * 0.55, inner, yb); g.closePath(); g.clip();
      const sg = g.createRadialGradient(ex - rx * 0.25, ey - ry * 0.3, ry * 0.1, ex, ey, ry * 1.02);
      sg.addColorStop(0, C.scleraIn); sg.addColorStop(0.72, C.scleraOut); sg.addColorStop(1, C.scleraEdge);
      g.fillStyle = sg; g.fillRect(ex - rx, ey - ry, 2 * rx, 2 * ry);
      const ri = rx * 0.64 / sx * 0.98, ix = ex + lx * rx * 0.36, iy = ey + ly * ry * 0.3;
      g.save(); g.translate(ix, iy); g.scale(sx * (1 - Math.abs(lx) * 0.06), 1 - Math.abs(ly) * 0.05);
      g.drawImage(this.iris, -ri, -ri, 2 * ri, 2 * ri);
      const pr = ri * 0.42 * clamp(P.pupil, 0.55, 1.5);
      const pg = g.createRadialGradient(0, 0, pr * 0.6, 0, 0, pr * 1.08);
      pg.addColorStop(0, '#050201'); pg.addColorStop(1, 'rgba(5,2,1,0)');
      g.fillStyle = pg; g.beginPath(); g.arc(0, 0, pr * 1.08, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath(); g.ellipse(ix - ri * 0.36, iy - ri * 0.4, ri * 0.2, ri * 0.17, -0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(ix + ri * 0.32, iy + ri * 0.3, ri * 0.075, 0, TAU); g.fill();
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 46; g.beginPath(); upperLid(); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 20; g.beginPath(); upperLid(); g.stroke();
      g.restore();
    }
    if (closed > 0.01) {
      g.strokeStyle = `rgba(243,235,221,${0.9 * closed})`; g.lineWidth = 10; g.lineCap = 'round';
      const yc = ey + ry * 0.35;
      g.beginPath(); g.moveTo(ex - rx * 0.78, yc - tilt * 0.4 * i); g.quadraticCurveTo(ex, yc + ry * 0.32, ex + rx * 0.78, yc + tilt * 0.4 * i); g.stroke();
    }
  }
}

// Iris lisse (dégradé seul) : les fines stries de la 1re version créaient un scintillement quand l'œil bougeait.
function makeIris() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), r = s / 2;
  const rg = g.createRadialGradient(r, r, r * 0.18, r, r, r);
  rg.addColorStop(0, C.irisIn); rg.addColorStop(0.45, C.irisMid); rg.addColorStop(0.86, C.irisOut); rg.addColorStop(1, C.limbal);
  g.fillStyle = rg; g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
  return c;
}
