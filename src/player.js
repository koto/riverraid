import * as THREE from 'three';
import { CFG } from './config.js';
import { makeJet } from './models.js';
import { clamp, lerp } from './util.js';

const shieldVS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const shieldFS = /* glsl */ `
uniform float uTime; uniform float uAlpha;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
  float hex = abs(sin(vP.x * 3.0 + uTime * 2.0) * sin(vP.z * 3.0 - uTime * 1.5) * sin(vP.y * 4.0));
  float bands = 0.5 + 0.5 * sin(vP.y * 7.0 - uTime * 6.0 + vP.x * 1.5);
  vec3 c = vec3(0.3, 0.85, 2.6) * (f * 1.6 + bands * 0.12 + smoothstep(0.85, 1.0, hex) * 0.5);
  gl_FragColor = vec4(c, (f + 0.06) * uAlpha);
}`;

export class Player {
  constructor(game) {
    this.game = game;
    this.mesh = makeJet();
    this.mesh.rotation.order = 'YXZ';
    this.flames = [];
    this.mesh.traverse((o) => o.name === 'flame' && this.flames.push(o));
    game.scene.add(this.mesh);
    this.shieldU = { uTime: { value: 0 }, uAlpha: { value: 1 } };
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 28, 18),
      new THREE.ShaderMaterial({
        uniforms: this.shieldU,
        vertexShader: shieldVS,
        fragmentShader: shieldFS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.shieldMesh.scale.set(1.25, 0.6, 1.45);
    this.shieldMesh.visible = false;
    game.scene.add(this.shieldMesh);
    this.t = 0;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.speed = CFG.SPEED_BASE;
    this.fuel = 100;
    this.alive = true;
    this.invuln = 0;
    this.weapons = { vulcan: 1 };
    this.current = 'vulcan';
    this.bombs = CFG.START_BOMBS;
    this.shield = 0;
    this.overdrive = 0;
    this.slowmo = 0;
    this.deadT = 0;
    this.roll = 0;
    this.pitch = 0;
    this.mesh.visible = true;
  }

  /** player-controlled flight */
  update(dt, input) {
    const g = this.game;
    this.t += dt;
    if (!this.alive) {
      this.deadT -= dt;
      this.mesh.visible = false;
      this.shieldMesh.visible = false;
      if (this.deadT <= 0) g.respawnOrGameOver();
      return;
    }
    const thr = input.throttle;
    const target = thr > 0 ? lerp(CFG.SPEED_BASE, CFG.SPEED_MAX, thr) : lerp(CFG.SPEED_BASE, CFG.SPEED_MIN, -thr);
    const prev = this.speed;
    this.speed += (target - this.speed) * Math.min(1, dt * 1.8);
    this.vx += (input.steer * CFG.STRAFE - this.vx) * Math.min(1, dt * 8);
    this.x += this.vx * dt;
    this.z -= this.speed * dt;
    this.pitch = lerp(this.pitch, clamp((this.speed - prev) / dt / 60, -0.25, 0.25), Math.min(1, dt * 6));

    this.invuln = Math.max(0, this.invuln - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.slowmo = Math.max(0, this.slowmo - dt);

    if (!g.boss && !g.god) {
      this.fuel -= CFG.FUEL_DRAIN * dt * (0.7 + 0.3 * (this.speed / CFG.SPEED_BASE));
      if (this.fuel <= 0) {
        this.fuel = 0;
        g.killPlayer('fuel', true);
      } else if (this.fuel < 25) g.audio.alarm();
    }
    this.updateVisual(dt);
  }

  updateVisual(dt) {
    const g = this.game;
    this.t += 0;
    this.roll = lerp(this.roll, -(this.vx / CFG.STRAFE) * 0.65, Math.min(1, dt * 8));
    const m = this.mesh;
    m.position.set(this.x, CFG.PLAYER_Y + Math.sin(this.t * 2.2) * 0.15, this.z);
    m.rotation.set(-this.pitch * 0.5, -this.vx * 0.004, this.roll);
    const blink = this.invuln > 0 && Math.floor(this.t * 14) % 2 === 0;
    m.visible = this.alive && !blink && g.state !== 'gameover';
    const sp = this.speed / CFG.SPEED_BASE;
    for (const f of this.flames) {
      f.scale.set(1, 1, (0.55 + sp * 0.6) * (0.85 + Math.random() * 0.3));
    }
    if (this.alive && m.visible) {
      const od = this.overdrive > 0;
      for (const sx of [-0.38, 0.38]) {
        const wx = this.x + sx * Math.cos(this.roll);
        const wy = CFG.PLAYER_Y + sx * Math.sin(this.roll);
        g.effects.trail(wx, wy, this.z + 4.2, od ? 3 : 3.5, od ? 2.6 : 1.3, od ? 0.6 : 0.35, 1.1 * sp, 0.22, 0, 0, 14);
      }
    }
    this.shieldMesh.visible = this.alive && this.shield > 0 && g.state !== 'gameover';
    if (this.shieldMesh.visible) {
      this.shieldMesh.position.copy(m.position);
      this.shieldMesh.rotation.z = this.roll;
      this.shieldU.uTime.value = this.t;
      this.shieldU.uAlpha.value = this.shield < 2 ? (Math.floor(this.t * 8) % 2 ? 1 : 0.25) : 1;
    }
  }
}
