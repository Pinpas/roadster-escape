export interface Rng {
  /** A uniform float in [0, 1). */
  next(): number;
  /** A uniform integer in [min, max). */
  int(min: number, max: number): number;
  /** The 32-bit state. `createRng(rng.state())` resumes this exact sequence. */
  state(): number;
}

/** mulberry32: 32-bit state, fast, and identical on every JS engine. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min)),
    state: () => state,
  };
}
