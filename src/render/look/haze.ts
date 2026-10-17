import { Color, Vector3, type IUniform } from 'three';
import { palette, type PaletteKey } from '../palette';
import type { HazeLayer } from '../world/highway';
import { tune } from './tune';

/** Towards the sun: low, ahead and to the left of the chase camera, golden hour. */
export const SUN_DIR = new Vector3(-0.62, 0.21, -0.76).normalize();

/**
 * Stepped haze planes behind the road. Each backdrop layer fades to one flat colour by a
 * fixed amount, so near, mid and far mesas and the far ridge read as separate cut-paper
 * planes. `mist` is the height over which a plane's foot dissolves into the ground haze.
 */
export const hazePlanes: Record<HazeLayer, { color: PaletteKey; amount: number; mist: number }> = {
  0: { color: 'hazeNear', amount: 0.15, mist: 18 },
  1: { color: 'hazeMid', amount: 0.58, mist: 35 },
  2: { color: 'hazeFar', amount: 0.75, mist: 50 },
  3: { color: 'hazeRidge', amount: 0.86, mist: 120 },
};

export interface HazeUniforms {
  readonly [name: string]: IUniform;
  readonly uSunDir: IUniform<Vector3>;
  readonly uHaze: IUniform<Color>;
  readonly uHazeSun: IUniform<Color>;
  readonly uHazeHeight: IUniform<number>;
  readonly uFogDensity: IUniform<number>;
}

/** Shared by every material and the sky, so they all agree on the horizon colour. */
export const hazeUniforms: HazeUniforms = {
  uSunDir: { value: SUN_DIR.clone() },
  uHaze: { value: new Color(palette.skyHorizon) },
  uHazeSun: { value: new Color(palette.hazeSun) },
  uHazeHeight: { value: tune.hazeHeight },
  uFogDensity: { value: tune.fogDensity },
};

export const planeUniforms = (layer: HazeLayer | undefined): Record<string, IUniform> => {
  const plane = layer === undefined ? undefined : hazePlanes[layer];
  return {
    uPlaneColor: { value: new Color(plane ? palette[plane.color] : palette.skyHorizon) },
    uPlaneAmount: { value: plane?.amount ?? 0 },
    uPlaneMist: { value: plane?.mist ?? 1 },
  };
};

/**
 * Height haze plus the stepped planes. `hazeColor` is the horizon colour along a view
 * direction; the sky dome calls it too. Define `HAZE_PLANE` on backdrop materials.
 */
export const hazeGLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform vec3 uHazeSun;
uniform float uHazeHeight;
uniform float uFogDensity;
uniform vec3 uPlaneColor;
uniform float uPlaneAmount;
uniform float uPlaneMist;

vec3 hazeColor(vec3 dir) {
  float s = max(dot(dir, uSunDir), 0.0);
  return mix(uHaze, uHazeSun, pow(s, 4.0) * 0.9);
}

vec3 applyHaze(vec3 col, vec3 world, float scale) {
  vec3 ray = world - cameraPosition;
  float dist = length(ray);
  vec3 dir = ray / dist;
  float low = 1.0 - smoothstep(0.0, uHazeHeight, world.y);
  float od = uFogDensity * scale * mix(0.6, 1.0, low) * dist;
  float amount = 1.0 - exp(-od * sqrt(od));
  amount = max(amount, smoothstep(1900.0, 3100.0, dist) * low * scale);
  vec3 tint = hazeColor(dir);
  #ifdef HAZE_PLANE
    float mist = 1.0 - smoothstep(0.0, uPlaneMist, world.y);
    float toSun = pow(max(dot(dir, uSunDir), 0.0), 4.0);
    tint = mix(mix(uPlaneColor, uHazeSun, toSun * 0.5), tint, mist * 0.6);
    amount = mix(uPlaneAmount, max(uPlaneAmount, amount), mist);
  #endif
  return mix(col, tint, amount);
}
`;
