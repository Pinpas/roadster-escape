import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Triple = readonly [number, number, number];

export interface Placement {
  readonly at?: Triple;
  readonly rot?: Triple;
  readonly scale?: Triple;
}

/** Fill a geometry's `color` attribute from a function of each vertex position (linear RGB). */
export function setColors(
  geo: BufferGeometry,
  fn: (x: number, y: number, z: number, out: Color) => void,
): void {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
}

/** Strip a geometry down to position, normal and one flat vertex colour so any two parts merge. */
export function paint(geo: BufferGeometry, hex: string, place: Placement = {}): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  const [x, y, z] = place.at ?? [0, 0, 0];
  const [rx, ry, rz] = place.rot ?? [0, 0, 0];
  const [sx, sy, sz] = place.scale ?? [1, 1, 1];
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
      new Vector3(sx, sy, sz),
    ),
  );
  const c = new Color(hex);
  setColors(g, (_x, _y, _z, out) => out.copy(c));
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  // The typings say non-null, but three returns null (and logs) when attributes mismatch.
  const g = mergeGeometries(parts, false) as BufferGeometry | null;
  if (!g) throw new Error('mergeGeometries failed: parts have mismatched attributes');
  return g;
}

export const box = (w: number, h: number, d: number, r: number, seg = 2): BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

export const wheel = (radius: number, width: number): BufferGeometry =>
  new CylinderGeometry(radius, radius, width, 12, 1).rotateZ(Math.PI / 2);

/** Move vertices with a function of their position, then recompute normals. */
export function warp(geo: BufferGeometry, fn: (p: Vector3) => void): BufferGeometry {
  const pos = geo.getAttribute('position');
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Bake cheap ambient occlusion into vertex colours: darker near the ground and on downward
 * faces. Placeholder for the Blender AO bake the phase-2 assets carry.
 */
export function bakeAO(geo: BufferGeometry, height: number, floor = 0.45): BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const up = smooth(0, height, pos.getY(i));
    const facing = 0.75 + 0.25 * nor.getY(i);
    const ao = floor + (1 - floor) * Math.min(1, up * 0.6 + 0.4) * facing;
    col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
  return geo;
}

/** Small seeded LCG for scenery placement; the simulation's Rng lives in src/sim. */
export function scatter(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
