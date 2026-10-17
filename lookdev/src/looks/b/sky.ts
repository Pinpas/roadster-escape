import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { merge } from '../../common/geometry';
import { hazeGLSL, shared, toon } from './shading';
import { tune } from './tune';

export function skyDome(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: { ...shared, uSunCore: { value: new Color(tune.sunCore) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${hazeGLSL}
      uniform vec3 uSunCore;
      void main() {
        vec3 dir = normalize(vDir);
        float s = max(dot(dir, uSunDir), 0.0);
        vec3 col = mix(sqrt(bHaze(dir)), sqrt(uSkyTop), pow(smoothstep(-0.01, 0.42, dir.y), 0.7));
        col *= col;
        col += uHazeSun * (pow(s, 24.0) * 0.6 + pow(s, 300.0) * 2.5);
        col += uSunCore * smoothstep(0.99955, 0.9998, s) * 16.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const dome = new Mesh(new SphereGeometry(4000, 24, 12), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Chunky flat-bottomed cumulus: clusters of low-poly spheres far out in the sky, merged into one mesh. */
function cloudGeometry(): BufferGeometry {
  const r = rand(23);
  const top = new Color('#fff6ec');
  const base = new Color('#e6dcf0');
  const parts: BufferGeometry[] = [];
  const azimuths = [-54, -40, -24, -10, 4, 18, 33, 50];
  for (const azDeg of azimuths) {
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
      nor.needsUpdate = true;
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

export function clouds(): Mesh {
  const mesh = new Mesh(cloudGeometry(), toon({ B_HERO: '', B_CLOUD: '' }, tune.cloudFog));
  mesh.frustumCulled = false;
  return mesh;
}
