import type { Action } from '../sim/runner';
import { actionForKey, classifySwipe } from './gestures';

export interface Input {
  /** Returns the actions since the last call, in order. */
  drain(): Action[];
  /** Queues an action from an on-screen button. */
  push(action: Action): void;
}

/** A touch shorter than this that barely moves is a tap, and a tap jumps. */
const TAP_MS = 250;

/** Listens for keys on the window and for swipes and taps on `surface`. */
export function createInput(surface: HTMLElement): Input {
  let queued: Action[] = [];
  let touch: { id: number; x: number; y: number; at: number; fired: boolean } | undefined;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const action = actionForKey(event.code);
    if (!action) return;
    event.preventDefault();
    queued.push(action);
  });
  surface.addEventListener('pointerdown', (event) => {
    touch = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: event.timeStamp,
      fired: false,
    };
  });
  surface.addEventListener('pointermove', (event) => {
    if (touch?.id !== event.pointerId || touch.fired) return;
    const action = classifySwipe(event.clientX - touch.x, event.clientY - touch.y);
    if (!action) return;
    touch.fired = true;
    queued.push(action);
  });
  const lift = (event: PointerEvent): void => {
    if (touch?.id !== event.pointerId) return;
    const tapped =
      !touch.fired && event.type === 'pointerup' && event.timeStamp - touch.at < TAP_MS;
    touch = undefined;
    if (tapped) queued.push('jump');
  };
  surface.addEventListener('pointerup', lift);
  surface.addEventListener('pointercancel', lift);

  return {
    drain() {
      const actions = queued;
      queued = [];
      return actions;
    },
    push(action) {
      queued.push(action);
    },
  };
}
