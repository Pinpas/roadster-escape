import {
  BackSide,
  Color,
  Mesh,
  NoToneMapping,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { assignMaterials, type Look } from '../../common/look';
import { SUN_DIR, type Part } from '../../common/world';
import { fog, noise } from './glsl';

const c = (hex: string) => new Color(hex);

/** One shared uniform block, so tuning a value retunes every material at once. */
const shared = {
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: c('#ffd9a0').multiplyScalar(1.15) },
  uShadowTint: { value: c('#7d72d6') },
  uSkyFill: { value: c('#8fa6e8') },
  uGroundFill: { value: c('#e09a6a') },
  uRimColor: { value: c('#ffd29a') },
  uFogColor: { value: c('#f7b994') },
  uFogSunColor: { value: c('#ffd7a3') },
  uFogDensity: { value: 0.00052 },
  uFogFalloff: { value: 0.0042 },
  uSkyTop: { value: c('#4f86d6') },
  uSkyMid: { value: c('#a9b6e6') },
  uSkyHorizon: { value: c('#ffc89a') },
  uTime: { value: 0 },
};

const vertex = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vColor = color;
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
}
`;

const fragment = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform vec3 uSkyFill;
uniform vec3 uGroundFill;
uniform vec3 uRimColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uRim;
uniform float uFogExtra;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vNormalW;
${fog}
${noise}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = uSunDir;
  vec3 albedo = vColor;

  #ifdef GROUND
    float grain = fbm(vWorldPos.xz * 0.35) - 0.5;
    albedo *= 1.0 + grain * 0.12;
  #endif

  #ifdef EMISSIVE
    float white = step(0.78, min(albedo.r, min(albedo.g, albedo.b)));
    vec3 glow = mix(albedo * 1.8, vec3(0.55, 0.75, 1.0), white);
    gl_FragColor = vec4(applyFog(glow, vWorldPos, 0.6), 1.0);
    #include <colorspace_fragment>
    return;
  #endif

  float ndl = dot(N, L);
  float lit = clamp(ndl, 0.0, 1.0) * getShadowMask();
  // Three soft bands: shadow, a narrow terminator band, full sun.
  float band = 0.45 * smoothstep(0.015, 0.06, lit) + 0.55 * smoothstep(0.11, 0.17, lit);

  vec3 shadowCol = albedo * uShadowTint * 0.62;
  vec3 litCol = albedo * uSunColor;
  vec3 col = mix(shadowCol, litCol, band);
  col += albedo * mix(uGroundFill, uSkyFill, N.y * 0.5 + 0.5) * 0.16;

  float fres = 1.0 - max(dot(N, V), 0.0);

  #ifdef GLASS
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.5, R.y));
    col = mix(albedo * 0.7, sky * 0.55, 0.12 + 0.5 * pow(fres, 3.0));
    float spec = pow(max(dot(R, L), 0.0), 120.0) * getShadowMask();
    col += uSunColor * smoothstep(0.4, 0.6, spec) * 1.2;
  #endif

  if (uRim > 0.0) {
    float sunSide = smoothstep(-0.6, 0.6, dot(N, L));
    float sideways = 1.0 - smoothstep(0.25, 0.7, abs(N.y));
    col += uRimColor * smoothstep(0.6, 0.85, fres) * sideways * uRim * (0.3 + 0.7 * sunSide);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0) * getShadowMask();
    col += uSunColor * smoothstep(0.5, 0.7, spec) * 0.45;
  }

  gl_FragColor = vec4(applyFog(col, vWorldPos, uFogExtra), 1.0);
  #include <colorspace_fragment>
}
`;

function toon(part: Part): ShaderMaterial {
  const defines: Record<string, string> = {};
  if (part.role === 'ground') defines.GROUND = '';
  if (part.role === 'glass') defines.GLASS = '';
  if (part.role === 'emissive') defines.EMISSIVE = '';
  return new ShaderMaterial({
    defines,
    uniforms: {
      ...UniformsUtils.merge([UniformsLib.lights]),
      ...shared,
      uRim: { value: part.hero && part.role === 'body' ? 1 : 0 },
      uFogExtra: { value: 1 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    lights: true,
  });
}

function sky(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyTop;
      uniform vec3 uSkyMid;
      uniform vec3 uSkyHorizon;
      uniform vec3 uFogColor;
      uniform vec3 uFogSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uShadowTint;
      uniform float uTime;
      varying vec3 vDir;
      ${noise}
      float cloudField(vec2 uv) {
        float detail = vnoise(uv * 0.8) * 0.55 + vnoise(uv * 2.2 + 3.7) * 0.25 + vnoise(uv * 5.9 + 1.3) * 0.12 + vnoise(uv * 14.0) * 0.08;
        float clusters = smoothstep(0.3, 0.7, vnoise(uv * 0.28 + 7.0));
        return detail - (1.0 - clusters) * 0.4 + clusters * 0.06;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uSkyTop, smoothstep(0.12, 0.75, h));
        vec3 flatDir = normalize(vec3(d.x, 0.0, d.z));
        float toSunFlat = pow(max(dot(flatDir, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 5.0);
        vec3 haze = mix(uFogColor, uFogSunColor, toSunFlat);
        col = mix(haze, col, smoothstep(-0.01, 0.08, h));

        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.72, 0.42) * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.5);

        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 0.9 + vec2(uTime * 0.003, uTime * 0.0015);
          float n = cloudField(uv);
          float cover = smoothstep(0.56, 0.585, n) * smoothstep(0.03, 0.22, h);
          vec2 toward = normalize(uSunDir.xz) * 0.12;
          float lit = smoothstep(-0.015, 0.02, n - cloudField(uv + toward));
          float core = smoothstep(0.6, 0.75, n);
          vec3 shade = vec3(0.6, 0.53, 0.84);
          vec3 bright = vec3(1.0, 0.9, 0.78);
          vec3 cloud = mix(shade, bright, max(lit, core * 0.35));
          cloud += vec3(1.0, 0.55, 0.25) * pow(s, 10.0) * 0.7 * (1.0 - smoothstep(0.585, 0.62, n));
          col = mix(col, cloud, cover);
        }

        float disc = smoothstep(0.99955, 0.9997, s);
        col = mix(col, vec3(1.0, 0.95, 0.82), disc);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(new SphereGeometry(100, 48, 24), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

export const lookA: Look = {
  id: 'a',
  title: 'Shader toon',
  canvasAntialias: true,
  build(renderer, world) {
    renderer.toneMapping = NoToneMapping;
    assignMaterials(world, toon);
    for (const part of world.parts) {
      if (part.role === 'mesa' && part.layer !== undefined) {
        (part.mesh.material as ShaderMaterial).uniforms.uFogExtra.value = 1 + part.layer * 0.15;
      }
    }
    world.sun.shadow.normalBias = 0.09;
    world.sun.shadow.bias = -0.0004;
    const dome = sky();
    world.scene.add(dome);
    const camPos = new Vector3();
    return {
      update(t) {
        shared.uTime.value = t;
        world.camera.getWorldPosition(camPos);
        dome.position.copy(camPos);
      },
      render: () => renderer.render(world.scene, world.camera),
      resize: () => {},
    };
  },
};
