import { describe, expect, it } from 'vitest';
import { parseTier, resolveTier } from './quality';

describe('parseTier', () => {
  it.each([
    ['?tier=low', 'low'],
    ['?tier=high', 'high'],
    ['?tier=ultra', undefined],
    ['?still&dpr=1', undefined],
  ])('%s gives %s', (search, tier) => {
    expect(parseTier(search)).toBe(tier);
  });
});

describe('resolveTier', () => {
  const capable = { halfFloatTarget: true, halfFloatSamples: 4 };
  const eightBit = { halfFloatTarget: false, halfFloatSamples: 0 };

  it('defaults to high on a device that can render half-float targets', () => {
    expect(resolveTier(undefined, capable)).toEqual({ tier: 'high', reason: 'default' });
  });
  it('honours a request for low', () => {
    expect(resolveTier('low', capable)).toEqual({ tier: 'low', reason: 'requested' });
  });
  it('falls back to low without half-float targets, even when high is requested', () => {
    expect(resolveTier(undefined, eightBit)).toEqual({
      tier: 'low',
      reason: 'no-half-float-target',
    });
    expect(resolveTier('high', eightBit)).toEqual({ tier: 'low', reason: 'no-half-float-target' });
  });
});
