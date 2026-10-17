import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  rollThreat,
  starsFor,
  THREAT_COPS,
  WANTED_LEVELS,
  type Stars,
  type Threat,
} from './wanted';

const rolledThreats = (stars: Stars, liveCops = 0): Set<Threat | undefined> => {
  const rng = createRng(stars);
  return new Set(
    Array.from({ length: 5_000 }, () => rollThreat(WANTED_LEVELS[stars], liveCops, rng)),
  );
};

const designThreats: [Stars, Threat[]][] = [
  [1, ['patrol']],
  [2, ['patrol', 'pair']],
  [3, ['patrol', 'pair', 'spikeStrip']],
  [4, ['patrol', 'pair', 'spikeStrip', 'roadblock', 'helicopter']],
  [5, ['patrol', 'pair', 'spikeStrip', 'roadblock', 'helicopter', 'interceptor']],
];

describe('wanted level', () => {
  it.each(designThreats)(
    'lists exactly the threats the design adds by %i stars',
    (stars, threats) => {
      expect(new Set(WANTED_LEVELS[stars].threats.map(([threat]) => threat))).toEqual(
        new Set(threats),
      );
    },
  );

  it.each([
    [1, ['patrol']],
    [2, ['patrol', 'pair']],
    [3, ['patrol', 'pair']],
    [4, ['patrol', 'pair']],
    [5, ['patrol', 'pair', 'interceptor']],
  ] satisfies [Stars, Threat[]][])(
    'rolls only threats that put cops on the road at %i stars',
    (stars, threats) => {
      expect(rolledThreats(stars)).toEqual(new Set(threats));
    },
  );

  it.each([
    [1, ['patrol']],
    [2, ['patrol']],
    [3, ['patrol']],
    [4, ['patrol']],
    [5, ['patrol', 'interceptor']],
  ] satisfies [Stars, string[]][])('spawns only allowed cop kinds at %i stars', (stars, kinds) => {
    const spawned = new Set(
      [...rolledThreats(stars)].flatMap((threat) => (threat ? THREAT_COPS[threat] : [])),
    );
    expect(spawned).toEqual(new Set(kinds));
  });

  it('rolls nothing that would put more live cops on the road than the level allows', () => {
    const { maxCops } = WANTED_LEVELS[2];
    expect(rolledThreats(2, maxCops - 1)).toEqual(new Set(['patrol']));

    const rng = createRng(1);
    const before = rng.state();
    expect(rollThreat(WANTED_LEVELS[2], maxCops, rng)).toBeUndefined();
    expect(rng.state()).toBe(before);
  });

  it('starts at one star, climbs with heat to five, and never drops', () => {
    expect(starsFor(0)).toBe(1);
    let previous = starsFor(0);
    for (let heat = 0; heat <= 60 * 60 * 10; heat += 60) {
      const stars = starsFor(heat);
      expect(stars).toBeGreaterThanOrEqual(previous);
      previous = stars;
    }
    expect(previous).toBe(5);
  });
});
