import { STEP_SECONDS } from './fixed-step';
import { createRng } from './rng';

export type Lane = 0 | 1 | 2;
export type Action = 'left' | 'right' | 'jump' | 'boost';
export type ObstacleKind = 'hatch' | 'sedan' | 'suv' | 'pickup' | 'semi';

export interface Obstacle {
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly lane: Lane;
  /** Meters from the Roadster's centre to the obstacle's centre; negative once passed. */
  ahead: number;
  /** The step a boost or a hit knocked it away, or undefined while it still blocks. */
  smashedAt: number | undefined;
  /** Set once the Roadster has passed it, so a clear only scores once. */
  passed: boolean;
}

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
  /** Steps of the knock-back after a hit, while nothing else can hit you. */
  stumbleLeft: number;
  /** How far behind the cops are; at 0 they have you. */
  copGap: number;
  obstacles: Obstacle[];
  nextId: number;
  /** Distance at which the next row of traffic spawns. Infinity on the title screen. */
  nextRowAt: number;
  bonus: number;
  busted: boolean;
}

export const LANE_WIDTH = 3.7;
const ROADSTER_LENGTH = 4.4;
/** Closer than this sideways, the Roadster and a car overlap. */
const HIT_HALF_WIDTH = 2.1;
/** A jump clears a car once the Roadster is this high. Semis are too tall to clear. */
const CLEAR_HEIGHT = 1.3;

export const RUN = {
  startSpeed: 26,
  topSpeed: 50,
  accel: 0.35,
  boostFactor: 1.7,
  trafficSpeed: 4,
  laneEase: 14,
  jumpSpeed: 14,
  gravity: 22,
  jumpBufferSteps: 9,
  boostSteps: Math.round(2.5 / STEP_SECONDS),
  boostRefillSeconds: 9,
  clearRefill: 0.2,
  stumbleSteps: Math.round(1 / STEP_SECONDS),
  stumbleSlowdown: 0.7,
  copStartGap: 16,
  copMaxGap: 20,
  copBoostMaxGap: 30,
  copHitLoss: 10,
  copRegen: 0.6,
  copBoostGain: 6,
  spawnAhead: 170,
  firstRowAt: 60,
  smashPoints: 100,
  clearPoints: 50,
} as const;

export const LENGTHS: Readonly<Record<ObstacleKind, number>> = {
  hatch: 3.9,
  sedan: 4.6,
  suv: 4.8,
  pickup: 5.4,
  semi: 15,
};

const CARS: readonly ObstacleKind[] = ['hatch', 'sedan', 'suv', 'pickup'];

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
  stumbleLeft: 0,
  copGap: RUN.copStartGap,
  obstacles: [],
  nextId: 0,
  nextRowAt: RUN.firstRowAt,
  bonus: 0,
  busted: false,
});

export const scoreOf = (world: World): number => Math.floor(world.distance) + world.bonus;

export const isBoosting = (world: World): boolean => world.boostLeft > 0;

/** Advances the world one fixed step in place. A busted world no longer changes. */
export function stepWorld(world: World, actions: readonly Action[]): void {
  if (world.busted) return;
  const dt = STEP_SECONDS;
  world.step += 1;

  for (const action of actions) act(world, action);
  if (world.jumpBuffer > 0) {
    world.jumpBuffer -= 1;
    if (world.y === 0) jump(world);
  }

  world.x += (laneX(world.lane) - world.x) * Math.min(1, RUN.laneEase * dt);
  world.vy -= RUN.gravity * dt;
  world.y = Math.max(0, world.y + world.vy * dt);
  if (world.y === 0) world.vy = 0;

  const boosting = isBoosting(world);
  if (boosting) world.boostLeft -= 1;
  else world.boostMeter = Math.min(1, world.boostMeter + dt / RUN.boostRefillSeconds);
  if (world.stumbleLeft > 0) world.stumbleLeft -= 1;

  world.speed = Math.min(RUN.topSpeed, world.speed + RUN.accel * dt);
  const speed = world.speed * (boosting ? RUN.boostFactor : 1);
  const travel = speed * dt;
  world.distance += travel;

  if (boosting) {
    world.copGap = Math.min(RUN.copBoostMaxGap, world.copGap + RUN.copBoostGain * dt);
  } else if (world.stumbleLeft === 0 && world.copGap < RUN.copMaxGap) {
    world.copGap = Math.min(RUN.copMaxGap, world.copGap + RUN.copRegen * dt);
  }

  const closing = travel - RUN.trafficSpeed * dt;
  for (const car of world.obstacles) {
    car.ahead -= car.smashedAt === undefined ? closing : travel * 0.3;
    if (car.smashedAt === undefined && collide(world, car)) return;
  }
  world.obstacles = world.obstacles.filter(
    (car) => car.ahead > -40 && world.step - (car.smashedAt ?? world.step) < 120,
  );
  spawnRows(world);
}

function act(world: World, action: Action): void {
  switch (action) {
    case 'left':
      if (world.lane > 0) world.lane = (world.lane - 1) as Lane;
      return;
    case 'right':
      if (world.lane < 2) world.lane = (world.lane + 1) as Lane;
      return;
    case 'jump':
      if (world.y === 0) jump(world);
      else world.jumpBuffer = RUN.jumpBufferSteps;
      return;
    case 'boost':
      if (world.boostMeter >= 1 && !isBoosting(world)) {
        world.boostMeter = 0;
        world.boostLeft = RUN.boostSteps;
      }
      return;
  }
}

function jump(world: World): void {
  world.vy = RUN.jumpSpeed;
  world.y = 0.001;
  world.jumpBuffer = 0;
}

/** Resolves a hit, a smash or a clear; returns whether the hit busted the Roadster. */
function collide(world: World, car: Obstacle): boolean {
  const reach = (LENGTHS[car.kind] + ROADSTER_LENGTH) / 2;
  const besides = Math.abs(world.x - laneX(car.lane)) < HIT_HALF_WIDTH;
  if (besides && Math.abs(car.ahead) < reach) {
    if (isBoosting(world)) {
      car.smashedAt = world.step;
      world.bonus += RUN.smashPoints;
      return false;
    }
    const cleared = car.kind !== 'semi' && world.y > CLEAR_HEIGHT;
    if (cleared || world.stumbleLeft > 0) return false;
    car.smashedAt = world.step;
    world.stumbleLeft = RUN.stumbleSteps;
    world.speed = Math.max(RUN.startSpeed * 0.7, world.speed * RUN.stumbleSlowdown);
    world.copGap -= RUN.copHitLoss;
    if (world.copGap <= 0) {
      world.copGap = 0;
      world.busted = true;
    }
    return world.busted;
  }
  if (!car.passed && car.ahead < -reach) {
    car.passed = true;
    if (besides) {
      world.bonus += RUN.clearPoints;
      world.boostMeter = Math.min(1, world.boostMeter + RUN.clearRefill);
    }
  }
  return false;
}

/**
 * Spawns a row of traffic far ahead. Every row leaves a lane open, or blocks all three with
 * cars low enough to jump, so a run is never unwinnable.
 */
function spawnRows(world: World): void {
  if (world.distance < world.nextRowAt) return;
  const rng = createRng(world.rngState);
  const pick = <T>(items: readonly T[]): T => items[rng.int(0, items.length)] as T;
  const car = (): ObstacleKind => pick(CARS);
  const lanes: Lane[] = [0, 1, 2];
  const open = pick(lanes);
  const others = lanes.filter((lane) => lane !== open);
  const hard = world.distance > 400;

  const row: { lane: Lane; kind: ObstacleKind }[] = [];
  const roll = rng.next();
  if (roll < 0.3) row.push({ lane: pick(others), kind: car() });
  else if (roll < 0.55) for (const lane of others) row.push({ lane, kind: car() });
  else if (roll < 0.75) row.push({ lane: pick(others), kind: 'semi' });
  else if (roll < 0.9 || !hard) {
    const [a, b] = rng.next() < 0.5 ? others : [...others].reverse();
    row.push({ lane: a as Lane, kind: 'semi' }, { lane: b as Lane, kind: car() });
  } else for (const lane of lanes) row.push({ lane, kind: car() });

  for (const { lane, kind } of row) {
    world.obstacles.push({
      id: world.nextId,
      kind,
      lane,
      ahead: RUN.spawnAhead + (kind === 'semi' ? 5 : 0),
      smashedAt: undefined,
      passed: false,
    });
    world.nextId += 1;
  }
  // Rows come 1.6 to 2.2 seconds apart at first, and tighten to 1.1 to 1.7 seconds over 1.5 km.
  const gapSeconds = Math.max(1.1, 1.6 - world.distance / 3000) + rng.next() * 0.6;
  world.nextRowAt = world.distance + world.speed * gapSeconds;
  world.rngState = rng.state();
}
