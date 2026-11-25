import { clamp } from './util.js';

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.just = new Set();
    this.touch = { active: false, id: null, sx: 0, sy: 0, steer: 0, thr: 0 };
    this.gp = { steer: 0, thr: 0, fire: false };
    this.gpPrev = [];
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.just.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    const t = this.touch;
    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (t.active) return;
        const p = e.changedTouches[0];
        t.active = true;
        t.id = p.identifier;
        t.sx = p.clientX;
        t.sy = p.clientY;
        t.steer = 0;
        t.thr = 0;
        this.just.add('Touch');
      },
      { passive: false }
    );
    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const p of e.changedTouches) {
          if (p.identifier !== t.id) continue;
          t.steer = clamp((p.clientX - t.sx) / 45, -1, 1);
          t.thr = clamp(-(p.clientY - t.sy) / 60, -1, 1);
        }
      },
      { passive: false }
    );
    const end = (e) => {
      for (const p of e.changedTouches) {
        if (p.identifier !== t.id) continue;
        t.active = false;
        t.id = null;
        t.steer = 0;
        t.thr = 0;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) {
      this.gp.steer = 0;
      this.gp.thr = 0;
      this.gp.fire = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    this.gp.steer = dz(gp.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    this.gp.thr = -dz(gp.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    this.gp.fire = b(0) || b(7);
    const map = { 1: 'GpBomb', 2: 'GpBomb', 4: 'GpPrev', 5: 'GpNext', 9: 'GpStart', 3: 'GpNext' };
    for (const [i, code] of Object.entries(map)) {
      const now = b(+i);
      if (now && !this.gpPrev[i]) this.just.add(code);
      this.gpPrev[i] = now;
    }
    if (b(0) && !this.gpPrev[0]) this.just.add('GpA');
    this.gpPrev[0] = b(0);
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  pressed(...codes) {
    return codes.some((c) => this.just.has(c));
  }

  get steer() {
    let s = 0;
    if (this.down('ArrowLeft', 'KeyA')) s -= 1;
    if (this.down('ArrowRight', 'KeyD')) s += 1;
    if (this.touch.active) s += this.touch.steer;
    s += this.gp.steer;
    return clamp(s, -1, 1);
  }

  get throttle() {
    let s = 0;
    if (this.down('ArrowUp', 'KeyW')) s += 1;
    if (this.down('ArrowDown', 'KeyS')) s -= 1;
    if (this.touch.active) s += this.touch.thr;
    s += this.gp.thr;
    return clamp(s, -1, 1);
  }

  get fire() {
    return this.down('Space', 'KeyJ', 'KeyZ') || this.touch.active || this.gp.fire;
  }

  endFrame() {
    this.just.clear();
  }
}
