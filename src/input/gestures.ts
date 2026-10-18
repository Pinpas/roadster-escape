import type { Action } from '../sim/runner';

/** A finger that moves this far fires its swipe at once, without waiting for the lift. */
export const SWIPE_PX = 24;

/** Maps a swipe to an action: sideways changes lane, up jumps, down boosts. */
export function classifySwipe(dx: number, dy: number): Action | undefined {
  if (Math.hypot(dx, dy) < SWIPE_PX) return undefined;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'jump' : 'boost';
}

const KEYS: Readonly<Record<string, Action>> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'jump',
  ArrowUp: 'jump',
  Space: 'jump',
  KeyS: 'boost',
  ArrowDown: 'boost',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

export const actionForKey = (code: string): Action | undefined => KEYS[code];
