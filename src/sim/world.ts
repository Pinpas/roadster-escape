import type { Action } from './actions';
import { hasLanded, nextCop, type Cop, type LandedCop } from './cop';
import { STEP_SECONDS } from './fixed-step';
import { LANE_COUNT, laneAt, laneToward, type Lane, type Side } from './lanes';
import { createRng, type Rng } from './rng';
import {
  createRoadster,
  isPerfectDodge,
  nextRoadster,
  occupiesLane,
  staysOnRoad,
  type Roadster,
} from './roadster';
import { STYLE_POINTS, TUNING } from './tuning';
import {
  rollThreat,
  starsFor,
  THREAT_COPS,
  WANTED_LEVELS,
  type Threat,
  type WantedLevel,
} from './wanted';

export interface TrafficCar {
  readonly id: number;
  readonly lane: Lane;
  /** Meters ahead of the Roadster; negative once passed. */
  readonly ahead: number;
}

export interface BufferedAction {
  readonly action: Action;
  readonly stepsLeft: number;
}

/** Plain data: it survives a JSON round trip, and equal worlds stay equal under equal actions. */
export interface World {
  step: number;
  rngState: number;
  /** Meters driven. */
  distance: number;
  heat: number;
  roadster: Roadster;
  cops: readonly Cop[];
  nextCopId: number;
  spawnIn: number;
  buffer: readonly BufferedAction[];
  traffic: readonly TrafficCar[];
  nextCarId: number;
  trafficIn: number;
  /** Style points earned so far, already multiplied by the combo. */
  stylePoints: number;
  combo: number;
  comboStepsLeft: number;
}

export type SimEvent =
  | { readonly kind: 'spawned'; readonly threat: Threat }
  | { readonly kind: 'perfectDodge'; readonly copId: number }
  | { readonly kind: 'wrecked'; readonly copId: number }
  | { readonly kind: 'busted'; readonly copId: number }
  | { readonly kind: 'nearMiss'; readonly carId: number }
  | { readonly kind: 'crashed'; readonly carId: number };

export type StyleEvent = Extract<SimEvent, { kind: keyof typeof STYLE_POINTS }>;

export const createWorld = (seed: number): World => ({
  step: 0,
  rngState: createRng(seed).state(),
  distance: 0,
  heat: 0,
  roadster: createRoadster(),
  cops: [],
  nextCopId: 0,
  spawnIn: TUNING.firstSpawnSteps,
  buffer: [],
  traffic: [],
  nextCarId: 0,
  trafficIn: TUNING.trafficMinEverySteps,
  stylePoints: 0,
  combo: 1,
  comboStepsLeft: 0,
});

/** Meters driven plus style points. */
export const scoreOf = (world: World): number => Math.floor(world.distance) + world.stylePoints;

export const speedAt = (step: number): number =>
  Math.min(TUNING.topSpeed, TUNING.startSpeed + TUNING.speedGainPerStep * step);

/** Advances the world one fixed step in place. A busted world no longer changes. */
export function stepWorld(world: World, actions: readonly Action[]): readonly SimEvent[] {
  if (world.roadster.state.kind === 'busted') return [];
  const rng = createRng(world.rngState);
  const level = WANTED_LEVELS[starsFor(world.heat)];
  const travel = speedAt(world.step) * STEP_SECONDS;
  const events: SimEvent[] = [];

  world.roadster = nextRoadster(world.roadster, { kind: 'tick' });
  fireActions(world, actions);
  lineUpCops(world);
  const tick = {
    kind: 'tick',
    travel,
    warnSteps: level.warnSteps,
    roadsterLane: world.roadster.lane,
  } as const;
  world.cops = world.cops.map((cop) => nextCop(cop, tick));
  moveTraffic(world, travel, events);
  if (world.roadster.state.kind === 'busted') return events;
  landLunges(world, events);
  world.cops = world.cops.filter(
    (cop) => cop.state.kind !== 'crashed' || cop.gap < TUNING.copDespawnGap,
  );
  spawnThreat(world, level, rng, events);
  spawnTraffic(world, rng);
  scoreStyle(world, events);

  const wrecks = events.filter((event) => event.kind === 'wrecked').length;
  world.heat += 1 + wrecks * TUNING.wreckHeat;
  world.distance += travel;
  world.step += 1;
  world.rngState = rng.state();
  return events;
}

function fireActions(world: World, actions: readonly Action[]): void {
  const pending = [
    ...world.buffer,
    ...actions.map((action) => ({ action, stepsLeft: TUNING.inputBufferSteps })),
  ];
  const kept: BufferedAction[] = [];
  // At most one sideways move per step, so a lane press and a roll never jump two lanes at once.
  let movedSideways = false;
  for (const { action, stepsLeft } of pending) {
    if (!staysOnRoad(world.roadster, action)) continue;
    const sideways = action.kind !== 'hop';
    const next = sideways && movedSideways ? world.roadster : nextRoadster(world.roadster, action);
    if (next !== world.roadster) {
      world.roadster = next;
      movedSideways ||= sideways;
    } else if (stepsLeft > 0) kept.push({ action, stepsLeft: stepsLeft - 1 });
  }
  world.buffer = kept;
}

/** The sides a cop can line up on without crossing the Roadster's lane. */
function sidesFrom(copLane: Lane, roadsterLane: Lane): readonly Side[] {
  if (copLane < roadsterLane) return ['left'];
  if (copLane > roadsterLane) return ['right'];
  return ['left', 'right'];
}

/**
 * Lines up each close cruising cop on a free side of the Roadster. Cops with one possible side
 * claim first, then the nearer cop, so the order of `world.cops` never decides who gets a side.
 */
function lineUpCops(world: World): void {
  const roadsterLane = world.roadster.lane;
  const heldSides = new Set<Side>();
  const lungeLanes = new Set<Lane>();
  for (const { lane, state } of world.cops) {
    if (state.kind === 'lineUp' || state.kind === 'warn') heldSides.add(state.side);
    if (state.kind === 'lunge') lungeLanes.add(lane);
  }
  const isFree = (side: Side): boolean => {
    const lane = laneToward(roadsterLane, side);
    return lane !== undefined && !heldSides.has(side) && !lungeLanes.has(lane);
  };

  const candidates = world.cops
    .filter((cop) => cop.state.kind === 'cruise' && cop.gap <= TUNING.copHoldGap)
    .map((cop) => ({ cop, sides: sidesFrom(cop.lane, roadsterLane) }))
    .sort(
      (a, b) => a.sides.length - b.sides.length || a.cop.gap - b.cop.gap || a.cop.id - b.cop.id,
    );
  const linedUp = new Map<number, Cop>();
  for (const { cop, sides } of candidates) {
    const side = sides.find(isFree);
    if (side === undefined) continue;
    heldSides.add(side);
    linedUp.set(cop.id, nextCop(cop, { kind: 'lineUp', side }));
  }
  world.cops = world.cops.map((cop) => linedUp.get(cop.id) ?? cop);
}

/**
 * A landed lunge busts the Roadster, misses, or hits a cop in its path. A hit wrecks both cops.
 * A bust ends the run on this step, so nothing else resolves.
 */
function landLunges(world: World, events: SimEvent[]): void {
  const landed = world.cops.filter(hasLanded);
  for (const cop of landed) {
    const pitted = nextRoadster(world.roadster, { kind: 'pit', lane: cop.state.target });
    if (pitted !== world.roadster) {
      world.roadster = pitted;
      events.push({ kind: 'busted', copId: cop.id });
      return;
    }
  }

  const pathLane = (cop: Cop): Lane => (hasLanded(cop) ? cop.state.target : cop.lane);
  const hitsTraffic = (cop: LandedCop): boolean =>
    world.traffic.some(
      (car) => car.lane === cop.state.target && Math.abs(car.ahead + cop.gap) < TUNING.copLength,
    );
  const crashing = new Set<Cop>();
  for (const cop of landed) {
    const { target } = cop.state;
    if (isPerfectDodge(world.roadster, target)) {
      events.push({ kind: 'perfectDodge', copId: cop.id });
    }
    const hit = world.cops.filter(
      (other) =>
        other !== cop &&
        pathLane(other) === target &&
        Math.abs(other.gap - cop.gap) < TUNING.copLength,
    );
    if (hit.length > 0) for (const wreck of [cop, ...hit]) crashing.add(wreck);
    if (hitsTraffic(cop)) crashing.add(cop);
  }
  for (const cop of world.cops) {
    if (crashing.has(cop) && cop.state.kind !== 'crashed') {
      events.push({ kind: 'wrecked', copId: cop.id });
    }
  }
  world.cops = world.cops.map((cop) => {
    if (crashing.has(cop)) return nextCop(cop, { kind: 'crash' });
    return hasLanded(cop) ? nextCop(cop, { kind: 'miss' }) : cop;
  });
}

function spawnThreat(world: World, level: WantedLevel, rng: Rng, events: SimEvent[]): void {
  if (world.spawnIn > 0) {
    world.spawnIn -= 1;
    return;
  }
  const live = world.cops.filter((cop) => cop.state.kind !== 'crashed').length;
  const threat = rollThreat(level, live, rng);
  if (threat === undefined) return;
  world.spawnIn = level.spawnEverySteps;
  const firstLane = rng.int(0, LANE_COUNT);
  const spawned = THREAT_COPS[threat].map((kind, index): Cop => ({
    id: world.nextCopId + index,
    kind,
    lane: laneAt(firstLane + index),
    gap: TUNING.copSpawnGap,
    state: { kind: 'cruise' },
  }));
  world.cops = [...world.cops, ...spawned];
  world.nextCopId += spawned.length;
  events.push({ kind: 'spawned', threat });
}

/**
 * Traffic is slower than the Roadster, so it closes in from ahead. A grounded Roadster that
 * overlaps a car is busted. A car that passes under a hop or a roll is a near miss and refills
 * some air. Cars in other lanes never count, so only the risky clear pays.
 */
function moveTraffic(world: World, travel: number, events: SimEvent[]): void {
  const closing = travel - TUNING.trafficSpeed * STEP_SECONDS;
  const kept: TrafficCar[] = [];
  for (const car of world.traffic) {
    const moved = { ...car, ahead: car.ahead - closing };
    const crashed = nextRoadster(world.roadster, { kind: 'crash', lane: car.lane });
    if (Math.abs(moved.ahead) < TUNING.carLength && crashed !== world.roadster) {
      world.roadster = crashed;
      events.push({ kind: 'crashed', carId: car.id });
      return;
    }
    const passed = car.ahead > 0 && moved.ahead <= 0;
    if (passed && occupiesLane(world.roadster, car.lane)) {
      world.roadster = nextRoadster(world.roadster, {
        kind: 'refill',
        liters: TUNING.nearMissLiters,
      });
      events.push({ kind: 'nearMiss', carId: car.id });
    }
    if (moved.ahead > -TUNING.trafficDespawnBehind) kept.push(moved);
  }
  world.traffic = kept;
}

/** Spawns a car far ahead in a random lane, never level with another car, so a gap stays open. */
function spawnTraffic(world: World, rng: Rng): void {
  if (world.trafficIn > 0) {
    world.trafficIn -= 1;
    return;
  }
  world.trafficIn = rng.int(TUNING.trafficMinEverySteps, TUNING.trafficMaxEverySteps);
  const ahead = TUNING.trafficSpawnAhead;
  if (world.traffic.some((car) => Math.abs(car.ahead - ahead) < TUNING.trafficSpacing)) return;
  world.traffic = [
    ...world.traffic,
    { id: world.nextCarId, lane: laneAt(rng.int(0, LANE_COUNT)), ahead },
  ];
  world.nextCarId += 1;
}

/** Each style event scores at the current combo, then raises it; five quiet seconds reset it. */
function scoreStyle(world: World, events: readonly SimEvent[]): void {
  const style = events.filter((event): event is StyleEvent => event.kind in STYLE_POINTS);
  for (const event of style) {
    world.stylePoints += STYLE_POINTS[event.kind] * world.combo;
    world.combo = Math.min(world.combo + 1, TUNING.maxCombo);
    world.comboStepsLeft = TUNING.comboSteps;
  }
  if (style.length === 0 && world.comboStepsLeft > 0) {
    world.comboStepsLeft -= 1;
    if (world.comboStepsLeft === 0) world.combo = 1;
  }
}
