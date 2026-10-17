import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  NoToneMapping,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { assignMaterials, type Look } from '../../common/look';
import { palette } from '../../common/palette';
import { SUN_DIR, type Part, type Role } from '../../common/world';
import { haze, noise } from './glsl';
import { createSky } from './sky';

const c = (hex: string) => new Color(hex);

/** One shared uniform block: retuning a value here retunes every material and the sky. */
const shared = {
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: c('#ffdcae').multiplyScalar(1.2) },
  uShadowTint: { value: c(palette.shadow) },
  uTermTint: { value: c('#f2a28c') },
  uSkyFill: { value: c('#8e9ae6') },
  uBounce: { value: c('#e89a6c') },
  uHorizon: { value: c('#ffc89a') },
  uHazeSun: { value: c('#ffe0ae') },
  uNearDist: { value: 650 },
  uSkyLow: { value: c('#f6b4a6') },
  uSkyMid: { value: c('#b9a9dd') },
  uSkyTop: { value: c('#5b8fd9') },
  uHalo: { value: c('#fff0c8') },
  uCloudCore: { value: c('#a88cbf') },
  uCloudBody: { value: c('#f2a4a2') },
  uCloudEdge: { value: c('#ffd2a4') },
  uInk: { value: c('#5a2a3e') },
  uInkLight: { value: c('#f8c99c') },
  uTime: { value: 0 },
};

/**
 * Stepped depth planes behind the road: near mesas, mid mesas, far mesas, and this look's own
 * far ridge. Each plane has one flat haze colour and amount; `flatten` collapses its lighting
 * towards a single tone so the far planes read as cut-paper silhouettes; `mist` is the height
 * over which the plane's foot dissolves into the ground haze.
 */
const planes = [
  { haze: c('#d98a8a'), amount: 0.15, flatten: 0, mist: 18 },
  { haze: c('#c595b4'), amount: 0.58, flatten: 0.6, mist: 35 },
  { haze: c('#b4a2d4'), amount: 0.75, flatten: 0.9, mist: 50 },
  { haze: c('#cdb8e0'), amount: 0.86, flatten: 1, mist: 120 },
];

/** Brush stroke and painted-variation scale per role, in world units. */
const styles: Record<Role, { brush: number; stretch: [number, number, number]; amp: number; hue: number; hueAmt: number }> = {
  ground: { brush: 0.45, stretch: [1, 1, 0.2], amp: 0.3, hue: 0.025, hueAmt: 0.4 },
  prop: { brush: 1.4, stretch: [0.6, 2, 0.6], amp: 0.25, hue: 0.05, hueAmt: 0.12 },
  mesa: { brush: 0.06, stretch: [0.45, 2.4, 0.45], amp: 0.35, hue: 0.007, hueAmt: 0.24 },
  body: { brush: 2.6, stretch: [0.5, 2.2, 0.5], amp: 0.2, hue: 0.0, hueAmt: 0.0 },
  glass: { brush: 2.6, stretch: [0.5, 2.2, 0.5], amp: 0.15, hue: 0.0, hueAmt: 0.0 },
  emissive: { brush: 1, stretch: [1, 1, 1], amp: 0, hue: 0, hueAmt: 0 },
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
uniform vec3 uTermTint;
uniform vec3 uSkyFill;
uniform vec3 uBounce;
uniform vec3 uSkyLow;
uniform vec3 uSkyTop;
uniform float uBrushScale;
uniform vec3 uBrushStretch;
uniform float uBrushAmp;
uniform float uHueScale;
uniform float uHueAmt;
uniform vec3 uHazeCol;
uniform float uHazeAmt;
uniform float uFlatten;
uniform float uMistH;
varying vec3 vColor;
varying vec3 vWorldPos;
varying vec3 vNormalW;
${noise}
${haze}

/** The sun's shadow, looked up at a coordinate nudged by the brush field so its edge wobbles like a stroke. */
float brushedShadow(vec2 jitter) {
  float s = 1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow sl = directionalLightShadows[0];
    vec4 coord = vDirectionalShadowCoord[0];
    coord.xy += jitter * coord.w;
    s = receiveShadow ? getShadow(directionalShadowMap[0], sl.shadowMapSize, sl.shadowIntensity, sl.shadowBias, sl.shadowRadius, coord) : 1.0;
  #endif
  return s;
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 ray = vWorldPos - cameraPosition;
  float dist = length(ray);
  vec3 rd = ray / dist;
  vec3 albedo = vColor;

  if (uHueAmt > 0.0) {
    vec3 q = vWorldPos * uHueScale;
    float hue = vnoise3(q) - 0.5;
    float val = vnoise3(q * 4.3 + 11.7) - 0.5;
    albedo *= 1.0 + hue * uHueAmt * vec3(0.9, 0.1, -1.0) + val * uHueAmt * 0.5;
  }
  #ifdef GROUND
    albedo *= 1.0 + (vnoise3(vWorldPos * vec3(0.8, 0.0, 0.05)) - 0.5) * 0.2;
  #endif

  #ifdef EMISSIVE
    float white = step(0.78, min(albedo.r, min(albedo.g, albedo.b)));
    vec3 glow = mix(albedo * 1.8, vec3(0.6, 0.8, 1.0), white);
    gl_FragColor = vec4(mix(glow, horizonTint(rd, uHorizon), nearHaze(dist) * 0.6), 1.0);
    #include <colorspace_fragment>
    return;
  #endif

  albedo = albedo * 0.94 + vec3(0.03, 0.026, 0.055);

  vec3 bq = vWorldPos * uBrushScale * uBrushStretch;
  float b1 = vnoise3(bq);
  float b2 = vnoise3(bq * 2.7 + 5.3);
  float brush = b1 * 0.65 + b2 * 0.35 - 0.5;
  float sunVis = brushedShadow((vec2(b1, b2) - 0.5) * 0.006);

  float form = clamp(dot(N, uSunDir) * 4.5, 0.0, 1.0) + brush * uBrushAmp;
  float toTerm = smoothstep(0.06, 0.26, form);
  float toSun = smoothstep(0.42, 0.7, form);
  float inSun = smoothstep(0.15, 0.85, sunVis + brush * uBrushAmp * 0.6);

  vec3 shade = mix(vec3(1.0), uShadowTint, 0.68) * 0.82;
  vec3 light = mix(shade, mix(mix(shade, uTermTint, toTerm), uSunColor, toSun), inSun);
  light += mix(uBounce, uSkyFill, N.y * 0.5 + 0.5) * 0.22;
  vec3 col = albedo * light + uShadowTint * 0.03;

  #ifdef LAYER
    vec3 paper = albedo * mix(shade, uSunColor, 0.45);
    col = mix(col, paper, uFlatten);
  #endif

  #ifdef GLASS
    vec3 V = -rd;
    vec3 R = reflect(rd, N);
    float fres = 1.0 - max(dot(N, V), 0.0);
    vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(0.05, 0.35, R.y + brush * 0.15));
    col = mix(albedo * 0.8, sky * 0.6, 0.15 + 0.55 * smoothstep(0.35, 0.75, fres));
    float spec = pow(max(dot(R, uSunDir), 0.0), 60.0) * inSun;
    col += uSunColor * smoothstep(0.35, 0.45, spec + brush * 0.2);
  #endif

  #ifdef HERO
    vec3 H = normalize(uSunDir - rd);
    float dab = pow(max(dot(N, H), 0.0), 70.0) * inSun;
    col += uSunColor * smoothstep(0.4, 0.55, dab + brush * 0.25) * 0.5;
  #endif

  vec3 hazeCol = horizonTint(rd, uHorizon);
  float amount = nearHaze(dist);
  #ifdef LAYER
    float mist = 1.0 - smoothstep(0.0, uMistH, vWorldPos.y + brush * uMistH * 0.4);
    hazeCol = mix(horizonTint(rd, uHazeCol), hazeCol, mist * 0.6);
    amount = mix(uHazeAmt, max(uHazeAmt, amount), mist);
  #endif

  gl_FragColor = vec4(mix(col, hazeCol, amount), 1.0);
  #include <colorspace_fragment>
}
`;

interface Shading {
  role: Role;
  layer?: number;
  hero?: boolean;
}

function toon({ role, layer, hero }: Shading): ShaderMaterial {
  const style = styles[role];
  const plane = role === 'mesa' && layer !== undefined ? planes[layer] : undefined;
  const defines: Record<string, string> = { [role.toUpperCase()]: '' };
  if (plane) defines.LAYER = '';
  if (hero && role === 'body') defines.HERO = '';
  return new ShaderMaterial({
    defines,
    uniforms: {
      ...UniformsUtils.merge([UniformsLib.lights]),
      ...shared,
      uBrushScale: { value: style.brush },
      uBrushStretch: { value: new Vector3(...style.stretch) },
      uBrushAmp: { value: style.amp },
      uHueScale: { value: style.hue },
      uHueAmt: { value: style.hueAmt },
      uHazeCol: { value: plane?.haze ?? new Color() },
      uHazeAmt: { value: plane?.amount ?? 0 },
      uFlatten: { value: plane?.flatten ?? 0 },
      uMistH: { value: plane?.mist ?? 1 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    lights: true,
  });
}

/**
 * Inverted hull: the back faces of the hero car pushed out along their normals. Warm ink on
 * the side away from the sun, warm light on the sun side, so it doubles as the rim light.
 */
const hullMaterial = new ShaderMaterial({
  uniforms: { ...shared, uWidth: { value: 0.028 } },
  vertexShader: /* glsl */ `
    uniform float uWidth;
    varying vec3 vNormalW;
    varying vec3 vWorldPos;
    void main() {
      vec4 world = modelMatrix * vec4(position + normal * uWidth, 1.0);
      vWorldPos = world.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uInk;
    uniform vec3 uInkLight;
    varying vec3 vNormalW;
    varying vec3 vWorldPos;
    ${haze}
    void main() {
      float sunSide = smoothstep(0.05, 0.45, dot(normalize(vNormalW), uSunDir));
      vec3 col = mix(uInk, uInkLight, sunSide);
      vec3 ray = vWorldPos - cameraPosition;
      gl_FragColor = vec4(mix(col, horizonTint(normalize(ray), uHorizon), nearHaze(length(ray))), 1.0);
      #include <colorspace_fragment>
    }`,
  side: BackSide,
});

function addHulls(parts: Part[]) {
  for (const part of parts) {
    if (!part.hero || (part.role !== 'body' && part.role !== 'glass')) continue;
    const hull = new Mesh(part.mesh.geometry, hullMaterial);
    hull.castShadow = false;
    hull.receiveShadow = false;
    part.mesh.add(hull);
  }
}

/** A long jagged ridge far behind the last mesas: the backmost depth plane. */
function ridgeGeometry(): BufferGeometry {
  const segs = 180;
  const half = 6500;
  const z = -3900;
  const base = -120;
  const pos: number[] = [];
  const top = (x: number) =>
    190 +
    95 * Math.sin(x * 0.0011 + 1.3) +
    55 * Math.sin(x * 0.0029 + 0.4) +
    30 * Math.abs(Math.sin(x * 0.0071 + 2.2)) +
    10 * Math.sin(x * 0.019);
  for (let i = 0; i < segs; i++) {
    const x0 = -half + (i / segs) * half * 2;
    const x1 = -half + ((i + 1) / segs) * half * 2;
    const [y0, y1] = [top(x0), top(x1)];
    pos.push(x0, base, z, x1, base, z, x0, y0, z, x1, base, z, x1, y1, z, x0, y0, z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const n = pos.length / 3;
  const normals = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const rock = c('#b86a5a');
  for (let i = 0; i < n; i++) {
    normals.set([0, 0, 1], i * 3);
    colors.set([rock.r, rock.g, rock.b], i * 3);
  }
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export const lookC: Look = {
  id: 'c',
  title: 'Painterly depth',
  canvasAntialias: true,
  build(renderer, world) {
    renderer.toneMapping = NoToneMapping;
    assignMaterials(world, toon);
    addHulls(world.parts);
    world.sun.shadow.normalBias = 0.09;
    world.sun.shadow.bias = -0.0004;

    const ridge = new Mesh(ridgeGeometry(), toon({ role: 'mesa', layer: 3 }));
    ridge.frustumCulled = false;
    const sky = createSky(shared);
    world.scene.add(ridge, sky);

    const cam = new Vector3();
    return {
      update(t) {
        shared.uTime.value = t;
        world.camera.getWorldPosition(cam);
        sky.position.copy(cam);
        ridge.position.set(0, 0, cam.z);
      },
      render: () => renderer.render(world.scene, world.camera),
      resize: () => {},
    };
  },
};
