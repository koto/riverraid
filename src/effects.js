import * as THREE from 'three';
import { rand } from './util.js';

const VS = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */ `
uniform float uSoft;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

class ParticleSystem {
  constructor(scene, max, blending, soft) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.base = new Float32Array(max);
    this.baseA = new Float32Array(max);
    const g = (this.geo = new THREE.BufferGeometry());
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('pcolor', attr(this.col, 3));
    g.setAttribute('size', attr(this.size, 1));
    g.setAttribute('alpha', attr(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: soft } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.idx = 0;
    this.colDirty = false;
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grow = 0, drag = 0, grav = 0, alpha = 1) {
    const i = this.idx;
    this.idx = (i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
    this.base[i] = size; this.size[i] = size;
    this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav;
    this.baseA[i] = alpha; this.alpha[i] = alpha;
    this.colDirty = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
  }

  update(dt) {
    const { pos, vel, life, maxLife, size, alpha, grow, drag, grav, base, baseA } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + grav[i] * dt; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = life[i] / maxLife[i];
      size[i] = base[i] + grow[i] * (maxLife[i] - life[i]);
      alpha[i] = baseA[i] * Math.min(1, t * 1.6);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.size.needsUpdate = true;
    a.alpha.needsUpdate = true;
    if (this.colDirty) {
      a.pcolor.needsUpdate = true;
      this.colDirty = false;
    }
  }
}

const _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glow = new ParticleSystem(scene, 6000, THREE.AdditiveBlending, 1.6);
    this.smoke = new ParticleSystem(scene, 2500, THREE.NormalBlending, 1.0);
    // debris
    this.debrisMax = 160;
    this.debris = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8, metalness: 0.3 }),
      this.debrisMax
    );
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    this.debrisData = [];
    for (let i = 0; i < this.debrisMax; i++) this.debrisData.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 });
    this.debrisIdx = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    for (let i = 0; i < this.debrisMax; i++) this.debris.setMatrixAt(i, this._m4.makeScale(0, 0, 0));
    scene.add(this.debris);
    // shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, r: 10 });
    }
    this.ringIdx = 0;
    // flash lights (constant count to avoid shader recompiles)
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 90, 1.6);
      scene.add(l);
      this.lights.push({ l, k: 0 });
    }
    this.lightIdx = 0;
  }

  setViewport(heightPx, fov) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    this.glow.mat.uniforms.uScale.value = s;
    this.smoke.mat.uniforms.uScale.value = s;
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    for (const d of this.debrisData) d.life = 0;
    for (const r of this.rings) { r.t = r.dur; r.m.visible = false; }
  }

  flashLight(x, y, z, intensity, color = 0xffaa55) {
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.l.position.set(x, y + 3, z);
    L.l.color.setHex(color);
    L.k = intensity;
  }

  ring(x, y, z, radius, color = 0xffaa66, dur = 0.6, k = 3) {
    const R = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    R.t = 0; R.dur = dur; R.r = radius;
    R.m.position.set(x, y, z);
    R.m.material.color.copy(_c.setHex(color)).multiplyScalar(k);
    R.m.visible = true;
  }

  spawnDebris(x, y, z, n, size) {
    for (let i = 0; i < n; i++) {
      const d = this.debrisData[this.debrisIdx];
      this.debrisIdx = (this.debrisIdx + 1) % this.debrisMax;
      d.life = rand(1.2, 2.2);
      d.p.set(x, y, z);
      d.v.set(rand(-1, 1) * 14 * size, rand(8, 20) * Math.sqrt(size), rand(-1, 1) * 14 * size);
      d.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
      d.w.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      d.s = rand(0.25, 0.8) * Math.sqrt(size);
    }
  }

  explosion(x, y, z, size = 1, color = 0xff8a30) {
    _c.setHex(color);
    const cr = _c.r, cg = _c.g, cb = _c.b;
    const n = Math.round(28 * size);
    for (let i = 0; i < n; i++) {
      const u = rand(-1, 1), th = rand(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
      const sp = rand(6, 24) * Math.sqrt(size);
      this.glow.spawn(x, y, z, s * Math.cos(th) * sp, Math.abs(u) * sp * 0.8 + 3, s * Math.sin(th) * sp, rand(0.35, 0.8), rand(1.2, 3) * size, 4, rand(1.4, 2.4), 0.4, 0, 2.4, -8);
    }
    for (let i = 0; i < 6 * size; i++) {
      this.glow.spawn(x + rand(-1.5, 1.5) * size, y + rand(-0.5, 1.5) * size, z + rand(-1.5, 1.5) * size, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.3, 0.55), rand(5, 9) * size, cr * 3, cg * 2.2, cb * 1.4, 9 * size, 1, 0);
    }
    this.glow.spawn(x, y, z, 0, 0, 0, 0.16, 12 * size, 7, 6, 5, 40 * size);
    for (let i = 0; i < 10 * size; i++) {
      const g = rand(0.08, 0.16);
      this.smoke.spawn(x + rand(-1, 1) * size, y + rand(0, 1), z + rand(-1, 1) * size, rand(-2.5, 2.5), rand(2, 6), rand(-2.5, 2.5), rand(1.2, 2.4), rand(3, 5) * size, g, g * 0.95, g * 0.9, 4 * size, 0.8, 1.5, 0.75);
    }
    this.spawnDebris(x, y, z, Math.round(5 * size), size);
    this.ring(x, Math.max(0.3, y - 1), z, 10 * size, color, 0.55);
    this.flashLight(x, y, z, 900 * size, color);
    if (y < 3) this.splash(x, z, size);
  }

  nova(x, z, radius) {
    for (let i = 0; i < 3; i++) this.ring(x, 0.6 + i * 0.6, z, radius * (1 - i * 0.2), [0xffffff, 0x9ad8ff, 0xff7aff][i], 0.9 + i * 0.2, 4);
    for (let i = 0; i < 220; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      this.glow.spawn(x, 3, z, Math.cos(a) * sp, rand(0, 10), Math.sin(a) * sp, rand(0.4, 0.9), rand(2, 4), 2.5, 2.8, 4, 0, 1.5, 0);
    }
    this.glow.spawn(x, 4, z, 0, 0, 0, 0.3, 50, 6, 6, 8, 160);
    this.flashLight(x, 4, z, 6000, 0xaad8ff);
  }

  sparks(x, y, z, n = 6, color = 0xffcc66, speed = 14) {
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      this.glow.spawn(x, y, z, rand(-1, 1) * speed, rand(-0.3, 1) * speed, rand(-1, 1) * speed, rand(0.15, 0.35), rand(0.5, 1.1), _c.r * 3, _c.g * 3, _c.b * 3, -1, 3, -10);
    }
  }

  splash(x, z, size = 1) {
    for (let i = 0; i < 18 * size; i++) {
      this.smoke.spawn(x + rand(-1.5, 1.5) * size, 0.3, z + rand(-1.5, 1.5) * size, rand(-4, 4) * size, rand(6, 16) * Math.sqrt(size), rand(-4, 4) * size, rand(0.6, 1.1), rand(1, 2.2) * size, 0.85, 0.92, 1.0, 1.5, 0.5, -26, 0.85);
    }
  }

  trail(x, y, z, r, g, b, size, life, vx = 0, vy = 0, vz = 0) {
    this.glow.spawn(x, y, z, vx, vy, vz, life, size, r, g, b, -size / life * 0.8, 2, 0);
  }

  smokeTrail(x, y, z, size = 1.2) {
    const g = rand(0.35, 0.55);
    this.smoke.spawn(x, y, z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), rand(0.5, 0.9), size, g, g, g, 3, 1, 0, 0.5);
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    // debris
    const m4 = this._m4, q = this._q, s = this._s;
    for (let i = 0; i < this.debrisMax; i++) {
      const d = this.debrisData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 32 * dt;
      d.p.addScaledVector(d.v, dt);
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      if (d.p.y < 0 && d.v.y < 0) {
        if (d.v.y < -8) this.smoke.spawn(d.p.x, 0.3, d.p.z, 0, 4, 0, 0.5, 1.5, 0.85, 0.92, 1, 2, 0.5, -10, 0.7);
        d.v.multiplyScalar(0.3);
        d.v.y = Math.abs(d.v.y) * 0.2;
        if (d.p.y < -1.5) d.life = 0;
      }
      if (d.life <= 0) m4.makeScale(0, 0, 0);
      else {
        q.setFromEuler(d.r);
        s.setScalar(d.s);
        m4.compose(d.p, q, s);
      }
      this.debris.setMatrixAt(i, m4);
      if (d.life > 0 && d.life < 0.3 && Math.random() < 0.3) this.smokeTrail(d.p.x, d.p.y, d.p.z, 0.8);
      else if (Math.random() < 0.25) this.glow.spawn(d.p.x, d.p.y, d.p.z, 0, 0, 0, 0.2, 1.0, 3, 1.2, 0.3, -2, 0, 0);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    for (const R of this.rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const t = R.t / R.dur;
      if (t >= 1) { R.m.visible = false; continue; }
      const k = 1 - Math.pow(1 - t, 3);
      R.m.scale.setScalar(0.5 + R.r * k);
      R.m.material.opacity = (1 - t) * 0.9;
    }
    for (const L of this.lights) {
      L.k *= Math.exp(-dt * 7);
      L.l.intensity = L.k < 1 ? 0 : L.k;
    }
  }
}
