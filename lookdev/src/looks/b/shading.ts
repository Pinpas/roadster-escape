import {
  Color,
  DataTexture,
  LinearFilter,
  MeshBasicMaterial,
  MeshToonMaterial,
  RedFormat,
  ShaderChunk,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { SUN_DIR, type Part } from '../../common/world';
import { tune } from './tune';

const c = (hex: string) => new Color(hex);

/** One uniform bag shared by every look-B shader, so sky, fog and materials agree on the haze. */
export const shared = {
  uSunDir: { value: SUN_DIR.clone() },
  uHaze: { value: c(tune.haze) },
  uHazeSun: { value: c(tune.hazeSun) },
  uSkyTop: { value: c(tune.skyTop) },
  uHazeHeight: { value: tune.hazeHeight },
  uShadowHue: { value: c(tune.shadowTint) },
  uShadowShift: { value: tune.shadowShift },
  uLitAmbient: { value: tune.litAmbient },
  uMesaAmbient: { value: tune.mesaAmbient },
  uRim: { value: c(tune.rim).multiplyScalar(tune.rimStrength) },
};
{
  const s = shared.uShadowHue.value;
  s.multiplyScalar(1 / (0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b));
}

/** Haze colour per world-space view direction: peach, warming toward the sun. Sky and fog both call it. */
export const hazeGLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform vec3 uHazeSun;
uniform vec3 uSkyTop;
uniform float uHazeHeight;
vec3 bHaze(vec3 dir) {
  float s = max(dot(dir, uSunDir), 0.0);
  return mix(uHaze, uHazeSun, pow(s, 4.0) * 0.9);
}
`;

const fogGLSL = /* glsl */ `
#ifdef USE_FOG
  vec3 bRay = vBWorld - cameraPosition;
  float bDist = length(bRay);
  float bLow = 1.0 - smoothstep(0.0, uHazeHeight, vBWorld.y);
  float bOD = fogDensity * B_FOG_SCALE * mix(0.6, 1.0, bLow) * bDist;
  float fogFactor = 1.0 - exp(-bOD * sqrt(bOD));
  fogFactor = max(fogFactor, smoothstep(1900.0, 3100.0, bDist) * bLow * B_FOG_SCALE);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, bHaze(bRay / bDist), fogFactor);
#endif
`;

/** Patch a built-in material: exponential height haze toward the shared haze colour. */
function patchFog(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, shared);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBWorld;')
    .replace('#include <fog_vertex>', '#include <fog_vertex>\nvBWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vBWorld;\n${hazeGLSL}\nuniform vec3 uShadowHue;\nuniform float uShadowShift;\nuniform float uLitAmbient;\nuniform float uMesaAmbient;\nuniform vec3 uRim;`)
    .replace('#include <fog_fragment>', fogGLSL);
}

/**
 * Toon lighting with coloured shadows: the hemisphere fill is pushed toward the violet
 * shadow hue at equal luminance, heroes get a warm fresnel rim toward the sun, glass a sky sheen.
 */
const toonOutgoing = /* glsl */ `
vec3 bInd = reflectedLight.indirectDiffuse;
float bSun = 0.0;
#if NUM_DIR_LIGHTS > 0
  float bFull = dot(diffuseColor.rgb * directionalLights[0].color, vec3(0.2126, 0.7152, 0.0722)) * RECIPROCAL_PI;
  bSun = saturate(dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722)) / max(bFull, 1e-5));
#endif
float bL = dot(bInd, vec3(0.2126, 0.7152, 0.0722));
#ifdef B_HERO
  float bShift = uShadowShift * 0.5;
#else
  float bShift = uShadowShift;
#endif
bInd = mix(mix(bInd, bL * uShadowHue, bShift), bInd * uLitAmbient, bSun);
#ifdef B_MESA
  bInd *= uMesaAmbient;
#endif
vec3 outgoingLight = reflectedLight.directDiffuse + bInd + totalEmissiveRadiance;
float bF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
#if defined(B_HERO) && NUM_DIR_LIGHTS > 0
  float bToward = 0.3 + 0.7 * smoothstep(-0.15, 0.45, dot(normal, directionalLights[0].direction));
  outgoingLight += uRim * smoothstep(0.68, 0.95, bF) * bToward;
#endif
#ifdef B_GLASS
  outgoingLight += mix(uSkyTop, uHaze, 0.35) * (0.08 + 0.55 * bF * bF);
#endif
`;

const gradientWrap = ShaderChunk.gradientmap_pars_fragment.replace(
  'float dotNL = dot( normal, lightDirection );',
  'float dotNL = dot( normal, lightDirection );\n#ifdef B_CLOUD\ndotNL = dotNL * 0.55 + 0.3;\n#endif',
);

function patchToon(shader: WebGLProgramParametersWithUniforms) {
  patchFog(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <gradientmap_pars_fragment>', gradientWrap)
    .replace(
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
    toonOutgoing,
  );
}

/** Three soft bands over N·L: shadow, a narrow mid band, full sun. Linear filtering keeps edges soft. */
function toonRamp(): DataTexture {
  const n = 64;
  const data = new Uint8Array(n);
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < n; i++) {
    const ndl = ((i + 0.5) / n) * 2 - 1;
    const v = tune.bandMid * ss(-0.08, 0.02, ndl) + (1 - tune.bandMid) * ss(0.13, 0.25, ndl);
    data[i] = Math.round(v * 255);
  }
  const tex = new DataTexture(data, n, 1, RedFormat);
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const ramp = toonRamp();

export function toon(defines: Record<string, string> = {}, fogScale = 1): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  m.defines = { B_FOG_SCALE: fogScale.toFixed(3), ...defines };
  m.onBeforeCompile = patchToon;
  return m;
}

export function glow(gain: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ vertexColors: true, color: new Color(gain, gain, gain) });
  m.defines = { B_FOG_SCALE: '1.0' };
  m.onBeforeCompile = patchFog;
  return m;
}

export function materialPicker(): (part: Part) => Material {
  const plain = toon();
  const hero = toon({ B_HERO: '' });
  const heroGlass = toon({ B_HERO: '', B_GLASS: '' });
  const glass = toon({ B_GLASS: '' });
  const rock = toon({ B_MESA: '' }, tune.mesaFog);
  const lamp = glow(tune.emissiveGain);
  return (p) => {
    if (p.role === 'emissive') return lamp;
    if (p.role === 'mesa') return rock;
    if (p.role === 'glass') return p.hero ? heroGlass : glass;
    return p.hero ? hero : plain;
  };
}
