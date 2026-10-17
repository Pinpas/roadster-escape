/** Value noise and fbm, shared by the sky and the ground grain. */
export const noise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}
`;

/** Height fog with an analytic integral (Quilez), tinted warmer towards the sun. */
export const fog = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec3 uSunDir;

vec3 applyFog(vec3 col, vec3 worldPos, float extra) {
  vec3 ray = worldPos - cameraPosition;
  float dist = length(ray);
  vec3 rd = ray / dist;
  float b = uFogFalloff;
  float h = max(cameraPosition.y, 0.0);
  float k = abs(rd.y) < 1e-4 ? dist : (1.0 - exp(-dist * rd.y * b)) / (rd.y * b);
  float amount = 1.0 - exp(-uFogDensity * exp(-h * b) * k);
  amount = clamp(amount * extra, 0.0, 1.0);
  vec3 flatDir = normalize(vec3(rd.x, 0.0, rd.z));
  float toSun = pow(max(dot(flatDir, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 5.0);
  return mix(col, mix(uFogColor, uFogSunColor, toSun), amount);
}
`;
