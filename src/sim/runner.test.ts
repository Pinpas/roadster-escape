import { describe, expect, it } from 'vitest';
import {
  createWorld,
  isBoosting,
  laneX,
  RUN,
  stepWorld,
  type Obstacle,
  type World,
} from './runner';

const quiet = (): World => ({ ...createWorld(1), nextRowAt: Infinity });
const car = (overrides: Partial<Obstacle>): Obstacle => ({
  id: 0,
  kind: 'sedan',
  lane: 1,
  ahead: 30,
  smashedAt: undefined,
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
    run(world, 30);
    expect(world.lane).toBe(0);
    expect(world.x).toBeCloseTo(laneX(0), 1);
  });

  it('jumps and lands', () => {
    const world = quiet();
    stepWorld(world, ['jump']);
    run(world, 25);
    expect(world.y).toBeGreaterThan(2);
    run(world, 60);
    expect(world.y).toBe(0);
  });

  it('a hit costs cop gap, and a second quick hit busts', () => {
    const world = quiet();
    world.obstacles.push(car({ id: 0, ahead: 10 }), car({ id: 1, ahead: 45 }));
    run(world, 30);
    expect(world.copGap).toBeLessThan(RUN.copStartGap - 5);
    expect(world.busted).toBe(false);
    run(world, 300);
    expect(world.busted).toBe(true);
  });

  it('a jump clears a car and fills boost', () => {
    const world = quiet();
    world.boostMeter = 0;
    world.obstacles.push(car({ ahead: 18 }));
    stepWorld(world, ['jump']);
    run(world, 60);
    expect(world.copGap).toBeGreaterThanOrEqual(RUN.copStartGap);
    expect(world.bonus).toBe(RUN.clearPoints);
    expect(world.boostMeter).toBeGreaterThanOrEqual(RUN.clearRefill);
  });

  it('cannot jump a semi', () => {
    const world = quiet();
    world.obstacles.push(car({ kind: 'semi', ahead: 18 }));
    stepWorld(world, ['jump']);
    run(world, 60);
    expect(world.copGap).toBeLessThan(RUN.copStartGap - 5);
  });

  it('boost needs a full meter and smashes through traffic', () => {
    const world = quiet();
    world.boostMeter = 0.5;
    stepWorld(world, ['boost']);
    expect(isBoosting(world)).toBe(false);
    world.boostMeter = 1;
    world.obstacles.push(car({ kind: 'semi', ahead: 30 }));
    stepWorld(world, ['boost']);
    expect(isBoosting(world)).toBe(true);
    run(world, 60);
    expect(world.bonus).toBe(RUN.smashPoints);
    expect(world.copGap).toBeGreaterThan(RUN.copStartGap);
  });

  it('a run with no input gets busted', () => {
    const world = createWorld(7);
    let steps = 0;
    while (!world.busted && steps < 60 * 120) {
      stepWorld(world, []);
      steps += 1;
    }
    expect(world.busted).toBe(true);
  });
});
