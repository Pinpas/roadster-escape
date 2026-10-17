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

export interface Placement {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

/** Strip a geometry down to position, normal and a flat vertex colour so any two parts can merge. */
export function paint(geo: BufferGeometry, hex: string, place: Placement = {}): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const m = new Matrix4().compose(
    new Vector3(...(place.at ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(place.rot ?? [0, 0, 0]))),
    new Vector3(...(place.scale ?? [1, 1, 1])),
  );
  g.applyMatrix4(m);
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed: parts have mismatched attributes');
  return g;
}

export const box = (w: number, h: number, d: number, r: number, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

export const wheel = (radius: number, width: number) =>
  new CylinderGeometry(radius, radius, width, 12, 1).rotateZ(Math.PI / 2);

/** Move vertices with a function of their position; recompute normals afterwards. */
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

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Bake cheap ambient occlusion into vertex colours: darker near the ground and on
 * downward faces. Stands in for the Blender AO bake the real assets get in phase 2.
 */
export function bakeAO(geo: BufferGeometry, height: number, floor = 0.45): BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colr = geo.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const up = smooth(0, height, pos.getY(i));
    const facing = 0.75 + 0.25 * nor.getY(i);
    const ao = floor + (1 - floor) * Math.min(1, up * 0.6 + 0.4) * facing;
    colr.setXYZ(i, colr.getX(i) * ao, colr.getY(i) * ao, colr.getZ(i) * ao);
  }
  return geo;
}

export { smooth };
