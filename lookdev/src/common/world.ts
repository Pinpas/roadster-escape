import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { merge, paint, smooth } from './geometry';
import { palette } from './palette';
import { police, roadster, traffic, trafficColors, type TrafficKind, type VehicleGeo } from './vehicles';

/**
 * Shading roles. Every mesh in the world carries exactly one; a look turns each role
 * into a material. Albedo always lives in the vertex `color` attribute (linear).
 */
export type Role = 'ground' | 'prop' | 'mesa' | 'body' | 'glass' | 'emissive';

export interface Part {
  mesh: Mesh;
  role: Role;
  /** Depth layer for mesas: 0 near, 1 mid, 2 far. */
  layer?: number;
  /** The Roadster and the police car: hero objects that get a rim light or outline. */
  hero?: boolean;
}

export const LANE = 3.7;
export const ROAD_HALF = 8;
const DASH_PERIOD = 12;
const TILE = 300;
const SPEED = 24;

/** Sun direction (towards the sun): low, ahead and to the left, golden hour. */
export const SUN_DIR = new Vector3(-0.62, 0.21, -0.76).normalize();

export interface World {
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  parts: Part[];
  /** Additive red/blue pool on the road under the police car, owned by common. */
  glow: Mesh;
  roadsterRoot: Group;
  policeRoot: Group;
  update(t: number): void;
  resize(w: number, h: number): void;
}

const TAU = Math.PI * 2;

/** Noise that repeats every TILE metres in z, so snapped ground tiles never pop. */
function tileNoise(x: number, z: number): number {
  const k = TAU / TILE;
  return (
    0.5 * Math.sin(x * 0.013 + Math.sin(z * k * 2) * 1.7) * Math.cos(z * k * 3 + x * 0.004) +
    0.3 * Math.sin(x * 0.041 + z * k * 7 + 1.3) +
    0.2 * Math.sin(x * 0.11 - z * k * 17 + 2.1) * Math.sin(z * k * 11 + x * 0.07)
  );
}

function setColors(g: BufferGeometry, fn: (x: number, y: number, z: number, c: Color) => void) {
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
}

function sandGround(): BufferGeometry {
  const xs: number[] = [];
  const cols = 36;
  for (let i = 0; i <= cols; i++) {
    const u = (i / cols) * 2 - 1;
    xs.push(Math.sign(u) * (Math.abs(u) ** 2.2 * 2400 + (Math.abs(u) > 0 ? 7 : 0)));
  }
  const rowStep = 30;
  const rows = 107;
  const zStart = 200;
  const verts: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    for (const x of xs) {
      const z = zStart - r * rowStep;
      const side = smooth(14, 140, Math.abs(x));
      const h = side * (6 + 14 * (tileNoise(x, z) * 0.5 + 0.5)) + smooth(600, 2400, Math.abs(x)) * 40;
      verts.push(x, Math.abs(x) < 10 ? -0.05 : h, z);
    }
  }
  const w = xs.length;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < w - 1; i++) {
      const a = r * w + i;
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  }
  let g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g = g.toNonIndexed();
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
  // Segmented every dash period: one 1.8 km quad clipped at the near plane loses depth precision and eats the paint.
  const segs = len / DASH_PERIOD;
  const parts = [
    paint(new PlaneGeometry(ROAD_HALF * 2, len, 1, segs).rotateX(-Math.PI / 2), palette.asphalt, { at: [0, 0, center] }),
    paint(new PlaneGeometry(0.16, len, 1, segs).rotateX(-Math.PI / 2), palette.lanePaint, { at: [-LANE * 1.5 - 0.3, 0.02, center] }),
    paint(new PlaneGeometry(0.16, len, 1, segs).rotateX(-Math.PI / 2), palette.lanePaint, { at: [LANE * 1.5 + 0.3, 0.02, center] }),
  ];
  for (let z = z0; z > z0 - len; z -= DASH_PERIOD) {
    for (const x of [-LANE / 2, LANE / 2]) {
      parts.push(paint(new PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2), palette.lanePaint, { at: [x, 0.02, z] }));
    }
  }
  return merge(parts);
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** One TILE of roadside props, merged into a single geometry. */
function propsTile(): BufferGeometry {
  const r = rand(7);
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
  const shrubs = ['#8a9a5b', '#9aa564', '#7b8a55', '#a8a06a'];
  for (let i = 0; i < 70; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (12 + r() ** 1.6 * 90);
    const s = 0.6 + r() * 1.3;
    parts.push(
      paint(new IcosahedronGeometry(1, 0), shrubs[i % shrubs.length], {
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
  const ring = (rad: number, y: number) =>
    radii.map((k, i) => {
      const a = (i / sides) * TAU;
      return new Vector3(Math.cos(a) * rad * k * w, y, Math.sin(a) * rad * k * w * 0.55);
    });
  const rings = [ring(1.55, 0), ring(1.08, h * 0.38), ring(1.0, h * 0.42), ring(0.94, h), ring(0, h)];
  const verts: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3) => verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const [a, b, c, d] = [rings[k][i], rings[k][j], rings[k + 1][i], rings[k + 1][j]];
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  const rock = new Color(palette.mesa);
  const band = new Color('#a9503d');
  const pale = new Color('#dd8a62');
  setColors(g, (_x, y, _z, c) => {
    const t = y / h;
    const strata = Math.sin(t * 22) > 0.55 ? band : t > 0.9 ? pale : rock;
    c.copy(rock).lerp(strata, 0.6);
    if (t < 0.4) c.lerp(new Color(palette.sand), 0.35 * (1 - t / 0.4));
  });
  return g;
}

function mesaLayer(layer: number): BufferGeometry {
  const r = rand(100 + layer);
  const ranges = [
    { z: [-480, -700], count: 4, w: [70, 130], h: [45, 80] },
    { z: [-1300, -1700], count: 7, w: [120, 260], h: [80, 150] },
    { z: [-2300, -2900], count: 9, w: [200, 420], h: [110, 210] },
  ][layer];
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < ranges.count; i++) {
    const spread = [900, 2600, 3800][layer];
    let x = (i / (ranges.count - 1) - 0.5) * spread + (r() - 0.5) * 120;
    if (layer === 0 && Math.abs(x) < 150) x = Math.sign(x || 1) * (150 + r() * 80);
    const z = ranges.z[0] + (ranges.z[1] - ranges.z[0]) * r();
    const w = ranges.w[0] + r() * (ranges.w[1] - ranges.w[0]);
    const h = ranges.h[0] + r() * (ranges.h[1] - ranges.h[0]);
    const g = mesa(r, w * 0.5, h);
    g.translate(x, -4, z);
    parts.push(g);
  }
  return merge(parts);
}

function glowMaterial() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(palette.policeRed) }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.2) * uStrength;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

interface Car {
  root: Group;
  lane: number;
  /** Start offset ahead of the Roadster; traffic is a pure function of time so frozen frames match. */
  z0: number;
  speed: number;
}

export function createWorld(): World {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.5, 4500);
  const parts: Part[] = [];
  const add = (geo: BufferGeometry, role: Role, parent: Group | Scene, extra: Partial<Part> = {}) => {
    const mesh = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true }));
    mesh.castShadow = role === 'body' || role === 'prop' || role === 'glass';
    mesh.receiveShadow = role !== 'emissive' && role !== 'mesa';
    parent.add(mesh);
    parts.push({ mesh, role, ...extra });
    return mesh;
  };

  const ground = new Group();
  scene.add(ground);
  add(sandGround(), 'ground', ground);
  add(roadStrip(), 'ground', ground);

  const props = [new Group(), new Group(), new Group()];
  const propGeo = propsTile();
  for (const g of props) {
    add(propGeo, 'prop', g);
    scene.add(g);
  }

  const mesas = new Group();
  scene.add(mesas);
  for (const layer of [0, 1, 2]) add(mesaLayer(layer), 'mesa', mesas, { layer });

  const vehicle = (geo: VehicleGeo, hero: boolean) => {
    const root = new Group();
    add(geo.body, 'body', root, { hero });
    if (geo.glass) add(geo.glass, 'glass', root, { hero });
    if (geo.emissive) add(geo.emissive, 'emissive', root, { hero });
    scene.add(root);
    return root;
  };

  const roadsterRoot = vehicle(roadster(), true);
  const policeGeo = police();
  const policeRoot = vehicle(policeGeo, true);
  const barRed = add(policeGeo.barRed!, 'emissive', policeRoot, { hero: true });
  const barBlue = add(policeGeo.barBlue!, 'emissive', policeRoot, { hero: true });
  const barOff = new Color('#3a3346');
  const barOffMat = new MeshBasicMaterial({ color: barOff });
  const barRedOff = new Mesh(policeGeo.barRed!, barOffMat);
  const barBlueOff = new Mesh(policeGeo.barBlue!, barOffMat);
  policeRoot.add(barRedOff, barBlueOff);
  parts.push({ mesh: barRedOff, role: 'body', hero: true }, { mesh: barBlueOff, role: 'body', hero: true });
  for (const m of [barRedOff, barBlueOff]) {
    const g = m.geometry.clone();
    const c = g.getAttribute('color');
    for (let i = 0; i < c.count; i++) c.setXYZ(i, barOff.r, barOff.g, barOff.b);
    m.geometry = g;
  }


  const glow = new Mesh(new PlaneGeometry(14, 14).rotateX(-Math.PI / 2), glowMaterial());
  glow.position.y = 0.03;
  glow.renderOrder = 2;
  policeRoot.add(glow);

  const kinds: TrafficKind[] = ['sedan', 'semi', 'hatch', 'suv', 'pickup', 'sedan', 'hatch'];
  const cars: Car[] = kinds.map((kind, i) => {
    const geo = traffic(kind, trafficColors[i % trafficColors.length]);
    return {
      root: vehicle(geo, false),
      lane: [-1, 1, 0, -1, 1, 0, 1][i],
      z0: -40 - i * 32,
      speed: SPEED - 8 - (i % 3) * 2.5,
    };
  });

  const sun = new DirectionalLight(new Color(palette.sun), 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const rig = { back: 9.5, height: 3.6, lookY: 1.1 };
  const update = (t: number) => {
    const pz = -SPEED * t;
    const sway = Math.sin(t * 0.37) * 0.9;
    roadsterRoot.position.set(sway * 0.4, 0, pz);
    roadsterRoot.rotation.z = -Math.cos(t * 0.37) * 0.02;
    policeRoot.position.set(-LANE + Math.sin(t * 0.8) * 0.25, 0, pz - 1.5 + Math.sin(t * 0.5) * 1.2);
    policeRoot.rotation.y = Math.sin(t * 0.8) * 0.03;

    const tileZ = Math.ceil(pz / TILE) * TILE;
    ground.position.z = tileZ;
    props.forEach((g, i) => (g.position.z = tileZ + (1 - i) * TILE));
    mesas.position.z = pz * 0.92;

    for (const car of cars) {
      const span = 260;
      const rel = ((((car.z0 + 220 + (SPEED - car.speed) * t) % span) + span) % span) - 220;
      car.root.position.set(car.lane * LANE, 0, pz + rel);
    }

    const phase = Math.floor(t * 5) % 4;
    const redOn = phase === 0 || phase === 1;
    barRed.visible = redOn;
    barBlue.visible = !redOn;
    barRedOff.visible = !redOn;
    barBlueOff.visible = redOn;
    const gm = glow.material as ShaderMaterial;
    gm.uniforms.uColor.value.set(redOn ? palette.policeRed : palette.policeBlue);
    gm.uniforms.uStrength.value = 0.55 + 0.15 * Math.sin(t * 31);
    glow.position.x = redOn ? -0.6 : 0.6;

    const focus = new Vector3(roadsterRoot.position.x * 0.5, 0, pz - 14);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 120);

    camera.position.set(sway * 0.25 + Math.sin(t * 0.13) * 0.8, rig.height, pz + rig.back);
    camera.lookAt(sway * 0.1, rig.lookY, pz - 16);
  };

  const resize = (w: number, h: number) => {
    const aspect = w / h;
    const portrait = smooth(1.3, 0.5, aspect);
    rig.back = 9.5 + portrait * 5.5;
    rig.height = 3.6 + portrait * 1.6;
    rig.lookY = 1.1 + portrait * 2.4;
    camera.aspect = aspect;
    camera.fov = 50 + portrait * 20;
    camera.updateProjectionMatrix();
  };

  return { scene, camera, sun, parts, glow, roadsterRoot, policeRoot, update, resize };
}
