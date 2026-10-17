import type { Cop } from '../sim/cop';
import type { Lane } from '../sim/lanes';
import type { Roadster } from '../sim/roadster';
import { TUNING } from '../sim/tuning';
import { LANE } from './world/highway';

export const LANE_WIDTH = LANE;
const HOP_HEIGHT = 2.2;

export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Spin around the driving axis, in radians. */
  readonly roll: number;
}

export const laneX = (lane: Lane): number => (lane - 1) * LANE_WIDTH;

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
const progress = (stepsLeft: number, total: number): number => 1 - stepsLeft / total;
const arc = (t: number): number => 4 * HOP_HEIGHT * t * (1 - t);

export function roadsterPose({ lane, state }: Roadster): Pose {
  switch (state.kind) {
    case 'driving':
      return { x: laneX(lane), y: 0, roll: 0 };
    case 'changingLane':
      return {
        x: lerp(laneX(state.from), laneX(lane), progress(state.stepsLeft, TUNING.laneChangeSteps)),
        y: 0,
        roll: 0,
      };
    case 'hopping':
      return { x: laneX(lane), y: arc(progress(state.stepsLeft, TUNING.hopSteps)), roll: 0 };
    case 'rolling': {
      const t = progress(state.stepsLeft, TUNING.rollSteps);
      const from = state.from[state.from.length - 1] ?? lane;
      const y =
        state.airStepsLeft > 0
          ? arc(progress(state.airStepsLeft, TUNING.hopSteps))
          : Math.sin(Math.PI * t) * 0.6;
      return {
        x: lerp(laneX(from), laneX(lane), t),
        y,
        roll: Math.sign(from - lane) * 2 * Math.PI * t,
      };
    }
    case 'busted':
      return { x: laneX(lane), y: 0, roll: 0.25 };
  }
}

export function copPose({ lane, state }: Cop): Pose {
  switch (state.kind) {
    case 'lunge':
      return {
        x: lerp(laneX(lane), laneX(state.target), progress(state.stepsLeft, TUNING.lungeSteps)),
        y: 0,
        roll: 0,
      };
    case 'landed':
      return { x: laneX(state.target), y: 0, roll: 0 };
    case 'crashed':
      return { x: laneX(lane), y: 0.3, roll: Math.PI / 2 };
    default:
      return { x: laneX(lane), y: 0, roll: 0 };
  }
}
