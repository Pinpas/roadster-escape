import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material, type Object3D } from 'three';
import type { Cop } from '../sim/cop';
import type { World } from '../sim/world';
import { copPose, laneX } from './pose';

const TRAFFIC_COLORS = ['#8aa0b8', '#b8a88a', '#9cb89a', '#c9c2b8', '#a48fb0'] as const;

export interface Chase {
  /** Moves every cop and car to match the world, relative to the Roadster's distance. */
  update(world: World): void;
}

const box = (w: number, h: number, d: number, material: Material, y = h / 2): Mesh => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.y = y;
  return mesh;
};

const lambert = (color: string, emissive = '#000000'): MeshLambertMaterial =>
  new MeshLambertMaterial({ color, emissive });

const copBlue = lambert('#2f6bff', '#2f6bff');
const copRed = lambert('#ff3048', '#ff3048');
const copDark = lambert('#1f1c26');

function buildCop(): Group {
  const car = new Group();
  car.add(box(2, 0.7, 4.4, lambert('#f4f1ea'), 0.5));
  car.add(box(2.02, 0.35, 2.2, copDark, 0.5));
  car.add(box(1.5, 0.45, 1.8, copDark, 1.05));
  const blue = box(0.6, 0.2, 0.4, copBlue, 1.38);
  blue.position.x = -0.35;
  blue.name = 'blue';
  const red = box(0.6, 0.2, 0.4, copRed, 1.38);
  red.position.x = 0.35;
  red.name = 'red';
  car.add(blue, red);
  return car;
}

/** Keeps one mesh per sim id: adds new ones, moves live ones, and removes the gone. */
function syncById<T extends { readonly id: number }>(
  parent: Object3D,
  meshes: Map<number, Group | Mesh>,
  items: readonly T[],
  build: (item: T) => Group | Mesh,
  place: (mesh: Group | Mesh, item: T) => void,
): void {
  const live = new Set<number>();
  for (const item of items) {
    live.add(item.id);
    let mesh = meshes.get(item.id);
    if (!mesh) {
      mesh = build(item);
      meshes.set(item.id, mesh);
      parent.add(mesh);
    }
    place(mesh, item);
  }
  for (const [id, mesh] of meshes) {
    if (!live.has(id)) {
      parent.remove(mesh);
      meshes.delete(id);
    }
  }
}

const isFlashing = (cop: Cop): boolean =>
  cop.state.kind === 'warn' || cop.state.kind === 'lunge' || cop.state.kind === 'lineUp';

export function createChase(parent: Object3D): Chase {
  const cops = new Map<number, Group | Mesh>();
  const traffic = new Map<number, Group | Mesh>();

  return {
    update(world) {
      const flashOn = Math.floor(world.step / 8) % 2 === 0;
      syncById(parent, cops, world.cops, buildCop, (mesh, cop) => {
        const copAt = copPose(cop);
        mesh.position.set(copAt.x, copAt.y, cop.gap);
        mesh.rotation.z = copAt.roll;
        const flashing = isFlashing(cop);
        const blue = mesh.getObjectByName('blue');
        const red = mesh.getObjectByName('red');
        if (blue) blue.visible = !flashing || flashOn;
        if (red) red.visible = !flashing || !flashOn;
      });
      syncById(
        parent,
        traffic,
        world.traffic,
        (car) => {
          const color = TRAFFIC_COLORS[car.id % TRAFFIC_COLORS.length] ?? TRAFFIC_COLORS[0];
          const group = new Group();
          group.add(box(1.9, 1.1, 4, lambert(color), 0.65));
          return group;
        },
        (mesh, car) => {
          mesh.position.set(laneX(car.lane), 0, -car.ahead);
        },
      );
    },
  };
}
