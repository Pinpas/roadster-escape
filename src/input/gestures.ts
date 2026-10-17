import type { Action } from '../sim/actions';

/** Shorter moves count as taps, so a tap on the screen never fires a move. */
export const MIN_SWIPE_PX = 30;

/**
 * Maps a swipe to one action. Mostly sideways changes lane, mostly up hops, and up at an angle
 * rolls toward that side. Screen y grows downward, so an upward swipe has a negative dy.
 */
export function classifySwipe(dx: number, dy: number): Action | undefined {
  if (Math.hypot(dx, dy) < MIN_SWIPE_PX) return undefined;
  const side = dx < 0 ? 'left' : 'right';
  const up = -dy;
  if (up <= Math.abs(dx) * 0.5)
    return Math.abs(dx) > Math.abs(dy) ? { kind: 'lane', side } : undefined;
  return Math.abs(dx) < up * 0.5 ? { kind: 'hop' } : { kind: 'roll', side };
}

const KEYS: Readonly<Record<string, Action>> = {
  KeyA: { kind: 'lane', side: 'left' },
  ArrowLeft: { kind: 'lane', side: 'left' },
  KeyD: { kind: 'lane', side: 'right' },
  ArrowRight: { kind: 'lane', side: 'right' },
  KeyW: { kind: 'hop' },
  ArrowUp: { kind: 'hop' },
  Space: { kind: 'hop' },
  KeyQ: { kind: 'roll', side: 'left' },
  KeyE: { kind: 'roll', side: 'right' },
};

/** Maps a key press to an action. Shift with a direction rolls instead of changing lane. */
export function actionForKey(code: string, shift: boolean): Action | undefined {
  const action = KEYS[code];
  if (shift && action?.kind === 'lane') return { kind: 'roll', side: action.side };
  return action;
}
