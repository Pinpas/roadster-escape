import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { palette } from '../palette';
import { merge, paint, scatter, setColors, smooth } from './geometry';
import {
  police,
  roadster,
  traffic,
  trafficColors,
  type TrafficKind,
  type VehicleGeo,
} from './vehicles';

/**
 * Shading roles. Every mesh in the world carries exactly one, and each quality tier turns a
 * role into a material. Albedo always lives in the vertex `color` attribute, in linear RGB.
 */
export type Role = 'ground' | 'prop' | 'mesa' | 'body' | 'glass' | 'emissive';

/** Haze plane of a backdrop mesh: 0 near mesas, 1 mid, 2 far, 3 the far ridge. */
export type HazeLayer = 0 | 1 | 2 | 3;

export type Part =
  | { readonly mesh: Mesh; readonly role: 'mesa'; readonly layer: HazeLayer }
  | { readonly mesh: Mesh; readonly role: Exclude<Role, 'mesa'>; readonly hero: boolean };

export const LANE = 3.7;
export const ROAD_HALF = 8;
const DASH_PERIOD = 12;
const TILE = 300;
/** How far the look-dev scene drives per second; the sim's distance divided by it poses the road. */
export const HIGHWAY_SPEED = 24;
const TAU = Math.PI * 2;

export interface Highway {
  readonly root: Group;
  readonly parts: readonly Part[];
  /** Where the sun's shadow camera should centre this frame. */
  readonly focus: Vector3;
  /** The Roadster's position; the chase camera follows it. */
  readonly hero: Vector3;
  readonly roadster: Group;
  /** The look-dev police car and traffic, which move on their own in `update`. */
  readonly attract: readonly Group[];
  /** Pose everything for time `t` in seconds. Pure in `t`, so a frozen frame always looks the same. */
  update(t: number): void;
}

/** Noise that repeats every TILE metres in z, so snapped ground tiles never pop. */
function tileNoise(x: number, z: number): number {
  const k = TAU / TILE;
  return (
    0.5 * Math.sin(x * 0.013 + Math.sin(z * k * 2) * 1.7) * Math.cos(z * k * 3 + x * 0.004) +
    0.3 * Math.sin(x * 0.041 + z * k * 7 + 1.3) +
    0.2 * Math.sin(x * 0.11 - z * k * 17 + 2.1) * Math.sin(z * k * 11 + x * 0.07)
  );
}

function sandGround(): BufferGeometry {
  const cols = 36;
  const xs = Array.from({ length: cols + 1 }, (_, i) => {
    const u = (i / cols) * 2 - 1;
    return Math.sign(u) * (Math.abs(u) ** 2.2 * 2400 + (u === 0 ? 0 : 7));
  });
  const rowStep = 30;
  const rows = 107;
  const verts: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const z = 200 - r * rowStep;
    for (const x of xs) {
      const side = smooth(14, 140, Math.abs(x));
      const h =
        side * (6 + 14 * (tileNoise(x, z) * 0.5 + 0.5)) + smooth(600, 2400, Math.abs(x)) * 40;
      verts.push(x, Math.abs(x) < 10 ? -0.05 : h, z);
    }
  }
  const w = xs.length;
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < w - 1; i++) {
      const a = r * w + i;
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  }
  const indexed = new BufferGeometry();
  indexed.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  indexed.setIndex(idx);
  indexed.computeVertexNormals();
  const g = indexed.toNonIndexed();
  const sand = new Color(palette.sand);
  const dark = new Color('#c98a55');
  const light = new Color('#f2bd85');
  const gravel = new Color('#9d7a68');
  setColors(g, (x, _y, z, c) => {
    const n = tileNoise(x * 1.7 + 40, z);
    c.copy(sand).lerp(n > 0 ? light : dark, Math.abs(n) * 0.7);
    c.lerp(gravel, (1 - smooth(9, 12, Math.abs(x))) * 0.8);
  });
  return g;
}

function roadStrip(): BufferGeometry {
  const len = 1800;
  const z0 = 200;
  const center = z0 - len / 2;
  // One 1.8 km quad clipped at the near plane loses depth precision and swallows the lane paint.
  const segs = len / DASH_PERIOD;
  const strip = (width: number, x: number, y: number, hex: string) =>
    paint(new PlaneGeometry(width, len, 1, segs).rotateX(-Math.PI / 2), hex, {
      at: [x, y, center],
    });
  const parts = [
    strip(ROAD_HALF * 2, 0, 0, palette.asphalt),
    strip(0.16, -LANE * 1.5 - 0.3, 0.02, palette.lanePaint),
    strip(0.16, LANE * 1.5 + 0.3, 0.02, palette.lanePaint),
  ];
  for (let z = z0; z > z0 - len; z -= DASH_PERIOD) {
    for (const x of [-LANE / 2, LANE / 2]) {
      parts.push(
        paint(new PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2), palette.lanePaint, {
          at: [x, 0.02, z],
        }),
      );
    }
  }
  return merge(parts);
}

/** One TILE of roadside props, merged into a single geometry. */
function propsTile(): BufferGeometry {
  const r = scatter(7);
  const parts: BufferGeometry[] = [];
  for (let z = 0; z > -TILE; z -= 50) {
    parts.push(
      paint(new BoxGeometry(0.26, 9, 0.26), '#7a5a4a', { at: [14, 4.5, z] }),
      paint(new BoxGeometry(2.4, 0.18, 0.18), '#7a5a4a', { at: [14, 8.3, z] }),
    );
  }
  for (let z = 0; z > -TILE; z -= 25) {
    for (const x of [-ROAD_HALF - 0.6, ROAD_HALF + 0.6]) {
      parts.push(paint(new BoxGeometry(0.12, 0.9, 0.12), '#f3eee6', { at: [x, 0.45, z] }));
    }
  }
  const shrubs = ['#8a9a5b', '#9aa564', '#7b8a55', '#a8a06a'] as const;
  for (let i = 0; i < 70; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (12 + r() ** 1.6 * 90);
    const s = 0.6 + r() * 1.3;
    parts.push(
      paint(new IcosahedronGeometry(1, 0), shrubs[i % shrubs.length] ?? palette.sand, {
        at: [x, s * 0.45, -r() * TILE],
        scale: [s * 1.3, s * 0.8, s * 1.2],
      }),
    );
  }
  for (let i = 0; i < 18; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const s = 0.8 + r() * 2.4;
    parts.push(
      paint(new DodecahedronGeometry(1, 0), r() < 0.5 ? '#b0644c' : '#c07a5a', {
        at: [side * (13 + r() * 70), s * 0.35, -r() * TILE],
        rot: [r() * 3, r() * 3, r() * 3],
        scale: [s * 1.4, s, s * 1.2],
      }),
    );
  }
  return merge(parts);
}

/** A mesa: a cliff block on a wider talus skirt, with painted strata. */
function mesa(r: () => number, w: number, h: number): BufferGeometry {
  const sides = 9;
  const radii = Array.from({ length: sides }, () => 0.75 + r() * 0.45);
  const ring = (rad: number, y: number): Vector3[] =>
    radii.map((k, i) => {
      const a = (i / sides) * TAU;
      return new Vector3(Math.cos(a) * rad * k * w, y, Math.sin(a) * rad * k * w * 0.55);
    });
  const rings = [
    ring(1.55, 0),
    ring(1.08, h * 0.38),
    ring(1.0, h * 0.42),
    ring(0.94, h),
    ring(0, h),
  ];
  const verts: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3) =>
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  rings.slice(0, -1).forEach((lower, k) => {
    const upper = rings[k + 1] ?? lower;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const [a, b, c, d] = [lower[i], lower[j], upper[i], upper[j]];
      if (!a || !b || !c || !d) continue;
      tri(a, c, b);
      tri(b, c, d);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  const rock = new Color(palette.mesa);
  const band = new Color('#a9503d');
  const pale = new Color('#dd8a62');
  const sand = new Color(palette.sand);
  setColors(g, (_x, y, _z, c) => {
    const t = y / h;
    const strata = Math.sin(t * 22) > 0.55 ? band : t > 0.9 ? pale : rock;
    c.copy(rock).lerp(strata, 0.6);
    if (t < 0.4) c.lerp(sand, 0.35 * (1 - t / 0.4));
  });
  return g;
}

const mesaLayers = [
  { z: [-480, -700], count: 4, w: [70, 130], h: [45, 80], spread: 900 },
  { z: [-1300, -1700], count: 7, w: [120, 260], h: [80, 150], spread: 2600 },
  { z: [-2300, -2900], count: 9, w: [200, 420], h: [110, 210], spread: 3800 },
] as const;

function mesaLayer(layer: 0 | 1 | 2): BufferGeometry {
  const r = scatter(100 + layer);
  const L = mesaLayers[layer];
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < L.count; i++) {
    let x = (i / (L.count - 1) - 0.5) * L.spread + (r() - 0.5) * 120;
    if (layer === 0 && Math.abs(x) < 150) x = Math.sign(x || 1) * (150 + r() * 80);
    const z = L.z[0] + (L.z[1] - L.z[0]) * r();
    const w = L.w[0] + r() * (L.w[1] - L.w[0]);
    const h = L.h[0] + r() * (L.h[1] - L.h[0]);
    parts.push(mesa(r, w * 0.5, h).translate(x, -4, z));
  }
  return merge(parts);
}

/** A long jagged ridge behind the last mesas: the backmost haze plane. */
function ridge(): BufferGeometry {
  const segs = 180;
  const half = 6500;
  const z = -3900;
  const base = -120;
  const top = (x: number) =>
    190 +
    95 * Math.sin(x * 0.0011 + 1.3) +
    55 * Math.sin(x * 0.0029 + 0.4) +
    30 * Math.abs(Math.sin(x * 0.0071 + 2.2)) +
    10 * Math.sin(x * 0.019);
  const pos: number[] = [];
  for (let i = 0; i < segs; i++) {
    const x0 = -half + (i / segs) * half * 2;
    const x1 = -half + ((i + 1) / segs) * half * 2;
    pos.push(x0, base, z, x1, base, z, x0, top(x0), z, x1, base, z, x1, top(x1), z, x0, top(x0), z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const normals = new Float32Array(pos.length).map((_, i) => (i % 3 === 2 ? 1 : 0));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  const rock = new Color(palette.ridge);
  setColors(g, (_x, _y, _z, c) => c.copy(rock));
  return g;
}

/** Additive red/blue pool on the road under the police car: the light bar colouring the asphalt. */
function lightPool() {
  const color = { value: new Color(palette.policeRed) };
  const strength = { value: 1 };
  const material = new ShaderMaterial({
    uniforms: { uColor: color, uStrength: strength },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        gl_FragColor = vec4(uColor * pow(max(1.0 - d, 0.0), 2.2) * uStrength, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(14, 14).rotateX(-Math.PI / 2), material);
  mesh.position.y = 0.03;
  mesh.renderOrder = 2;
  return { mesh, color, strength };
}

interface Car {
  readonly root: Group;
  readonly lane: number;
  /** Start offset ahead of the Roadster. */
  readonly z0: number;
  /** How fast the Roadster closes on the car, in m/s. */
  readonly closing: number;
}

/**
 * Placeholder traffic until the simulation spawns it. Cars in the Roadster's and the police
 * car's lanes cruise at the Roadster's speed, so nothing drives through the hero cars. The
 * right lane is overtaken at one shared closing speed with even spacing, so its cars never drive
 * through each other, and it wraps behind the camera and 400 m ahead.
 */
const trafficPlan: readonly { kind: TrafficKind; lane: number; z0: number; closing: number }[] = [
  { kind: 'hatch', lane: 0, z0: -70, closing: 0 },
  { kind: 'sedan', lane: -1, z0: -120, closing: 0 },
  { kind: 'suv', lane: 0, z0: -190, closing: 0 },
  { kind: 'semi', lane: 1, z0: -60, closing: 10 },
  { kind: 'pickup', lane: 1, z0: -167.5, closing: 10 },
  { kind: 'sedan', lane: 1, z0: -275, closing: 10 },
  { kind: 'hatch', lane: 1, z0: -382.5, closing: 10 },
];
const WRAP_AHEAD = 400;
const WRAP_BEHIND = 30;

/**
 * The look-dev highway: road, dunes, props, three mesa layers and a far ridge, the Roadster,
 * one police car lining up for a PIT, and traffic. Placeholder content until the simulation
 * drives it; the shading roles and the scene layout are what later phases build on.
 */
export function createHighway(): Highway {
  const root = new Group();
  const parts: Part[] = [];
  const placeholder = new MeshBasicMaterial({ vertexColors: true });
  const add = (geo: BufferGeometry, parent: Object3D, part: (mesh: Mesh) => Part): Mesh => {
    const mesh = new Mesh(geo, placeholder);
    const p = part(mesh);
    mesh.castShadow = p.role === 'body' || p.role === 'prop' || p.role === 'glass';
    mesh.receiveShadow = p.role !== 'emissive' && p.role !== 'mesa';
    parent.add(mesh);
    parts.push(p);
    return mesh;
  };
  const plain =
    (role: Exclude<Role, 'mesa'>, hero = false) =>
    (mesh: Mesh): Part => ({ mesh, role, hero });

  const ground = new Group();
  add(sandGround(), ground, plain('ground'));
  add(roadStrip(), ground, plain('ground'));

  const propGeo = propsTile();
  const props = [0, 1, 2].map(() => {
    const g = new Group();
    add(propGeo, g, plain('prop'));
    return g;
  });

  const backdrop = new Group();
  for (const layer of [0, 1, 2] as const) {
    add(mesaLayer(layer), backdrop, (mesh) => ({ mesh, role: 'mesa', layer }));
  }
  const farRidge = new Group();
  add(ridge(), farRidge, (mesh) => ({ mesh, role: 'mesa', layer: 3 }));
  root.add(ground, ...props, backdrop, farRidge);

  const vehicle = (geo: VehicleGeo, hero: boolean): Group => {
    const g = new Group();
    add(geo.body, g, plain('body', hero));
    if (geo.glass) add(geo.glass, g, plain('glass', hero));
    add(geo.emissive, g, plain('emissive', hero));
    root.add(g);
    return g;
  };

  const roadsterRoot = vehicle(roadster(), true);
  const cop = police();
  const policeRoot = vehicle(cop, true);
  const barRed = add(cop.barRed, policeRoot, plain('emissive', true));
  const barBlue = add(cop.barBlue, policeRoot, plain('emissive', true));
  const unlit = (geo: BufferGeometry) => {
    const g = geo.clone();
    setColors(g, (_x, _y, _z, c) => c.set('#3a3346'));
    return g;
  };
  const barRedOff = add(unlit(cop.barRed), policeRoot, plain('body', true));
  const barBlueOff = add(unlit(cop.barBlue), policeRoot, plain('body', true));
  const pool = lightPool();
  policeRoot.add(pool.mesh);

  const cars: Car[] = trafficPlan.map(({ kind, lane, z0, closing }, i) => ({
    root: vehicle(traffic(kind, trafficColors[i % trafficColors.length] ?? palette.sand), false),
    lane,
    z0,
    closing,
  }));

  const focus = new Vector3();

  return {
    root,
    parts,
    focus,
    hero: roadsterRoot.position,
    roadster: roadsterRoot,
    attract: [policeRoot, ...cars.map((car) => car.root)],
    update(t) {
      const pz = -HIGHWAY_SPEED * t;
      const sway = Math.sin(t * 0.37) * 0.9;
      roadsterRoot.position.set(sway * 0.4, 0, pz);
      roadsterRoot.rotation.z = -Math.cos(t * 0.37) * 0.02;
      policeRoot.position.set(
        -LANE + Math.sin(t * 0.8) * 0.25,
        0,
        pz - 1.5 + Math.sin(t * 0.5) * 1.2,
      );
      policeRoot.rotation.y = Math.sin(t * 0.8) * 0.03;

      const tileZ = Math.ceil(pz / TILE) * TILE;
      ground.position.z = tileZ;
      props.forEach((g, i) => (g.position.z = tileZ + (1 - i) * TILE));
      // Pinned to the camera like the far ridge: any parallax rate would carry the mesas past
      // the camera within minutes of play.
      backdrop.position.z = pz;
      farRidge.position.z = pz;

      const span = WRAP_AHEAD + WRAP_BEHIND;
      for (const car of cars) {
        const ahead = car.z0 + WRAP_AHEAD + car.closing * t;
        const rel = (((ahead % span) + span) % span) - WRAP_AHEAD;
        car.root.position.set(car.lane * LANE, 0, pz + rel);
      }

      const redOn = Math.floor(t * 5) % 4 < 2;
      barRed.visible = redOn;
      barBlue.visible = !redOn;
      barRedOff.visible = !redOn;
      barBlueOff.visible = redOn;
      pool.color.value.set(redOn ? palette.policeRed : palette.policeBlue);
      pool.strength.value = 0.55 + 0.15 * Math.sin(t * 31);
      pool.mesh.position.x = redOn ? -0.6 : 0.6;

      focus.set(roadsterRoot.position.x * 0.5, 0, pz - 14);
    },
  };
}

/** Where the chase camera sits relative to the Roadster; portrait screens pull back and tilt up. */
export function chaseCamera(
  hero: Vector3,
  t: number,
  portrait: number,
  out: { position: Vector3; target: Vector3 },
): void {
  out.position.set(
    hero.x * 0.6 + Math.sin(t * 0.13) * 0.8,
    3.6 + portrait * 1.6,
    hero.z + 9.5 + portrait * 5.5,
  );
  out.target.set(hero.x * 0.25, 1.1 + portrait * 2.4, hero.z - 16);
}
