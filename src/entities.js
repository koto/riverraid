import * as THREE from 'three';
import { CFG, BOSS_NAMES } from './config.js';
import * as Models from './models.js';
import { clamp, lerp } from './util.js';

const _v = new THREE.Vector3();

function makeFlashable(root) {
  const mats = [];
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
      o.material = o.material.clone();
      mats.push({ m: o.material, e: o.material.emissive.clone(), k: o.material.emissiveIntensity });
    }
  });
  return mats;
}

export class Entity {
  constructor(game, mesh, x, z, y = 0) {
    this.game = game;
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.y = y;
    this.hx = 2;
    this.hz = 2;
    this.hp = this.maxHp = 1;
    this.score = 0;
    this.hittable = true;
    this.solid = true;
    this.alive = true;
    this.active = false;
    this.activateAt = 150;
    this.dropChance = 0.07;
    this.kind = 'entity';
    this.flashMats = null;
    this.flashT = 0;
    this.boom = 1;
    game.scene.add(mesh);
    this.sync();
  }
  get ahead() {
    return this.game.player.z - this.z;
  }
  setHp(n) {
    this.hp = this.maxHp = n;
  }
  enableFlash() {
    this.flashMats = makeFlashable(this.mesh);
  }
  sync() {
    this.mesh.position.set(this.x, this.y, this.z);
  }
  tick(dt) {
    if (!this.active && this.ahead < this.activateAt) {
      this.active = true;
      this.onActivate();
    }
    if (this.active) this.update(dt);
    if (this.flashMats && (this.flashT > 0 || this._flashing)) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      if (on !== this._flashing) {
        this._flashing = on;
        for (const f of this.flashMats) {
          if (on) {
            f.m.emissive.setRGB(1, 1, 1);
            f.m.emissiveIntensity = 1.2;
          } else {
            f.m.emissive.copy(f.e);
            f.m.emissiveIntensity = f.k;
          }
        }
      }
    }
    this.sync();
  }
  onActivate() {}
  update() {}
  damage(n) {
    if (!this.alive || !this.hittable) return;
    this.hp -= n;
    this.flashT = 0.06;
    if (this.hp <= 0) this.destroy(true);
    else this.game.audio.hit();
  }
  destroy(byPlayer = true) {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    g.effects.explosion(this.x, this.y + 1, this.z, this.boom);
    g.audio.explosion(this.boom);
    g.shake = Math.max(g.shake, 0.25 * this.boom);
    if (byPlayer) g.onKill(this);
    this.dispose();
  }
  dispose() {
    this.alive = false;
    this.game.scene.remove(this.mesh);
    this.onDispose();
  }
  onDispose() {}
  hits(x, z, r) {
    return Math.abs(x - this.x) < this.hx + r && Math.abs(z - this.z) < this.hz + r;
  }
  /** bounce between banks, returns true if turned */
  patrol(dt, margin) {
    if (this.speed <= 0) return false;
    const nx = this.x + this.dir * this.speed * dt;
    if (this.game.river.landDist(nx + this.dir * margin, this.z) > -0.5) {
      this.dir *= -1;
      return true;
    }
    this.x = nx;
    return false;
  }
}

export class Ship extends Entity {
  constructor(game, x, z, diff, rng) {
    super(game, Models.cloneModel('ship'), x, z, 0);
    this.kind = 'ship';
    this.hx = 3.4;
    this.hz = 1.6;
    this.setHp(2 + Math.floor(diff * 3));
    this.score = 30;
    this.boom = 1.1;
    this.speed = rng() < 0.35 ? 0 : (5 + rng() * 8) * (1 + diff * 0.7);
    this.dir = rng() < 0.5 ? -1 : 1;
    this.bob = rng() * 6;
    this.radar = this.mesh.getObjectByName('radar');
    this.canFire = diff > 0.3 && rng() < 0.5;
    this.fireCd = 2 + rng() * 2;
    this.diff = diff;
    this.enableFlash();
    this.face();
  }
  face() {
    this.mesh.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  update(dt) {
    this.bob += dt;
    if (this.patrol(dt, 3.6)) this.face();
    if (this.speed > 0 && Math.random() < dt * 20) {
      this.game.effects.smoke.spawn(this.x - this.dir * 3.2, 0.2, this.z + (Math.random() - 0.5) * 2, -this.dir * 2, 1, 0, 0.8, 1.2, 0.9, 0.95, 1, 2, 1, 0, 0.6);
    }
    this.mesh.rotation.z = Math.sin(this.bob * 2) * 0.04;
    this.y = Math.sin(this.bob * 1.7) * 0.12;
    if (this.radar) this.radar.rotation.y += dt * 3;
    if (this.canFire && this.ahead > 30 && this.ahead < 120) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.game.enemyFire(this.x, 2, this.z);
        this.fireCd = lerp(3.5, 2, this.diff) + Math.random();
      }
    }
  }
}

export class Heli extends Entity {
  constructor(game, x, z, diff, rng) {
    super(game, Models.cloneModel('heli'), x, z, CFG.PLAYER_Y);
    this.kind = 'heli';
    this.hx = 2.4;
    this.hz = 2.6;
    this.setHp(1 + Math.floor(diff * 2));
    this.score = 60;
    this.speed = rng() < 0.25 ? 0 : (8 + rng() * 10) * (1 + diff * 0.6);
    this.dir = rng() < 0.5 ? -1 : 1;
    this.canFire = diff > 0.12 && rng() < 0.4 + diff * 0.5;
    this.fireCd = 1.5 + rng() * 2;
    this.diff = diff;
    this.t = rng() * 6;
    this.rotor = this.mesh.getObjectByName('rotor');
    this.tail = this.mesh.getObjectByName('tailRotor');
    if (this.maxHp > 1) this.enableFlash();
    this.face();
  }
  face() {
    this.mesh.rotation.y = this.speed > 0 ? (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
  }
  update(dt) {
    this.t += dt;
    this.rotor.rotation.y += dt * 28;
    this.tail.rotation.x += dt * 40;
    if (this.patrol(dt, 3)) this.face();
    this.mesh.rotation.x = this.speed > 0 ? -0.18 : Math.sin(this.t) * 0.05;
    this.y = CFG.PLAYER_Y + Math.sin(this.t * 2.2) * 0.35;
    if (this.canFire && this.ahead > 25 && this.ahead < 130 && this.game.player.alive) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.game.enemyFire(this.x, this.y, this.z + 1);
        this.fireCd = lerp(3.2, 1.6, this.diff) + Math.random();
      }
    }
  }
}

export class Jet extends Entity {
  constructor(game, x, z, diff, rng) {
    super(game, Models.cloneModel('enemyJet'), x, z, CFG.PLAYER_Y + 0.5);
    this.kind = 'jet';
    this.hx = 3.2;
    this.hz = 2.2;
    this.score = 100;
    this.mesh.visible = false;
    this.hittable = false;
    this.solid = false;
    this.activateAt = 105 + rng() * 25;
    this.dir = rng() < 0.5 ? -1 : 1;
    this.speed = (40 + rng() * 14) * (1 + diff * 0.4);
    this.flames = [];
    this.mesh.traverse((o) => o.name === 'flame' && this.flames.push(o));
  }
  onActivate() {
    const s = this.game.river.sample(this.z);
    this.x = s.cx - this.dir * (s.hw + 50);
    this.mesh.visible = true;
    this.hittable = this.solid = true;
    this.mesh.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.mesh.rotation.z = this.dir * 0.3;
    this.game.audio.jetFlyby();
  }
  update(dt) {
    this.x += this.dir * this.speed * dt;
    for (const f of this.flames) f.scale.z = 0.9 + Math.random() * 0.4;
    const s = this.game.river.sample(this.z);
    if ((this.x - s.cx) * this.dir > s.hw + 80) this.dispose();
  }
}

export class Turret extends Entity {
  constructor(game, x, z, y, diff, rng) {
    super(game, Models.cloneModel('turret'), x, z, y);
    this.kind = 'turret';
    this.hx = this.hz = 2.3;
    this.setHp(3 + Math.floor(diff * 4));
    this.score = 150;
    this.solid = false;
    this.boom = 1.3;
    this.diff = diff;
    this.fireCd = 1 + rng() * 1.5;
    this.activateAt = 175;
    this.head = this.mesh.getObjectByName('head');
    this.enableFlash();
  }
  update(dt) {
    const p = this.game.player;
    const dx = p.x - this.x, dz = p.z - this.z;
    this.head.rotation.y = Math.atan2(-dx, -dz);
    if (this.ahead > 18 && this.ahead < 150 && p.alive) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.game.enemyFire(this.x, this.y + 1.6, this.z);
        this.fireCd = lerp(2.4, 1.1, this.diff) * (0.8 + Math.random() * 0.4);
        this.game.effects.sparks(this.x - Math.sin(this.head.rotation.y) * 3, this.y + 1.6, this.z - Math.cos(this.head.rotation.y) * 3, 4, 0xff5533, 6);
      }
    }
  }
}

export class Drone extends Entity {
  constructor(game, x, z, diff, rng) {
    super(game, Models.cloneModel('drone'), x, z, CFG.PLAYER_Y);
    this.kind = 'drone';
    this.hx = this.hz = 1.7;
    this.setHp(2);
    this.score = 120;
    this.activateAt = 100;
    this.t = rng() * 6;
    this.state = 'hover';
    this.diff = diff;
    this.enableFlash();
  }
  update(dt) {
    this.t += dt;
    this.mesh.rotation.y = Math.sin(this.t * 1.3) * 0.4;
    const p = this.game.player;
    if (this.state === 'hover') {
      this.y = CFG.PLAYER_Y + Math.sin(this.t * 3) * 0.6;
      this.x += Math.sin(this.t * 1.7) * 6 * dt;
      if (this.ahead < 72) {
        this.state = 'dash';
        this.game.audio.droneCharge();
      }
    } else {
      this.y = lerp(this.y, CFG.PLAYER_Y, dt * 4);
      this.x += clamp(p.x - this.x, -1, 1) * 26 * dt;
      this.z += 44 * (1 + this.diff * 0.4) * dt;
      this.mesh.lookAt(p.x, CFG.PLAYER_Y, p.z);
      if (Math.random() < dt * 40) this.game.effects.trail(this.x, this.y, this.z - 1, 3, 0.4, 0.3, 1.2, 0.3);
    }
  }
}

export class FuelDepot extends Entity {
  constructor(game, x, z) {
    super(game, Models.cloneModel('fuel'), x, z, 0.4);
    this.kind = 'fuel';
    this.hx = 2.0;
    this.hz = 3.7;
    this.setHp(2);
    this.score = 80;
    this.solid = false;
    this.dropChance = 0;
    this.t = Math.random() * 3;
    this.beacons = [];
    this.mesh.traverse((o) => o.name === 'beacon' && this.beacons.push(o));
    this.enableFlash();
  }
  update(dt) {
    this.t += dt;
    const on = Math.sin(this.t * 6) > 0;
    for (const b of this.beacons) b.visible = on;
    this.y = 0.4 + Math.sin(this.t * 1.5) * 0.08;
  }
}

export class Bridge extends Entity {
  constructor(game, z, index) {
    const s = game.river.sample(z);
    const width = 2 * s.hw + 36;
    super(game, Models.makeBridge(width), s.cx, z, 0);
    this.kind = 'bridge';
    this.width = width;
    this.hx = width / 2;
    this.hz = 3;
    this.setHp(7 + index * 2);
    this.score = 500;
    this.boom = 2;
    this.dropChance = 0;
    this.index = index;
    this.activateAt = 1e9;
    this.enableFlash();
  }
  destroy(byPlayer = true) {
    if (!this.alive) return;
    const g = this.game;
    const hw = this.width / 2 - 14;
    for (let i = 0; i < 5; i++) {
      const x = this.x - hw + (i / 4) * hw * 2;
      g.later(i * 0.08, () => g.effects.explosion(x, 3, this.z, 1.4));
    }
    g.audio.bigBoom();
    g.shake = Math.max(g.shake, 0.9);
    g.onBridgeDestroyed(this, byPlayer);
    super.destroy(byPlayer);
  }
  onDispose() {
    this.mesh.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
}

export class Boss extends Entity {
  constructor(game, z, index) {
    const s = game.river.sample(z);
    super(game, Models.cloneModel('boss'), s.cx, z, 0);
    this.kind = 'boss';
    this.hx = 6.5;
    this.hz = 17;
    this.index = index;
    this.setHp(260 + index * 160);
    this.score = 5000 + index * 2500;
    this.boom = 4;
    this.dropChance = 0;
    this.activateAt = 150;
    this.t = 0;
    this.pattern = -1;
    this.patT = 2.5;
    this.shotT = 0;
    this.shotN = 0;
    this.dir = 1;
    this.speed = 7 + index * 2;
    this.name = BOSS_NAMES[index % BOSS_NAMES.length];
    this.turrets = [0, 1, 2].map((i) => this.mesh.getObjectByName('turret' + i));
    this.radar = this.mesh.getObjectByName('radar');
    this.core = this.mesh.getObjectByName('core');
    this.enableFlash();
  }
  onActivate() {
    this.game.startBoss(this);
  }
  turretPos(i) {
    this.turrets[i].getWorldPosition(_v);
    return _v;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    if (this.radar) this.radar.rotation.y += dt * 2;
    this.y = Math.sin(this.t * 0.9) * 0.25;
    this.mesh.rotation.z = Math.sin(this.t * 0.7) * 0.02;
    if (this.core) this.core.scale.setScalar(1 + Math.sin(this.t * 6) * 0.12);
    const s = g.river.sample(this.z);
    const lim = Math.max(0, s.hw - 10);
    this.x += this.dir * this.speed * dt;
    if (this.x > s.cx + lim) this.dir = -1;
    if (this.x < s.cx - lim) this.dir = 1;
    for (const tr of this.turrets) {
      tr.getWorldPosition(_v);
      tr.rotation.y = Math.atan2(p.x - _v.x, p.z - _v.z);
    }
    if (!p.alive) return;
    const enraged = this.hp < this.maxHp * 0.4;
    const rate = enraged ? 0.65 : 1;
    this.patT -= dt;
    if (this.patT <= 0) {
      this.pattern = (this.pattern + 1) % 3;
      this.patT = enraged ? 3.2 : 4.4;
      this.shotT = 0.3;
      this.shotN = 0;
    }
    this.shotT -= dt;
    if (this.shotT > 0 || this.pattern < 0) return;
    if (this.pattern === 0) {
      const pos = this.turretPos(this.shotN % 3);
      g.enemyFire(pos.x, CFG.PLAYER_Y, pos.z, { speed: 62 + this.index * 6 });
      this.shotN++;
      this.shotT = 0.2 * rate;
    } else if (this.pattern === 1) {
      const n = 9 + this.index * 2;
      const base = Math.atan2(p.x - this.x, p.z - (this.z + 16));
      const off = this.shotN % 2 ? 0.06 : -0.06;
      for (let i = 0; i < n; i++) {
        const a = base + off + (i / (n - 1) - 0.5) * 1.8;
        g.spawnEnemyBullet(this.x, CFG.PLAYER_Y, this.z + 17, Math.sin(a) * 42, Math.cos(a) * 42, {});
      }
      g.audio.enemyShot();
      this.shotN++;
      this.shotT = 1.0 * rate;
    } else {
      for (const i of [1, 2]) {
        const pos = this.turretPos(i);
        g.spawnEnemyBullet(pos.x, CFG.PLAYER_Y, pos.z, (i === 1 ? -1 : 1) * 14, 22, { homing: true, life: 5 });
      }
      g.audio.missile();
      this.shotN++;
      this.shotT = 0.85 * rate;
    }
  }
  destroy(byPlayer = true) {
    if (!this.alive) return;
    const g = this.game;
    for (let i = 0; i < 8; i++) {
      g.later(i * 0.12, () => g.effects.explosion(this.x + (Math.random() - 0.5) * 12, 3 + Math.random() * 4, this.z + (Math.random() - 0.5) * 30, 2));
    }
    g.later(1.0, () => {
      g.effects.explosion(this.x, 4, this.z, 5, 0xffaa55);
      g.effects.nova(this.x, this.z, 60);
      g.audio.bigBoom();
      g.shake = 2;
      g.hud.flash('#fff', 0.7);
    });
    g.bossDefeated(this);
    super.destroy(byPlayer);
  }
}

export class Powerup extends Entity {
  constructor(game, x, z, type) {
    super(game, Models.makePowerup(type, -(CFG.PLAYER_Y - 0.5) + 0.15), x, z, CFG.PLAYER_Y - 0.5);
    this.kind = 'powerup';
    this.type = type;
    this.hittable = false;
    this.solid = false;
    this.hx = this.hz = 2.4;
    this.t = Math.random() * 6;
    this.activateAt = 1e9;
    this.core = this.mesh.getObjectByName('core');
    this.cage = this.mesh.getObjectByName('cage');
    this.ring = this.mesh.getObjectByName('ring');
  }
  update(dt) {
    this.t += dt;
    this.core.rotation.y += dt * 2.5;
    this.cage.rotation.x += dt * 0.9;
    this.cage.rotation.y -= dt * 1.3;
    const bob = Math.sin(this.t * 2.5) * 0.5;
    this.y = CFG.PLAYER_Y - 0.5 + bob;
    this.ring.position.y = -(CFG.PLAYER_Y - 0.5) + 0.15 - bob;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 4) * 0.12);
    // gentle magnet
    const p = this.game.player;
    if (p.alive) {
      const dx = p.x - this.x, dz = p.z - this.z;
      if (dx * dx + dz * dz < 13 * 13) {
        this.x += dx * Math.min(1, dt * 3.5);
        this.z += dz * Math.min(1, dt * 3.5);
      }
    }
  }
}
