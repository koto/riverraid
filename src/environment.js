import * as THREE from 'three';
import { smoothstep } from './util.js';

// Time-of-day palettes, cycled per sector.
const P = [
  { name: 'DAY', top: 0x2c6bd8, hor: 0xb4dcf0, sun: 0xfff1d6, sunI: 2.8, hs: 0xcfe8ff, hg: 0x5a6a3a, hI: 1.0, deep: 0x0c4a6e, shallow: 0x2ba5b5, dir: [0.35, 0.85, 0.4], stars: 0, exp: 1.0 },
  { name: 'GOLDEN HOUR', top: 0x3f5aa6, hor: 0xf6c48a, sun: 0xffbb70, sunI: 2.6, hs: 0xffdcb0, hg: 0x5a4a30, hI: 0.85, deep: 0x15405c, shallow: 0x3b8f99, dir: [-0.5, 0.42, -0.6], stars: 0, exp: 1.0 },
  { name: 'DUSK', top: 0x1a1d4a, hor: 0xe0627e, sun: 0xff7f5a, sunI: 1.7, hs: 0xa080c0, hg: 0x2a2030, hI: 0.8, deep: 0x0f1d3a, shallow: 0x2c4c70, dir: [0.5, 0.25, -0.8], stars: 0.35, exp: 1.05 },
  { name: 'NIGHT', top: 0x02040c, hor: 0x16224a, sun: 0x9fb8ff, sunI: 1.0, hs: 0x5868b0, hg: 0x121220, hI: 0.7, deep: 0x040a18, shallow: 0x10305a, dir: [-0.3, 0.7, -0.6], stars: 1, exp: 1.1 },
  { name: 'DAWN', top: 0x3b54a0, hor: 0xf4aab4, sun: 0xffd6b8, sunI: 2.0, hs: 0xf0c8d8, hg: 0x40403a, hI: 0.85, deep: 0x123a5e, shallow: 0x3a90a8, dir: [0.6, 0.35, -0.7], stars: 0.1, exp: 1.0 },
];
const PC = P.map((p) => ({
  ...p,
  top: new THREE.Color(p.top),
  hor: new THREE.Color(p.hor),
  sun: new THREE.Color(p.sun),
  hs: new THREE.Color(p.hs),
  hg: new THREE.Color(p.hg),
  deep: new THREE.Color(p.deep),
  shallow: new THREE.Color(p.shallow),
  dir: new THREE.Vector3(...p.dir).normalize(),
}));

const skyVS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const skyFS = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSun * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.25);
  if (uStars > 0.0 && y > 0.05) {
    vec3 cell = floor(d * 380.0);
    float st = step(0.9975, hash(cell));
    c += vec3(st * uStars * (0.6 + 0.4 * hash(cell + 1.0)));
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Environment {
  constructor(scene, renderer) {
    this.renderer = renderer;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.0);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    scene.fog = new THREE.Fog(0xb4dcf0, 140, 390);
    this.fog = scene.fog;
    this.skyU = {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uStars: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.cur = {
      top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(),
      deep: new THREE.Color(), shallow: new THREE.Color(), dir: new THREE.Vector3(), sunI: 1, hI: 1, stars: 0, exp: 1,
    };
    this.name = P[0].name;
  }

  update(sectorFloat, player, camera, water) {
    const n = PC.length;
    const sf = Math.max(0, sectorFloat);
    const i = Math.floor(sf) % n;
    const f = smoothstep(0.72, 1.0, sf % 1);
    const a = PC[i], b = PC[(i + 1) % n];
    const c = this.cur;
    for (const k of ['top', 'hor', 'sun', 'hs', 'hg', 'deep', 'shallow']) c[k].copy(a[k]).lerp(b[k], f);
    c.dir.copy(a.dir).lerp(b.dir, f).normalize();
    c.sunI = a.sunI + (b.sunI - a.sunI) * f;
    c.hI = a.hI + (b.hI - a.hI) * f;
    c.stars = a.stars + (b.stars - a.stars) * f;
    c.exp = a.exp + (b.exp - a.exp) * f;
    this.name = f > 0.5 ? b.name : a.name;

    this.hemi.color.copy(c.hs);
    this.hemi.groundColor.copy(c.hg);
    this.hemi.intensity = c.hI;
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI;
    this.sun.position.set(player.x + c.dir.x * 150, c.dir.y * 150, player.z - 20 + c.dir.z * 150);
    this.sun.target.position.set(player.x, 0, player.z - 20);
    this.fog.color.copy(c.hor);
    this.skyU.uTop.value.copy(c.top);
    this.skyU.uHor.value.copy(c.hor);
    this.skyU.uSun.value.copy(c.sun);
    this.skyU.uSunDir.value.copy(c.dir);
    this.skyU.uStars.value = c.stars;
    this.sky.position.copy(camera.position);
    this.renderer.toneMappingExposure = c.exp;
    const u = water.uniforms;
    u.uDeep.value.copy(c.deep);
    u.uShallow.value.copy(c.shallow);
    u.uSky.value.copy(c.hor);
    u.uSunDir.value.copy(c.dir);
    u.uSunColor.value.copy(c.sun).multiplyScalar(Math.min(0.6, c.sunI * 0.25));
  }
}
