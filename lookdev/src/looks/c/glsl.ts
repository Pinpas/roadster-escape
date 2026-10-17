/** Value noise in 2D (sky) and 3D (world-space brush and hue), plus a 2D fbm. */
export const noise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec2 e = vec2(1.0, 0.0);
  return mix(
    mix(mix(hash13(i), hash13(i + e.xyy), u.x), mix(hash13(i + e.yxy), hash13(i + e.xxy), u.x), u.y),
    mix(mix(hash13(i + e.yyx), hash13(i + e.xyx), u.x), mix(hash13(i + e.yxx), hash13(i + e.xxx), u.x), u.y),
    u.z);
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

/** Horizon colour and the continuous near haze, shared by the world, the ridge and the sky. */
export const haze = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uHorizon;
uniform vec3 uHazeSun;
uniform float uNearDist;

vec3 horizonTint(vec3 rd, vec3 base) {
  float toSun = max(dot(normalize(rd.xz + 1e-5), normalize(uSunDir.xz)), 0.0);
  return mix(base, uHazeSun, pow(toSun, 6.0) * 0.7);
}
float nearHaze(float dist) {
  return 1.0 - exp(-pow(dist / uNearDist, 1.6));
}
`;
