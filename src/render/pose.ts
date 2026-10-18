import { isBoosting, laneX, type World } from '../sim/runner';

export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Lean around the driving axis, and nose pitch, in radians. */
  readonly roll: number;
  readonly pitch: number;
}

export function roadsterPose(world: World): Pose {
  if (world.busted) return { x: world.x, y: 0, roll: 0.25, pitch: 0 };
  const wobble = world.stumbleLeft > 0 ? Math.sin(world.step * 0.9) * 0.15 : 0;
  return {
    x: world.x,
    y: world.y,
    roll: (world.x - laneX(world.lane)) * 0.12 + wobble,
    pitch: world.vy * 0.012 + (isBoosting(world) ? 0.04 : 0),
  };
}
