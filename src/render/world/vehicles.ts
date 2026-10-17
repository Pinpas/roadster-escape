import { BufferGeometry, CylinderGeometry } from 'three';
import { palette } from '../palette';
import { bakeAO, box, merge, paint, smooth, warp, wheel } from './geometry';

/** Placeholder vehicles, merged per shading role in local space with -Z forward. Phase 2 replaces them with Blender assets. */
export interface VehicleGeo {
  readonly body: BufferGeometry;
  readonly glass?: BufferGeometry;
  readonly emissive: BufferGeometry;
  readonly length: number;
}

export interface PoliceGeo extends VehicleGeo {
  readonly barRed: BufferGeometry;
  readonly barBlue: BufferGeometry;
}

const tyre = '#2b2633';
const hub = '#b9b2c4';
const glassTint = '#26223a';

function wheels(radius: number, width: number, x: number, zs: readonly number[]): BufferGeometry[] {
  return zs.flatMap((z) =>
    [-1, 1].flatMap((side) => [
      paint(wheel(radius, width), tyre, { at: [side * x, radius, z] }),
      paint(wheel(radius * 0.55, width + 0.02), hub, { at: [side * x, radius, z] }),
    ]),
  );
}

/** Flat normals per triangle, so bevelled panels read as crisp facets under toon light. */
function faceted(geo: BufferGeometry): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/** A dark star rim of our own: hub plus six thin spokes, facing out along X. */
function starRim(radius: number, x: number, y: number, z: number): BufferGeometry[] {
  const side = Math.sign(x);
  const rim = '#4a4752';
  return [
    paint(wheel(radius * 0.3, 0.06), rim, { at: [x + side * 0.02, y, z] }),
    ...Array.from({ length: 6 }, (_, i) =>
      paint(box(0.05, radius * 1.7, 0.07, 0.02, 1), rim, {
        at: [x + side * 0.02, y, z],
        rot: [(i / 6) * Math.PI, 0, 0],
      }),
    ),
  ];
}

/**
 * The 2026 Roadster as a chunky stylised placeholder: a faceted silver wedge over a satin
 * black lower band, a set-back dark glasshouse, and the rear the chase camera sees most
 * (full-width red bar, wing on two struts, diffuser with four nozzles, two corner nozzles).
 */
export function roadster(): VehicleGeo {
  const L = 4.4;
  const rear = L / 2;
  const upper = warp(box(2.0, 0.42, L, 0.07, 1), (p) => {
    const front = 1 - smooth(-L / 2, 0.6, p.z);
    if (p.y > 0) {
      p.y -= 0.3 * front;
      p.x *= 0.9;
    }
  });
  const cabin = warp(box(1.5, 0.42, 2.1, 0.06, 1), (p) => {
    if (p.y > 0) {
      p.z += p.z < 0 ? 0.75 : -0.2;
      p.y -= p.z > 0 ? 0.1 : 0;
      p.x *= 0.84;
    }
  });
  const tyre = '#24222b';
  const wheelPos = [-1.38, 1.38].flatMap((z) => [-0.92, 0.92].map((x) => [x, z] as const));
  const body = bakeAO(
    merge([
      faceted(paint(upper, palette.roadster, { at: [0, 0.71, 0] })),
      faceted(
        paint(box(2.04, 0.34, L - 0.06, 0.05, 1), palette.roadsterLower, { at: [0, 0.34, 0] }),
      ),
      paint(box(2.12, 0.05, 0.46, 0.02, 1), palette.roadster, { at: [0, 1.34, rear - 0.3] }),
      ...[-0.5, 0.5].map((x) =>
        paint(box(0.06, 0.4, 0.14, 0.02, 1), palette.roadsterLower, { at: [x, 1.13, rear - 0.28] }),
      ),
      paint(box(1.56, 0.3, 0.14, 0.03, 1), '#141218', { at: [0, 0.4, rear + 0.02] }),
      paint(box(0.42, 0.13, 0.03, 0.01, 1), '#ece6d8', { at: [0, 0.68, rear + 0.015] }),
      ...[-0.88, 0.88].map((x) =>
        paint(new CylinderGeometry(0.05, 0.06, 0.16, 8), '#141218', { at: [x, 0.2, rear - 0.18] }),
      ),
      ...[-1, 1].flatMap((side) =>
        [-0.5, 0.55].map((z) =>
          paint(new CylinderGeometry(0.05, 0.05, 0.08, 8).rotateZ(Math.PI / 2), '#141218', {
            at: [side * 1.03, 0.22, z],
          }),
        ),
      ),
      ...wheelPos.flatMap(([x, z]) => [
        paint(wheel(0.37, 0.34), tyre, { at: [x, 0.37, z] }),
        ...starRim(0.33, x, 0.37, z),
      ]),
    ]),
    1.2,
  );
  const nozzle = (x: number, y: number, z: number, rot: readonly [number, number, number]) =>
    paint(new CylinderGeometry(0.045, 0.045, 0.02, 10), palette.thruster, { at: [x, y, z], rot });
  const emissive = merge([
    paint(box(1.94, 0.06, 0.04, 0.02, 1), palette.policeRed, { at: [0, 0.88, rear + 0.01] }),
    ...[-0.45, -0.15, 0.15, 0.45].map((x) => nozzle(x, 0.45, rear + 0.1, [Math.PI / 2, 0, 0])),
    ...[-0.88, 0.88].map((x) => nozzle(x, 0.115, rear - 0.18, [0, 0, 0])),
    paint(box(0.5, 0.04, 0.04, 0.01, 1), palette.lanePaint, { at: [-0.6, 0.62, -rear + 0.04] }),
    paint(box(0.5, 0.04, 0.04, 0.01, 1), palette.lanePaint, { at: [0.6, 0.62, -rear + 0.04] }),
  ]);
  return {
    body,
    glass: faceted(paint(cabin, glassTint, { at: [0, 1.12, 0.35] })),
    emissive,
    length: L,
  };
}

/** Goofy chunky sedan: tall cabin, fat wheels, oversized light bar. */
export function police(): PoliceGeo {
  const L = 4.7;
  const black = '#1f1d29';
  const white = '#f2e2bf';
  const shell = warp(box(2.06, 0.72, L, 0.3, 3), (p) => {
    if (Math.abs(p.z) > L / 2 - 0.9 && p.y > 0) p.y *= 0.8;
  });
  const body = bakeAO(
    merge([
      paint(shell, black, { at: [0, 0.7, 0] }),
      paint(box(2.1, 0.5, 2.3, 0.2), white, { at: [0, 0.72, 0.1] }),
      paint(box(1.7, 0.1, 1.8, 0.05), white, { at: [0, 1.66, 0.3] }),
      paint(box(1.1, 0.12, 0.42, 0.05), '#2a2836', { at: [0, 1.76, 0.25] }),
      paint(box(2.0, 0.22, 0.3, 0.1), '#2a2836', { at: [0, 0.48, -L / 2 - 0.05] }),
      ...wheels(0.42, 0.38, 0.92, [-1.5, 1.5]),
    ]),
    1.4,
  );
  const cabin = warp(box(1.74, 0.62, 2.2, 0.26, 3), (p) => {
    const top = smooth(-0.3, 0.3, p.y);
    p.x *= 1 - 0.1 * top;
    p.z *= 1 - 0.15 * top;
  });
  return {
    body,
    glass: paint(cabin, glassTint, { at: [0, 1.32, 0.3] }),
    barRed: paint(box(0.56, 0.2, 0.36, 0.08), palette.policeRed, { at: [-0.3, 1.9, 0.25] }),
    barBlue: paint(box(0.56, 0.2, 0.36, 0.08), palette.policeBlue, { at: [0.3, 1.9, 0.25] }),
    emissive: paint(box(1.6, 0.08, 0.06, 0.03), palette.policeRed, { at: [0, 0.92, L / 2 + 0.01] }),
    length: L,
  };
}

export type TrafficKind = 'hatch' | 'sedan' | 'suv' | 'pickup' | 'semi';

export const trafficColors = [
  '#8fa39a',
  '#a7b4c2',
  '#cbb79a',
  '#9c8aa5',
  '#7f9c9f',
  '#d6cfc0',
] as const;

const carSpecs = {
  hatch: { L: 3.9, cabinL: 2.0, cabinZ: 0.5, cabinH: 0.6, bodyH: 0.62 },
  sedan: { L: 4.6, cabinL: 2.1, cabinZ: 0.15, cabinH: 0.58, bodyH: 0.62 },
  suv: { L: 4.8, cabinL: 3.0, cabinZ: 0.5, cabinH: 0.8, bodyH: 0.78 },
  pickup: { L: 5.4, cabinL: 1.7, cabinZ: -0.6, cabinH: 0.72, bodyH: 0.75 },
} as const;

/** Muted traffic silhouettes. Windows are painted into the body, so each car is one draw call. */
export function traffic(kind: TrafficKind, color: string): VehicleGeo {
  const win = '#3a3550';
  if (kind === 'semi') {
    const L = 15;
    const body = merge([
      paint(box(2.5, 2.6, 2.4, 0.3), color, { at: [0, 1.9, -L / 2 + 1.3] }),
      paint(box(2.3, 0.8, 1.0, 0.2), win, { at: [0, 2.5, -L / 2 + 0.25] }),
      paint(box(2.6, 3.4, 11.6, 0.15), '#e6dfd2', { at: [0, 2.35, 1.5] }),
      paint(box(2.2, 0.35, L - 0.5, 0.1), '#3a2f3d', { at: [0, 0.6, 0] }),
      ...wheels(0.5, 0.5, 1.0, [-L / 2 + 1.2, 4.5, 6.2]),
    ]);
    return { body: bakeAO(body, 4), emissive: taillight(L), length: L };
  }
  const s = carSpecs[kind];
  const bodyY = 0.35 + s.bodyH / 2;
  const cabinY = 0.35 + s.bodyH + s.cabinH / 2 - 0.04;
  const body = merge([
    paint(box(1.9, s.bodyH, s.L, 0.24), color, { at: [0, bodyY, 0] }),
    paint(box(1.62, s.cabinH, s.cabinL, 0.2), color, { at: [0, cabinY, s.cabinZ] }),
    paint(box(1.66, s.cabinH * 0.62, s.cabinL - 0.3, 0.12), win, {
      at: [0, cabinY + 0.02, s.cabinZ],
    }),
    ...wheels(0.36, 0.28, 0.86, [-s.L / 2 + 0.85, s.L / 2 - 0.85]),
  ]);
  return { body: bakeAO(body, cabinY + s.cabinH / 2), emissive: taillight(s.L), length: s.L };
}

const taillight = (L: number): BufferGeometry =>
  paint(box(1.7, 0.08, 0.05, 0.03), '#c43a3a', { at: [0, 0.85, L / 2 + 0.02] });
