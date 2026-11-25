import { CFG, isBossSector } from './config.js';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';

const DZ = CFG.DZ;

/**
 * Procedural river. Distance d = -z (the player flies towards -z).
 * For every sample we store the channel centre (cx), half width (hw) and
 * the half width of an optional island in the middle (iw).
 */
export class River {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.cx = [];
    this.hw = [];
    this.iw = [];
    this.seg = null;
    this.n = 0;
    this._s = { cx: 0, hw: 0, iw: 0 };
  }

  ensure(d) {
    while (this.n * DZ <= d + DZ * 2) this._step();
  }

  _newSeg(d) {
    const r = this.rng;
    const from = this.seg ? this.seg.to : { cx: 0, hw: 32, iw: 0 };
    const len = 60 + r() * 120;
    let hw = 15 + r() * 28;
    if (r() < 0.18) hw = 10.5 + r() * 3; // narrow passage
    const maxShift = Math.min(38, len * 0.32);
    let cx = clamp(from.cx + (r() * 2 - 1) * maxShift, -60, 60);
    let iw = 0;
    if (hw > 28 && r() < 0.5) iw = 3 + r() * (hw - 22);
    if (d < 160) { hw = 32; cx = 0; iw = 0; }
    // Fairness: limit how fast channel edges can move (edge slope <= ~0.5 with smoothstep)
    const budget = len * 0.34;
    let dcx = cx - from.cx;
    if (Math.abs(dcx) > budget * 0.7) dcx = Math.sign(dcx) * budget * 0.7;
    cx = from.cx + dcx;
    const rest = Math.max(0, budget - Math.abs(dcx));
    const dhw = clamp(hw - from.hw, -rest, rest);
    hw = from.hw + dhw;
    const diw = clamp(iw - from.iw, -rest, rest);
    iw = from.iw + diw;
    this.seg = { start: d, end: d + len, from, to: { cx, hw, iw } };
  }

  _step() {
    const d = this.n * DZ;
    if (!this.seg || d >= this.seg.end) this._newSeg(d);
    const s = this.seg;
    const t = smoothstep(s.start, s.end, d);
    let cx = lerp(s.from.cx, s.to.cx, t);
    let hw = lerp(s.from.hw, s.to.hw, t);
    let iw = lerp(s.from.iw, s.to.iw, t);

    const S = CFG.SECTOR_LEN;
    // narrow, island-free stretch around every bridge
    const k = Math.round(d / S);
    if (k >= 1) {
      const dist = Math.abs(d - k * S);
      const b = 1 - smoothstep(25, 150, dist);
      hw = lerp(hw, CFG.BRIDGE_HW, b);
      iw = lerp(iw, 0, clamp(b * 2, 0, 1));
    }
    // wide arena for boss fights
    const kb = Math.ceil(d / S);
    if (isBossSector(kb)) {
      const c = kb * S - CFG.BOSS_OFFSET;
      const b = 1 - smoothstep(110, 240, Math.abs(d - c));
      hw = lerp(hw, 42, b);
      iw = lerp(iw, 0, clamp(b * 2, 0, 1));
      cx = lerp(cx, clamp(cx, -25, 25), b);
    }
    iw = Math.min(iw, hw - 15);
    if (iw < 1.2) iw = 0;
    this.cx.push(cx);
    this.hw.push(hw);
    this.iw.push(iw);
    this.n++;
  }

  sampleD(d, out = this._s) {
    if (d < 0) d = 0;
    this.ensure(d);
    const f = d / DZ;
    const i = Math.floor(f);
    const t = f - i;
    out.cx = lerp(this.cx[i], this.cx[i + 1], t);
    out.hw = lerp(this.hw[i], this.hw[i + 1], t);
    out.iw = lerp(this.iw[i], this.iw[i + 1], t);
    return out;
  }

  sample(z, out) {
    return this.sampleD(-z, out);
  }

  /** >0: over land (distance to water), <0: over water (distance to nearest bank). */
  landDist(x, z) {
    const s = this.sampleD(-z);
    const ax = Math.abs(x - s.cx);
    let e = ax - s.hw;
    if (s.iw > 0) e = Math.max(e, s.iw - ax);
    return e;
  }

  channels(z) {
    const s = this.sampleD(-z);
    if (s.iw > 0) return [[s.cx - s.hw, s.cx - s.iw], [s.cx + s.iw, s.cx + s.hw]];
    return [[s.cx - s.hw, s.cx + s.hw]];
  }

  /** Writes RGBA = (cx, hw, iw, 0) samples starting at distance d0 into data. */
  fill(data, d0, count) {
    const i0 = Math.round(d0 / DZ);
    this.ensure((i0 + count + 2) * DZ);
    for (let i = 0; i < count; i++) {
      const j = i0 + i;
      data[i * 4] = this.cx[j];
      data[i * 4 + 1] = this.hw[j];
      data[i * 4 + 2] = this.iw[j];
      data[i * 4 + 3] = 0;
    }
  }
}
