import {
  Color,
  DataTexture,
  LinearFilter,
  MeshBasicMaterial,
  MeshToonMaterial,
  RedFormat,
  type IUniform,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { palette } from '../palette';
import type { HazeLayer, Part, Role } from '../world/highway';
import { hazeGLSL, hazeUniforms, planeUniforms } from './haze';
import { applyPatches, patchedChunk, type Patch } from './patches';
import { tune } from './tune';

const luminanceNormalised = (hex: string): Color => {
  const c = new Color(hex);
  return c.multiplyScalar(1 / (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b));
};

/** Shared by every high-tier material, so retuning one value retunes all of them. */
const lookUniforms: Record<string, IUniform> = {
  ...hazeUniforms,
  uSkyTop: { value: new Color(palette.skyTop) },
  uShadowHue: { value: luminanceNormalised(palette.shadow) },
  uShadowShift: { value: tune.shadowShift },
  uLitAmbient: { value: tune.litAmbient },
  uMesaAmbient: { value: tune.mesaAmbient },
  uRim: { value: new Color(palette.rim).multiplyScalar(tune.rimStrength) },
};

const worldVarying = 'varying vec3 vWorld;';

/**
 * Toon lighting with coloured shadows: the hemisphere fill is pushed toward the violet shadow
 * hue at equal luminance where the sun does not reach, hero cars get a warm fresnel rim toward
 * the sun, and glass a sky sheen.
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

const hazePatches: readonly Patch[] = [
  { stage: 'vertex', find: '#include <common>', replace: `#include <common>\n${worldVarying}` },
  {
    stage: 'vertex',
    find: '#include <fog_vertex>',
    replace: '#include <fog_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
  },
  {
    stage: 'fragment',
    find: '#include <common>',
    replace: `#include <common>\n${worldVarying}\n${hazeGLSL}
uniform float uHazeScale;
uniform vec3 uSkyTop;
uniform vec3 uShadowHue;
uniform float uShadowShift;
uniform float uLitAmbient;
uniform float uMesaAmbient;
uniform vec3 uRim;`,
  },
  {
    stage: 'fragment',
    find: '#include <fog_fragment>',
    replace: 'gl_FragColor.rgb = applyHaze(gl_FragColor.rgb, vWorld, uHazeScale);',
  },
];

/** Every edit to three's built-in shaders, by the ShaderLib program it applies to. */
export const highPatches = {
  toon: {
    lib: 'toon',
    patches: [
      ...hazePatches,
      patchedChunk('gradientmap_pars_fragment', {
        stage: 'fragment',
        find: 'float dotNL = dot( normal, lightDirection );',
        replace:
          'float dotNL = dot( normal, lightDirection );\n#ifdef B_CLOUD\ndotNL = dotNL * 0.55 + 0.3;\n#endif',
      }),
      {
        stage: 'fragment',
        find: 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        replace: toonOutgoing,
      },
    ],
  },
  basic: { lib: 'basic', patches: hazePatches },
} as const satisfies Record<string, { lib: 'toon' | 'basic'; patches: readonly Patch[] }>;

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
    data[i] = Math.round(
      (tune.bandMid * ss(-0.08, 0.02, ndl) + (1 - tune.bandMid) * ss(0.13, 0.25, ndl)) * 255,
    );
  }
  const tex = new DataTexture(data, n, 1, RedFormat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

interface Variant {
  readonly hero?: boolean;
  readonly glass?: boolean;
  readonly cloud?: boolean;
  readonly layer?: HazeLayer;
  readonly hazeScale?: number;
}

function patched<M extends Material>(
  material: M,
  patches: readonly Patch[],
  variant: Variant,
  defines: Record<string, string>,
): M {
  const uniforms = {
    ...lookUniforms,
    ...planeUniforms(variant.layer),
    uHazeScale: { value: variant.hazeScale ?? 1 },
  };
  material.defines = defines;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    applyPatches(shader, patches);
  };
  return material;
}

const ramp = toonRamp();

export function highToon(variant: Variant = {}): MeshToonMaterial {
  const defines: Record<string, string> = {};
  if (variant.hero) defines.B_HERO = '';
  if (variant.glass) defines.B_GLASS = '';
  if (variant.cloud) defines.B_CLOUD = '';
  if (variant.layer !== undefined) {
    defines.B_MESA = '';
    defines.HAZE_PLANE = '';
  }
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  return patched(material, highPatches.toon.patches, variant, defines);
}

function highGlow(gain: number): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    vertexColors: true,
    color: new Color(gain, gain, gain),
  });
  return patched(material, highPatches.basic.patches, {}, {});
}

type Flat = Exclude<Role, 'mesa'>;

/** The high tier's material for every shading role, hero or not, and every haze layer. */
export function highMaterials(): (part: Part) => Material {
  const glow = highGlow(tune.emissiveGain);
  const byRole: Record<Flat, { plain: Material; hero: Material }> = {
    ground: { plain: highToon(), hero: highToon() },
    prop: { plain: highToon(), hero: highToon() },
    body: { plain: highToon(), hero: highToon({ hero: true }) },
    glass: { plain: highToon({ glass: true }), hero: highToon({ hero: true, glass: true }) },
    emissive: { plain: glow, hero: glow },
  };
  const byLayer: Record<HazeLayer, Material> = {
    0: highToon({ layer: 0 }),
    1: highToon({ layer: 1 }),
    2: highToon({ layer: 2 }),
    3: highToon({ layer: 3 }),
  };
  return (part) => {
    if (part.role === 'mesa') return byLayer[part.layer];
    const pair = byRole[part.role];
    return part.hero ? pair.hero : pair.plain;
  };
}
