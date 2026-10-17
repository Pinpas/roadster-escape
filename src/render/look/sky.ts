import {
  BackSide,
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type BufferGeometry,
  type IUniform,
  type Material,
} from 'three';
import { palette } from '../palette';
import { merge, scatter } from '../world/geometry';
import { hazeGLSL, hazeUniforms, planeUniforms } from './haze';

const noiseGLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}
`;

export interface Sky {
  readonly dome: Mesh;
  readonly clouds: Mesh;
  /** Keep the dome and the cloud ring centred on the camera; drift the cloud decks with time. */
  follow(cameraX: number, cameraY: number, cameraZ: number, t: number): void;
}

/**
 * Painted sunset sky: a stroked gradient, a big stepped sun halo, and stratified cloud decks in
 * three quantised tones. Drawn last at the far plane, so only uncovered pixels pay for it.
 * `sunGlow` adds an HDR core around the sun for the bloom pass; the low tier passes 0.
 */
function skyDome(sunGlow: number, time: IUniform<number>): Mesh {
  const c = (hex: string) => ({ value: new Color(hex) });
  const material = new ShaderMaterial({
    uniforms: {
      ...hazeUniforms,
      ...planeUniforms(undefined),
      uSkyLow: c(palette.skyLow),
      uSkyMid: c(palette.skyMid),
      uSkyTop: c(palette.skyTop),
      uHalo: c(palette.sunCore),
      uCloudCore: c(palette.cloudCore),
      uCloudBody: c(palette.cloudBody),
      uCloudEdge: c(palette.cloudEdge),
      uSunGlow: { value: sunGlow },
      uTime: time,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyLow;
      uniform vec3 uSkyMid;
      uniform vec3 uSkyTop;
      uniform vec3 uHalo;
      uniform vec3 uCloudCore;
      uniform vec3 uCloudBody;
      uniform vec3 uCloudEdge;
      uniform float uSunGlow;
      uniform float uTime;
      varying vec3 vDir;
      ${noiseGLSL}
      ${hazeGLSL}

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float az = atan(d.x, -d.z);

        float stroke = vnoise2(vec2(az * 7.0, h * 160.0)) - 0.5;
        float hj = h + stroke * 0.014;
        vec3 col = hazeColor(d);
        col = mix(col, uSkyLow, smoothstep(0.015, 0.11, hj));
        col = mix(col, uSkyMid, smoothstep(0.09, 0.3, hj));
        col = mix(col, uSkyTop, smoothstep(0.26, 0.8, hj));

        float s = max(dot(d, uSunDir), 0.0);
        float halo = pow(s, 2.5) * 0.34 + pow(s, 10.0) * 0.3 + smoothstep(0.95, 0.985, s) * 0.18 + smoothstep(0.985, 0.996, s) * 0.25;
        col = mix(col, uHalo, clamp(halo, 0.0, 1.0));

        vec2 p = d.xz / (max(h, 0.0) + 0.07);
        p = vec2(p.x * 0.17, p.y * 0.62) + vec2(uTime * 0.012, 0.0);
        float n = fbm2(p);
        float deck = 0.13 * exp(-pow((h - 0.06) / 0.035, 2.0))
                   + 0.11 * exp(-pow((h - 0.16) / 0.05, 2.0))
                   + 0.14 * exp(-pow((h - 0.36) / 0.11, 2.0));
        float dens = n + deck - 0.6;
        float cover = smoothstep(0.0, 0.04, dens) * smoothstep(0.004, 0.035, h);
        float body = smoothstep(0.06, 0.09, dens);
        float core = smoothstep(0.13, 0.16, dens);
        float sunNear = pow(s, 6.0);
        vec3 edge = mix(uCloudEdge, uHalo * 1.15, sunNear);
        vec3 cloud = mix(edge, mix(uCloudBody, uCloudEdge, sunNear * 0.6), body);
        cloud = mix(cloud, mix(uCloudCore, uCloudBody, sunNear * 0.5), core);
        col = mix(col, cloud, cover);

        float wisp = vnoise2(vec2(az * 2.2 + 3.0, h * 26.0)) * 0.7 + vnoise2(vec2(az * 7.0, h * 70.0)) * 0.3;
        float high = smoothstep(0.2, 0.32, h) * (1.0 - smoothstep(0.62, 0.8, h));
        col = mix(col, mix(uCloudBody, uCloudEdge, 0.5), smoothstep(0.6, 0.7, wisp) * high * 0.45);

        float disc = smoothstep(0.9993, 0.99965, s) * (1.0 - cover * 0.7);
        col = mix(col, vec3(1.0, 0.96, 0.86), disc);
        col += uHazeSun * (pow(s, 24.0) * 0.6 + pow(s, 300.0) * 2.5) * uSunGlow * (1.0 - cover * 0.6);
        col += uHalo * disc * 15.0 * uSunGlow;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(100, 16, 10), material);
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  return mesh;
}

/** Chunky flat-bottomed cumulus: clusters of low-poly spheres far out in the sky, one mesh. */
function cloudGeometry(): BufferGeometry {
  const r = scatter(23);
  const top = new Color(palette.cloudTop);
  const base = new Color(palette.cloudBase);
  const parts: BufferGeometry[] = [];
  for (const azDeg of [-54, -40, -24, -10, 4, 18, 33, 50]) {
    const az = ((azDeg + (r() - 0.5) * 8) * Math.PI) / 180;
    const dist = 2900 + r() * 650;
    const elev = ((4 + r() * 13) * Math.PI) / 180;
    const width = 280 + r() * 360;
    const puffs = 5 + Math.floor(r() * 5);
    for (let i = 0; i < puffs; i++) {
      const u = (i / (puffs - 1)) * 2 - 1;
      const rad = width * (0.17 + 0.16 * (1 - Math.abs(u)) + r() * 0.06);
      const g = new IcosahedronGeometry(1, 1);
      g.deleteAttribute('uv');
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const col = new Float32Array(pos.count * 3);
      const k = new Color();
      for (let v = 0; v < pos.count; v++) {
        let y = pos.getY(v);
        if (y < -0.28) {
          y = -0.28;
          nor.setXYZ(v, nor.getX(v) * 0.3, -1, nor.getZ(v) * 0.3);
        }
        pos.setY(v, y);
        k.copy(base).lerp(top, Math.min(1, Math.max(0, y * 0.8 + 0.5)));
        col.set([k.r, k.g, k.b], v * 3);
      }
      g.setAttribute('color', new BufferAttribute(col, 3));
      g.scale(rad * 1.25, rad, rad);
      g.translate(u * width * 0.5, rad * 0.28 + r() * rad * 0.25, (r() - 0.5) * width * 0.25);
      g.rotateY(-az);
      g.translate(Math.sin(az) * dist, Math.tan(elev) * dist, -Math.cos(az) * dist);
      parts.push(g);
    }
  }
  const g = merge(parts);
  g.normalizeNormals();
  return g;
}

export function createSky(cloudMaterial: Material, sunGlow: number): Sky {
  const time = { value: 0 };
  const dome = skyDome(sunGlow, time);
  const clouds = new Mesh(cloudGeometry(), cloudMaterial);
  clouds.frustumCulled = false;
  return {
    dome,
    clouds,
    follow(x, y, z, t) {
      time.value = t;
      dome.position.set(x, y, z);
      clouds.position.set(x, 0, z);
      clouds.rotation.y = Math.sin(t * 0.01) * 0.08;
    },
  };
}
