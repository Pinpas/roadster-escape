import { describe, expect, it } from 'vitest';
import { MAX_FRAME_SECONDS, STEP_SECONDS, advanceClock } from './fixed-step';
import { createRng } from './rng';

const runFrames = (frames: readonly number[]): { steps: number; accumulator: number } => {
  let accumulator = 0;
  let steps = 0;
  for (const frame of frames) {
    const result = advanceClock(accumulator, frame);
    accumulator = result.accumulator;
    steps += result.steps;
  }
  return { steps, accumulator };
};

const steadyFrames = (hz: number, seconds: number): number[] =>
  Array.from({ length: Math.round(hz * seconds) }, () => 1 / hz);

const jitteredFrames = (seconds: number, seed: number): number[] => {
  const rng = createRng(seed);
  const frames: number[] = [];
  let left = seconds;
  while (left > 1e-12) {
    const frame = Math.min(0.004 + rng.next() * 0.04, left);
    frames.push(frame);
    left -= frame;
  }
  return frames;
};

describe('advanceClock', () => {
  it.each([
    ['30 Hz', steadyFrames(30, 10)],
    ['60 Hz', steadyFrames(60, 10)],
    ['144 Hz', steadyFrames(144, 10)],
    ['jittered frames', jitteredFrames(10, 1)],
    ['other jittered frames', jitteredFrames(10, 2)],
  ])('runs 600 steps for 10 s of %s', (_label, frames) => {
    expect(runFrames(frames).steps).toBe(600);
  });

  it('carries leftover time to the next frame', () => {
    const first = advanceClock(0, STEP_SECONDS * 1.5);
    expect(first.steps).toBe(1);
    expect(first.alpha).toBeCloseTo(0.5);

    const second = advanceClock(first.accumulator, STEP_SECONDS * 0.5);
    expect(second.steps).toBe(1);
    expect(second.alpha).toBeCloseTo(0);
  });

  it('runs no step for a frame shorter than one step', () => {
    const result = advanceClock(0, STEP_SECONDS / 4);
    expect(result.steps).toBe(0);
    expect(result.alpha).toBeCloseTo(0.25);
  });

  it('caps a long frame, so a hitch cannot trigger a catch-up spiral', () => {
    const result = advanceClock(0, 10);
    expect(result.steps).toBe(Math.floor(MAX_FRAME_SECONDS / STEP_SECONDS));
  });

  it('ignores a negative frame time', () => {
    expect(advanceClock(0, -1)).toEqual({ accumulator: 0, steps: 0, alpha: 0 });
  });

  it('keeps the accumulator and alpha in range over a long run', () => {
    let accumulator = 0;
    for (const frame of jitteredFrames(60, 3)) {
      const result = advanceClock(accumulator, frame);
      accumulator = result.accumulator;
      expect(result.accumulator).toBeGreaterThanOrEqual(0);
      expect(result.accumulator).toBeLessThan(STEP_SECONDS);
      expect(result.alpha).toBeGreaterThanOrEqual(0);
      expect(result.alpha).toBeLessThan(1);
    }
  });
});
