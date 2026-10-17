import { describe, expect, it } from 'vitest';
import type { Action } from './actions';
import type { Lane } from './lanes';
import { STYLE_POINTS, TUNING } from './tuning';
import { createWorld, scoreOf, stepWorld, type SimEvent, type World } from './world';

/** A world with only the traffic a test places: no cops, no new cars. */
const road = (cars: readonly { lane: Lane; ahead: number }[]): World => ({
  ...createWorld(7),
  spawnIn: Number.MAX_SAFE_INTEGER,
  trafficIn: Number.MAX_SAFE_INTEGER,
  traffic: cars.map((car, id) => ({ id, ...car })),
});

const run = (
  world: World,
  steps: number,
  actions: (step: number) => readonly Action[] = () => [],
) => {
  const events: SimEvent[] = [];
  for (let step = 0; step < steps; step++) events.push(...stepWorld(world, actions(step)));
  return events;
};

describe('traffic', () => {
  it('busts a Roadster that drives into a car in its lane', () => {
    const world = road([{ lane: 1, ahead: 20 }]);
    const events = run(world, 300);
    expect(events).toContainEqual({ kind: 'crashed', carId: 0 });
    expect(world.roadster.state.kind).toBe('busted');
  });

  it('lets a hop clear a car, and counts it as a near miss', () => {
    const world = road([{ lane: 1, ahead: 6 }]);
    const events = run(world, 200, (step) => (step === 0 ? [{ kind: 'hop' }] : []));
    expect(world.roadster.state.kind).not.toBe('busted');
    expect(events).toContainEqual({ kind: 'nearMiss', carId: 0 });
  });

  it('refills more air for a car cleared with a hop than the hop costs', () => {
    const world = road([{ lane: 1, ahead: 6 }]);
    world.roadster = { ...world.roadster, air: 100 };
    run(world, 200, (step) => (step === 0 ? [{ kind: 'hop' }] : []));
    expect(world.roadster.air).toBe(100 - TUNING.hopLiters + TUNING.nearMissLiters);
    expect(world.roadster.air).toBeGreaterThan(100);
  });

  it('ignores cars in the next lane, whether the Roadster cruises or swerves past them', () => {
    const cruising = road([
      { lane: 0, ahead: 10 },
      { lane: 2, ahead: 50 },
    ]);
    expect(run(cruising, 400)).toEqual([]);
    const swerving = road([{ lane: 0, ahead: 2 }]);
    swerving.roadster = {
      ...swerving.roadster,
      state: { kind: 'changingLane', from: 2, stepsLeft: 15 },
    };
    expect(run(swerving, 200)).toEqual([]);
  });

  it('ignores a car two lanes away', () => {
    const world = road([{ lane: 0, ahead: 10 }]);
    world.roadster = { ...world.roadster, lane: 2 };
    expect(run(world, 200)).toEqual([]);
  });

  it('wrecks a cop whose lunge lands on a car, which scores and raises the combo', () => {
    const world = road([{ lane: 0, ahead: 0.5 }]);
    world.cops = [
      { id: 9, kind: 'patrol', lane: 1, gap: 0, state: { kind: 'lunge', target: 0, stepsLeft: 1 } },
    ];
    world.roadster = { ...world.roadster, lane: 2 };
    world.combo = 2;
    expect(stepWorld(world, [])).toContainEqual({ kind: 'wrecked', copId: 9 });
    expect(world.stylePoints).toBe(STYLE_POINTS.wrecked * 2);
    expect(world.combo).toBe(3);
  });

  it('keeps spawned cars apart, so a lane always stays open', () => {
    const world = { ...createWorld(3), spawnIn: Number.MAX_SAFE_INTEGER };
    for (let step = 0; step < 60 * 120 && world.roadster.state.kind !== 'busted'; step++) {
      world.roadster = { ...world.roadster, state: { kind: 'hopping', stepsLeft: 2 } };
      stepWorld(world, []);
      const aheads = world.traffic.map((car) => car.ahead).sort((a, b) => a - b);
      for (let index = 1; index < aheads.length; index++) {
        expect((aheads[index] ?? 0) - (aheads[index - 1] ?? 0)).toBeGreaterThan(
          TUNING.trafficSpacing - 1,
        );
      }
    }
    expect(world.nextCarId).toBeGreaterThan(20);
  });

  it('replays traffic exactly for the same seed', () => {
    const a = createWorld(11);
    const b = createWorld(11);
    run(a, 3000);
    run(b, 3000);
    expect(b).toEqual(a);
    expect(a.nextCarId).toBeGreaterThan(0);
  });
});

describe('score and combo', () => {
  it('scores meters driven plus style points', () => {
    const world = road([]);
    run(world, 600);
    expect(scoreOf(world)).toBe(Math.floor(world.distance));
  });

  it('multiplies each style event by the combo, then resets the combo after five quiet seconds', () => {
    const world = road([
      { lane: 1, ahead: 1 },
      { lane: 1, ahead: 3 },
    ]);
    world.roadster = {
      ...world.roadster,
      state: { kind: 'rolling', from: [1], stepsLeft: TUNING.rollSteps, airStepsLeft: 0 },
    };
    run(world, 200);
    expect(world.stylePoints).toBe(STYLE_POINTS.nearMiss * 1 + STYLE_POINTS.nearMiss * 2);
    expect(world.combo).toBe(3);
    run(world, TUNING.comboSteps);
    expect(world.combo).toBe(1);
  });
});
