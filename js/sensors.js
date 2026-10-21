// Wilson — capteurs de la tablette : toucher, secousses, batterie, réseau.

export class Sensors {
  constructor(el) {
    this.el = el; this.h = {};
    this._down = null; this._lastTap = 0; this._longTimer = null;
    el.addEventListener('pointerdown', (e) => this._pd(e));
    el.addEventListener('pointerup', (e) => this._pu(e));
    el.addEventListener('pointercancel', () => clearTimeout(this._longTimer));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('online', () => this._emit('network', true));
    addEventListener('offline', () => this._emit('network', false));
  }
  on(ev, fn) { this.h[ev] = fn; }
  _emit(ev, ...a) { this.h[ev] && this.h[ev](...a); }

  _pd(e) {
    this._down = { x: e.clientX, y: e.clientY, t: performance.now() };
    clearTimeout(this._longTimer);
    this._longTimer = setTimeout(() => { this._down = null; this._emit('longpress'); }, 1500);
  }
  _pu(e) {
    clearTimeout(this._longTimer);
    if (!this._down) return;
    const d = this._down; this._down = null;
    if (performance.now() - d.t > 600) return;
    const now = performance.now();
    const nx = (e.clientX / innerWidth - 0.5) * 2, ny = (e.clientY / innerHeight - 0.5) * 2;
    if (now - this._lastTap < 320) { this._lastTap = 0; this._emit('doubletap', nx, ny); }
    else { this._lastTap = now; setTimeout(() => { if (this._lastTap === now) this._emit('tap', nx, ny); }, 330); }
  }

  async startMotion() {
    // Secousse ou tablette déplacée.
    let last = null, cooldown = 0;
    addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
      const v = [a.x, a.y, a.z];
      if (last) {
        const d = Math.hypot(v[0] - last[0], v[1] - last[1], v[2] - last[2]);
        const now = performance.now();
        if (d > 6 && now > cooldown) { cooldown = now + 3000; this._emit('shake', d); }
      }
      last = v;
    });
  }

  async startBattery() {
    if (!navigator.getBattery) return;
    try {
      const b = await navigator.getBattery();
      const report = () => this._emit('battery', { level: b.level, charging: b.charging });
      b.addEventListener('chargingchange', report); b.addEventListener('levelchange', report); report();
    } catch (_) {}
  }
}
