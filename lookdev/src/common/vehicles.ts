import { BufferGeometry, CylinderGeometry, Vector3 } from 'three';
import { bakeAO, box, merge, paint, smooth, warp, wheel } from './geometry';
import { palette } from './palette';

/** A vehicle as merged geometry per shading role, in local space with -Z forward. */
export interface VehicleGeo {
  body: BufferGeometry;
  glass?: BufferGeometry;
  emissive?: BufferGeometry;
  barRed?: BufferGeometry;
  barBlue?: BufferGeometry;
  length: number;
  width: number;
}

const tyre = '#2b2633';
const hub = '#b9b2c4';
const glass = '#26223a';

function wheels(radius: number, width: number, x: number, zs: number[]): BufferGeometry[] {
  return zs.flatMap((z) =>
    [-1, 1].flatMap((side) => [
      paint(wheel(radius, width), tyre, { at: [side * x, radius, z] }),
      paint(wheel(radius * 0.55, width + 0.02), hub, { at: [side * x, radius, z] }),
    ]),
  );
}

/** Chunky wedge: a low slab whose nose is pulled down, a small cabin set back. */
export function roadster(): VehicleGeo {
  const L = 4.4;
  const shell = warp(box(2.0, 0.62, L, 0.24, 3), (p) => {
    const front = 1 - smooth(-L / 2, 0.8, p.z);
    if (p.y > -0.1) p.y = -0.1 + (p.y + 0.1) * (1 - 0.62 * front);
    p.x *= 1 - 0.08 * front * smooth(-0.2, 0.31, p.y);
    if (p.z > L / 2 - 0.4 && p.y > 0.2) p.y += 0.05;
  });
  const cabin = warp(box(1.46, 0.5, 1.9, 0.22, 3), (p) => {
    const top = smooth(-0.25, 0.25, p.y);
    p.z += top * (p.z < 0 ? 0.55 : 0.18);
    p.x *= 1 - 0.14 * top;
  });
  const lip = paint(box(1.7, 0.08, 0.3, 0.04), palette.roadster, { at: [0, 0.98, L / 2 - 0.2] });
  const body = bakeAO(
    merge([
      paint(shell, palette.roadster, { at: [0, 0.6, 0] }),
      lip,
      paint(box(1.9, 0.14, L - 0.3, 0.07), '#3a2f3d', { at: [0, 0.3, 0] }),
      ...wheels(0.36, 0.32, 0.9, [-1.38, 1.38]),
    ]),
    1.1,
  );
  const emissive = merge([
    paint(box(1.5, 0.07, 0.06, 0.03), palette.policeRed, { at: [0, 0.78, L / 2 + 0.005] }),
    ...[-0.55, -0.18, 0.18, 0.55].map((x) =>
      paint(new CylinderGeometry(0.08, 0.1, 0.08, 8).rotateX(Math.PI / 2), palette.thruster, {
        at: [x, 0.45, L / 2 + 0.02],
      }),
    ),
    paint(box(0.42, 0.06, 0.05, 0.02), palette.lanePaint, { at: [-0.62, 0.62, -L / 2 + 0.06] }),
    paint(box(0.42, 0.06, 0.05, 0.02), palette.lanePaint, { at: [0.62, 0.62, -L / 2 + 0.06] }),
  ]);
  return {
    body,
    glass: paint(cabin, glass, { at: [0, 1.08, 0.45] }),
    emissive,
    length: L,
    width: 2.0,
  };
}

/** Goofy chunky sedan: tall cabin, fat wheels, oversized light bar. */
export function police(): VehicleGeo {
  const L = 4.7;
  const black = '#1f1d29';
  const white = '#f3eee6';
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
    glass: paint(cabin, glass, { at: [0, 1.32, 0.3] }),
    barRed: paint(box(0.56, 0.2, 0.36, 0.08), palette.policeRed, { at: [-0.3, 1.9, 0.25] }),
    barBlue: paint(box(0.56, 0.2, 0.36, 0.08), palette.policeBlue, { at: [0.3, 1.9, 0.25] }),
    emissive: merge([
      paint(box(1.6, 0.08, 0.06, 0.03), palette.policeRed, { at: [0, 0.92, L / 2 + 0.01] }),
    ]),
    length: L,
    width: 2.06,
  };
}

export type TrafficKind = 'hatch' | 'sedan' | 'suv' | 'pickup' | 'semi';

export const trafficColors = ['#8fa39a', '#a7b4c2', '#cbb79a', '#9c8aa5', '#7f9c9f', '#d6cfc0'];

/** Muted traffic silhouettes. Windows are painted into the body so each car is one draw call. */
export function traffic(kind: TrafficKind, color: string): VehicleGeo {
  const win = '#3a3550';
  const parts: BufferGeometry[] = [];
  let L = 4.4;
  let H = 1.6;
  if (kind === 'semi') {
    L = 15;
    H = 4;
    parts.push(
      paint(box(2.5, 2.6, 2.4, 0.3), color, { at: [0, 1.9, -L / 2 + 1.3] }),
      paint(box(2.3, 0.8, 1.0, 0.2), win, { at: [0, 2.5, -L / 2 + 0.25] }),
      paint(box(2.6, 3.4, 11.6, 0.15), '#e6dfd2', { at: [0, 2.35, 1.5] }),
      paint(box(2.2, 0.35, L - 0.5, 0.1), '#3a2f3d', { at: [0, 0.6, 0] }),
      ...wheels(0.5, 0.5, 1.0, [-L / 2 + 1.2, 4.5, 6.2]),
    );
  } else {
    const spec = {
      hatch: { L: 3.9, cabinL: 2.0, cabinZ: 0.5, cabinH: 0.6, bodyH: 0.62 },
      sedan: { L: 4.6, cabinL: 2.1, cabinZ: 0.15, cabinH: 0.58, bodyH: 0.62 },
      suv: { L: 4.8, cabinL: 3.0, cabinZ: 0.5, cabinH: 0.8, bodyH: 0.78 },
      pickup: { L: 5.4, cabinL: 1.7, cabinZ: -0.6, cabinH: 0.72, bodyH: 0.75 },
    }[kind];
    L = spec.L;
    const bodyY = 0.35 + spec.bodyH / 2;
    const cabinY = 0.35 + spec.bodyH + spec.cabinH / 2 - 0.04;
    H = cabinY + spec.cabinH / 2;
    parts.push(
      paint(box(1.9, spec.bodyH, L, 0.24), color, { at: [0, bodyY, 0] }),
      paint(box(1.62, spec.cabinH, spec.cabinL, 0.2), color, { at: [0, cabinY, spec.cabinZ] }),
      paint(box(1.66, spec.cabinH * 0.62, spec.cabinL - 0.3, 0.12), win, {
        at: [0, cabinY + 0.02, spec.cabinZ],
      }),
      ...wheels(0.36, 0.28, 0.86, [-L / 2 + 0.85, L / 2 - 0.85]),
    );
  }
  return {
    body: bakeAO(merge(parts), H),
    emissive: paint(box(1.7, 0.08, 0.05, 0.03), '#c43a3a', { at: [0, 0.85, L / 2 + 0.02] }),
    length: L,
    width: kind === 'semi' ? 2.6 : 1.9,
  };
}

export const forward = new Vector3(0, 0, -1);
