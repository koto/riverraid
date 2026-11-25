import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, wrapAngle } from './util.js';
import { hdr } from './models.js';

class Pool {
  constructor(scene, factory) {
    this.scene = scene;
    this.factory = factory;
    this.free = [];
  }
  get() {
    const m = this.free.pop() || this.factory();
    this.scene.add(m);
    return m;
  }
  put(m) {
    this.scene.remove(m);
    this.free.push(m);
  }
}

const LASER_DPS = [0, 16, 25, 36];
const LASER_W = [0, 0.9, 1.5, 2.2];
const LASER_RANGE = 150;

export class Weapons {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const vGeo = new THREE.BoxGeometry(0.24, 0.24, 2.6);
    const vMat = new THREE.MeshBasicMaterial({ color: hdr(0xffd060, 5) });
    const sGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const sMat = new THREE.MeshBasicMaterial({ color: hdr(0xff7a20, 5) });
    const mGeo = new THREE.ConeGeometry(0.25, 1.6, 6).rotateX(Math.PI / 2);
    const mMat = new THREE.MeshBasicMaterial({ color: hdr(0xff60e0, 4) });
    this.pools = {
      vulcan: new Pool(scene, () => new THREE.Mesh(vGeo, vMat)),
      spread: new Pool(scene, () => new THREE.Mesh(sGeo, sMat)),
      missile: new Pool(scene, () => new THREE.Mesh(mGeo, mMat)),
    };
    // laser beam
    this.beam = new THREE.Group();
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    this.beamCore = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: hdr(0xddfaff, 2.2) }));
    this.beamGlow = new THREE.Mesh(
      bGeo,
      new THREE.MeshBasicMaterial({ color: hdr(0x2ae8ff, 1.3), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.beam.add(this.beamCore, this.beamGlow);
    this.beam.visible = false;
    scene.add(this.beam);
    // nova bomb projectile
    this.bombMesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: hdr(0xaad8ff, 6) }));
    this.bombMesh.visible = false;
    scene.add(this.bombMesh);
    this.bullets = [];
    this.bombs = [];
    this.cd = 0;
    this.cd2 = 0;
    this.alt = 1;
    this.laserOn = false;
  }

  reset() {
    for (const b of this.bullets) this.pools[b.type].put(b.mesh);
    this.bullets.length = 0;
    this.bombs.length = 0;
    this.bombMesh.visible = false;
    this.beam.visible = false;
    this.laserOn = false;
    this.game.audio.laser(false);
  }

  spawn(type, x, z, vx, vz, dmg, life) {
    const m = this.pools[type].get();
    const b = { type, mesh: m, x, y: CFG.PLAYER_Y, z, vx, vz, dmg, life, target: null, speed: Math.hypot(vx, vz) };
    m.position.set(x, b.y, z);
    m.rotation.y = Math.atan2(vx, vz);
    this.bullets.push(b);
    return b;
  }

  launchBomb() {
    const p = this.game.player;
    if (p.bombs <= 0 || !p.alive || this.bombs.length) return;
    p.bombs--;
    this.bombs.push({ x: p.x, z: p.z - 5, t: 0 });
    this.bombMesh.visible = true;
    this.game.audio.bombLaunch();
  }

  _fire(dt) {
    const g = this.game, p = g.player, a = g.audio;
    const lvl = p.weapons[p.current] || 1;
    const od = p.overdrive > 0 ? 0.5 : 1;
    const nz = p.z - 4.5;
    const deg = Math.PI / 180;
    switch (p.current) {
      case 'vulcan':
        if (this.cd <= 0) {
          this.cd = 0.085 * od;
          const sp = 175;
          if (lvl === 1) {
            this.alt *= -1;
            this.spawn('vulcan', p.x + this.alt * 0.7, nz, 0, -sp, 1, 0.85);
          } else {
            this.spawn('vulcan', p.x - 0.7, nz, 0, -sp, 1, 0.85);
            this.spawn('vulcan', p.x + 0.7, nz, 0, -sp, 1, 0.85);
            if (lvl === 3) {
              const s = Math.sin(4 * deg) * sp, c = -Math.cos(4 * deg) * sp;
              this.spawn('vulcan', p.x - 1.4, nz + 1, -s, c, 1, 0.8);
              this.spawn('vulcan', p.x + 1.4, nz + 1, s, c, 1, 0.8);
            }
          }
          a.vulcan();
          g.effects.trail(p.x, CFG.PLAYER_Y, nz - 0.5, 4, 3, 1, 1.6, 0.05);
        }
        break;
      case 'spread':
        if (this.cd <= 0) {
          this.cd = 0.2 * od;
          const n = [0, 3, 5, 7][lvl];
          const step = lvl === 1 ? 11 : 10;
          for (let i = 0; i < n; i++) {
            const ang = (i - (n - 1) / 2) * step * deg;
            this.spawn('spread', p.x, nz, Math.sin(ang) * 140, -Math.cos(ang) * 140, 1.3, 0.75);
          }
          a.spread();
          g.effects.trail(p.x, CFG.PLAYER_Y, nz - 0.5, 4, 2, 0.5, 2.2, 0.06);
        }
        break;
      case 'homing':
        if (this.cd <= 0) {
          this.cd = 0.5 * od;
          const n = lvl + 1;
          for (let i = 0; i < n; i++) {
            const side = i % 2 ? 1 : -1;
            const b = this.spawn('missile', p.x + side * 1.5, p.z - 1, side * (18 + i * 5), -22, 4, 3);
            b.speed = 28;
          }
          a.missile();
        }
        if (this.cd2 <= 0) {
          this.cd2 = 0.16 * od;
          this.spawn('vulcan', p.x, nz, 0, -175, 1, 0.85);
          a.vulcan();
        }
        break;
      case 'laser':
        this.laserOn = true;
        break;
    }
  }

  update(dt, firing) {
    const g = this.game, p = g.player;
    this.cd -= dt;
    this.cd2 -= dt;
    this.laserOn = false;
    if (firing && p.alive) this._fire(dt);

    // projectiles
    const ents = g.entities;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.type === 'missile') {
        if (!b.target || !b.target.alive || !b.target.hittable) b.target = g.findTarget(b.x, b.z);
        b.speed = Math.min(125, b.speed + 170 * dt);
        let ang = Math.atan2(b.vx, b.vz);
        const desired = b.target ? Math.atan2(b.target.x - b.x, b.target.z - b.z) : Math.PI;
        const diff = wrapAngle(desired - ang);
        const turn = 5.5 * dt;
        ang += clamp(diff, -turn, turn);
        b.vx = Math.sin(ang) * b.speed;
        b.vz = Math.cos(ang) * b.speed;
        b.mesh.rotation.y = ang;
        g.effects.trail(b.x, b.y, b.z, 3, 0.8, 2.4, 1.1, 0.25);
        if (Math.random() < 0.5) g.effects.smokeTrail(b.x, b.y, b.z, 0.9);
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      let hit = null;
      for (const e of ents) {
        if (!e.alive || !e.hittable || e.ahead > 230) continue;
        if (e.hits(b.x, b.z, 0.5)) {
          hit = e;
          break;
        }
      }
      if (!hit) {
        // enemy homing missiles can be shot down
        const eb = g.eBullets;
        for (let j = eb.length - 1; j >= 0; j--) {
          const m = eb[j];
          if (!m.homing) continue;
          const dx = m.x - b.x, dz = m.z - b.z;
          if (dx * dx + dz * dz < 2.2 * 2.2) {
            g.destroyEnemyBullet(j, true);
            g.addScore(25, m.x, m.y, m.z);
            hit = true;
            break;
          }
        }
        if (hit) {
          this.pools[b.type].put(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (hit) {
        hit.damage(b.dmg * (p.overdrive > 0 ? 1.25 : 1));
        g.effects.sparks(b.x, b.y, b.z, b.type === 'missile' ? 14 : 5, b.type === 'missile' ? 0xff60e0 : 0xffcc66);
        if (b.type === 'missile') g.effects.explosion(b.x, b.y, b.z, 0.4, 0xff60e0);
      }
      if (hit || b.life <= 0) {
        this.pools[b.type].put(b.mesh);
        this.bullets.splice(i, 1);
      }
    }

    // laser
    if (this.laserOn) {
      const lvl = p.weapons.laser || 1;
      const w = LASER_W[lvl];
      const dps = LASER_DPS[lvl] * (p.overdrive > 0 ? 1.6 : 1);
      const near = p.z - 4.5, far = near - LASER_RANGE;
      for (const e of ents) {
        if (!e.alive || !e.hittable || e.ahead > 230) continue;
        if (e.z - e.hz < near && e.z + e.hz > far && Math.abs(e.x - p.x) < e.hx + w / 2) {
          e.damage(dps * dt);
          if (Math.random() < dt * 25) g.effects.sparks(p.x, CFG.PLAYER_Y, Math.min(near, e.z + e.hz), 5, 0x2ae8ff, 12);
        }
      }
      const flick = 0.85 + Math.random() * 0.3;
      this.beam.visible = true;
      this.beam.position.set(p.x, CFG.PLAYER_Y, near - LASER_RANGE / 2);
      this.beamCore.scale.set(w * 0.35 * flick, w * 0.35 * flick, LASER_RANGE);
      this.beamGlow.scale.set(w * flick, w * 0.8 * flick, LASER_RANGE);
      if (Math.random() < 0.6) g.effects.trail(p.x, CFG.PLAYER_Y, near, 1.5, 4, 5, w * 2.2, 0.08);
      g.audio.laser(true);
    } else {
      this.beam.visible = false;
      g.audio.laser(false);
    }

    // nova bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      b.z -= 95 * dt;
      this.bombMesh.position.set(b.x, CFG.PLAYER_Y + Math.sin(b.t * 7) * 0.5, b.z);
      this.bombMesh.scale.setScalar(1 + b.t * 1.5);
      g.effects.trail(b.x, CFG.PLAYER_Y, b.z, 2, 3, 4, 2.5, 0.3);
      if (b.t >= 0.45) {
        this.detonate(b);
        this.bombs.splice(i, 1);
        this.bombMesh.visible = false;
      }
    }
  }

  detonate(b) {
    const g = this.game;
    const R = 58;
    for (const e of g.entities) {
      if (!e.alive || !e.hittable) continue;
      const dx = Math.max(0, Math.abs(e.x - b.x) - e.hx), dz = Math.max(0, Math.abs(e.z - b.z) - e.hz);
      if (dx * dx + dz * dz < R * R) e.damage(e.kind === 'boss' ? 60 : 80);
    }
    g.clearEnemyBullets(true);
    g.effects.nova(b.x, b.z, R);
    g.audio.bomb();
    g.hud.flash('#cfe9ff', 0.75);
    g.shake = Math.max(g.shake, 1.5);
  }
}
