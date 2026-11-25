import * as THREE from 'three';
import { CFG } from './config.js';

const N = 512; // river samples in the data texture

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(wp.x * 0.15 + uTime * 1.5) * 0.12 + sin(wp.z * 0.2 + uTime * 2.0) * 0.12;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform sampler2D uRiver;
uniform float uD0;
varying vec3 vWorld;

float landDist(vec2 p) {
  float f = clamp((-p.y - uD0) / ${CFG.DZ.toFixed(1)}, 0.0, ${(N - 2).toFixed(1)});
  int i = int(floor(f));
  float t = fract(f);
  vec3 a = texelFetch(uRiver, ivec2(i, 0), 0).xyz;
  vec3 b = texelFetch(uRiver, ivec2(i + 1, 0), 0).xyz;
  vec3 r = mix(a, b, t);
  float ax = abs(p.x - r.x);
  float e = ax - r.y;
  if (r.z > 0.0) e = max(e, r.z - ax);
  return e;
}

vec3 waveNormal(vec2 p) {
  float t = uTime;
  vec2 g = vec2(0.0);
  g += 0.12 * vec2(0.15, 0.0) * cos(p.x * 0.15 + t * 1.5);
  g += 0.12 * vec2(0.0, 0.2) * cos(p.y * 0.2 + t * 2.0);
  g += 0.05 * vec2(0.9, 0.6) * cos(dot(p, vec2(0.9, 0.6)) + t * 3.1);
  g += 0.04 * vec2(-0.7, 1.1) * cos(dot(p, vec2(-0.7, 1.1)) + t * 2.7);
  g += 0.025 * vec2(1.7, -1.3) * cos(dot(p, vec2(1.7, -1.3)) + t * 4.3);
  g += 0.015 * vec2(2.9, 2.3) * cos(dot(p, vec2(2.9, 2.3)) - t * 5.1);
  return normalize(vec3(-g.x * 3.0, 1.0, -g.y * 3.0));
}

void main() {
  float e = landDist(vWorld.xz);
  if (e > 2.5) discard;
  vec3 n = waveNormal(vWorld.xz);
  vec3 v = normalize(cameraPosition - vWorld);
  float depthF = smoothstep(0.0, 14.0, -e);
  vec3 col = mix(uShallow, uDeep, depthF);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  col = mix(col, uSky, fres * 0.6);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 220.0);
  col += uSunColor * spec * 1.3;
  float fn = sin(vWorld.x * 1.3 + uTime * 2.0) * sin(vWorld.z * 1.1 - uTime * 1.7);
  float foam = smoothstep(-2.4 + fn * 0.6, -0.1, e);
  float flow = sin(vWorld.z * 0.35 + uTime * 4.0 + sin(vWorld.x * 0.2) * 2.0) * sin(vWorld.x * 1.7 + sin(vWorld.z * 0.03) * 6.0);
  col += vec3(smoothstep(0.85, 1.0, flow)) * 0.05 * (1.0 - foam);
  col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.8);
  float alpha = mix(0.78, 0.96, max(depthF, foam));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Water {
  constructor(scene, river) {
    this.river = river;
    this.data = new Float32Array(N * 4);
    this.tex = new THREE.DataTexture(this.data, N, 1, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0c4a6e) },
        uShallow: { value: new THREE.Color(0x2ba5b5) },
        uSky: { value: new THREE.Color(0xb4dcf0) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uRiver: { value: null },
        uD0: { value: 0 },
      },
    ]);
    this.uniforms.uRiver.value = this.tex;
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      fog: true,
    });
    const geo = new THREE.PlaneGeometry(460, 660, 92, 132).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  setRiver(river) {
    this.river = river;
  }

  update(playerD, time) {
    const d0 = Math.max(0, Math.floor((playerD - 110) / CFG.DZ) * CFG.DZ);
    this.river.fill(this.data, d0, N);
    this.tex.needsUpdate = true;
    this.uniforms.uD0.value = d0;
    this.uniforms.uTime.value = time;
    // snap to the vertex grid to avoid swimming waves
    const z = -playerD - 220;
    this.mesh.position.set(0, 0, Math.round(z / 5) * 5);
  }
}
