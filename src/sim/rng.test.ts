import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const draw = (seed: number, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(20261015, 1000)).toEqual(draw(20261015, 1000));
  });

  it('gives a different sequence for a different seed', () => {
    expect(draw(1, 10)).not.toEqual(draw(2, 10));
  });

  it('matches the reference mulberry32 output, so saved seeds replay across releases', () => {
    expect(draw(0, 2)).toEqual([0.26642920868471265, 0.0003297457005828619]);
    expect(draw(20261015, 3)).toEqual([
      0.40124592115171254, 0.5087482859380543, 0.5477656635921448,
    ]);
  });

  it('keeps floats in [0, 1)', () => {
    for (const value of draw(7, 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps integers in [min, max) and reaches both ends', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(-1, 2);
      expect(Number.isInteger(value)).toBe(true);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([-1, 0, 1]);
  });
});
