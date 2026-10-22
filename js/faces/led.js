// Visage « Rétro » : écran de LED ambrées. Les formes sont dessinées dans une petite image (1 pixel = 1 LED),
// puis chaque LED s'allume selon l'intensité de son pixel : mouvements fluides, aspect rétro.
import { lightShapes } from './lumiere.js';

const AMBER = '#FFB040';

export class Led {
  constructor(face) {
    this.f = face; this.bg = '#070302'; this.ink = AMBER; this.listenRGB = '255,176,64'; this.maxFps = 30;
    this.mask = document.createElement('canvas'); this.mx = this.mask.getContext('2d', { willReadFrequently: true });
    this.tint = document.createElement('canvas');
    this.board = document.createElement('canvas'); this.sprite = document.createElement('canvas');
  }
  resize() {
    const W = this.f.W, H = this.f.H, c = this.c = Math.max(8, Math.round(W / 58));
    this.cols = Math.ceil(W / c); this.rows = Math.ceil(H / c);
    this.mask.width = this.tint.width = this.cols; this.mask.height = this.tint.height = this.rows;
    // Panneau : toutes les LED éteintes (dessiné une seule fois)
    this.board.width = W; this.board.height = H;
    const b = this.board.getContext('2d'); b.fillStyle = this.bg; b.fillRect(0, 0, W, H);
    b.fillStyle = '#1E1006';
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) { b.beginPath(); b.arc((x + 0.5) * c, (y + 0.5) * c, c * 0.33, 0, Math.PI * 2); b.fill(); }
    // LED allumée (avec petit halo)
    const s = this.sprite; s.width = s.height = c * 2; const sg = s.getContext('2d');
    const rg = sg.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, '#FFF1C8'); rg.addColorStop(0.28, AMBER); rg.addColorStop(0.36, 'rgba(255,150,40,0.55)'); rg.addColorStop(1, 'rgba(255,120,20,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 2 * c, 2 * c);
  }
  draw(g, st) {
    const m = this.mx, c = this.c, k = 1 / c;
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, this.cols, this.rows);
    m.setTransform(st.S * k, 0, 0, st.S * k, st.cx * k, st.cy * k); m.translate(st.hx, st.hy); m.rotate(st.rot);
    m.fillStyle = m.strokeStyle = '#fff'; lightShapes(m, st, { lw: 2 });
    const d = m.getImageData(0, 0, this.cols, this.rows).data;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.board, 0, 0);
    for (let y = 0, p = 3; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++, p += 4) {
        const v = d[p] / 255; if (v < 0.06) continue;
        g.globalAlpha = Math.min(1, v * 1.15); g.drawImage(this.sprite, x * c - c / 2, y * c - c / 2);
      }
    }
    // Lueur d'ensemble
    const t = this.tint.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, this.cols, this.rows); t.drawImage(this.mask, 0, 0);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = '#FF8A1E'; t.fillRect(0, 0, this.cols, this.rows);
    g.globalAlpha = 0.28; g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.tint, 0, 0, this.cols * c, this.rows * c);
    g.restore();
  }
}
