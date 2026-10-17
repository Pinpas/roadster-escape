import type { Action } from '../sim/actions';
import { actionForKey, classifySwipe } from './gestures';

export interface Input {
  /** Returns the actions since the last call, in order. */
  drain(): Action[];
}

/** Listens for keys on the window and for swipes on `surface`. */
export function createInput(surface: HTMLElement): Input {
  let queued: Action[] = [];
  let start: { x: number; y: number } | undefined;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const action = actionForKey(event.code, event.shiftKey);
    if (!action) return;
    event.preventDefault();
    queued.push(action);
  });
  surface.addEventListener('pointerdown', (event) => {
    start = { x: event.clientX, y: event.clientY };
  });
  surface.addEventListener('pointerup', (event) => {
    if (!start) return;
    const action = classifySwipe(event.clientX - start.x, event.clientY - start.y);
    start = undefined;
    if (action) queued.push(action);
  });

  return {
    drain() {
      const actions = queued;
      queued = [];
      return actions;
    },
  };
}
