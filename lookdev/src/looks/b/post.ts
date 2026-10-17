import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { tune } from './tune';

const v3 = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

/**
 * The one post pass. Bloom-lite reads three mip levels of the HDR scene target through a
 * 4-tap B-spline filter (12 reads), then grade, tone curve, vignette and sRGB in the same shader.
 */
const fragmentShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec3 uLods;
uniform float uBloom;
uniform float uDiffuse;
uniform float uThreshold;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uShadowTone;
uniform vec3 uHighTone;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uAspect;
varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}

vec3 bspline(float lod) {
  vec2 size = vec2(textureSize(tScene, int(lod)));
  vec2 st = vUv * size - 0.5;
  vec2 f = fract(st);
  st -= f;
  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
  vec3 s0 = textureLod(tScene, o.xz, lod).rgb;
  vec3 s1 = textureLod(tScene, o.yz, lod).rgb;
  vec3 s2 = textureLod(tScene, o.xw, lod).rgb;
  vec3 s3 = textureLod(tScene, o.yw, lod).rgb;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

vec3 bright(vec3 c) {
  float l = dot(c, LUMA);
  return c * (max(l - uThreshold, 0.0) / max(l, 1e-4));
}

vec3 neutralCurve(vec3 color) {
  const float start = 0.76;
  const float desat = 0.08;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  const float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 hdr = textureLod(tScene, vUv, 0.0).rgb;
#ifdef B_LOW
  vec3 c = hdr * uExposure;
#else
  vec3 m0 = bspline(uLods.x);
  vec3 m1 = bspline(uLods.y);
  vec3 m2 = bspline(uLods.z);
  vec3 bloom = 0.5 * bright(m0) + 0.32 * bright(m1) + 0.22 * bright(m2);
  vec3 c = (mix(hdr, m1, uDiffuse) + bloom * uBloom) * uExposure;
#endif
  c = neutralCurve(c);
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / uGamma);
  float l = dot(c, LUMA);
  c *= mix(uShadowTone, uHighTone, smoothstep(0.05, 0.7, l));
  c = mix(vec3(l), c, uSaturation);
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float v = smoothstep(0.42, 1.25, length(p) * 1.25);
  c *= mix(vec3(1.0), uVignetteColor, v * uVignette);
  vec3 s = toSRGB(clamp(c, 0.0, 1.0));
  s = mix(s, s * s * (3.0 - 2.0 * s), uContrast);
  s += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(s, 1.0);
}
`;

/** `low` drops bloom and diffusion: no mip chain, one texture read per pixel, 2x MSAA. */
export function createPost(renderer: WebGLRenderer, low: boolean) {
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: low ? 2 : 4,
    generateMipmaps: !low,
    minFilter: low ? LinearFilter : LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
  });
  const material = new ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      uLods: { value: new Vector3(2, 4, 6) },
      uBloom: { value: tune.bloom },
      uDiffuse: { value: tune.diffuse },
      uThreshold: { value: tune.bloomThreshold },
      uExposure: { value: tune.exposure },
      uLift: { value: v3(tune.lift) },
      uGamma: { value: v3(tune.gamma) },
      uGain: { value: v3(tune.gain) },
      uShadowTone: { value: v3(tune.shadowTone) },
      uHighTone: { value: v3(tune.highTone) },
      uSaturation: { value: tune.saturation },
      uContrast: { value: tune.contrast },
      uVignette: { value: tune.vignette },
      uVignetteColor: { value: v3(tune.vignetteColor) },
      uAspect: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader,
    defines: low ? { B_LOW: '' } : {},
    depthTest: false,
    depthWrite: false,
  });
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new Mesh(tri, material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera();
  const size = new Vector2();

  return {
    render(world: Scene, view: Camera) {
      renderer.setRenderTarget(target);
      renderer.render(world, view);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    resize(width: number, height: number, pixelRatio: number) {
      size.set(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      target.setSize(size.x, size.y);
      const base = Math.max(0, Math.log2(Math.min(size.x, size.y) / 720));
      material.uniforms.uLods.value.set(2 + base, 4 + base, 6 + base).round();
      material.uniforms.uAspect.value = width / height;
    },
  };
}
