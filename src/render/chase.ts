import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  TorusGeometry,
  type Material,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type BufferGeometry,
  type Object3D,
} from 'three';
import {
  isBoosting,
  isPickup,
  LANE_WIDTH,
  laneX,
  SHAPES,
  type CarKind,
  type Thing,
  type World,
} from '../sim/runner';
import { police, traffic, trafficColors, type VehicleGeo } from './world/vehicles';

export interface Chase {
  /** Moves the traffic, the cops and the thruster flames to match the world. */
  update(world: World): void;
}

const paintMaterial = new MeshLambertMaterial({ vertexColors: true });
const glowMaterial = new MeshBasicMaterial({ vertexColors: true });

function vehicleGroup(geo: VehicleGeo): Group {
  const group = new Group();
  const parts: [BufferGeometry | undefined, MeshLambertMaterial | MeshBasicMaterial][] = [
    [geo.body, paintMaterial],
    [geo.glass, paintMaterial],
    [geo.emissive, glowMaterial],
  ];
  for (const [part, material] of parts) {
    if (!part) continue;
    const mesh = new Mesh(part, material);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

const geoCache = new Map<string, VehicleGeo>();
function trafficGeo(kind: CarKind | 'semi', id: number): VehicleGeo {
  const color = trafficColors[id % trafficColors.length] ?? trafficColors[0];
  const key = `${kind}:${color}`;
  let geo = geoCache.get(key);
  if (!geo) {
    geo = traffic(kind, color);
    geoCache.set(key, geo);
  }
  return geo;
}

const lambert = (color: string): MeshLambertMaterial => new MeshLambertMaterial({ color });
const mats = {
  white: lambert('#f4f1ea'),
  black: lambert('#26222c'),
  pink: lambert('#f2a0b4'),
  horn: lambert('#e8dcc0'),
  orange: lambert('#ff7a1a'),
  rampTop: lambert('#ffc23d'),
  rampSide: lambert('#7a5a3a'),
  dough: lambert('#d99a55'),
  frosting: new MeshBasicMaterial({ color: '#ff6fae' }),
  sprinkle: new MeshBasicMaterial({ color: '#fff27a' }),
  canister: new MeshBasicMaterial({ color: '#5fd8ff' }),
  magnet: new MeshBasicMaterial({ color: '#ff3048' }),
  steel: lambert('#d8dde6'),
};

const part = (
  geometry: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

/** A boxy cartoon cow standing across the lane, staring at you. */
function buildCow(): Group {
  const cow = new Group();
  cow.add(part(new BoxGeometry(2.2, 1.0, 1.1), mats.white, 0, 1.15, 0));
  cow.add(part(new BoxGeometry(0.8, 0.5, 1.12), mats.black, -0.4, 1.35, 0));
  cow.add(part(new BoxGeometry(0.5, 0.6, 1.12), mats.black, 0.6, 1.05, 0));
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.35, 0.35])
      cow.add(part(new BoxGeometry(0.22, 0.7, 0.22), mats.white, x, 0.35, z));
  }
  const head = new Group();
  head.position.set(1.25, 1.55, 0.25);
  head.add(part(new BoxGeometry(0.6, 0.6, 0.7), mats.white, 0, 0, 0));
  head.add(part(new BoxGeometry(0.62, 0.3, 0.6), mats.pink, 0.05, -0.2, 0.2));
  for (const z of [-0.25, 0.25])
    head.add(part(new BoxGeometry(0.1, 0.25, 0.1), mats.horn, 0, 0.4, z));
  head.rotation.y = -0.6;
  cow.add(head);
  cow.rotation.y = 0.15;
  return cow;
}

function buildCone(): Group {
  const cone = new Group();
  cone.add(part(new ConeGeometry(0.32, 0.8, 12), mats.orange, 0, 0.45, 0));
  cone.add(part(new CylinderGeometry(0.2, 0.24, 0.12, 12), mats.white, 0, 0.5, 0));
  cone.add(part(new BoxGeometry(0.7, 0.06, 0.7), mats.orange, 0, 0.03, 0));
  return cone;
}

/** A launch ramp: rises 1.4 m over its length toward the far end. */
function buildRamp(): Group {
  const ramp = new Group();
  const length = SHAPES.ramp.length;
  const slope = Math.atan2(1.4, length);
  const deck = part(new BoxGeometry(3, 0.18, Math.hypot(length, 1.4)), mats.rampTop, 0, 0.7, 0);
  deck.rotation.x = slope;
  ramp.add(deck);
  for (const x of [-1.4, 1.4]) {
    const side = part(
      new BoxGeometry(0.15, 0.8, length * 0.6),
      mats.rampSide,
      x,
      0.4,
      -length * 0.15,
    );
    ramp.add(side);
  }
  for (let i = 0; i < 4; i++) {
    const stripe = part(new BoxGeometry(3.02, 0.2, 0.5), mats.black, 0, 0, 0);
    const along = -length / 2 + 1 + i * 1.6;
    stripe.position.set(0, 0.7 - along * Math.tan(slope) + 0.02, along);
    stripe.rotation.x = slope;
    ramp.add(stripe);
  }
  return ramp;
}

function buildDonut(): Group {
  const donut = new Group();
  donut.add(part(new TorusGeometry(0.45, 0.2, 10, 20), mats.dough, 0, 0, 0));
  const icing = part(new TorusGeometry(0.45, 0.17, 10, 20), mats.frosting, 0, 0, 0.06);
  icing.scale.set(1, 1, 0.8);
  donut.add(icing);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const sprinkle = part(
      new BoxGeometry(0.12, 0.04, 0.04),
      mats.sprinkle,
      Math.cos(angle) * 0.45,
      Math.sin(angle) * 0.45,
      0.2,
    );
    sprinkle.rotation.z = angle * 2;
    donut.add(sprinkle);
  }
  return donut;
}

function buildCanister(): Group {
  const can = new Group();
  can.add(part(new CylinderGeometry(0.35, 0.35, 1, 14), mats.canister, 0, 0, 0));
  can.add(part(new CylinderGeometry(0.36, 0.36, 0.15, 14), mats.white, 0, 0.1, 0));
  can.add(part(new CylinderGeometry(0.12, 0.12, 0.25, 8), mats.steel, 0, 0.6, 0));
  return can;
}

function buildMagnet(): Group {
  const magnet = new Group();
  magnet.add(part(new TorusGeometry(0.45, 0.16, 8, 16, Math.PI), mats.magnet, 0, 0, 0));
  for (const x of [-0.45, 0.45])
    magnet.add(part(new BoxGeometry(0.32, 0.3, 0.32), mats.steel, x, -0.15, 0));
  magnet.rotation.z = Math.PI;
  return magnet;
}

function buildThing(thing: Thing): Group {
  switch (thing.kind) {
    case 'cow':
      return buildCow();
    case 'cone':
      return buildCone();
    case 'ramp':
      return buildRamp();
    case 'donut':
      return buildDonut();
    case 'canister':
      return buildCanister();
    case 'magnet':
      return buildMagnet();
    default:
      return vehicleGroup(trafficGeo(thing.kind, thing.id));
  }
}

function buildCop(): Group {
  const geo = police();
  const car = vehicleGroup(geo);
  const red = new Mesh(geo.barRed, glowMaterial);
  red.name = 'red';
  const blue = new Mesh(geo.barBlue, glowMaterial);
  blue.name = 'blue';
  car.add(red, blue);
  return car;
}

const flameMaterial = new MeshBasicMaterial({
  color: '#8fe3ff',
  transparent: true,
  opacity: 0.85,
  blending: AdditiveBlending,
  depthWrite: false,
});

/** A cone with its base at the origin and its tip `length` along +Z, or down -Y. */
function flame(radius: number, length: number, down: boolean): Mesh {
  const geo = new ConeGeometry(radius, length, 10);
  if (down) geo.rotateX(Math.PI).translate(0, -length / 2, 0);
  else geo.rotateX(Math.PI / 2).translate(0, 0, length / 2);
  return new Mesh(geo, flameMaterial);
}

/** Cold-gas plumes on the Roadster: two out the back for the boost, two down for a jump. */
function createThrusters(roadster: Object3D): (world: World) => void {
  const rear = [-0.5, 0.5].map((x) => {
    const mesh = flame(0.32, 2.6, false);
    mesh.position.set(x, 0.55, 2.2);
    return mesh;
  });
  const lift = [-0.85, 0.85].map((x) => {
    const mesh = flame(0.3, 1.4, true);
    mesh.position.set(x, 0.25, 1.4);
    return mesh;
  });
  roadster.add(...rear, ...lift);
  return (world) => {
    const flicker = 0.8 + 0.4 * Math.abs(Math.sin(world.step * 1.7));
    const boosting = isBoosting(world);
    for (const mesh of rear) {
      mesh.visible = boosting;
      mesh.scale.set(1, 1, flicker);
    }
    const lifting = world.vy > 3;
    for (const mesh of lift) {
      mesh.visible = lifting;
      mesh.scale.set(1, flicker * (world.vy / 15), 1);
    }
  };
}

/** Poses one thing: parked, bobbing, sucked into the car, or knocked flying. */
function place(mesh: Group, thing: Thing, world: World): void {
  const x = laneX(thing.lane);
  const spin = world.step * 0.06 + thing.id;
  if (thing.goneAt === undefined) {
    mesh.visible = true;
    mesh.position.set(x, thing.y, -thing.ahead);
    if (isPickup(thing.kind)) {
      mesh.position.y = thing.y + 0.2 + Math.sin(spin * 1.5) * 0.15;
      mesh.rotation.set(0, spin, 0);
    }
    return;
  }
  const t = (world.step - thing.goneAt) / 60;
  if (isPickup(thing.kind)) {
    // Collected: zips into the car and shrinks away.
    const k = Math.min(1, t / 0.2);
    mesh.visible = k < 1;
    mesh.position.set(
      x + (world.x - x) * k,
      thing.y + (world.y + 0.8 - thing.y) * k,
      -thing.ahead * (1 - k),
    );
    mesh.scale.setScalar(1 - k * 0.7);
    return;
  }
  if (thing.kind === 'cone' || thing.kind === 'cow' || SHAPES[thing.kind].length < 10) {
    // Knocked flying: up, off to the side, tumbling. Cows fly higher, because cows.
    const side = thing.lane === 0 ? -1 : thing.lane === 2 ? 1 : thing.id % 2 ? 1 : -1;
    const lift = thing.kind === 'cow' ? 18 : 11;
    mesh.position.set(x + side * 9 * t, Math.max(0, lift * t - 9 * t * t), -thing.ahead);
    mesh.rotation.set(-5 * t, side * 3 * t, side * 4 * t);
    return;
  }
  // A semi just tips over onto its side.
  const k = Math.min(1, t * 2.5);
  mesh.rotation.set(0, 0, (thing.lane === 0 ? 1 : -1) * k * (Math.PI / 2));
  mesh.position.set(x, 0, -thing.ahead);
}

export function createChase(parent: Object3D, roadster: Object3D): Chase {
  const things = new Map<number, Group>();
  const cops = [buildCop(), buildCop()];
  parent.add(...cops);
  const thrusters = createThrusters(roadster);

  return {
    update(world) {
      const live = new Set<number>();
      for (const thing of world.things) {
        live.add(thing.id);
        let mesh = things.get(thing.id);
        if (!mesh) {
          mesh = buildThing(thing);
          things.set(thing.id, mesh);
          parent.add(mesh);
        }
        place(mesh, thing, world);
      }
      for (const [id, mesh] of things) {
        if (!live.has(id)) {
          parent.remove(mesh);
          things.delete(id);
        }
      }

      // The cops sit on the bumper at gap 0 and drop out of view behind the camera past ~10 m.
      const flashOn = Math.floor(world.step / 8) % 2 === 0;
      const otherLaneX = world.lane === 2 ? -LANE_WIDTH : LANE_WIDTH;
      cops.forEach((cop, index) => {
        const z = 4 + world.copGap * 0.9 + index * 5;
        cop.position.set(world.x + (index === 1 ? otherLaneX * 0.8 : 0), 0, z);
        const red = cop.getObjectByName('red');
        const blue = cop.getObjectByName('blue');
        if (red) red.visible = flashOn;
        if (blue) blue.visible = !flashOn;
      });
      thrusters(world);
    },
  };
}
