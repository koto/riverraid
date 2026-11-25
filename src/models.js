import * as THREE from 'three';
import { POWERUPS } from './config.js';

export const hdr = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...o });
const emi = (color, k = 3) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: k, roughness: 1, metalness: 0 });

export const MAT = {
  white: std(0xe9eef4, { metalness: 0.5, roughness: 0.32 }),
  blue: std(0x1f6fe5, { metalness: 0.45, roughness: 0.35 }),
  dark: std(0x262b33, { metalness: 0.6, roughness: 0.45 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0b1a28, emissive: 0x1c9cff, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.08 }),
  engine: emi(0xff8a2a, 6),
  cyan: emi(0x2ee6ff, 5),
  red: emi(0xff2a2a, 5),
  green: emi(0x2aff5a, 5),
  olive: std(0x5f6d3b, { roughness: 0.65 }),
  enemyRed: std(0xb8352c, { roughness: 0.5 }),
  enemyDark: std(0x2f332b, { roughness: 0.6 }),
  hull: std(0x7c8590, { metalness: 0.45, roughness: 0.5 }),
  hullDark: std(0x3a4048, { metalness: 0.45, roughness: 0.6 }),
  cabin: std(0xdedbd2, { roughness: 0.7 }),
  concrete: std(0x9c9a92, { roughness: 0.92, metalness: 0 }),
  asphalt: std(0x37373b, { roughness: 0.9, metalness: 0 }),
  steel: std(0xc4492f, { metalness: 0.55, roughness: 0.42 }),
  yellow: std(0xffd23a, { roughness: 0.6, emissive: 0x332800 }),
  bossHull: std(0x3b4654, { metalness: 0.6, roughness: 0.4 }),
  bossDark: std(0x22272e, { metalness: 0.6, roughness: 0.5 }),
  enemyJet: std(0x8a2f2a, { metalness: 0.5, roughness: 0.35 }),
  drone: std(0x1c1f24, { metalness: 0.8, roughness: 0.3, flatShading: true }),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function shadows(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return root;
}

export function textTexture(text, color = '#ffffff', glow = '#00ffff', w = 128, h = 128, font = 'bold 84px Arial, sans-serif') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = glow;
  g.shadowBlur = 16;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 4);
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- jets
function wingGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.4);
  s.lineTo(4.4, -1.5);
  s.lineTo(4.4, -2.3);
  s.lineTo(0, -2.6);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
  g.translate(0, 0, -0.08);
  g.rotateX(-Math.PI / 2); // shape y -> -z (forward)
  return g;
}

function finGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1.9, 0);
  s.lineTo(2.1, 1.8);
  s.lineTo(1.3, 1.8);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
  g.translate(0, 0, -0.06);
  g.rotateY(-Math.PI / 2); // shape x -> +z (backwards)
  return g;
}

const WING = wingGeo();
const FIN = finGeo();

export function makeJet({ body = MAT.white, accent = MAT.blue, glow = MAT.engine, flameColor = 0xff9a40 } = {}) {
  const g = new THREE.Group();
  const fus = mesh(new THREE.CylinderGeometry(0.78, 0.55, 6, 10), body);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const nose = mesh(new THREE.ConeGeometry(0.55, 2.4, 10).rotateX(-Math.PI / 2), accent, 0, 0, -4.2);
  g.add(nose);
  const cockpit = mesh(new THREE.SphereGeometry(0.5, 14, 10), MAT.glass, 0, 0.45, -1.8);
  cockpit.scale.set(0.9, 0.75, 2.2);
  g.add(cockpit);
  const wr = mesh(WING, body, 0.4, -0.1, 0.4);
  const wl = mesh(WING, body, -0.4, -0.1, 0.4);
  wl.scale.x = -1;
  g.add(wr, wl);
  // wing accent stripes
  const stripeGeo = new THREE.BoxGeometry(1.2, 0.18, 0.5);
  const sr = mesh(stripeGeo, accent, 3.4, -0.05, 1.2);
  sr.rotation.y = -0.55;
  const sl = mesh(stripeGeo, accent, -3.4, -0.05, 1.2);
  sl.rotation.y = 0.55;
  g.add(sr, sl);
  // nav lights
  const navGeo = new THREE.SphereGeometry(0.14, 6, 4);
  g.add(mesh(navGeo, MAT.green, 4.45, 0, 2.0), mesh(navGeo, MAT.red, -4.45, 0, 2.0));
  const fr = mesh(FIN, accent, 0.55, 0.35, 1.0);
  fr.rotation.z = -0.35;
  const fl = mesh(FIN, accent, -0.55, 0.35, 1.0);
  fl.rotation.z = 0.35;
  g.add(fr, fl);
  const intakeGeo = new THREE.BoxGeometry(0.5, 0.6, 2.2);
  g.add(mesh(intakeGeo, MAT.dark, 0.9, -0.1, -0.4), mesh(intakeGeo, MAT.dark, -0.9, -0.1, -0.4));
  const nozGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.9, 10).rotateX(Math.PI / 2);
  const glowGeo = new THREE.CircleGeometry(0.32, 12);
  const flameGeo = new THREE.ConeGeometry(0.34, 2.6, 8, 1, true).rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: hdr(flameColor, 3),
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const sx of [-0.38, 0.38]) {
    g.add(mesh(nozGeo, MAT.dark, sx, 0, 3.3));
    g.add(mesh(glowGeo, glow, sx, 0, 3.76));
    const f = mesh(flameGeo, flameMat, sx, 0, 3.8 + 1.3);
    f.name = 'flame';
    f.castShadow = false;
    g.add(f);
  }
  shadows(g);
  g.traverse((o) => {
    if (o.name === 'flame') o.castShadow = false;
  });
  return g;
}

// ---------------------------------------------------------------- helicopter
function buildHeli() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(1, 14, 10), MAT.olive);
  body.scale.set(1.3, 1.15, 2.1);
  g.add(body);
  const canopy = mesh(new THREE.SphereGeometry(0.8, 12, 8), MAT.glass, 0, 0.3, -1.3);
  canopy.scale.set(1.05, 0.8, 1);
  g.add(canopy);
  const boom = mesh(new THREE.CylinderGeometry(0.35, 0.18, 4, 6).rotateX(Math.PI / 2), MAT.olive, 0, 0.3, 3.4);
  g.add(boom);
  g.add(mesh(new THREE.BoxGeometry(0.12, 1.3, 0.9), MAT.enemyRed, 0, 0.85, 5.2));
  const tr = mesh(new THREE.BoxGeometry(0.06, 1.7, 0.22), MAT.enemyDark, 0.2, 0.85, 5.3);
  tr.name = 'tailRotor';
  g.add(tr);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 6), MAT.enemyDark, 0, 1.25, 0));
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.y = 1.5;
  const bladeGeo = new THREE.BoxGeometry(8.5, 0.06, 0.38);
  const b1 = mesh(bladeGeo, MAT.enemyDark);
  const b2 = mesh(bladeGeo, MAT.enemyDark);
  b2.rotation.y = Math.PI / 2;
  rotor.add(b1, b2);
  g.add(rotor);
  const skidGeo = new THREE.BoxGeometry(0.12, 0.12, 3.4);
  g.add(mesh(skidGeo, MAT.enemyDark, 0.95, -1.35, 0), mesh(skidGeo, MAT.enemyDark, -0.95, -1.35, 0));
  const strutGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.8, 0.8]) g.add(mesh(strutGeo, MAT.enemyDark, sx, -1.05, sz));
  const stripe = mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.3, 14), MAT.enemyRed, 0, 0, 0.5);
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1.3, 1, 1.15);
  g.add(stripe);
  const podGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.4, 6).rotateX(Math.PI / 2);
  g.add(mesh(podGeo, MAT.enemyDark, 1.5, -0.4, -0.2), mesh(podGeo, MAT.enemyDark, -1.5, -0.4, -0.2));
  g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), MAT.red, 0, -1.15, 0.6));
  g.rotation.order = 'YXZ';
  return shadows(g);
}

// ---------------------------------------------------------------- patrol boat
function buildShip() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.3, -2.6);
  s.lineTo(1.3, -2.6);
  s.lineTo(1.3, 1.6);
  s.lineTo(0, 3.5);
  s.lineTo(-1.3, 1.6);
  s.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 1 });
  hullGeo.rotateX(-Math.PI / 2);
  g.add(mesh(hullGeo, MAT.hull, 0, -0.5, 0));
  const stripeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
  stripeGeo.rotateX(-Math.PI / 2);
  const stripe = mesh(stripeGeo, MAT.enemyRed, 0, -0.45, 0);
  stripe.scale.set(1.08, 1, 1.04);
  g.add(stripe);
  g.add(mesh(new THREE.BoxGeometry(1.9, 1.1, 2.0), MAT.cabin, 0, 1.3, 0.6));
  g.add(mesh(new THREE.BoxGeometry(1.95, 0.32, 1.2), MAT.glass, 0, 1.55, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), MAT.cabin, 0, 2.2, 0.9));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5), MAT.hullDark, 0, 3.4, 1.0));
  const radar = mesh(new THREE.BoxGeometry(1.1, 0.12, 0.2), MAT.hullDark, 0, 4.3, 1.0);
  radar.name = 'radar';
  g.add(radar);
  const gun = new THREE.Group();
  gun.position.set(0, 1.0, -1.7);
  gun.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.45, 8), MAT.hullDark));
  gun.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6).rotateX(Math.PI / 2), MAT.hullDark, 0, 0.15, -0.8));
  g.add(gun);
  g.add(mesh(new THREE.SphereGeometry(0.12, 6, 4), MAT.red, 0, 4.55, 1.0));
  g.rotation.order = 'YXZ';
  return shadows(g);
}

// ---------------------------------------------------------------- fuel depot
let fuelTex = null;
function fuelTexture() {
  if (fuelTex) return fuelTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f4f4f4' : '#d7262b';
    g.fillRect(0, i * 32, 128, 32);
  }
  g.fillStyle = '#111';
  g.globalAlpha = 0.9;
  g.font = 'bold 50px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = '#fff';
  ['F', 'U', 'E', 'L'].forEach((ch, i) => {
    g.strokeText(ch, 64, 32 + i * 64);
    g.fillText(ch, 64, 32 + i * 64);
  });
  fuelTex = new THREE.CanvasTexture(c);
  fuelTex.colorSpace = THREE.SRGBColorSpace;
  return fuelTex;
}

function buildFuel() {
  const g = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ map: fuelTexture(), roughness: 0.6 });
  const side = new THREE.MeshStandardMaterial({ color: 0xd7262b, roughness: 0.55 });
  const end = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55 });
  g.add(mesh(new THREE.BoxGeometry(3.4, 1.4, 7), [side, side, top, side, end, end], 0, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(4.0, 0.45, 7.6), MAT.hullDark, 0, -0.3, 0));
  const b = new THREE.SphereGeometry(0.22, 8, 6);
  const b1 = mesh(b, MAT.green, 1.6, 1.45, -3.3);
  const b2 = mesh(b, MAT.green, -1.6, 1.45, 3.3);
  b1.name = 'beacon';
  b2.name = 'beacon';
  g.add(b1, b2);
  return shadows(g);
}

// ---------------------------------------------------------------- turret
function buildTurret() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.8, 2.3, 1.4, 8), MAT.concrete, 0, 0.3, 0));
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.0;
  head.add(mesh(new THREE.SphereGeometry(1.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.enemyDark));
  const barGeo = new THREE.CylinderGeometry(0.2, 0.24, 3.2, 6).rotateX(Math.PI / 2);
  head.add(mesh(barGeo, MAT.hullDark, 0.35, 0.6, -1.7), mesh(barGeo, MAT.hullDark, -0.35, 0.6, -1.7));
  head.add(mesh(new THREE.BoxGeometry(1.2, 0.25, 0.25), MAT.red, 0, 1.0, -0.6));
  g.add(head);
  return shadows(g);
}

// ---------------------------------------------------------------- kamikaze drone
function buildDrone() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), MAT.drone));
  const eye = mesh(new THREE.TorusGeometry(0.62, 0.12, 6, 16), MAT.red, 0, 0, 0.85);
  g.add(eye);
  g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), MAT.red, 0, 0, 0.9));
  const armGeo = new THREE.BoxGeometry(3.6, 0.12, 0.2);
  const a1 = mesh(armGeo, MAT.hullDark);
  a1.rotation.y = Math.PI / 4;
  const a2 = mesh(armGeo, MAT.hullDark);
  a2.rotation.y = -Math.PI / 4;
  g.add(a1, a2);
  const propGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.04, 12);
  const propMat = new THREE.MeshBasicMaterial({ color: 0x99aabb, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [x, z] of [[1.27, 1.27], [-1.27, 1.27], [1.27, -1.27], [-1.27, -1.27]]) g.add(mesh(propGeo, propMat, x, 0.15, z));
  return shadows(g);
}

// ---------------------------------------------------------------- boss battleship
function buildBoss() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-5.5, 15);
  s.lineTo(5.5, 15);
  s.lineTo(6.5, -6);
  s.lineTo(0, -18);
  s.lineTo(-6.5, -6);
  s.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
  hullGeo.rotateX(-Math.PI / 2); // bow (y=-18) -> z=+18, facing the player
  g.add(mesh(hullGeo, MAT.bossHull, 0, -1.4, 0));
  const stripeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false });
  stripeGeo.rotateX(-Math.PI / 2);
  const st = mesh(stripeGeo, MAT.red, 0, -1.0, 0);
  st.scale.set(1.04, 1, 1.02);
  g.add(st);
  g.add(mesh(new THREE.BoxGeometry(7, 3, 9), MAT.bossDark, 0, 3.4, -2));
  g.add(mesh(new THREE.BoxGeometry(4.5, 3.6, 3.5), MAT.bossHull, 0, 6.6, -3));
  g.add(mesh(new THREE.BoxGeometry(4.6, 0.5, 3.6), MAT.red, 0, 7.4, -3));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), MAT.bossDark, 0, 9.8, -3));
  const radar = mesh(new THREE.BoxGeometry(3.2, 0.5, 0.3), MAT.bossDark, 0, 11.2, -3);
  radar.name = 'radar';
  g.add(radar);
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.3, 4, 10), MAT.bossDark, 0, 5, -9));
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 10), MAT.engine, 0, 7.05, -9));
  const core = mesh(new THREE.SphereGeometry(1.3, 16, 12), MAT.red, 0, 2.6, 5);
  core.name = 'core';
  g.add(core);
  const turretPos = [[0, 2.4, 11], [-3.8, 2.4, -6], [3.8, 2.4, -6]];
  const barGeo = new THREE.CylinderGeometry(0.22, 0.26, 3.4, 6).rotateX(Math.PI / 2);
  turretPos.forEach(([x, y, z], i) => {
    const base = mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.9, 10), MAT.bossDark, x, y, z);
    g.add(base);
    const head = new THREE.Group();
    head.name = 'turret' + i;
    head.position.set(x, y + 0.9, z);
    head.add(mesh(new THREE.BoxGeometry(2.4, 1.1, 2.6), MAT.bossHull));
    head.add(mesh(barGeo, MAT.bossDark, 0.45, 0.1, 2.6), mesh(barGeo, MAT.bossDark, -0.45, 0.1, 2.6));
    head.add(mesh(new THREE.BoxGeometry(1.6, 0.2, 0.1), MAT.red, 0, 0.35, 1.32));
    g.add(head);
  });
  const lightGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  for (let z = -12; z <= 12; z += 6) {
    g.add(mesh(lightGeo, MAT.cyan, 6.0 - Math.max(0, z - 6) * 0.15, 1.2, z), mesh(lightGeo, MAT.cyan, -6.0 + Math.max(0, z - 6) * 0.15, 1.2, z));
  }
  return shadows(g);
}

// ---------------------------------------------------------------- bridge (unique per instance)
export function makeBridge(width) {
  const g = new THREE.Group();
  const deck = mesh(new THREE.BoxGeometry(width, 1.0, 6), MAT.asphalt, 0, 3.0, 0);
  g.add(deck);
  g.add(mesh(new THREE.BoxGeometry(width, 0.06, 0.3), MAT.yellow, 0, 3.53, 0));
  const railGeo = new THREE.BoxGeometry(width, 0.25, 0.25);
  g.add(mesh(railGeo, MAT.steel, 0, 4.4, 2.85), mesh(railGeo, MAT.steel, 0, 4.4, -2.85));
  const hw = (width - 36) / 2;
  const R = hw + 6;
  const archGeo = new THREE.TorusGeometry(R, 0.35, 6, 32, Math.PI);
  for (const z of [-2.85, 2.85]) {
    const a = mesh(archGeo, MAT.steel, 0, 3.4, z);
    a.scale.y = 0.42;
    g.add(a);
  }
  // hangers
  const hangerGeo = new THREE.BoxGeometry(0.15, 1, 0.15);
  const n = Math.floor((2 * R) / 3);
  const hangers = new THREE.InstancedMesh(hangerGeo, MAT.steel, n * 2);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 1; i <= n; i++) {
    const x = -R + (i * 2 * R) / (n + 1);
    const h = Math.sqrt(Math.max(0, R * R - x * x)) * 0.42;
    for (const z of [-2.85, 2.85]) {
      m4.makeScale(1, Math.max(0.01, h), 1);
      m4.setPosition(x, 3.4 + h / 2, z);
      hangers.setMatrixAt(k++, m4);
    }
  }
  g.add(hangers);
  const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 8, 8);
  for (const x of [-(hw - 2), hw - 2]) g.add(mesh(pillarGeo, MAT.concrete, x, -1.2, 0));
  const abGeo = new THREE.BoxGeometry(16, 5, 8);
  g.add(mesh(abGeo, MAT.concrete, -(width / 2 - 8), 0.9, 0), mesh(abGeo, MAT.concrete, width / 2 - 8, 0.9, 0));
  // warning lights
  const lg = new THREE.SphereGeometry(0.2, 6, 4);
  for (let x = -hw; x <= hw; x += 6) g.add(mesh(lg, MAT.red, x, 3.6, 3.05));
  return shadows(g);
}

// ---------------------------------------------------------------- powerups
const PU_CORE = new THREE.OctahedronGeometry(1.1, 0);
const PU_CAGE = new THREE.IcosahedronGeometry(1.9, 0);
const PU_RING = new THREE.RingGeometry(2.2, 2.7, 32).rotateX(-Math.PI / 2);
const puCache = {};
function puMats(type) {
  if (puCache[type]) return puCache[type];
  const def = POWERUPS[type];
  const hex = '#' + new THREE.Color(def.color).getHexString();
  return (puCache[type] = {
    core: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: def.color, emissiveIntensity: 2.2, flatShading: true, metalness: 0.3, roughness: 0.3 }),
    cage: new THREE.MeshBasicMaterial({ color: hdr(def.color, 2), wireframe: true, transparent: true, opacity: 0.8 }),
    ring: new THREE.MeshBasicMaterial({ color: hdr(def.color, 2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    sprite: new THREE.SpriteMaterial({ map: textTexture(def.label, '#ffffff', hex), transparent: true, depthWrite: false }),
  });
}

export function makePowerup(type, waterY) {
  const m = puMats(type);
  const g = new THREE.Group();
  const core = new THREE.Mesh(PU_CORE, m.core);
  core.name = 'core';
  const cage = new THREE.Mesh(PU_CAGE, m.cage);
  cage.name = 'cage';
  const spr = new THREE.Sprite(m.sprite);
  spr.scale.set(2.6, 2.6, 1);
  spr.position.y = 2.7;
  const ring = new THREE.Mesh(PU_RING, m.ring);
  ring.name = 'ring';
  ring.position.y = waterY;
  core.castShadow = true;
  g.add(core, cage, spr, ring);
  return g;
}

// ---------------------------------------------------------------- cache
const BUILDERS = {
  heli: buildHeli,
  ship: buildShip,
  fuel: buildFuel,
  turret: buildTurret,
  drone: buildDrone,
  boss: buildBoss,
  enemyJet: () => {
    const j = makeJet({ body: MAT.enemyJet, accent: MAT.enemyDark, glow: MAT.red, flameColor: 0xff4020 });
    j.rotation.order = 'YXZ';
    return j;
  },
};
const cache = {};
export function cloneModel(key) {
  if (!cache[key]) cache[key] = BUILDERS[key]();
  return cache[key].clone();
}
export function prewarmModels() {
  for (const k of Object.keys(BUILDERS)) if (!cache[k]) cache[k] = BUILDERS[k]();
}
