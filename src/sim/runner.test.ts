import { describe, expect, it } from 'vitest';
import {
  createWorld,
  cruiseSpeed,
  isBoosting,
  laneX,
  RUN,
  stepWorld,
  type Thing,
  type World,
} from './runner';

const quiet = (): World => ({ ...createWorld(1), nextRowAt: Infinity });
const thing = (overrides: Partial<Thing>): Thing => ({
  id: 0,
  kind: 'sedan',
  lane: 1,
  ahead: 30,
  y: 0,
  goneAt: undefined,
  passed: false,
  ...overrides,
});
const run = (world: World, steps: number): void => {
  for (let i = 0; i < steps; i++) stepWorld(world, []);
};

describe('runner', () => {
  it('changes lanes and eases sideways', () => {
    const world = quiet();
    stepWorld(world, ['left']);
    expect(world.events).toContainEqual({ kind: 'lane' });
    run(world, 30);
    expect(world.lane).toBe(0);
    expect(world.x).toBeCloseTo(laneX(0), 1);
  });

  it('jumps and lands', () => {
    const world = quiet();
    stepWorld(world, ['jump']);
    expect(world.events).toContainEqual({ kind: 'jump' });
    run(world, 25);
    expect(world.y).toBeGreaterThan(2);
    run(world, 60);
    expect(world.y).toBe(0);
  });

  it('gets faster the further you go, and levels up', () => {
    expect(cruiseSpeed(2000)).toBeGreaterThan(cruiseSpeed(0) + 15);
    const world = quiet();
    world.distance = RUN.levelMeters - 1;
    run(world, 5);
    expect(world.level).toBe(2);
  });

  it('a crash costs cop gap, and a second quick crash busts', () => {
    const world = quiet();
    world.things.push(thing({ id: 0, ahead: 10 }), thing({ id: 1, ahead: 45 }));
    run(world, 30);
    expect(world.copGap).toBeLessThan(RUN.copStartGap - 5);
    expect(world.busted).toBe(false);
    run(world, 300);
    expect(world.busted).toBe(true);
  });

  it('a jump clears a car and pays out', () => {
    const world = quiet();
    world.boostMeter = 0;
    world.things.push(thing({ ahead: 15 }));
    stepWorld(world, ['jump']);
    run(world, 60);
    expect(world.copGap).toBeGreaterThanOrEqual(RUN.copStartGap);
    expect(world.boostMeter).toBeGreaterThanOrEqual(RUN.clearRefill);
  });

  it('cannot jump a semi, but a ramp launches over one', () => {
    const blocked = quiet();
    blocked.things.push(thing({ kind: 'semi', ahead: 18 }));
    stepWorld(blocked, ['jump']);
    run(blocked, 60);
    expect(blocked.copGap).toBeLessThan(RUN.copStartGap - 5);

    const launched = quiet();
    const gap = launched.speed * 0.45 + 4;
    launched.things.push(
      thing({ id: 0, kind: 'ramp', ahead: 20 }),
      thing({ id: 1, kind: 'semi', ahead: 20 + gap }),
    );
    run(launched, 150);
    expect(launched.copGap).toBeGreaterThanOrEqual(RUN.copStartGap);
  });

  it('collects donuts and power-ups', () => {
    const world = quiet();
    world.things.push(
      thing({ id: 0, kind: 'donut', ahead: 10, y: 1 }),
      thing({ id: 1, kind: 'magnet', ahead: 20, y: 1 }),
    );
    run(world, 60);
    expect(world.donuts).toBe(1);
    expect(world.magnetLeft).toBeGreaterThan(0);
  });

  it('boost needs a full meter and smashes through traffic', () => {
    const world = quiet();
    world.boostMeter = 0.5;
    stepWorld(world, ['boost']);
    expect(isBoosting(world)).toBe(false);
    world.boostMeter = 1;
    world.things.push(thing({ kind: 'semi', ahead: 30 }));
    stepWorld(world, ['boost']);
    expect(isBoosting(world)).toBe(true);
    let smashed = false;
    for (let i = 0; i < 60; i++) {
      stepWorld(world, []);
      smashed ||= world.events.some((event) => event.kind === 'smash');
    }
    expect(smashed).toBe(true);
    expect(world.copGap).toBeGreaterThan(RUN.copStartGap);
  });

  it('a run with no input gets busted, and seeded runs replay', () => {
    const a = createWorld(7);
    const b = createWorld(7);
    let steps = 0;
    while (!a.busted && steps < 60 * 180) {
      stepWorld(a, []);
      stepWorld(b, []);
      steps += 1;
    }
    expect(a.busted).toBe(true);
    expect(b.score).toBe(a.score);
  });
});
