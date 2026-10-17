import type { Action } from './actions';
import { laneToward, type Lane, type Side } from './lanes';
import { TUNING } from './tuning';

export type RoadsterState =
  | { readonly kind: 'driving' }
  | { readonly kind: 'changingLane'; readonly from: Lane; readonly stepsLeft: number }
  | { readonly kind: 'hopping'; readonly stepsLeft: number }
  | {
      readonly kind: 'rolling';
      /** The lanes the Roadster occupied when the roll began: one, or two mid-lane-change. */
      readonly from: readonly Lane[];
      readonly stepsLeft: number;
      /** Steps until the hop this roll started in would land, or 0 for a roll from the ground. */
      readonly airStepsLeft: number;
    }
  | { readonly kind: 'busted' };

type LiveState = Exclude<RoadsterState, { readonly kind: 'busted' }>;

export interface Roadster {
  /** The lane the Roadster is in, or moving into. */
  readonly lane: Lane;
  readonly air: number;
  readonly state: RoadsterState;
}

export type RoadsterEvent =
  | Action
  | { readonly kind: 'tick' }
  | { readonly kind: 'pit'; readonly lane: Lane }
  | { readonly kind: 'refill'; readonly liters: number };

const DRIVING: RoadsterState = { kind: 'driving' };

export const createRoadster = (): Roadster => ({ lane: 1, air: TUNING.tankLiters, state: DRIVING });

/** Returns the same Roadster for an event its state does not allow, so callers can tell. */
export function nextRoadster(roadster: Roadster, event: RoadsterEvent): Roadster {
  const { state } = roadster;
  if (state.kind === 'busted') return roadster;
  switch (event.kind) {
    case 'lane':
      return state.kind === 'driving' ? changeLane(roadster, event.side) : roadster;
    case 'hop':
      return state.kind === 'driving' && roadster.air >= TUNING.hopLiters
        ? {
            ...roadster,
            air: roadster.air - TUNING.hopLiters,
            state: { kind: 'hopping', stepsLeft: TUNING.hopSteps },
          }
        : roadster;
    case 'roll':
      return state.kind === 'rolling' ? roadster : roll(roadster, state, event.side);
    case 'tick':
      return tick(roadster, state);
    case 'pit':
      return state.kind !== 'rolling' && occupiesLane(roadster, event.lane)
        ? { ...roadster, state: { kind: 'busted' } }
        : roadster;
    case 'refill':
      return { ...roadster, air: Math.min(TUNING.tankLiters, roadster.air + event.liters) };
  }
}

export function occupiesLane(roadster: Roadster, lane: Lane): boolean {
  const { state } = roadster;
  return (
    roadster.lane === lane ||
    (state.kind === 'changingLane' && state.from === lane) ||
    (state.kind === 'rolling' && state.from.includes(lane))
  );
}

/** Whether the action can ever fire from this lane. A move off the edge of the road never can. */
export const staysOnRoad = (roadster: Roadster, action: Action): boolean =>
  action.kind === 'hop' || laneToward(roadster.lane, action.side) !== undefined;

export function isPerfectDodge(roadster: Roadster, lane: Lane): boolean {
  const { state } = roadster;
  return (
    state.kind === 'rolling' &&
    occupiesLane(roadster, lane) &&
    TUNING.rollSteps - state.stepsLeft < TUNING.perfectDodgeSteps
  );
}

function changeLane(roadster: Roadster, side: Side): Roadster {
  const lane = laneToward(roadster.lane, side);
  if (lane === undefined) return roadster;
  return {
    ...roadster,
    lane,
    state: { kind: 'changingLane', from: roadster.lane, stepsLeft: TUNING.laneChangeSteps },
  };
}

function roll(roadster: Roadster, state: LiveState, side: Side): Roadster {
  const lane = laneToward(roadster.lane, side);
  if (lane === undefined || roadster.air < TUNING.rollLiters) return roadster;
  return {
    lane,
    air: roadster.air - TUNING.rollLiters,
    state: {
      kind: 'rolling',
      from: state.kind === 'changingLane' ? [state.from, roadster.lane] : [roadster.lane],
      stepsLeft: TUNING.rollSteps,
      airStepsLeft: state.kind === 'hopping' ? state.stepsLeft : 0,
    },
  };
}

function tick(roadster: Roadster, state: LiveState): Roadster {
  switch (state.kind) {
    case 'driving':
      return roadster;
    case 'changingLane':
    case 'hopping':
      return {
        ...roadster,
        state: state.stepsLeft > 1 ? { ...state, stepsLeft: state.stepsLeft - 1 } : DRIVING,
      };
    case 'rolling':
      if (state.stepsLeft > 1) {
        return {
          ...roadster,
          state: {
            ...state,
            stepsLeft: state.stepsLeft - 1,
            airStepsLeft: Math.max(0, state.airStepsLeft - 1),
          },
        };
      }
      return {
        ...roadster,
        state:
          state.airStepsLeft > 1 ? { kind: 'hopping', stepsLeft: state.airStepsLeft - 1 } : DRIVING,
      };
  }
}
