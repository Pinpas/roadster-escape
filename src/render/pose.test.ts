import { describe, expect, it } from 'vitest';
import { createRoadster } from '../sim/roadster';
import { TUNING } from '../sim/tuning';
import { LANE_WIDTH, copPose, roadsterPose } from './pose';

const roadster = createRoadster();

describe('roadsterPose', () => {
  it('sits in the middle lane at rest', () => {
    expect(roadsterPose(roadster)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it('slides halfway between lanes halfway through a lane change', () => {
    const pose = roadsterPose({
      ...roadster,
      lane: 0,
      state: { kind: 'changingLane', from: 1, stepsLeft: TUNING.laneChangeSteps / 2 },
    });
    expect(pose.x).toBeCloseTo(-LANE_WIDTH / 2);
  });

  it('peaks at the middle of a hop and lands at the end', () => {
    const mid = roadsterPose({
      ...roadster,
      state: { kind: 'hopping', stepsLeft: TUNING.hopSteps / 2 },
    });
    const end = roadsterPose({ ...roadster, state: { kind: 'hopping', stepsLeft: 0 } });
    expect(mid.y).toBeGreaterThan(2);
    expect(end.y).toBeCloseTo(0);
  });

  it('turns a full circle over a roll, toward the new lane', () => {
    const done = roadsterPose({
      ...roadster,
      lane: 2,
      state: { kind: 'rolling', from: [1], stepsLeft: 0, airStepsLeft: 0 },
    });
    expect(done.x).toBeCloseTo(LANE_WIDTH);
    expect(Math.abs(done.roll)).toBeCloseTo(2 * Math.PI);
  });
});

describe('copPose', () => {
  it('reaches the target lane when the lunge lands', () => {
    const pose = copPose({
      id: 1,
      kind: 'patrol',
      lane: 0,
      gap: 0,
      state: { kind: 'lunge', target: 1, stepsLeft: 0 },
    });
    expect(pose.x).toBeCloseTo(0);
  });
});
