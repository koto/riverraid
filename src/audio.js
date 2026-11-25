// Fully synthesized WebAudio sound effects + a small procedural music sequencer.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('rr_muted') === '1';
    this.musicOn = localStorage.getItem('rr_music') !== '0';
    this.last = {};
    this.intensity = 0;
    this.musicTimer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.mus = ctx.createGain();
    this.mus.gain.value = this.musicOn ? 0.3 : 0;
    this.mus.connect(this.master);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this._initEngine();
    this._initLaser();
  }

  get t() {
    return this.ctx.currentTime;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('rr_muted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.t, 0.05);
    return this.muted;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    localStorage.setItem('rr_music', this.musicOn ? '1' : '0');
    if (this.ctx) this.mus.gain.setTargetAtTime(this.musicOn ? 0.3 : 0, this.t, 0.1);
    return this.musicOn;
  }

  _ok(name, gap) {
    if (!this.ctx) return false;
    const now = performance.now();
    if (gap && this.last[name] && now - this.last[name] < gap * 1000) return false;
    this.last[name] = now;
    return true;
  }

  _osc(type, f0, f1, t, dur, vol, dest = this.sfx, filter = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, filter * 0.25), t + dur);
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    this._osc(type, f0, f1, this.t + delay, dur, vol);
  }

  noise(dur, vol, f0, f1, ftype = 'lowpass', q = 1, delay = 0, dest = this.sfx) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.t + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ continuous
  _initEngine() {
    const c = this.ctx;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engFilter.Q.value = 2;
    this.engO1 = c.createOscillator();
    this.engO1.type = 'sawtooth';
    this.engO1.frequency.value = 70;
    this.engO2 = c.createOscillator();
    this.engO2.type = 'square';
    this.engO2.frequency.value = 104;
    const o2g = c.createGain();
    o2g.gain.value = 0.4;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    nf.Q.value = 0.8;
    this.engNoiseF = nf;
    const ng = c.createGain();
    ng.gain.value = 1.2;
    this.engO1.connect(this.engFilter);
    this.engO2.connect(o2g);
    o2g.connect(this.engFilter);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(this.engGain);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.sfx);
    this.engO1.start();
    this.engO2.start();
    n.start();
  }

  engine(on, speedNorm = 0.5) {
    if (!this.ctx) return;
    const t = this.t;
    this.engGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.15);
    this.engO1.frequency.setTargetAtTime(55 + speedNorm * 55, t, 0.1);
    this.engO2.frequency.setTargetAtTime(82 + speedNorm * 80, t, 0.1);
    this.engFilter.frequency.setTargetAtTime(300 + speedNorm * 900, t, 0.1);
    this.engNoiseF.frequency.setTargetAtTime(600 + speedNorm * 1400, t, 0.1);
  }

  _initLaser() {
    const c = this.ctx;
    this.lzGain = c.createGain();
    this.lzGain.gain.value = 0;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 140;
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 283;
    const lfo = c.createOscillator();
    lfo.frequency.value = 18;
    const lfoG = c.createGain();
    lfoG.gain.value = 30;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.5;
    o1.connect(f);
    o2.connect(f);
    f.connect(this.lzGain);
    this.lzGain.connect(this.sfx);
    o1.start();
    o2.start();
    lfo.start();
    this.lzOn = false;
  }

  laser(on) {
    if (!this.ctx || on === this.lzOn) return;
    this.lzOn = on;
    this.lzGain.gain.setTargetAtTime(on ? 0.07 : 0, this.t, 0.03);
  }

  // ------------------------------------------------------------ one-shots
  vulcan() {
    if (!this._ok('vulcan', 0.05)) return;
    this.tone('square', 1300, 320, 0.05, 0.035);
    this.noise(0.04, 0.04, 5000, 1500, 'highpass');
  }
  spread() {
    if (!this._ok('spread', 0.08)) return;
    this.tone('sawtooth', 700, 160, 0.12, 0.05);
    this.noise(0.08, 0.05, 3000, 600, 'bandpass', 2);
  }
  missile() {
    if (!this._ok('missile', 0.1)) return;
    this.noise(0.4, 0.09, 400, 3500, 'bandpass', 2);
  }
  hit() {
    if (!this._ok('hit', 0.035)) return;
    this.noise(0.05, 0.06, 3000, 900, 'bandpass', 3);
  }
  explosion(size = 1) {
    if (!this._ok('expl' + Math.round(size), 0.04)) return;
    const s = Math.min(size, 3);
    this.noise(0.45 + 0.3 * s, Math.min(0.5, 0.22 * s + 0.1), 1800, 50, 'lowpass', 0.7);
    this.tone('sine', 110, 28, 0.35 + 0.15 * s, 0.25);
  }
  bigBoom() {
    if (!this._ok('big', 0.1)) return;
    this.noise(2.0, 0.6, 2500, 30, 'lowpass', 0.6);
    this.tone('sine', 90, 20, 1.4, 0.45);
    this.noise(0.8, 0.3, 800, 60, 'lowpass', 1, 0.25);
  }
  pickup() {
    if (!this._ok('pickup', 0.05)) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.09, i * 0.05));
  }
  weaponUp() {
    if (!this._ok('wup', 0.05)) return;
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f * 1.01, 0.12, 0.05, i * 0.04));
    this.tone('sawtooth', 200, 1200, 0.35, 0.04);
  }
  refuel(fuel) {
    if (!this._ok('refuel', 0.11)) return;
    const f = 300 + fuel * 7;
    this.tone('sine', f, f * 1.05, 0.1, 0.06);
  }
  alarm() {
    if (!this._ok('alarm', 0.7)) return;
    this.tone('square', 880, 880, 0.12, 0.05);
    this.tone('square', 660, 660, 0.12, 0.05, 0.16);
  }
  bump() {
    if (!this._ok('bump', 0.12)) return;
    this.noise(0.18, 0.25, 900, 100);
    this.tone('sine', 1500, 500, 0.15, 0.08);
  }
  shieldHit() {
    if (!this._ok('shit', 0.06)) return;
    this.tone('sine', 1700, 500, 0.18, 0.1);
  }
  bombLaunch() {
    this.tone('sawtooth', 180, 900, 0.45, 0.07);
  }
  bomb() {
    this.noise(1.8, 0.6, 4000, 30, 'lowpass', 0.6);
    this.tone('sine', 80, 18, 1.4, 0.5);
    this.tone('sawtooth', 1200, 60, 0.9, 0.08);
  }
  playerDie() {
    this.explosion(3);
    this.tone('sawtooth', 500, 40, 1.3, 0.12);
  }
  bossWarn() {
    for (let i = 0; i < 3; i++) {
      this.tone('sawtooth', 320, 640, 0.45, 0.09, i * 0.6);
      this.tone('sawtooth', 640, 320, 0.15, 0.06, i * 0.6 + 0.45);
    }
  }
  jetFlyby() {
    if (!this._ok('jet', 0.3)) return;
    this.noise(1.6, 0.16, 250, 2800, 'bandpass', 1.5);
  }
  droneCharge() {
    if (!this._ok('drone', 0.2)) return;
    this.tone('square', 220, 1000, 0.4, 0.04);
  }
  enemyShot() {
    if (!this._ok('eshot', 0.06)) return;
    this.tone('square', 520, 240, 0.09, 0.025);
  }
  click() {
    this.tone('triangle', 900, 1200, 0.06, 0.06);
  }
  extraLife() {
    [659, 784, 988, 1318, 988, 1318].forEach((f, i) => this.tone('square', f, f, 0.1, 0.06, i * 0.08));
  }
  checkpoint() {
    [523, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.08, i * 0.1));
  }

  // ------------------------------------------------------------ music
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextT = this.t + 0.1;
    this.musicTimer = setInterval(() => this._sched(), 25);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  _sched() {
    if (!this.ctx) return;
    const spb = 60 / 132 / 4;
    while (this.nextT < this.t + 0.12) {
      this._playStep(this.step, this.nextT);
      this.nextT += spb;
      this.step++;
    }
  }

  _playStep(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const st = s % 16;
    const roots = [55, 43.65, 65.41, 49.0];
    const chords = [
      [440, 523.3, 659.3],
      [349.2, 440, 523.3],
      [523.3, 659.3, 784],
      [392, 493.9, 587.3],
    ];
    const m = this.mus;
    if (st % 4 === 0) this._osc('sine', 150, 40, t, 0.22, 0.6, m);
    if (st % 2 === 1) this._hat(t, st % 4 === 3 ? 0.06 : 0.03);
    if (st === 4 || st === 12) this._snare(t);
    const bp = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 2, 1];
    if (bp[st]) this._osc('sawtooth', roots[bar] * bp[st] * (st === 6 ? 2 : 1), roots[bar] * bp[st] * (st === 6 ? 2 : 1), t, 0.16, 0.22, m, 900);
    const phrase = Math.floor(s / 64) % 4;
    if (this.intensity > 0 || phrase >= 2) {
      const ch = chords[bar];
      const n = ch[st % 3] * (st % 8 < 4 ? 1 : 2);
      this._osc('square', n, n, t, 0.09, this.intensity > 0 ? 0.05 : 0.03, m, 3000);
    }
    if (phrase === 1 && st % 8 === 0) {
      const ch = chords[bar];
      for (const f of ch) this._osc('triangle', f / 2, f / 2, t, 0.5, 0.04, m);
    }
  }

  _hat(t, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.mus);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }

  _snare(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(f);
    f.connect(g);
    g.connect(this.mus);
    src.start(t, Math.random());
    src.stop(t + 0.18);
    this._osc('triangle', 220, 120, t, 0.1, 0.2, this.mus);
  }
}
