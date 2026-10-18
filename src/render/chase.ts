import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { isBoosting, LANE_WIDTH, type Obstacle, type World } from '../sim/runner';
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
function trafficGeo(car: Obstacle): VehicleGeo {
  const color = trafficColors[car.id % trafficColors.length] ?? trafficColors[0];
  const key = `${car.kind}:${color}`;
  let geo = geoCache.get(key);
  if (!geo) {
    geo = traffic(car.kind, color);
    geoCache.set(key, geo);
  }
  return geo;
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

export function createChase(parent: Object3D, roadster: Object3D): Chase {
  const cars = new Map<number, Group>();
  const cops = [buildCop(), buildCop()];
  parent.add(...cops);
  const thrusters = createThrusters(roadster);

  return {
    update(world) {
      const live = new Set<number>();
      for (const car of world.obstacles) {
        live.add(car.id);
        let mesh = cars.get(car.id);
        if (!mesh) {
          mesh = vehicleGroup(trafficGeo(car));
          cars.set(car.id, mesh);
          parent.add(mesh);
        }
        const x = (car.lane - 1) * LANE_WIDTH;
        if (car.smashedAt === undefined) {
          mesh.position.set(x, 0, -car.ahead);
          mesh.rotation.set(0, 0, 0);
        } else {
          // Knocked flying: up, off to the side, tumbling.
          const t = (world.step - car.smashedAt) / 60;
          const side = car.lane === 0 ? -1 : car.lane === 2 ? 1 : car.id % 2 ? 1 : -1;
          mesh.position.set(x + side * 9 * t, Math.max(0, 11 * t - 9 * t * t), -car.ahead);
          mesh.rotation.set(-5 * t, 0, side * 4 * t);
        }
      }
      for (const [id, mesh] of cars) {
        if (!live.has(id)) {
          parent.remove(mesh);
          cars.delete(id);
        }
      }

      // The cops sit just off the bumper at gap 0 and drop back as the gap grows.
      const flashOn = Math.floor(world.step / 8) % 2 === 0;
      const otherLaneX = world.lane === 2 ? -LANE_WIDTH : LANE_WIDTH;
      cops.forEach((cop, index) => {
        const z = 5 + world.copGap * 0.35 + index * 4;
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
