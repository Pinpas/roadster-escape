import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createPuffs, type GasBurst } from './puffs';

const burst = (time: number, x: number): GasBurst => ({
  time,
  origin: new Vector3(x, 0.5, 2),
  velocity: new Vector3(0, 0.6, -23),
  count: 6,
});

const matrices = (puffs: ReturnType<typeof createPuffs>): number[][] =>
  Array.from({ length: puffs.mesh.count }, (_, i) => {
    const m = new Matrix4();
    puffs.mesh.getMatrixAt(i, m);
    return m.toArray();
  });

describe('gas puffs', () => {
  it('show a burst after it fires and are gone a second later', () => {
    const puffs = createPuffs();
    const bursts = [burst(1, 0)];
    puffs.update(0.5, bursts);
    expect(puffs.mesh.count, 'nothing before the burst').toBe(0);
    puffs.update(1.2, bursts);
    expect(puffs.mesh.count, 'the burst is visible').toBe(6);
    puffs.update(2.5, bursts);
    expect(puffs.mesh.count, 'the puffs have faded').toBe(0);
  });

  it('draw the same puffs for the same burst, whatever else was drawn before', () => {
    const fresh = createPuffs();
    fresh.update(0.3, [burst(0, 1)]);
    const used = createPuffs();
    used.update(0.2, [burst(0.1, -2), burst(0.15, 4)]);
    used.update(5, [burst(4.8, 3)]);
    used.update(0.3, [burst(0, 1)]);
    expect(matrices(used)).toEqual(matrices(fresh));
  });

  it('keep the newest burst when the buffer is full', () => {
    const puffs = createPuffs();
    const old = Array.from({ length: 40 }, (_, i) => ({ ...burst(0, i), count: 6 }));
    const newest = burst(0.1, 100);
    puffs.update(0.2, [...old, newest]);
    const first = new Matrix4();
    puffs.mesh.getMatrixAt(0, first);
    expect(first.elements[12], 'the first instance belongs to the newest burst').toBeGreaterThan(
      90,
    );
  });
});
