import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG, POWERUPS, WEAPON_ORDER, isBossSector, randomDrop } from './config.js';
import { River } from './river.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Environment } from './environment.js';
import { Effects } from './effects.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import * as E from './entities.js';
import { prewarmModels, hdr } from './models.js';
import { clamp, lerp, mulberry32, wrapAngle } from './util.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.params = new URLSearchParams(location.search);
    this.god = this.params.has('god');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2200);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.65, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.env = new Environment(this.scene, r);
    this.effects = new Effects(this.scene);
    this.audio = new AudioSys();
    this.input = new Input(canvas);
    this.hud = new HUD(this);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    prewarmModels();

    // enemy bullets
    this.eBullets = [];
    const ebGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const ebMat = new THREE.MeshBasicMaterial({ color: hdr(0xff1a50, 3) });
    const ehGeo = new THREE.OctahedronGeometry(0.8, 0);
    const ehMat = new THREE.MeshBasicMaterial({ color: hdr(0xff2ad0, 2.6) });
    this.ebPool = { n: [], h: [] };
    this.ebMake = { n: () => new THREE.Mesh(ebGeo, ebMat), h: () => new THREE.Mesh(ehGeo, ehMat) };

    this.entities = [];
    this.timers = [];
    this.state = 'menu';
    this.time = 0;
    this.shake = 0;
    this.camPos = new THREE.Vector3(0, 30, 30);
    this.camLook = new THREE.Vector3();
    this.hiscore = +localStorage.getItem('rr_hiscore') || 0;
    this.score = 0;
    this.lives = CFG.START_LIVES;
    this.combo = 0;
    this.mult = 1;
    this.lastKill = -10;
    this.boss = null;
    this.refueling = false;

    addEventListener('resize', () => this.resize());
    this.resize();
    this.newWorld(+this.params.get('seed') || 1 + Math.floor(Math.random() * 1e6));
    this.updateCamera(1, true);
    this.lastT = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    window.__game = this;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the river visible on portrait screens
    this.baseFov = w / h < 1 ? 70 : 55;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // ------------------------------------------------------------------ world
  newWorld(seed) {
    this.seed = seed;
    for (const e of this.entities) e.dispose();
    this.entities = [];
    this.clearEnemyBullets(false);
    this.timers = [];
    if (this.terrain) this.terrain.dispose();
    this.river = new River(seed);
    this.terrain = new Terrain(this.scene, this.river, seed % 10000);
    if (this.water) this.water.setRiver(this.river);
    else this.water = new Water(this.scene, this.river);
    this.weapons.reset();
    this.effects.clear();
    this.player.reset();
    this.lastFuelD = 0;
    this.sector = 0;
    this.sectorFloat = 0;
    this.boss = null;
    this.bridges = 0;
    this.spawnEnabled = false;
  }

  startGame() {
    this.audio.init();
    this.newWorld(+this.params.get('seed') || 1 + Math.floor(Math.random() * 1e6));
    this.spawnEnabled = true;
    // spawn into already generated chunks
    this.terrain.dispose();
    this.state = 'playing';
    this.score = 0;
    this.nextLifeAt = CFG.EXTRA_LIFE_EVERY;
    this.lives = CFG.START_LIVES;
    this.combo = 0;
    this.mult = 1;
    this.kills = 0;
    this.player.invuln = 2;
    this.hud.show(true);
    this.showScreen(null);
    this.hud.message('SECTOR 1', 'DESTROY THE BRIDGES · WATCH YOUR FUEL', 3);
    this.audio.startMusic();
    this.audio.intensity = 0;
    this.updateCamera(1, true);
  }

  showScreen(id) {
    for (const s of ['menu', 'pause', 'gameover']) $(s).classList.toggle('hidden', s !== id);
    $('touch').classList.toggle('hidden', !(this.input.isTouch && this.state === 'playing'));
  }

  pause(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.showScreen('pause');
      this.audio.engine(false);
      this.audio.laser(false);
      this.audio.stopMusic();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.showScreen(null);
      this.audio.startMusic();
      this.lastT = performance.now();
    }
  }

  gameOver() {
    this.state = 'gameover';
    this.audio.engine(false);
    this.audio.laser(false);
    this.audio.stopMusic();
    const best = !this.god && this.score > this.hiscore;
    if (best) {
      this.hiscore = this.score;
      localStorage.setItem('rr_hiscore', String(this.score));
    }
    $('go-score').textContent = this.score.toLocaleString('en-US');
    $('go-best').textContent = this.hiscore.toLocaleString('en-US');
    $('go-sector').textContent = this.sector + 1;
    $('go-bridges').textContent = this.bridges;
    $('go-kills').textContent = this.kills;
    $('go-new').classList.toggle('hidden', !best);
    this.hud.show(false);
    this.showScreen('gameover');
    this.weapons.reset();
  }

  toMenu() {
    this.state = 'menu';
    this.audio.stopMusic();
    this.audio.engine(false);
    this.hud.show(false);
    this.newWorld(1 + Math.floor(Math.random() * 1e6));
    $('menu-hi').textContent = this.hiscore.toLocaleString('en-US');
    this.showScreen('menu');
    this.updateCamera(1, true);
  }

  later(t, fn) {
    this.timers.push({ t, fn });
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    requestAnimationFrame(this.frame);
    const now = performance.now(); const dt = Math.min((now - this.lastT) / 1000, 0.05); this.lastT = now;
    this.input.poll();
    this.globalInput();
    if (this.state !== 'paused') this.update(dt);
    this.input.endFrame();
    this.composer.render();
  }

  globalInput() {
    const i = this.input;
    if (i.pressed('KeyM')) $('opt-sound').textContent = this.audio.toggleMute() ? 'SOUND: OFF' : 'SOUND: ON';
    if (i.pressed('KeyN')) $('opt-music').textContent = this.audio.toggleMusic() ? 'MUSIC: ON' : 'MUSIC: OFF';
    if (this.state === 'menu' || this.state === 'gameover') {
      if (i.pressed('Enter', 'GpStart', 'GpA') || (this.state === 'menu' && i.pressed('Space'))) this.startGame();
      return;
    }
    if (i.pressed('Escape', 'KeyP', 'GpStart')) {
      this.pause(this.state === 'playing');
      return;
    }
    if (this.state !== 'playing') return;
    const p = this.player;
    if (i.pressed('KeyB', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyK', 'GpBomb')) this.weapons.launchBomb();
    const owned = WEAPON_ORDER.filter((w) => p.weapons[w]);
    let dir = 0;
    if (i.pressed('KeyE', 'Tab', 'GpNext')) dir = 1;
    if (i.pressed('KeyQ', 'GpPrev')) dir = -1;
    if (dir && owned.length > 1) {
      const idx = owned.indexOf(p.current);
      p.current = owned[(idx + dir + owned.length) % owned.length];
      this.audio.click();
    }
    WEAPON_ORDER.forEach((w, k) => {
      if (i.pressed('Digit' + (k + 1)) && p.weapons[w] && p.current !== w) {
        p.current = w;
        this.audio.click();
      }
    });
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    const playing = this.state === 'playing';
    const wdt = dt * (p.slowmo > 0 ? 0.45 : 1);

    for (let k = this.timers.length - 1; k >= 0; k--) {
      const t = this.timers[k];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(k, 1);
        t.fn();
      }
    }

    if (playing) p.update(dt, this.input);
    else this.autopilot(dt);

    if (this.boss && this.boss.alive && this.boss.active && p.z < this.boss.z + CFG.BOSS_LOCK) {
      p.z = this.boss.z + CFG.BOSS_LOCK;
      p.speed = Math.min(p.speed, CFG.SPEED_BASE);
    }

    const pd = -p.z;
    const created = this.terrain.update(pd);
    if (this.spawnEnabled) for (const c of created) this.spawnChunk(c);
    this.water.update(pd, this.time);

    for (const e of this.entities) {
      if (!e.alive) continue;
      e.tick(wdt);
      if (e.alive && e.ahead < -45 && e.kind !== 'boss') e.dispose();
    }
    this.entities = this.entities.filter((e) => e.alive);

    this.refueling = false;
    this.weapons.update(dt, playing && this.input.fire);
    if (playing && p.alive) this.checkCollisions(dt);
    this.updateEnemyBullets(wdt);
    this.effects.update(dt);

    // sectors
    this.sectorFloat = pd / CFG.SECTOR_LEN;
    const sec = Math.floor(this.sectorFloat);
    if (sec > this.sector) {
      this.sector = sec;
      if (playing) {
        const boss = isBossSector(sec + 1) ? ' · BOSS AHEAD' : '';
        this.hud.message(`SECTOR ${sec + 1}`, this.env.name + boss, 2.5);
      }
    }
    this.env.update(this.sectorFloat, p, this.camera, this.water);
    this.updateCamera(dt);
    if (playing || this.state === 'paused') {
      this.audio.engine(p.alive, (p.speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN));
    }
    this.hud.update(dt);
  }

  autopilot(dt) {
    const p = this.player;
    p.t += dt;
    const tx = this.nearestChannelX(p.x, p.z - 30, 6);
    const want = clamp((tx - p.x) / 8, -1, 1);
    p.vx += (want * CFG.STRAFE * 0.8 - p.vx) * Math.min(1, dt * 4);
    p.x += p.vx * dt;
    p.speed = CFG.SPEED_BASE;
    p.z -= p.speed * dt;
    p.alive = this.state !== 'gameover';
    p.updateVisual(dt);
  }

  updateCamera(dt, snap = false) {
    const p = this.player;
    const sp = p.speed - CFG.SPEED_BASE;
    const rc = this.river.sample(p.z - 20).cx;
    const tgt = new THREE.Vector3(rc + (p.x - rc) * 0.6, 25 + sp * 0.03, p.z + 25 + sp * 0.08);
    const look = new THREE.Vector3(rc + (p.x - rc) * 0.8, 0, p.z - 36);
    if (snap) {
      this.camPos.copy(tgt);
      this.camLook.copy(look);
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.camPos.lerp(tgt, k);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 8));
      this.camPos.z = Math.min(this.camPos.z, p.z + 32);
    }
    const s = this.shake * this.shake * 1.2;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * s,
      this.camPos.y + (Math.random() - 0.5) * s,
      this.camPos.z + (Math.random() - 0.5) * s
    );
    this.camera.lookAt(this.camLook);
    const fov = this.baseFov + clamp(sp, -20, 40) * 0.12;
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, snap ? 1 : Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ helpers
  nearestChannelX(x, z, margin = 3) {
    let best = x, bd = Infinity;
    for (const [a, b] of this.river.channels(z)) {
      const lo = a + margin, hi = b - margin;
      const cx = lo > hi ? (a + b) / 2 : clamp(x, lo, hi);
      const d = Math.abs(cx - x);
      if (d < bd) {
        bd = d;
        best = cx;
      }
    }
    return best;
  }

  findTarget(x, z) {
    let best = null, bs = Infinity;
    for (const e of this.entities) {
      if (!e.alive || !e.hittable || e.ahead > 170 || e.z > z + 4) continue;
      if (e.kind === 'fuel' || e.kind === 'bridge') continue;
      const dx = e.x - x, dz = e.z - z;
      const s = dx * dx * 2 + dz * dz;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    if (!best) {
      for (const e of this.entities) {
        if (!e.alive || !e.hittable || e.ahead > 170 || e.z > z + 4) continue;
        const dx = e.x - x, dz = e.z - z;
        const s = dx * dx * 2 + dz * dz;
        if (s < bs) {
          bs = s;
          best = e;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ spawning
  spawnChunk(c) {
    const S = CFG.SECTOR_LEN, CL = CFG.CHUNK_LEN, OFF = CFG.BOSS_OFFSET;
    const d0 = c * CL, d1 = d0 + CL;
    if (d1 <= 0) return;
    const rng = mulberry32(this.seed * 31 + c * 7919 + 17);
    for (let k = Math.max(1, Math.floor(d0 / S)); k <= Math.floor(d1 / S) + 1; k++) {
      const bd = k * S;
      if (bd >= d0 && bd < d1) this.entities.push(new E.Bridge(this, -bd, k));
      const bossD = k * S - OFF;
      if (isBossSector(k) && bossD >= d0 && bossD < d1) this.entities.push(new E.Boss(this, -bossD, k / CFG.BOSS_EVERY - 1));
    }
    if (d1 < 230) return;
    let d = Math.max(d0, 230) + rng() * 8;
    while (d < d1) {
      const k = Math.round(d / S);
      const kb = Math.ceil(d / S);
      const nearBridge = k >= 1 && Math.abs(d - k * S) < 32;
      const inArena = isBossSector(kb) && d > kb * S - OFF - 230 && d < kb * S - OFF + 75;
      if (nearBridge || inArena) {
        d += 12;
        continue;
      }
      const sector = Math.floor(d / S);
      const diff = clamp(sector / 8, 0, 1);
      const z = -d;
      const forceFuel = d - this.lastFuelD > 185;
      let type = 'fuel';
      if (!forceFuel) {
        const w = [
          ['fuel', 0.14],
          ['ship', 0.27],
          ['heli', 0.27],
          ['jet', sector >= 1 ? 0.08 : 0.02],
          ['turret', sector >= 1 ? 0.13 : 0],
          ['drone', sector >= 2 ? 0.1 : 0],
          ['powerup', 0.05],
        ];
        let r = rng() * w.reduce((s, [, v]) => s + v, 0);
        for (const [t, v] of w) {
          r -= v;
          if (r < 0) {
            type = t;
            break;
          }
        }
      }
      const ch = this.river.channels(z);
      const [a, b] = ch[Math.floor(rng() * ch.length)];
      const x = a + 4 + rng() * Math.max(0, b - a - 8);
      switch (type) {
        case 'fuel':
          this.entities.push(new E.FuelDepot(this, x, z));
          this.lastFuelD = d;
          break;
        case 'ship':
          this.entities.push(new E.Ship(this, x, z, diff, rng));
          break;
        case 'heli':
          this.entities.push(new E.Heli(this, x, z, diff, rng));
          break;
        case 'jet':
          this.entities.push(new E.Jet(this, x, z, diff, rng));
          break;
        case 'drone':
          this.entities.push(new E.Drone(this, x, z, diff, rng));
          break;
        case 'powerup':
          this.entities.push(new E.Powerup(this, x, z, randomDrop(rng)));
          break;
        case 'turret': {
          const s = this.river.sample(z);
          const side = rng() < 0.5 ? -1 : 1;
          const tx = s.iw > 9 && rng() < 0.4 ? s.cx : s.cx + side * (s.hw + 5 + rng() * 12);
          const ty = this.terrain.height(tx, d);
          if (ty > 0.5 && ty < 24 && this.river.landDist(tx, z) > 3) this.entities.push(new E.Turret(this, tx, z, ty, diff, rng));
          break;
        }
      }
      d += lerp(34, 17, diff) + rng() * lerp(26, 14, diff);
    }
  }

  spawnPowerup(x, z, type) {
    const nx = this.nearestChannelX(x, z, 4);
    this.entities.push(new E.Powerup(this, nx, z, type));
  }

  // ------------------------------------------------------------------ enemy fire
  enemyFire(x, y, z, opts = {}) {
    const p = this.player;
    if (!p.alive) return;
    const speed = opts.speed || 44 + clamp(this.sector / 8, 0, 1) * 32;
    let tx = p.x, tz = p.z;
    const dist = Math.hypot(tx - x, tz - z);
    const t = dist / (speed + p.speed);
    tx += p.vx * t * 0.8;
    tz -= p.speed * t;
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    this.spawnEnemyBullet(x, y, z, (dx / l) * speed, (dz / l) * speed, opts);
    this.audio.enemyShot();
  }

  spawnEnemyBullet(x, y, z, vx, vz, opts = {}) {
    const kind = opts.homing ? 'h' : 'n';
    const m = this.ebPool[kind].pop() || this.ebMake[kind]();
    this.scene.add(m);
    m.position.set(x, y, z);
    this.eBullets.push({ x, y, z, vx, vz, kind, mesh: m, life: opts.life || 4, homing: !!opts.homing, t: 0 });
  }

  destroyEnemyBullet(j, fx) {
    const b = this.eBullets[j];
    if (fx) {
      this.effects.explosion(b.x, b.y, b.z, 0.35, 0xff40d0);
      this.audio.hit();
    }
    this.scene.remove(b.mesh);
    this.ebPool[b.kind].push(b.mesh);
    this.eBullets.splice(j, 1);
  }

  clearEnemyBullets(fx) {
    for (const b of this.eBullets) {
      if (fx) this.effects.sparks(b.x, b.y, b.z, 4, 0xff6655, 8);
      this.scene.remove(b.mesh);
      this.ebPool[b.kind].push(b.mesh);
    }
    this.eBullets.length = 0;
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (let i = this.eBullets.length - 1; i >= 0; i--) {
      const b = this.eBullets[i];
      b.life -= dt;
      b.t += dt;
      if (b.homing && b.t > 0.4 && b.t < 2.2 && p.alive) {
        const sp = Math.hypot(b.vx, b.vz);
        let ang = Math.atan2(b.vx, b.vz);
        const diff = wrapAngle(Math.atan2(p.x - b.x, p.z - b.z) - ang);
        ang += clamp(diff, -1.25 * dt, 1.25 * dt);
        const ns = Math.min(46, sp + 16 * dt);
        b.vx = Math.sin(ang) * ns;
        b.vz = Math.cos(ang) * ns;
        b.mesh.rotation.y += dt * 8;
        if (Math.random() < 0.5) this.effects.trail(b.x, b.y, b.z, 3, 0.4, 2.5, 1, 0.25);
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y += (CFG.PLAYER_Y - b.y) * Math.min(1, dt * 3);
      b.mesh.position.set(b.x, b.y, b.z);
      let remove = b.life <= 0 || b.z > p.z + 30;
      if (!remove && p.alive && this.state === 'playing') {
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz < 1.9 * 1.9) {
          remove = true;
          if (p.shield > 0) {
            this.effects.sparks(b.x, b.y, b.z, 10, 0x66bbff, 12);
            this.audio.shieldHit();
          } else this.killPlayer('shot');
        }
      }
      if (remove) {
        this.scene.remove(b.mesh);
        this.ebPool[b.kind].push(b.mesh);
        this.eBullets.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ collisions
  checkCollisions(dt) {
    const p = this.player;
    const W = 2.0;
    const r = this.river;
    const land = Math.max(r.landDist(p.x - W, p.z), r.landDist(p.x + W, p.z), r.landDist(p.x, p.z - 3.5));
    if (land > 0) {
      if (p.shield > 0 || p.invuln > 0 || this.god) {
        const cx = this.nearestChannelX(p.x, p.z, 4);
        const dir = Math.sign(cx - p.x) || 1;
        p.x += dir * Math.min(Math.abs(cx - p.x), 40 * dt + land);
        p.vx = dir * 25;
        this.effects.sparks(p.x - dir * 2, CFG.PLAYER_Y, p.z, 6, 0x66bbff, 10);
        this.audio.bump();
        if (p.shield > 0) p.shield = Math.max(0.01, p.shield - dt * 3);
      } else {
        this.killPlayer('bank');
        return;
      }
    }
    for (const e of this.entities) {
      if (!e.alive || (!e.active && e.kind !== 'powerup')) continue;
      if (!e.hits(p.x, p.z, e.kind === 'powerup' || e.kind === 'fuel' ? 1.7 : 1.3)) continue;
      if (e.kind === 'powerup') {
        this.collect(e.type, e);
        e.dispose();
      } else if (e.kind === 'fuel') {
        this.refueling = true;
        if (p.fuel < 100) {
          p.fuel = Math.min(100, p.fuel + CFG.FUEL_REFILL * dt);
          this.audio.refuel(p.fuel);
          if (Math.random() < dt * 30) this.effects.trail(e.x + (Math.random() - 0.5) * 3, 1.5, e.z + (Math.random() - 0.5) * 6, 0.4, 3, 0.8, 1.2, 0.5, 0, 9, 0);
        }
      } else if (e.solid) {
        if (p.shield > 0 || p.invuln > 0 || this.god) {
          if (e.kind === 'bridge' || e.kind === 'boss') {
            p.z = e.z + e.hz + 2.5;
            p.speed = CFG.SPEED_MIN;
            this.audio.bump();
          } else e.destroy(true);
        } else {
          if (e.kind !== 'bridge' && e.kind !== 'boss') e.destroy(false);
          this.killPlayer('crash');
          return;
        }
      }
    }
  }

  killPlayer(reason, force = false) {
    const p = this.player;
    if (!p.alive || this.god) return;
    if (!force && (p.invuln > 0 || p.shield > 0)) return;
    p.alive = false;
    p.deadT = 2.4;
    this.effects.explosion(p.x, CFG.PLAYER_Y, p.z, 2.6, 0xffaa44);
    this.effects.explosion(p.x, CFG.PLAYER_Y, p.z - 2, 1.5, 0xff5522);
    this.audio.playerDie();
    this.audio.laser(false);
    this.shake = 1.6;
    this.combo = 0;
    this.mult = 1;
    this.hud.flash('#ff4422', 0.45);
    const msg = { fuel: 'OUT OF FUEL', bank: 'CRASHED', crash: 'COLLISION', shot: 'SHOT DOWN' }[reason] || 'DESTROYED';
    this.hud.message(msg, this.lives > 0 ? `${this.lives} SHIP${this.lives === 1 ? '' : 'S'} LEFT` : 'LAST SHIP LOST', 2.2, 'bad');
  }

  respawnOrGameOver() {
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.lives--;
    const p = this.player;
    p.alive = true;
    p.fuel = 100;
    p.invuln = 3;
    p.vx = 0;
    p.speed = CFG.SPEED_BASE;
    p.x = this.nearestChannelX(p.x, p.z - 10, 5);
    for (const w of Object.keys(p.weapons)) p.weapons[w] = Math.max(1, p.weapons[w] - 1);
    this.clearEnemyBullets(false);
    for (const e of this.entities) {
      if (!e.alive) continue;
      const a = e.ahead;
      if (e.kind === 'bridge' && a > -10 && a < 70) {
        this.onBridgeDestroyed(e, false);
        e.dispose();
      } else if (e.solid && e.kind !== 'boss' && e.kind !== 'powerup' && a > -10 && a < 50) e.dispose();
    }
    this.hud.message('READY', '', 1.2);
  }

  // ------------------------------------------------------------------ scoring & events
  addScore(pts, x, y, z, big = false) {
    this.score += pts;
    if (x !== undefined) this.hud.popup('+' + pts, x, y + 3, z, big ? '#ffe066' : '#ffffff', big);
    if (this.score >= this.nextLifeAt) {
      this.nextLifeAt += CFG.EXTRA_LIFE_EVERY;
      this.lives++;
      this.audio.extraLife();
      this.hud.message('EXTRA LIFE', '', 1.8, 'good');
    }
  }

  onKill(e) {
    this.combo = this.time - this.lastKill < 2.5 ? this.combo + 1 : 1;
    this.lastKill = this.time;
    this.mult = Math.min(8, 1 + Math.floor(this.combo / 4));
    this.kills = (this.kills || 0) + 1;
    this.addScore(e.score * this.mult, e.x, e.y, e.z, this.mult > 1);
    if (Math.random() < e.dropChance * (1 + Math.min(this.combo, 12) / 12)) this.spawnPowerup(e.x, e.z, randomDrop());
  }

  onBridgeDestroyed(bridge, byPlayer) {
    this.bridges++;
    if (byPlayer) {
      this.hud.message(`BRIDGE ${bridge.index} DESTROYED`, 'CHECKPOINT', 2.0, 'good');
      this.audio.checkpoint();
    }
  }

  startBoss(boss) {
    if (this.state !== 'playing') return;
    this.boss = boss;
    this.hud.showBoss(boss.name);
    this.hud.message('WARNING', boss.name + ' APPROACHING', 3, 'bad');
    this.audio.bossWarn();
    this.audio.intensity = 1;
    // supply drop for the fight
    const p = this.player;
    const owned = ['spread', 'homing', 'laser'];
    this.spawnPowerup(p.x - 8, p.z - 45, 'shield');
    this.spawnPowerup(p.x + 8, p.z - 45, owned[Math.floor(Math.random() * owned.length)]);
  }

  bossDefeated(boss) {
    this.boss = null;
    this.audio.intensity = 0;
    this.later(1.2, () => {
      this.hud.message('BOSS DESTROYED', `+${boss.score.toLocaleString('en-US')}`, 3, 'good');
      const types = ['life', randomDrop(), randomDrop()];
      types.forEach((t, i) => this.spawnPowerup(boss.x + (i - 1) * 9, this.player.z - 40, t));
    });
  }

  collect(type, e) {
    const p = this.player;
    const def = POWERUPS[type];
    this.effects.sparks(e.x, e.y, e.z, 24, def.color, 18);
    this.effects.ring(e.x, CFG.PLAYER_Y - 1, e.z, 6, def.color, 0.4);
    let sub = '';
    if (def.weapon) {
      p.weapons[type] = Math.min(3, (p.weapons[type] || 0) + 1);
      p.current = type;
      sub = p.weapons[type] === 3 ? 'MAX LEVEL' : `LEVEL ${p.weapons[type]}`;
      this.audio.weaponUp();
    } else {
      this.audio.pickup();
      switch (type) {
        case 'shield': p.shield = 10; break;
        case 'fuel': p.fuel = 100; sub = 'TANK FULL'; break;
        case 'bomb': p.bombs = Math.min(CFG.MAX_BOMBS, p.bombs + 1); sub = 'PRESS B'; break;
        case 'slowmo': p.slowmo = 6; break;
        case 'overdrive': p.overdrive = 8; sub = 'DOUBLE FIRE RATE'; break;
        case 'life': this.lives++; this.audio.extraLife(); break;
      }
    }
    this.hud.message(def.name, sub, 1.4, 'pu');
    this.addScore(50, e.x, e.y, e.z);
  }
}
