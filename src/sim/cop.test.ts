import { describe, expect, it } from 'vitest';
import { nextCop, type Cop, type CopEvent, type CopState } from './cop';
import type { Lane } from './lanes';
import { TUNING } from './tuning';

const WARN_STEPS = 30;
const tickBeside = (roadsterLane: Lane): CopEvent => ({
  kind: 'tick',
  travel: 0.5,
  warnSteps: WARN_STEPS,
  roadsterLane,
});
const TICK = tickBeside(1);
const MISS: CopEvent = { kind: 'miss' };
const CRASH: CopEvent = { kind: 'crash' };
const LINE_UP: CopEvent = { kind: 'lineUp', side: 'left' };

const cop = (state: CopState, gap = 0, lane: Lane = 0): Cop => ({
  id: 7,
  kind: 'patrol',
  lane,
  gap,
  state,
});
const ticks = (from: Cop, count: number, event = TICK): Cop =>
  Array.from({ length: count }).reduce<Cop>((current) => nextCop(current, event), from);

const cruising = cop({ kind: 'cruise' }, TUNING.copHoldGap);
const liningUp = cop(
  { kind: 'lineUp', side: 'left', stepsLeft: 15 },
  15 * TUNING.copClosingPerStep,
);
const warning = cop({ kind: 'warn', side: 'left', stepsLeft: 10 });
const lunging = cop({ kind: 'lunge', target: 1, stepsLeft: 5 });
const landed = cop({ kind: 'landed', target: 1 });
const recovering = cop({ kind: 'recover', stepsLeft: 10 }, 0, 1);
const crashed = cop({ kind: 'crashed' }, 0, 1);

describe('Cop state machine', () => {
  it('cruises in to the hold distance and no closer', () => {
    const far = cop({ kind: 'cruise' }, 60, 2);
    const closing = ticks(far, 1);
    expect(closing.gap).toBeLessThan(60);
    expect(ticks(far, 10_000)).toEqual({ ...far, gap: TUNING.copHoldGap });
  });

  it('lines up on the side it is given once it is close', () => {
    const behind = cop({ kind: 'cruise' }, TUNING.copHoldGap, 1);
    const linedUp = nextCop(nextCop(behind, { kind: 'lineUp', side: 'right' }), TICK);
    expect(linedUp.lane).toBe(2);
    expect(linedUp.state).toMatchObject({ kind: 'lineUp', side: 'right' });
  });

  it('pulls alongside from the hold distance in 100 steps (20 m at 12 m/s), then warns', () => {
    let alongside = nextCop(cruising, LINE_UP);
    let steps = 0;
    while (alongside.state.kind === 'lineUp') {
      expect(alongside.gap).toBeGreaterThan(0);
      alongside = nextCop(alongside, TICK);
      steps += 1;
    }
    expect(steps).toBe(100);
    expect(alongside.gap).toBe(0);
    expect(alongside.state).toEqual({ kind: 'warn', side: 'left', stepsLeft: WARN_STEPS });
  });

  it('keeps its side as the Roadster moves, without restarting its timer', () => {
    expect(nextCop(warning, tickBeside(2))).toEqual({
      ...warning,
      lane: 1,
      state: { kind: 'warn', side: 'left', stepsLeft: 9 },
    });
    const followed = nextCop(liningUp, tickBeside(2));
    expect(followed.lane).toBe(1);
    expect(followed.state).toEqual({ kind: 'lineUp', side: 'left', stepsLeft: 14 });
  });

  it('keeps its own lane and still warns before the PIT when the Roadster steers into its side', () => {
    const kinds: string[] = [];
    let current = liningUp;
    while (current.state.kind !== 'lunge') {
      current = nextCop(current, tickBeside(0));
      kinds.push(current.state.kind);
      expect(current.lane).toBe(liningUp.lane);
    }
    expect(kinds).toContain('warn');
    expect(current.state).toEqual({ kind: 'lunge', target: 0, stepsLeft: TUNING.lungeSteps });
  });

  it('lunges at the lane the Roadster is in when the warning runs out', () => {
    expect(ticks(warning, 9).state).toEqual({ kind: 'warn', side: 'left', stepsLeft: 1 });
    expect(ticks(warning, 10).state).toEqual({
      kind: 'lunge',
      target: 1,
      stepsLeft: TUNING.lungeSteps,
    });
    expect(ticks(lunging, 4).state.kind).toBe('lunge');
    expect(ticks(lunging, 5)).toEqual(landed);
  });

  it('refuses to tick a landed lunge the world never resolved', () => {
    expect(() => nextCop(landed, TICK)).toThrow();
  });

  it('swerves into the target lane and recovers after a miss', () => {
    const missed = nextCop(landed, MISS);
    expect(missed).toEqual({
      ...landed,
      lane: 1,
      state: { kind: 'recover', stepsLeft: TUNING.copRecoverSteps },
    });
    expect(ticks(missed, TUNING.copRecoverSteps - 1).state.kind).toBe('recover');
    const recovered = ticks(missed, TUNING.copRecoverSteps);
    expect(recovered.state).toEqual({ kind: 'cruise' });
    expect(recovered.gap).toBeGreaterThan(0);
  });

  it('crashes in the target lane when its lunge runs into something, and the wreck falls behind', () => {
    const wreck = nextCop(landed, CRASH);
    expect(wreck).toEqual({ ...landed, lane: 1, state: { kind: 'crashed' } });
    expect(ticks(wreck, 4).gap).toBe(2);
  });

  it('crashes where it is when a lunge runs into it', () => {
    expect(nextCop(warning, CRASH)).toEqual({ ...warning, state: { kind: 'crashed' } });
    expect(nextCop(lunging, CRASH)).toEqual({ ...lunging, state: { kind: 'crashed' } });
  });

  it.each([
    ['a side while far behind', cop({ kind: 'cruise' }, 40), LINE_UP],
    ['a side while lining up', liningUp, LINE_UP],
    ['a side while warning', warning, LINE_UP],
    ['a side mid-lunge', lunging, LINE_UP],
    ['a side while recovering', recovering, LINE_UP],
    ['a miss before the lunge lands', lunging, MISS],
    ['a miss while cruising', cruising, MISS],
    ['a miss while recovering', recovering, MISS],
    ['a side once crashed', crashed, LINE_UP],
    ['a miss once crashed', crashed, MISS],
    ['a crash once crashed', crashed, CRASH],
  ] satisfies [string, Cop, CopEvent][])('ignores %s', (_label, from, event) => {
    expect(nextCop(from, event)).toBe(from);
  });
});
