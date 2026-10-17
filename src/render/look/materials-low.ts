import {
  Color,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type IUniform,
  type Material,
} from 'three';
import { palette } from '../palette';
import type { HazeLayer, Part, Role } from '../world/highway';
import { hazeGLSL, hazeUniforms, planeUniforms } from './haze';

const white = new Color(1, 1, 1);
const lighter = (hex: string, amount: number): Color => new Color(hex).lerp(white, amount);

/**
 * Low-tier light colours, derived from the palette's sun, shadow, rim, sky and sand. This shader
 * writes straight to the canvas, so its tints sit a little lighter than the high tier's.
 */
const lowUniforms: Record<string, IUniform> = {
  ...hazeUniforms,
  uSunColor: { value: new Color(palette.sun).multiplyScalar(1.15) },
  uShadowTint: { value: lighter(palette.shadow, 0.08) },
  uSkyFill: { value: lighter(palette.skyTop, 0.2) },
  uGroundFill: { value: new Color(palette.sand) },
  uRimColor: { value: lighter(palette.rim, 0.3) },
  uSkyTop: { value: new Color(palette.skyTop) },
};

const vertexShader = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vColor = color;
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
}
`;

/** Three soft light bands, a violet shadow tint, a warm rim on hero cars, then the shared haze. */
const fragmentShader = /* glsl */ `
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
uniform float uHazeScale;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormalW;
${hazeGLSL}

void main() {
  vec3 albedo = vColor;
  #ifdef EMISSIVE
    gl_FragColor = vec4(applyHaze(albedo * 1.8, vWorld, 0.6), 1.0);
  #else
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = uSunDir;
    float ndl = dot(N, L);
    #ifdef CLOUD
      ndl = ndl * 0.55 + 0.3;
    #endif
    float shadow = getShadowMask();
    float lit = clamp(ndl, 0.0, 1.0) * shadow;
    float band = 0.45 * smoothstep(0.015, 0.06, lit) + 0.55 * smoothstep(0.11, 0.17, lit);
    vec3 col = mix(albedo * uShadowTint * 0.62, albedo * uSunColor, band);
    col += albedo * mix(uGroundFill, uSkyFill, N.y * 0.5 + 0.5) * 0.16;
    float fres = 1.0 - max(dot(N, V), 0.0);
    #ifdef GLASS
      vec3 R = reflect(-V, N);
      vec3 sky = mix(uHaze, uSkyTop, smoothstep(0.0, 0.5, R.y));
      col = mix(albedo * 0.7, sky * 0.55, 0.12 + 0.5 * pow(fres, 3.0));
      col += uSunColor * smoothstep(0.4, 0.6, pow(max(dot(R, L), 0.0), 120.0) * shadow) * 1.2;
    #endif
    #ifdef HERO
      float sunSide = smoothstep(-0.6, 0.6, ndl);
      float sideways = 1.0 - smoothstep(0.25, 0.7, abs(N.y));
      col += uRimColor * smoothstep(0.6, 0.85, fres) * sideways * (0.3 + 0.7 * sunSide);
      vec3 H = normalize(L + V);
      col += uSunColor * smoothstep(0.5, 0.7, pow(max(dot(N, H), 0.0), 90.0) * shadow) * 0.45;
    #endif
    gl_FragColor = vec4(applyHaze(col, vWorld, uHazeScale), 1.0);
  #endif
  #include <colorspace_fragment>
}
`;

interface Variant {
  readonly role: Role | 'cloud';
  readonly hero?: boolean;
  readonly layer?: HazeLayer;
  readonly hazeScale?: number;
}

export function lowToon({ role, hero = false, layer, hazeScale = 1 }: Variant): ShaderMaterial {
  const defines: Record<string, string> = {};
  if (role === 'glass') defines.GLASS = '';
  if (role === 'emissive') defines.EMISSIVE = '';
  if (role === 'cloud') defines.CLOUD = '';
  if (hero && role === 'body') defines.HERO = '';
  if (layer !== undefined) defines.HAZE_PLANE = '';
  return new ShaderMaterial({
    defines,
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.lights),
      ...lowUniforms,
      ...planeUniforms(layer),
      uHazeScale: { value: hazeScale },
    },
    vertexShader,
    fragmentShader,
    vertexColors: true,
    lights: true,
  });
}

type Flat = Exclude<Role, 'mesa'>;

/** The low tier's material for every shading role, hero or not, and every haze layer. */
export function lowMaterials(): (part: Part) => Material {
  const pair = (role: Flat) => ({ plain: lowToon({ role }), hero: lowToon({ role, hero: true }) });
  const byRole: Record<Flat, { plain: Material; hero: Material }> = {
    ground: pair('ground'),
    prop: pair('prop'),
    body: pair('body'),
    glass: pair('glass'),
    emissive: pair('emissive'),
  };
  const byLayer: Record<HazeLayer, Material> = {
    0: lowToon({ role: 'mesa', layer: 0 }),
    1: lowToon({ role: 'mesa', layer: 1 }),
    2: lowToon({ role: 'mesa', layer: 2 }),
    3: lowToon({ role: 'mesa', layer: 3 }),
  };
  return (part) => {
    if (part.role === 'mesa') return byLayer[part.layer];
    const p = byRole[part.role];
    return part.hero ? p.hero : p.plain;
  };
}
