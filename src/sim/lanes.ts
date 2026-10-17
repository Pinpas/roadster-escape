export type Lane = 0 | 1 | 2;
export type Side = 'left' | 'right';

export const LANE_COUNT = 3;

const isLane = (value: number): value is Lane => value === 0 || value === 1 || value === 2;

export function laneToward(lane: Lane, side: Side): Lane | undefined {
  const next = lane + (side === 'left' ? -1 : 1);
  return isLane(next) ? next : undefined;
}

export const laneAt = (index: number): Lane => (index % LANE_COUNT) as Lane;
