import { describe, expect, it } from 'vitest';
import {
  createRoadster,
  isPerfectDodge,
  nextRoadster,
  staysOnRoad,
  type Roadster,
  type RoadsterEvent,
  type RoadsterState,
} from './roadster';
import { TUNING } from './tuning';

const TICK: RoadsterEvent = { kind: 'tick' };
const HOP: RoadsterEvent = { kind: 'hop' };
const LEFT: RoadsterEvent = { kind: 'lane', side: 'left' };
const RIGHT: RoadsterEvent = { kind: 'lane', side: 'right' };
const ROLL_LEFT: RoadsterEvent = { kind: 'roll', side: 'left' };
const ROLL_RIGHT: RoadsterEvent = { kind: 'roll', side: 'right' };

const apply = (roadster: Roadster, ...events: RoadsterEvent[]): Roadster =>
  events.reduce(nextRoadster, roadster);
const ticks = (roadster: Roadster, count: number): Roadster =>
  apply(roadster, ...Array.from({ length: count }, () => TICK));
const kindOf = (roadster: Roadster): RoadsterState['kind'] => roadster.state.kind;

const fresh = createRoadster();
const hopping = apply(fresh, HOP);
const changingLane = apply(fresh, LEFT);
const rolling = apply(fresh, ROLL_LEFT);
const busted = apply(fresh, { kind: 'pit', lane: 1 });

describe('Roadster state machine', () => {
  it('starts in the middle lane with a full 600 L tank', () => {
    expect(fresh).toEqual({ lane: 1, air: 600, state: { kind: 'driving' } });
  });

  it('changes one lane over for free and settles there', () => {
    expect(changingLane).toMatchObject({ lane: 0, air: 600, state: { kind: 'changingLane' } });
    expect(kindOf(ticks(changingLane, TUNING.laneChangeSteps - 1))).toBe('changingLane');
    expect(ticks(changingLane, TUNING.laneChangeSteps)).toEqual({
      lane: 0,
      air: 600,
      state: { kind: 'driving' },
    });
  });

  it('hops for air and lands', () => {
    expect(hopping).toMatchObject({ lane: 1, air: 600 - TUNING.hopLiters });
    expect(kindOf(hopping)).toBe('hopping');
    expect(kindOf(ticks(hopping, TUNING.hopSteps - 1))).toBe('hopping');
    expect(kindOf(ticks(hopping, TUNING.hopSteps))).toBe('driving');
  });

  it('barrel-rolls one lane over for more air than a hop', () => {
    expect(rolling).toMatchObject({ lane: 0, state: { kind: 'rolling' } });
    expect(600 - rolling.air).toBeGreaterThan(600 - hopping.air);
    expect(kindOf(ticks(rolling, TUNING.rollSteps - 1))).toBe('rolling');
    expect(ticks(rolling, TUNING.rollSteps)).toMatchObject({ lane: 0, state: { kind: 'driving' } });
  });

  it('rolls while airborne and still lands when the hop would have', () => {
    const airborne = apply(ticks(hopping, 5), ROLL_RIGHT);
    expect(airborne).toMatchObject({ lane: 2, state: { kind: 'rolling' } });
    const afterRoll = ticks(airborne, TUNING.rollSteps);
    expect(kindOf(afterRoll)).toBe('hopping');
    expect(kindOf(ticks(afterRoll, TUNING.hopSteps - 5 - TUNING.rollSteps - 1))).toBe('hopping');
    expect(kindOf(ticks(afterRoll, TUNING.hopSteps - 5 - TUNING.rollSteps))).toBe('driving');
  });

  it('finishes a roll on the ground when the hop lands mid-spin', () => {
    const lateRoll = apply(ticks(hopping, TUNING.hopSteps - 3), ROLL_RIGHT);
    expect(kindOf(ticks(lateRoll, TUNING.rollSteps - 1))).toBe('rolling');
    expect(kindOf(ticks(lateRoll, TUNING.rollSteps))).toBe('driving');
  });

  it('rolls out of a lane change', () => {
    expect(apply(changingLane, ROLL_RIGHT)).toMatchObject({ lane: 1, state: { kind: 'rolling' } });
  });

  it('counts a late roll out of a lane change as a perfect dodge in the lane it left', () => {
    const leftLane = ticks(changingLane, TUNING.laneChangeSteps);
    const rolledOut = apply(leftLane, RIGHT, ROLL_RIGHT);
    expect(rolledOut).toMatchObject({ lane: 2, state: { kind: 'rolling' } });
    expect(isPerfectDodge(rolledOut, 0)).toBe(true);
    expect(isPerfectDodge(rolledOut, 1)).toBe(true);
    expect(isPerfectDodge(ticks(rolledOut, TUNING.perfectDodgeSteps), 0)).toBe(false);
  });

  it('knows a lane change or roll off the edge of the road can never fire', () => {
    const leftLane = ticks(changingLane, TUNING.laneChangeSteps);
    expect(staysOnRoad(leftLane, { kind: 'lane', side: 'left' })).toBe(false);
    expect(staysOnRoad(leftLane, { kind: 'roll', side: 'left' })).toBe(false);
    expect(staysOnRoad(leftLane, { kind: 'lane', side: 'right' })).toBe(true);
    expect(staysOnRoad(leftLane, { kind: 'hop' })).toBe(true);
    expect(staysOnRoad(hopping, { kind: 'roll', side: 'left' })).toBe(true);
  });

  it.each([
    ['driving in that lane', fresh, 1],
    ['hopping in that lane', hopping, 1],
    ['changing into that lane', changingLane, 0],
    ['changing out of that lane', changingLane, 1],
  ] as const)('is busted by a PIT while %s', (_label, roadster, lane) => {
    expect(kindOf(nextRoadster(roadster, { kind: 'pit', lane }))).toBe('busted');
  });

  it('cannot be hit during the spin', () => {
    expect(nextRoadster(rolling, { kind: 'pit', lane: 1 })).toBe(rolling);
    expect(nextRoadster(rolling, { kind: 'pit', lane: 0 })).toBe(rolling);
  });

  it('refills air up to the tank size', () => {
    expect(nextRoadster(rolling, { kind: 'refill', liters: 30 }).air).toBe(rolling.air + 30);
    expect(nextRoadster(rolling, { kind: 'refill', liters: 10_000 }).air).toBe(600);
  });

  it('refuses a hop or a roll the tank cannot pay for', () => {
    const short = { ...fresh, air: TUNING.hopLiters - 1 };
    expect(nextRoadster(short, HOP)).toBe(short);
    expect(nextRoadster(short, ROLL_LEFT)).toBe(short);

    const enoughToHop = { ...fresh, air: TUNING.rollLiters - 1 };
    expect(nextRoadster(enoughToHop, ROLL_LEFT)).toBe(enoughToHop);
    expect(nextRoadster(enoughToHop, HOP)).toMatchObject({
      air: TUNING.rollLiters - 1 - TUNING.hopLiters,
    });
  });

  it.each([
    ['a lane change mid-hop', hopping, LEFT],
    ['a hop mid-hop', hopping, HOP],
    ['a lane change mid-lane-change', changingLane, LEFT],
    ['a hop mid-lane-change', changingLane, HOP],
    ['a lane change mid-roll', rolling, LEFT],
    ['a hop mid-roll', rolling, HOP],
    ['a roll mid-roll', rolling, ROLL_RIGHT],
    ['a lane change off the road', ticks(changingLane, TUNING.laneChangeSteps), LEFT],
    ['a roll off the road', ticks(rolling, TUNING.rollSteps), ROLL_LEFT],
    ['a PIT in another lane', fresh, { kind: 'pit', lane: 0 }],
    ['a lane change once busted', busted, LEFT],
    ['a hop once busted', busted, HOP],
    ['a roll once busted', busted, ROLL_LEFT],
    ['a tick once busted', busted, TICK],
    ['a refill once busted', busted, { kind: 'refill', liters: 50 }],
  ] satisfies [string, Roadster, RoadsterEvent][])('ignores %s', (_label, roadster, event) => {
    expect(nextRoadster(roadster, event)).toBe(roadster);
  });
});
