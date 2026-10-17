import { describe, expect, it } from 'vitest';
import type { Action } from './actions';
import type { Cop, CopState } from './cop';
import { laneToward, type Lane, type Side } from './lanes';
import { createRng } from './rng';
import { occupiesLane } from './roadster';
import { TUNING } from './tuning';
import { THREAT_COPS, WANTED_LEVELS, type Stars } from './wanted';
import { createWorld, speedAt, stepWorld, type SimEvent, type World } from './world';

const SEED = 20261015;
const STARS: readonly Stars[] = [1, 2, 3, 4, 5];

/** A world with cops but no traffic, for tests about the chase alone. */
const withoutTraffic = (world: World): World => ({ ...world, trafficIn: Number.MAX_SAFE_INTEGER });

/** A world where only the cops a test places ever show up. */
const quietWorld = (): World =>
  withoutTraffic({ ...createWorld(SEED), spawnIn: Number.MAX_SAFE_INTEGER });

const copAt = (id: number, lane: Lane, state: CopState, gap = 0): Cop => ({
  id,
  kind: 'patrol',
  lane,
  gap,
  state,
});

const stepUntil = (world: World, done: (world: World) => boolean): number => {
  for (let count = 1; count <= 60 * 60; count++) {
    stepWorld(world, []);
    if (done(world)) return count;
  }
  throw new Error('the world never reached the expected state');
};

const play = (
  world: World,
  count: number,
  choose: (world: World, index: number) => readonly Action[],
): { log: (readonly Action[])[]; events: SimEvent[] } => {
  const log: (readonly Action[])[] = [];
  const events: SimEvent[] = [];
  for (let index = 0; index < count; index++) {
    const actions = choose(world, index);
    log.push(actions);
    events.push(...stepWorld(world, actions));
  }
  return { log, events };
};

const replay =
  (log: readonly (readonly Action[])[]) =>
  (_world: World, index: number): readonly Action[] =>
    log[index] ?? [];

const dodgeBot = (seed: number) => {
  const rng = createRng(seed);
  return ({ roadster, cops }: World): Action[] => {
    const lunge = cops.find(
      (cop) => cop.state.kind === 'lunge' && occupiesLane(roadster, cop.state.target),
    );
    if (lunge?.state.kind === 'lunge') {
      const [away, toward]: [Side, Side] =
        lunge.lane < roadster.lane ? ['right', 'left'] : ['left', 'right'];
      const canSwerve = laneToward(roadster.lane, away) !== undefined;
      if (roadster.state.kind === 'changingLane' || roadster.state.kind === 'rolling') return [];
      if (canSwerve && lunge.state.stepsLeft === TUNING.lungeSteps) {
        return [{ kind: 'lane', side: away }];
      }
      if (lunge.state.stepsLeft === 8) return [{ kind: 'roll', side: canSwerve ? away : toward }];
      return [];
    }
    const dice = rng.next();
    if (dice < 0.003) return [{ kind: 'hop' }];
    if (dice < 0.008) return [{ kind: 'lane', side: rng.next() < 0.5 ? 'left' : 'right' }];
    return [];
  };
};

const kinds = (events: readonly SimEvent[]): SimEvent['kind'][] =>
  events.map((event) => event.kind);

const chase = (): World => {
  const world = withoutTraffic(createWorld(SEED));
  world.heat = WANTED_LEVELS[3].fromHeat;
  return world;
};

describe('world determinism', () => {
  it('replays a recorded action log into an identical world', () => {
    const live = chase();
    const recorded = play(live, 6_000, dodgeBot(2));
    const again = chase();
    const replayed = play(again, 6_000, replay(recorded.log));

    expect(again).toEqual(live);
    expect(replayed.events).toEqual(recorded.events);
  });

  it('resumes from a JSON snapshot exactly where it left off', () => {
    const world = createWorld(SEED);
    play(world, 800, dodgeBot(2));
    const snapshot = JSON.parse(JSON.stringify(world)) as World;
    expect(snapshot).toEqual(world);

    const rest = play(world, 1_600, dodgeBot(3));
    const resumed = play(snapshot, 1_600, replay(rest.log));
    expect(snapshot).toEqual(world);
    expect(resumed.events).toEqual(rest.events);
  });

  it('lets the seed decide where cops spawn', () => {
    const firstSpawnLanes = Array.from({ length: 12 }, (_, seed) => {
      const world = withoutTraffic(createWorld(seed));
      stepUntil(world, (current) => current.cops.length > 0);
      return world.cops[0]?.lane;
    });
    expect(new Set(firstSpawnLanes)).toEqual(new Set([0, 1, 2]));
  });
});

describe('a dodging bot', () => {
  it('meets spawns, perfect dodges, wrecks, and a bust across a few three-star chases', () => {
    const seen = new Set<SimEvent['kind']>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const kind of kinds(play(chase(), 6_000, dodgeBot(seed)).events)) seen.add(kind);
    }
    expect(seen).toEqual(new Set(['spawned', 'perfectDodge', 'wrecked', 'busted']));
  });
});

describe('PIT and barrel roll', () => {
  const atFirstWarning = withoutTraffic(createWorld(SEED));
  stepUntil(atFirstWarning, (world) => world.cops.some((cop) => cop.state.kind === 'warn'));
  const landing = stepUntil(
    structuredClone(atFirstWarning),
    (world) => world.roadster.state.kind === 'busted',
  );

  const rollAt = (step: number | undefined) => {
    const world = structuredClone(atFirstWarning);
    const { events } = play(world, landing, (current, index) => {
      if (index + 1 !== step) return [];
      const cop = current.cops.find((candidate) => candidate.state.kind !== 'cruise');
      return [{ kind: 'roll', side: (cop?.lane ?? 0) < current.roadster.lane ? 'right' : 'left' }];
    });
    return { world, events: kinds(events) };
  };

  it('busts a Roadster that does not roll, on the step the lunge lands', () => {
    const { world, events } = rollAt(undefined);
    expect(events).toEqual(['busted']);
    expect(world.roadster.state.kind).toBe('busted');
  });

  it.each([
    ['the PIT lands', 0, ['perfectDodge']],
    ['11 steps before the PIT lands', 11, ['perfectDodge']],
    ['12 steps (200 ms) before the PIT lands', 12, []],
    ['29 steps before, so the spin still covers the landing', TUNING.rollSteps - 1, []],
  ] as const)('dodges with a roll started as %s', (_label, early, expected) => {
    const { world, events } = rollAt(landing - early);
    expect(events).toEqual(expected);
    expect(world.roadster.state.kind).not.toBe('busted');
    expect(world.cops.some((cop) => cop.state.kind === 'recover')).toBe(true);
  });

  it('busts a Roadster whose spin ended before the PIT landed, because the warning cop followed it', () => {
    const { world, events } = rollAt(landing - TUNING.rollSteps);
    expect(events).toEqual(['busted']);
    expect(world.roadster.lane).not.toBe(1);
  });

  const lunging = (id: number, lane: Lane): Cop =>
    copAt(id, lane, { kind: 'lunge', target: 1, stepsLeft: 1 });

  it.each([
    [0, 'busted'],
    [1, 'driving'],
    [2, 'driving'],
    [3, 'driving'],
    [4, 'busted'],
  ] as const)(
    'dodges a lunge with a lane change only in its first 3 steps (a change %i steps in ends %s)',
    (stepsIn, outcome) => {
      const world = quietWorld();
      world.cops = [copAt(0, 0, { kind: 'warn', side: 'left', stepsLeft: 1 })];
      play(world, TUNING.lungeSteps + 1, (_current, index) =>
        index === stepsIn ? [{ kind: 'lane', side: 'right' }] : [],
      );
      expect(world.roadster.state.kind).toBe(outcome);
    },
  );

  it('wrecks a warning cop that a landing lunge runs into, along with the lunging cop', () => {
    const world = quietWorld();
    world.roadster = { ...world.roadster, lane: 2 };
    world.cops = [lunging(0, 0), copAt(1, 1, { kind: 'warn', side: 'left', stepsLeft: 30 })];
    const heat = world.heat;

    expect(stepWorld(world, [])).toEqual([
      { kind: 'wrecked', copId: 0 },
      { kind: 'wrecked', copId: 1 },
    ]);
    expect(world.cops).toEqual([
      copAt(0, 1, { kind: 'crashed' }),
      copAt(1, 1, { kind: 'crashed' }),
    ]);
    expect(world.heat - heat).toBe(1 + 2 * TUNING.wreckHeat);
  });

  it('drops a wreck once it falls the despawn distance behind', () => {
    const world = quietWorld();
    world.cops = [copAt(0, 1, { kind: 'crashed' })];
    const gaps: number[] = [];
    stepUntil(world, (current) => {
      gaps.push(...current.cops.map((cop) => cop.gap));
      return current.cops.length === 0;
    });
    const lastGap = Math.max(...gaps);
    expect(lastGap).toBeLessThan(TUNING.copDespawnGap);
    expect(lastGap).toBeGreaterThan(TUNING.copDespawnGap - 1);
  });

  it('wrecks both cops of a pair that lunge into a rolling Roadster from both sides', () => {
    const world = withoutTraffic(createWorld(SEED));
    world.cops = [lunging(0, 0), lunging(1, 2)];
    const heat = world.heat;
    const events = stepWorld(world, [{ kind: 'roll', side: 'left' }]);

    expect(events).toEqual(
      expect.arrayContaining([
        { kind: 'perfectDodge', copId: 0 },
        { kind: 'perfectDodge', copId: 1 },
        { kind: 'wrecked', copId: 0 },
        { kind: 'wrecked', copId: 1 },
      ]),
    );
    expect(world.cops.map((cop) => cop.state.kind)).toEqual(['crashed', 'crashed']);
    expect(world.heat - heat).toBe(1 + 2 * TUNING.wreckHeat);
  });

  it('busts a Roadster that sits still between a lunging pair, then stops changing', () => {
    const world = withoutTraffic(createWorld(SEED));
    world.cops = [lunging(0, 0), lunging(1, 2)];
    expect(stepWorld(world, [])).toEqual([{ kind: 'busted', copId: 0 }]);

    const frozen = structuredClone(world);
    expect(stepWorld(world, [{ kind: 'hop' }])).toEqual([]);
    expect(world).toEqual(frozen);
  });
});

describe('cops keep their side of the Roadster', () => {
  const warning = (side: Side, stepsLeft: number): CopState => ({ kind: 'warn', side, stepsLeft });
  const boxedIn = (leftCopFirst: boolean): World => {
    const world = quietWorld();
    const leftCop = copAt(0, 0, warning('left', 90));
    const rightCop = copAt(1, 2, warning('right', 90));
    world.cops = leftCopFirst ? [leftCop, rightCop] : [rightCop, leftCop];
    return world;
  };
  const byId = (world: World): Cop[] => [...world.cops].sort((a, b) => a.id - b.id);
  const toEdgeAndBack = (world: World): { atEdge: Cop[]; back: Cop[] } => {
    play(world, 20, (_current, index) => (index === 0 ? [{ kind: 'lane', side: 'left' }] : []));
    const atEdge = byId(world);
    play(world, 10, (_current, index) => (index === 0 ? [{ kind: 'lane', side: 'right' }] : []));
    return { atEdge, back: byId(world) };
  };

  it('keeps warning, in its own lane, the cop whose side the Roadster steers into', () => {
    const world = boxedIn(true);
    stepWorld(world, [{ kind: 'lane', side: 'left' }]);
    expect(byId(world)).toEqual([
      copAt(0, 0, warning('left', 89)),
      copAt(1, 1, warning('right', 89)),
    ]);
  });

  it('busts a Roadster that only steers toward cops, from alongside, so a roll stays the answer', () => {
    const world = createWorld(SEED);
    const { events } = play(world, 60 * 60 * 5, (current) => {
      const cop = current.cops.find((c) => c.state.kind === 'lineUp' || c.state.kind === 'warn');
      if (!cop || current.roadster.state.kind !== 'driving' || cop.lane === current.roadster.lane) {
        return [];
      }
      return [{ kind: 'lane', side: cop.lane < current.roadster.lane ? 'left' : 'right' }];
    });
    expect(world.roadster.state.kind).toBe('busted');
    const bust = events.find((event) => event.kind === 'busted');
    const buster = world.cops.find((cop) => cop.id === bust?.copId);
    expect(buster?.gap, 'the PIT came from alongside').toBeLessThan(TUNING.copLength);
  });

  it('lets a cop the Roadster steers into finish its warning, then PIT, so it never parks', () => {
    const world = quietWorld();
    world.cops = [copAt(0, 0, warning('left', 90))];
    const kinds: string[] = [];
    play(world, 60 * 20, (current, index) => {
      const [cop] = current.cops;
      if (cop && kinds.at(-1) !== cop.state.kind) kinds.push(cop.state.kind);
      return index === 0 ? [{ kind: 'lane', side: 'left' }] : [];
    });
    expect(kinds.slice(0, 2)).toEqual(['warn', 'lunge']);
    expect(world.roadster.state.kind).toBe('busted');
  });

  it('moves at most one lane per step when a lane change and a roll arrive together', () => {
    const world = quietWorld();
    world.roadster = { ...world.roadster, lane: 2 };
    stepWorld(world, [
      { kind: 'lane', side: 'left' },
      { kind: 'roll', side: 'left' },
    ]);
    expect(world.roadster.lane).toBe(1);
    expect(world.buffer.map((entry) => entry.action.kind)).toEqual(['roll']);
  });

  it('gives the same outcome whatever order the cops are stored in', () => {
    expect(toEdgeAndBack(boxedIn(false))).toEqual(toEdgeAndBack(boxedIn(true)));
  });

  it('lines up a pair on both sides whichever cop is stored first', () => {
    const behind = copAt(0, 1, { kind: 'cruise' }, TUNING.copHoldGap);
    const beside = copAt(1, 0, { kind: 'cruise' }, TUNING.copHoldGap);
    for (const cops of [
      [behind, beside],
      [beside, behind],
    ]) {
      const world = quietWorld();
      world.cops = cops;
      stepWorld(world, []);
      expect(byId(world).map((cop) => [cop.lane, cop.state.kind])).toEqual([
        [2, 'lineUp'],
        [0, 'lineUp'],
      ]);
    }
  });
});

describe('input buffer', () => {
  const hopped = withoutTraffic(createWorld(SEED));
  stepWorld(hopped, [{ kind: 'hop' }]);
  const landing = stepUntil(
    structuredClone(hopped),
    (world) => world.roadster.state.kind === 'driving',
  );

  it.each([
    [9, 'hopping', 2],
    [10, 'driving', 1],
  ] as const)(
    'buffers a hop pressed %i steps before landing, so on landing the Roadster is %s',
    (early, state, hops) => {
      const world = structuredClone(hopped);
      play(world, landing, (_current, index) =>
        index + 1 === landing - early ? [{ kind: 'hop' }] : [],
      );
      expect(world.roadster.state.kind).toBe(state);
      expect(world.roadster.air).toBe(TUNING.tankLiters - hops * TUNING.hopLiters);
    },
  );

  it('drops a lane change or roll into the road edge instead of buffering it', () => {
    const world = quietWorld();
    play(world, TUNING.laneChangeSteps + 1, (_current, index) =>
      index === 0 ? [{ kind: 'lane', side: 'left' }] : [],
    );
    stepWorld(world, [
      { kind: 'lane', side: 'left' },
      { kind: 'roll', side: 'left' },
    ]);
    expect(world.roadster).toMatchObject({ lane: 0, state: { kind: 'driving' } });
    expect(world.buffer).toEqual([]);
  });

  it('fires a lane change pressed mid-hop on landing', () => {
    const world = structuredClone(hopped);
    play(world, landing, (_current, index) =>
      index + 1 === landing - 3 ? [{ kind: 'lane', side: 'right' }] : [],
    );
    expect(world.roadster).toMatchObject({ lane: 2, state: { kind: 'changingLane' } });
  });
});

describe('speed and wanted level', () => {
  it('speeds up slowly, then holds a top speed', () => {
    const minute = 60 * 60;
    expect(speedAt(minute)).toBeGreaterThan(speedAt(0));
    expect(speedAt(minute)).toBeLessThan(speedAt(0) * 1.5);
    expect(speedAt(100 * minute)).toBe(speedAt(200 * minute));

    const world = createWorld(SEED);
    stepWorld(world, []);
    expect(world.distance).toBeCloseTo(speedAt(0) / 60);
  });

  it('raises heat every step', () => {
    const world = createWorld(SEED);
    play(world, 100, () => []);
    expect(world.heat).toBe(100);
  });

  const warningSteps = (stars: Stars): number => {
    const world = withoutTraffic(createWorld(SEED));
    world.heat = WANTED_LEVELS[stars].fromHeat;
    stepUntil(world, (current) => current.cops.some((cop) => cop.state.kind === 'warn'));
    return stepUntil(world, (current) => current.cops.some((cop) => cop.state.kind === 'lunge'));
  };

  it('sends a pair that boxes the Roadster in from both sides', () => {
    const firstSpawnAtTwoStars = (seed: number): World => {
      const world = withoutTraffic(createWorld(seed));
      world.heat = WANTED_LEVELS[2].fromHeat;
      stepUntil(world, (current) => current.cops.length > 0);
      return world;
    };
    const world = Array.from({ length: 20 }, (_, seed) => firstSpawnAtTwoStars(seed)).find(
      (candidate) => candidate.cops.length === 2,
    );
    if (!world) throw new Error('no seed opened with a pair');

    stepUntil(world, (current) => current.cops.every((cop) => cop.state.kind === 'warn'));
    expect(world.roadster.lane).toBe(1);
    expect(world.cops.map((cop) => cop.lane).sort()).toEqual([0, 2]);
  });

  it('shortens the warning as the wanted level rises', () => {
    const durations = STARS.map(warningSteps);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
    expect(new Set(durations).size).toBe(5);
  });

  it('shortens the next warning once heat crosses a star threshold, not the running one', () => {
    const warningAfterLineUp = (stepsToTwoStars: number): number => {
      const world = quietWorld();
      world.heat = WANTED_LEVELS[2].fromHeat - stepsToTwoStars;
      world.cops = [
        copAt(0, 0, { kind: 'lineUp', side: 'left', stepsLeft: 20 }, 20 * TUNING.copClosingPerStep),
      ];
      stepUntil(world, (current) => current.cops[0]?.state.kind === 'warn');
      return stepUntil(world, (current) => current.cops[0]?.state.kind === 'lunge');
    };
    expect(warningAfterLineUp(10)).toBe(WANTED_LEVELS[2].warnSteps);
    expect(warningAfterLineUp(30)).toBe(WANTED_LEVELS[1].warnSteps);
  });

  it('spawns at least as many cops per minute at each star as at the star below', () => {
    const copsPerMinute = (stars: Stars): number => {
      const world = withoutTraffic(createWorld(SEED));
      let spawned = 0;
      for (let step = 0; step < 60 * 60; step++) {
        world.heat = WANTED_LEVELS[stars].fromHeat;
        world.cops = [];
        for (const event of stepWorld(world, [])) {
          if (event.kind === 'spawned') spawned += THREAT_COPS[event.threat].length;
        }
      }
      return spawned;
    };
    const counts = STARS.map(copsPerMinute);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('spawns nothing past maxCops, and spawns on the first step after room frees up', () => {
    const parked = (id: number): Cop =>
      copAt(id, 0, { kind: 'recover', stepsLeft: 1_000_000 }, TUNING.copSpawnGap);
    for (let seed = 0; seed < 20; seed++) {
      const world = withoutTraffic(createWorld(seed));
      world.heat = WANTED_LEVELS[2].fromHeat;
      world.spawnIn = 0;
      world.cops = [parked(100), parked(101)];
      expect(play(world, 600, () => []).events).toEqual([]);

      world.cops = [parked(100)];
      expect(stepWorld(world, [])).toEqual([{ kind: 'spawned', threat: 'patrol' }]);
    }
  });
});
