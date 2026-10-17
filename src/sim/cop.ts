import { laneToward, type Lane, type Side } from './lanes';
import { TUNING } from './tuning';

export type CopKind = 'patrol' | 'interceptor';

export type CopState =
  | { readonly kind: 'cruise' }
  /** Closes in beside the Roadster on `side`. The gap is `stepsLeft` steps of closing. */
  | { readonly kind: 'lineUp'; readonly side: Side; readonly stepsLeft: number }
  | { readonly kind: 'warn'; readonly side: Side; readonly stepsLeft: number }
  | { readonly kind: 'lunge'; readonly target: Lane; readonly stepsLeft: number }
  /** In the target lane, waiting for the world to resolve a `miss` or a `crash` this step. */
  | { readonly kind: 'landed'; readonly target: Lane }
  | { readonly kind: 'recover'; readonly stepsLeft: number }
  | { readonly kind: 'crashed' };

export interface Cop {
  readonly id: number;
  readonly kind: CopKind;
  readonly lane: Lane;
  /** Meters behind the Roadster. 0 is alongside. */
  readonly gap: number;
  readonly state: CopState;
}

export type CopEvent =
  | {
      readonly kind: 'tick';
      /** How far the Roadster drove this step. */
      readonly travel: number;
      readonly warnSteps: number;
      readonly roadsterLane: Lane;
    }
  | { readonly kind: 'lineUp'; readonly side: Side }
  | { readonly kind: 'miss' }
  | { readonly kind: 'crash' };

type TickEvent = Extract<CopEvent, { readonly kind: 'tick' }>;
export type LandedCop = Cop & { readonly state: Extract<CopState, { readonly kind: 'landed' }> };

const CRUISE: CopState = { kind: 'cruise' };

export const hasLanded = (cop: Cop): cop is LandedCop => cop.state.kind === 'landed';

/** Returns the same cop for an event its state does not allow. */
export function nextCop(cop: Cop, event: CopEvent): Cop {
  const { state } = cop;
  switch (event.kind) {
    case 'tick':
      return tick(cop, event);
    case 'lineUp':
      return state.kind === 'cruise' && cop.gap <= TUNING.copHoldGap
        ? {
            ...cop,
            state: {
              kind: 'lineUp',
              side: event.side,
              stepsLeft: Math.round(cop.gap / TUNING.copClosingPerStep),
            },
          }
        : cop;
    case 'miss':
      return hasLanded(cop)
        ? {
            ...cop,
            lane: cop.state.target,
            state: { kind: 'recover', stepsLeft: TUNING.copRecoverSteps },
          }
        : cop;
    case 'crash':
      if (state.kind === 'crashed') return cop;
      return {
        ...cop,
        lane: hasLanded(cop) ? cop.state.target : cop.lane,
        state: { kind: 'crashed' },
      };
  }
}

function tick(cop: Cop, { travel, warnSteps, roadsterLane }: TickEvent): Cop {
  const { state } = cop;
  switch (state.kind) {
    case 'cruise':
      return { ...cop, gap: approach(cop.gap, TUNING.copHoldGap, TUNING.copClosingPerStep) };
    case 'lineUp':
    case 'warn': {
      // When the Roadster steers into the cop's side the road ends there. The cop keeps its own
      // lane and its running cycle, so it still warns before it lunges at the Roadster's lane.
      const lane = laneToward(roadsterLane, state.side) ?? cop.lane;
      if (state.stepsLeft > 1) {
        const stepsLeft = state.stepsLeft - 1;
        const gap = state.kind === 'lineUp' ? stepsLeft * TUNING.copClosingPerStep : 0;
        return { ...cop, lane, gap, state: { ...state, stepsLeft } };
      }
      return {
        ...cop,
        lane,
        gap: 0,
        state:
          state.kind === 'lineUp'
            ? { kind: 'warn', side: state.side, stepsLeft: warnSteps }
            : { kind: 'lunge', target: roadsterLane, stepsLeft: TUNING.lungeSteps },
      };
    }
    case 'lunge':
      return {
        ...cop,
        state:
          state.stepsLeft > 1
            ? { ...state, stepsLeft: state.stepsLeft - 1 }
            : { kind: 'landed', target: state.target },
      };
    case 'landed':
      throw new Error(`cop ${String(cop.id)} landed without a miss or a crash`);
    case 'recover':
      return {
        ...cop,
        gap: cop.gap + TUNING.copFallBackPerStep,
        state: state.stepsLeft > 1 ? { ...state, stepsLeft: state.stepsLeft - 1 } : CRUISE,
      };
    case 'crashed':
      return { ...cop, gap: cop.gap + travel };
  }
}

const approach = (value: number, target: number, maxStep: number): number =>
  value > target ? Math.max(target, value - maxStep) : Math.min(target, value + maxStep);
