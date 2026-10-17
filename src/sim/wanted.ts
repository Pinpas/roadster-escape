import type { CopKind } from './cop';
import type { Rng } from './rng';
import { steps } from './tuning';

export type Stars = 1 | 2 | 3 | 4 | 5;

export type Threat = 'patrol' | 'pair' | 'spikeStrip' | 'roadblock' | 'helicopter' | 'interceptor';

export interface WantedLevel {
  /** Heat at which this level starts. Heat grows by 1 every step and by `wreckHeat` per wreck. */
  readonly fromHeat: number;
  readonly warnSteps: number;
  readonly spawnEverySteps: number;
  readonly maxCops: number;
  readonly threats: readonly (readonly [threat: Threat, weight: number])[];
}

export const WANTED_LEVELS: Readonly<Record<Stars, WantedLevel>> = {
  1: {
    fromHeat: 0,
    warnSteps: steps(1200),
    spawnEverySteps: steps(4000),
    maxCops: 1,
    threats: [['patrol', 1]],
  },
  2: {
    fromHeat: steps(30_000),
    warnSteps: steps(1000),
    spawnEverySteps: steps(3500),
    maxCops: 2,
    threats: [
      ['patrol', 3],
      ['pair', 1],
    ],
  },
  3: {
    fromHeat: steps(75_000),
    warnSteps: steps(800),
    spawnEverySteps: steps(3000),
    maxCops: 3,
    threats: [
      ['patrol', 3],
      ['pair', 2],
      ['spikeStrip', 2],
    ],
  },
  4: {
    fromHeat: steps(130_000),
    warnSteps: steps(650),
    spawnEverySteps: steps(2500),
    maxCops: 3,
    threats: [
      ['patrol', 2],
      ['pair', 2],
      ['spikeStrip', 2],
      ['roadblock', 1],
      ['helicopter', 1],
    ],
  },
  5: {
    fromHeat: steps(200_000),
    warnSteps: steps(500),
    spawnEverySteps: steps(2000),
    maxCops: 4,
    threats: [
      ['patrol', 2],
      ['pair', 2],
      ['spikeStrip', 2],
      ['roadblock', 1],
      ['helicopter', 1],
      ['interceptor', 1],
    ],
  },
};

export const THREAT_COPS: Readonly<Record<Threat, readonly CopKind[]>> = {
  patrol: ['patrol'],
  pair: ['patrol', 'patrol'],
  spikeStrip: [],
  roadblock: [],
  helicopter: [],
  interceptor: ['interceptor'],
};

const STARS: readonly Stars[] = [1, 2, 3, 4, 5];

export function starsFor(heat: number): Stars {
  let stars: Stars = 1;
  for (const level of STARS) if (heat >= WANTED_LEVELS[level].fromHeat) stars = level;
  return stars;
}

/** Rolls among the threats that can spawn now: ones with cops that fit under `maxCops`. */
export function rollThreat(level: WantedLevel, liveCops: number, rng: Rng): Threat | undefined {
  const ready = level.threats.filter(([threat]) => {
    const cops = THREAT_COPS[threat].length;
    return cops > 0 && liveCops + cops <= level.maxCops;
  });
  const total = ready.reduce((sum, [, weight]) => sum + weight, 0);
  if (total === 0) return undefined;
  let pick = rng.int(0, total);
  for (const [threat, weight] of ready) {
    if (pick < weight) return threat;
    pick -= weight;
  }
  return undefined;
}
