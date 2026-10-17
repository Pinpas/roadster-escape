export const STEP_HZ = 60;
export const STEP_SECONDS = 1 / STEP_HZ;
/** Longer frames (a background tab, a debugger pause) are cut, so the sim never races to catch up. */
export const MAX_FRAME_SECONDS = 0.25;

// Absorbs float rounding, so frames that sum to exactly N steps yield N steps, not N - 1.
const EPSILON = 1e-9;

export interface ClockAdvance {
  /** Unsimulated time carried to the next frame, in [0, STEP_SECONDS). */
  readonly accumulator: number;
  /** Fixed steps to run this frame. */
  readonly steps: number;
  /** How far the render sits between the last step and the next, in [0, 1). */
  readonly alpha: number;
}

export function advanceClock(accumulator: number, frameSeconds: number): ClockAdvance {
  const total = accumulator + Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
  const steps = Math.floor((total + EPSILON) / STEP_SECONDS);
  const rest = Math.max(total - steps * STEP_SECONDS, 0);
  return { accumulator: rest, steps, alpha: rest / STEP_SECONDS };
}
