import { STEP_SECONDS } from './fixed-step';
import { createRng, type Rng } from './rng';

export type Lane = 0 | 1 | 2;
export type Action = 'left' | 'right' | 'jump' | 'boost';
export type CarKind = 'hatch' | 'sedan' | 'suv' | 'pickup';
export type ThingKind =
  CarKind | 'semi' | 'cow' | 'cone' | 'ramp' | 'donut' | 'canister' | 'magnet';
export type PowerKind = 'canister' | 'magnet';

export interface Thing {
  readonly id: number;
  readonly kind: ThingKind;
  readonly lane: Lane;
  /** Meters from the Roadster's centre to the thing's centre; negative once passed. */
  ahead: number;
  /** Height of a floating pickup above the road. */
  readonly y: number;
  /** The step a boost, a hit or a pickup took it out, or undefined while it is still in play. */
  goneAt: number | undefined;
  /** Set once the Roadster has passed it, so a clear only scores once. */
  passed: boolean;
}

export type SimEvent =
  | { readonly kind: 'jump' }
  | { readonly kind: 'land' }
  | { readonly kind: 'lane' }
  | { readonly kind: 'boost' }
  | { readonly kind: 'boostEnd' }
  | { readonly kind: 'ramp' }
  | { readonly kind: 'smash'; readonly thing: ThingKind; readonly points: number }
  | { readonly kind: 'crash'; readonly thing: ThingKind }
  | { readonly kind: 'clear'; readonly thing: ThingKind; readonly points: number }
  | { readonly kind: 'donut'; readonly points: number }
  | { readonly kind: 'power'; readonly power: PowerKind }
  | { readonly kind: 'levelUp'; readonly level: number }
  | { readonly kind: 'busted' };

/** Plain data, so `?debug` can inspect it and equal seeds replay equal runs. */
export interface World {
  step: number;
  rngState: number;
  /** Meters driven. */
  distance: number;
  speed: number;
  lane: Lane;
  /** Sideways position in meters; it eases toward the lane. */
  x: number;
  /** Height above the road in meters, and its vertical speed. */
  y: number;
  vy: number;
  /** Steps a jump press waits for the landing. */
  jumpBuffer: number;
  /** 0 to 1; a full meter lets you boost. */
  boostMeter: number;
  boostLeft: number;
  magnetLeft: number;
  /** Steps of the knock-back after a hit, while nothing else can hit you. */
  stumbleLeft: number;
  /** How far behind the cops are; at 0 they have you. */
  copGap: number;
  things: Thing[];
  nextId: number;
  /** Distance at which the next row spawns. Infinity on the title screen. */
  nextRowAt: number;
  /** 1 and up; it raises the speed, the density and the score multiplier. */
  level: number;
  score: number;
  donuts: number;
  busted: boolean;
  /** What happened in the last step, for sound and effects. */
  events: SimEvent[];
}

export const LANE_WIDTH = 3.7;
const ROADSTER_LENGTH = 4.4;
const ROADSTER_HALF_WIDTH = 1.0;

export const RUN = {
  startSpeed: 24,
  topSpeed: 62,
  /** Meters per second of speed gained per meter driven. */
  speedPerMeter: 0.011,
  accel: 6,
  boostFactor: 1.6,
  laneEase: 16,
  jumpSpeed: 14,
  rampSpeed: 19,
  gravity: 22,
  jumpBufferSteps: 9,
  boostSteps: Math.round(3 / STEP_SECONDS),
  magnetSteps: Math.round(8 / STEP_SECONDS),
  boostRefillSeconds: 14,
  donutRefill: 0.04,
  clearRefill: 0.15,
  stumbleSteps: Math.round(1 / STEP_SECONDS),
  stumbleSlowdown: 0.7,
  copStartGap: 16,
  copMaxGap: 20,
  copBoostMaxGap: 30,
  copHitLoss: 10,
  copRegen: 0.6,
  copBoostGain: 6,
  spawnAhead: 180,
  firstRowAt: 50,
  levelMeters: 500,
  maxLevel: 10,
  points: { smash: 100, clear: 50, donut: 10, cone: 20, ramp: 25 },
} as const;

interface Shape {
  readonly length: number;
  readonly halfWidth: number;
  /** A jump this high clears it. */
  readonly height: number;
}

export const SHAPES: Readonly<Record<ThingKind, Shape>> = {
  hatch: { length: 3.9, halfWidth: 0.95, height: 1.3 },
  sedan: { length: 4.6, halfWidth: 0.95, height: 1.3 },
  suv: { length: 4.8, halfWidth: 0.95, height: 1.5 },
  pickup: { length: 5.4, halfWidth: 0.95, height: 1.4 },
  semi: { length: 15, halfWidth: 1.3, height: 4.8 },
  cow: { length: 2.4, halfWidth: 0.6, height: 1.3 },
  cone: { length: 0.6, halfWidth: 0.3, height: 0.7 },
  ramp: { length: 7, halfWidth: 1.4, height: 0 },
  donut: { length: 1.2, halfWidth: 0.8, height: 0 },
  canister: { length: 1.2, halfWidth: 0.8, height: 0 },
  magnet: { length: 1.2, halfWidth: 0.8, height: 0 },
};

const CARS: readonly CarKind[] = ['hatch', 'sedan', 'suv', 'pickup'];
const isBlocker = (kind: ThingKind): boolean =>
  kind !== 'cone' && kind !== 'ramp' && !isPickup(kind);
export const isPickup = (kind: ThingKind): boolean =>
  kind === 'donut' || kind === 'canister' || kind === 'magnet';

export const laneX = (lane: number): number => (lane - 1) * LANE_WIDTH;

export const createWorld = (seed: number): World => ({
  step: 0,
  rngState: createRng(seed).state(),
  distance: 0,
  speed: RUN.startSpeed,
  lane: 1,
  x: 0,
  y: 0,
  vy: 0,
  jumpBuffer: 0,
  boostMeter: 0.5,
  boostLeft: 0,
  magnetLeft: 0,
  stumbleLeft: 0,
  copGap: RUN.copStartGap,
  things: [],
  nextId: 0,
  nextRowAt: RUN.firstRowAt,
  level: 1,
  score: 0,
  donuts: 0,
  busted: false,
  events: [],
});

export const scoreOf = (world: World): number => Math.floor(world.score);

export const isBoosting = (world: World): boolean => world.boostLeft > 0;

/** The speed the run is heading for at this distance, before a boost. */
export const cruiseSpeed = (distance: number): number =>
  Math.min(RUN.topSpeed, RUN.startSpeed + distance * RUN.speedPerMeter);

/** Advances the world one fixed step in place. A busted world no longer changes. */
export function stepWorld(world: World, actions: readonly Action[]): void {
  world.events = [];
  if (world.busted) return;
  const dt = STEP_SECONDS;
  world.step += 1;

  for (const action of actions) act(world, action);
  if (world.jumpBuffer > 0) {
    world.jumpBuffer -= 1;
    if (world.y === 0) jump(world, RUN.jumpSpeed);
  }

  world.x += (laneX(world.lane) - world.x) * Math.min(1, RUN.laneEase * dt);
  const wasAirborne = world.y > 0;
  world.vy -= RUN.gravity * dt;
  world.y = Math.max(0, world.y + world.vy * dt);
  if (world.y === 0) {
    world.vy = 0;
    if (wasAirborne) world.events.push({ kind: 'land' });
  }

  const boosting = isBoosting(world);
  if (boosting) {
    world.boostLeft -= 1;
    if (world.boostLeft === 0) world.events.push({ kind: 'boostEnd' });
  } else {
    world.boostMeter = Math.min(1, world.boostMeter + dt / RUN.boostRefillSeconds);
  }
  if (world.magnetLeft > 0) world.magnetLeft -= 1;
  if (world.stumbleLeft > 0) world.stumbleLeft -= 1;

  const target = cruiseSpeed(world.distance);
  world.speed = Math.min(target, world.speed + RUN.accel * dt);
  const travel = world.speed * (boosting ? RUN.boostFactor : 1) * dt;
  world.distance += travel;
  world.score += travel * world.level * 0.5;

  const level = Math.min(RUN.maxLevel, 1 + Math.floor(world.distance / RUN.levelMeters));
  if (level > world.level) {
    world.level = level;
    world.events.push({ kind: 'levelUp', level });
  }

  if (boosting) {
    world.copGap = Math.min(RUN.copBoostMaxGap, world.copGap + RUN.copBoostGain * dt);
  } else if (world.stumbleLeft === 0 && world.copGap < RUN.copMaxGap) {
    world.copGap = Math.min(RUN.copMaxGap, world.copGap + RUN.copRegen * dt);
  }

  // Texas traffic is jammed solid, so everything on the road holds still and only you move.
  for (const thing of world.things) {
    thing.ahead -= thing.goneAt === undefined ? travel : travel * 0.3;
    if (thing.goneAt === undefined && touch(world, thing)) return;
  }
  world.things = world.things.filter(
    (thing) => thing.ahead > -40 && world.step - (thing.goneAt ?? world.step) < 120,
  );
  spawnRows(world);
}

/** Points scale with the level, like a score multiplier. */
const award = (world: World, base: number): number => {
  const points = base * world.level;
  world.score += points;
  return points;
};

function act(world: World, action: Action): void {
  switch (action) {
    case 'left':
    case 'right': {
      const lane = world.lane + (action === 'left' ? -1 : 1);
      if (lane < 0 || lane > 2) return;
      world.lane = lane as Lane;
      world.events.push({ kind: 'lane' });
      return;
    }
    case 'jump':
      if (world.y === 0) jump(world, RUN.jumpSpeed);
      else world.jumpBuffer = RUN.jumpBufferSteps;
      return;
    case 'boost':
      if (world.boostMeter >= 1 && !isBoosting(world)) {
        world.boostMeter = 0;
        world.boostLeft = RUN.boostSteps;
        world.events.push({ kind: 'boost' });
      }
      return;
  }
}

function jump(world: World, speed: number): void {
  world.vy = speed;
  world.y = Math.max(world.y, 0.001);
  world.jumpBuffer = 0;
  world.events.push({ kind: speed === RUN.jumpSpeed ? 'jump' : 'ramp' });
}

/** Resolves contact with one thing; returns whether it busted the Roadster. */
function touch(world: World, thing: Thing): boolean {
  const shape = SHAPES[thing.kind];
  const reach = (shape.length + ROADSTER_LENGTH) / 2;
  const magnet = thing.kind === 'donut' && world.magnetLeft > 0 && thing.ahead < 30;
  const sideways = Math.abs(world.x - laneX(thing.lane));
  const besides = sideways < shape.halfWidth + ROADSTER_HALF_WIDTH || magnet;
  const overlapping = besides && Math.abs(thing.ahead) < (magnet ? 30 : reach);

  if (!overlapping) {
    if (!thing.passed && thing.ahead < -reach) {
      thing.passed = true;
      if (isBlocker(thing.kind) && sideways < shape.halfWidth + ROADSTER_HALF_WIDTH) {
        const points = award(world, RUN.points.clear);
        world.boostMeter = Math.min(1, world.boostMeter + RUN.clearRefill);
        world.events.push({ kind: 'clear', thing: thing.kind, points });
      }
    }
    return false;
  }

  switch (thing.kind) {
    case 'donut':
      if (!magnet && Math.abs(world.y - thing.y) > 1.8) return false;
      thing.goneAt = world.step;
      world.donuts += 1;
      world.boostMeter = Math.min(1, world.boostMeter + RUN.donutRefill);
      world.events.push({ kind: 'donut', points: award(world, RUN.points.donut) });
      return false;
    case 'canister':
    case 'magnet':
      if (Math.abs(world.y - thing.y) > 1.8) return false;
      thing.goneAt = world.step;
      if (thing.kind === 'canister') world.boostMeter = 1;
      else world.magnetLeft = RUN.magnetSteps;
      world.events.push({ kind: 'power', power: thing.kind });
      return false;
    case 'ramp':
      if (world.y < 0.6 && world.vy <= 0) {
        jump(world, RUN.rampSpeed);
        award(world, RUN.points.ramp);
      }
      return false;
    case 'cone':
      if (world.y > shape.height) return false;
      thing.goneAt = world.step;
      world.events.push({ kind: 'smash', thing: 'cone', points: award(world, RUN.points.cone) });
      return false;
    default:
      break;
  }

  if (isBoosting(world)) {
    thing.goneAt = world.step;
    world.events.push({ kind: 'smash', thing: thing.kind, points: award(world, RUN.points.smash) });
    return false;
  }
  if (world.y > shape.height || world.stumbleLeft > 0) return false;
  thing.goneAt = world.step;
  world.stumbleLeft = RUN.stumbleSteps;
  world.speed = Math.max(RUN.startSpeed * 0.7, world.speed * RUN.stumbleSlowdown);
  world.copGap -= RUN.copHitLoss;
  world.events.push({ kind: 'crash', thing: thing.kind });
  if (world.copGap > 0) return false;
  world.copGap = 0;
  world.busted = true;
  world.events.push({ kind: 'busted' });
  return true;
}

interface Placement {
  readonly kind: ThingKind;
  readonly lane: Lane;
  /** Meters past the row's spawn line. */
  readonly offset?: number;
  readonly y?: number;
}

const LANES: readonly Lane[] = [0, 1, 2];

/** A line of donuts down one lane, on the road or floating along a jump arc. */
function donutLine(lane: Lane, from: number, count: number, arc = 0): Placement[] {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return {
      kind: 'donut',
      lane,
      offset: from + index * 4,
      y: 1 + arc * 4 * t * (1 - t),
    } as const;
  });
}

/** Donuts along the flight path off a ramp, so a clean launch collects them all. */
function rampDonuts(lane: Lane, speed: number): Placement[] {
  const launchBehind = (SHAPES.ramp.length + ROADSTER_LENGTH) / 2;
  return Array.from({ length: 8 }, (_, index) => {
    const t = 0.25 + index * 0.15;
    const y = RUN.rampSpeed * t - (RUN.gravity / 2) * t * t;
    return { kind: 'donut', lane, offset: speed * t - launchBehind, y } as const;
  });
}

/**
 * One row of road. Every pattern leaves a way through: an open lane, cars low enough to jump,
 * or a ramp over the trucks. Later levels unlock the meaner patterns.
 */
function pattern(world: World, rng: Rng): Placement[] {
  const pick = <T>(items: readonly T[]): T => items[rng.int(0, items.length)] as T;
  const car = (): CarKind => pick(CARS);
  const open = pick(LANES);
  const others = LANES.filter((lane) => lane !== open);
  const [a, b] = (rng.next() < 0.5 ? others : [...others].reverse()) as [Lane, Lane];
  const level = world.level;
  // A ramp launch clears a semi this far past the ramp's centre at the current speed.
  const rampGap = world.speed * 0.45 + 4;

  const patterns: (() => Placement[])[] = [
    () => [{ kind: car(), lane: a }, ...donutLine(open, -6, 5)],
    () => [{ kind: car(), lane: a }, { kind: car(), lane: b }, ...donutLine(open, -4, 4)],
    () => [{ kind: 'semi', lane: a, offset: 6 }, ...donutLine(b, -8, 4)],
    () => [
      { kind: 'cow', lane: a },
      { kind: 'cow', lane: b, offset: 10 },
      { kind: 'cow', lane: open, offset: 24 },
    ],
    () => [
      ...LANES.map((lane) => ({ kind: 'cone', lane, offset: rng.int(0, 10) }) as const),
      { kind: car(), lane: a, offset: 12 },
    ],
  ];
  if (level >= 2) {
    patterns.push(
      () => [
        { kind: 'semi', lane: a, offset: 6 },
        { kind: car(), lane: b },
        ...donutLine(open, 4, 5),
      ],
      () => [
        { kind: 'ramp', lane: a },
        { kind: 'semi', lane: a, offset: rampGap },
        ...rampDonuts(a, world.speed),
        { kind: car(), lane: b, offset: 10 },
      ],
    );
  }
  if (level >= 3) {
    patterns.push(
      () => [
        ...LANES.map((lane) => ({ kind: car(), lane }) as const),
        ...donutLine(open, -2, 5, 3),
      ],
      () => [
        { kind: 'semi', lane: a, offset: 6 },
        { kind: 'semi', lane: b, offset: 6 },
        { kind: 'ramp', lane: open },
        { kind: 'semi', lane: open, offset: rampGap },
        ...rampDonuts(open, world.speed),
      ],
    );
  }
  if (level >= 4) {
    patterns.push(() => [
      { kind: car(), lane: a },
      { kind: car(), lane: b, offset: 14 },
      { kind: car(), lane: open, offset: 28 },
    ]);
  }

  const row = pick(patterns)();
  if (rng.next() < 0.07) {
    const free = LANES.filter((lane) => !row.some((p) => p.lane === lane && isBlocker(p.kind)));
    if (free.length > 0) {
      row.push({
        kind: rng.next() < 0.5 ? 'canister' : 'magnet',
        lane: pick(free),
        offset: -14,
        y: 1,
      });
    }
  }
  return row;
}

function spawnRows(world: World): void {
  if (world.distance < world.nextRowAt) return;
  const rng = createRng(world.rngState);
  let extent = 0;
  for (const { kind, lane, offset = 0, y = 0 } of pattern(world, rng)) {
    extent = Math.max(extent, offset + SHAPES[kind].length / 2);
    world.things.push({
      id: world.nextId,
      kind,
      lane,
      ahead: RUN.spawnAhead + offset,
      y,
      goneAt: undefined,
      passed: false,
    });
    world.nextId += 1;
  }
  // Rows start about two seconds apart and tighten toward under one second.
  const gapSeconds = Math.max(0.8, 1.9 - world.distance / 2500) + rng.next() * 0.5;
  world.nextRowAt = world.distance + extent + world.speed * gapSeconds;
  world.rngState = rng.state();
}
