import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { fbm, valueNoise, mulberry32, smoothstep, clamp } from './util.js';

const XS = (() => {
  const a = [];
  for (let x = -330; x < -210; x += 15) a.push(x);
  for (let x = -210; x < -90; x += 6) a.push(x);
  for (let x = -90; x <= 90.001; x += 2.5) a.push(x);
  for (let x = 96; x <= 210; x += 6) a.push(x);
  for (let x = 225; x <= 330; x += 15) a.push(x);
  return a;
})();
const ZSTEP = 3;

function colorize(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function strip(g) {
  g.deleteAttribute('uv');
  return g;
}

function pineGeo() {
  const trunk = colorize(strip(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 5).translate(0, 0.6, 0)), 0x6b4a2b);
  const c1 = colorize(strip(new THREE.ConeGeometry(1.6, 3.2, 6).translate(0, 2.6, 0)), 0x2f6b2a);
  const c2 = colorize(strip(new THREE.ConeGeometry(1.15, 2.4, 6).translate(0, 3.9, 0)), 0x3a8a33);
  return mergeGeometries([trunk, c1, c2]);
}
function roundTreeGeo() {
  const trunk = colorize(strip(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5).translate(0, 0.8, 0)), 0x6b4a2b);
  const top = colorize(strip(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 2.8, 0)), 0x5aa83a);
  const n = top.index ? top : top;
  return mergeGeometries([trunk.toNonIndexed(), n.index ? n.toNonIndexed() : n]);
}
function houseGeo() {
  const body = colorize(strip(new THREE.BoxGeometry(3, 2.2, 3.6).translate(0, 1.1, 0)), 0xf1ebe0).toNonIndexed();
  const roof = colorize(strip(new THREE.ConeGeometry(2.8, 1.6, 4).rotateY(Math.PI / 4).translate(0, 3.0, 0)), 0xb8432f).toNonIndexed();
  roof.scale(1, 1, 1.25);
  return mergeGeometries([body, roof]);
}

export class Terrain {
  constructor(scene, river, seed) {
    this.scene = scene;
    this.river = river;
    this.seed = seed;
    this.chunks = new Map();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
    this.pine = pineGeo();
    this.round = roundTreeGeo();
    this.house = houseGeo();
    this.rock = new THREE.IcosahedronGeometry(1, 0);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, flatShading: true, roughness: 0.95 });
    this._s = { cx: 0, hw: 0, iw: 0 };
    this._c = new THREE.Color();
  }

  _h(x, d, s) {
    const ax = Math.abs(x - s.cx);
    let e = ax - s.hw;
    if (s.iw > 0) {
      const ie = s.iw - ax;
      if (ie > e) e = ie;
    }
    if (e < 0) return -1.0 - Math.min(-e, 8) * 0.45;
    const n1 = fbm(x * 0.022, d * 0.022, 4, this.seed);
    const hills = smoothstep(3, 45, e) * n1 * n1 * 40;
    const bump = (valueNoise(x * 0.15, d * 0.15, this.seed + 7) - 0.5) * 0.9 * smoothstep(1, 4, e);
    return 0.5 + Math.min(e, 2.2) + hills + bump;
  }

  height(x, d) {
    return this._h(x, d, this.river.sampleD(d, this._s));
  }

  _color(h, ny, x, d, out) {
    const v = valueNoise(x * 0.08, d * 0.08, this.seed + 3);
    if (h < -0.2) {
      out.setRGB(0.42, 0.37, 0.26);
      out.multiplyScalar(0.55 + 0.45 * clamp(1 + h / 4.5, 0, 1));
      return out;
    }
    if (h < 1.5) out.setHex(0xd8c48a);
    else if (ny < 0.72 && h > 2.5) out.setHex(0x8a7f70);
    else if (h < 9) out.setHex(v > 0.5 ? 0x6aaa3c : 0x5b9a34);
    else if (h < 15) out.setHex(0x427f2e);
    else if (h < 21) out.setHex(0x8d8578);
    else out.setHex(0xf2f5f8);
    out.offsetHSL(0, 0, (v - 0.5) * 0.06);
    return out;
  }

  update(playerD) {
    const CL = CFG.CHUNK_LEN;
    const c0 = Math.floor((playerD - CFG.VIEW_BEHIND) / CL);
    const c1 = Math.floor((playerD + CFG.VIEW_AHEAD) / CL);
    const created = [];
    for (const [c, obj] of this.chunks) {
      if (c < c0 || c > c1) {
        this._dispose(obj);
        this.chunks.delete(c);
      }
    }
    for (let c = c0; c <= c1; c++) {
      if (!this.chunks.has(c)) {
        this.chunks.set(c, this._build(c));
        created.push(c);
      }
    }
    return created;
  }

  _dispose(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
    });
  }

  dispose() {
    for (const obj of this.chunks.values()) this._dispose(obj);
    this.chunks.clear();
  }

  _build(c) {
    const CL = CFG.CHUNK_LEN;
    const d0 = c * CL;
    const rows = Math.round(CL / ZSTEP);
    const nx = XS.length, nz = rows + 1;
    const H = new Float32Array(nx * nz);
    const s = this._s;
    for (let r = 0; r < nz; r++) {
      const d = d0 + r * ZSTEP;
      this.river.sampleD(d, s);
      for (let i = 0; i < nx; i++) H[r * nx + i] = this._h(XS[i], d, s);
    }
    const tris = (nx - 1) * (nz - 1) * 2;
    const pos = new Float32Array(tris * 9);
    const nor = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    let p = 0;
    const C = this._c;
    const put = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
      let flip = false;
      if (nY < 0) { nX = -nX; nY = -nY; nZ = -nZ; flip = true; }
      const l = Math.hypot(nX, nY, nZ) || 1;
      nX /= l; nY /= l; nZ /= l;
      this._color((ay + by + cy) / 3, nY, (ax + bx + cx) / 3, -(az + bz + cz) / 3, C);
      const verts = flip ? [ax, ay, az, cx, cy, cz, bx, by, bz] : [ax, ay, az, bx, by, bz, cx, cy, cz];
      for (let k = 0; k < 3; k++) {
        pos[p] = verts[k * 3]; pos[p + 1] = verts[k * 3 + 1]; pos[p + 2] = verts[k * 3 + 2];
        nor[p] = nX; nor[p + 1] = nY; nor[p + 2] = nZ;
        col[p] = C.r; col[p + 1] = C.g; col[p + 2] = C.b;
        p += 3;
      }
    };
    for (let r = 0; r < nz - 1; r++) {
      const z0 = -(d0 + r * ZSTEP), z1 = -(d0 + (r + 1) * ZSTEP);
      for (let i = 0; i < nx - 1; i++) {
        const x0 = XS[i], x1 = XS[i + 1];
        const h00 = H[r * nx + i], h10 = H[r * nx + i + 1], h01 = H[(r + 1) * nx + i], h11 = H[(r + 1) * nx + i + 1];
        if ((i + r) & 1) {
          put(x0, h00, z0, x1, h10, z0, x0, h01, z1);
          put(x1, h10, z0, x1, h11, z1, x0, h01, z1);
        } else {
          put(x0, h00, z0, x1, h11, z1, x0, h01, z1);
          put(x0, h00, z0, x1, h10, z0, x1, h11, z1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const ground = new THREE.Mesh(geo, this.mat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    ground.userData.ownGeo = true;
    const group = new THREE.Group();
    group.add(ground);
    this._decorate(group, c, d0, CL);
    this.scene.add(group);
    return group;
  }

  _decorate(group, c, d0, CL) {
    const rng = mulberry32(this.seed * 13 + c * 7919 + 5);
    const pines = [], rounds = [], rocks = [], houses = [];
    for (let k = 0; k < 340; k++) {
      const x = (rng() * 2 - 1) * 210;
      const d = d0 + rng() * CL;
      const e = this.river.landDist(x, -d);
      if (e < 3) continue;
      const h = this.height(x, d);
      if (h > 15) continue;
      const dens = valueNoise(x * 0.03, d * 0.03, this.seed + 11);
      if (dens < 0.4) continue;
      (h > 7 || rng() < 0.45 ? pines : rounds).push([x, h, d, 0.7 + rng() * 0.9, rng() * 6.28]);
    }
    for (let k = 0; k < 30; k++) {
      const x = (rng() * 2 - 1) * 200;
      const d = d0 + rng() * CL;
      if (this.river.landDist(x, -d) < 1) continue;
      rocks.push([x, this.height(x, d), d, 0.5 + rng() * 1.8, rng() * 6.28]);
    }
    if (valueNoise(c * 0.71, 3.3, this.seed) > 0.55) {
      const side = rng() < 0.5 ? -1 : 1;
      const dc = d0 + rng() * CL;
      const n = 4 + Math.floor(rng() * 7);
      for (let k = 0; k < n; k++) {
        const d = dc + (rng() - 0.5) * 40;
        const s = this.river.sampleD(d, this._s);
        const x = s.cx + side * (s.hw + 7 + rng() * 28);
        const h = this.height(x, d);
        if (h > 6 || this.river.landDist(x, -d) < 5) continue;
        houses.push([x, h - 0.2, d, 0.9 + rng() * 0.4, (rng() * 4 | 0) * Math.PI / 2 + (rng() - 0.5) * 0.3]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const inst = (geo, mat, list, colorVar, shadow) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, d, s, r], i) => {
        q.setFromAxisAngle(yAxis, r);
        v.set(x, y - 0.3, -d);
        sc.set(s, s * (0.9 + (i % 5) * 0.06), s);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (colorVar) {
          col.setScalar(0.8 + ((i * 37) % 11) / 25);
          im.setColorAt(i, col);
        }
      });
      im.castShadow = shadow;
      im.receiveShadow = true;
      group.add(im);
    };
    inst(this.pine, this.treeMat, pines, true, true);
    inst(this.round, this.treeMat, rounds, true, true);
    inst(this.rock, this.rockMat, rocks, true, true);
    inst(this.house, this.treeMat, houses, false, true);
  }
}
