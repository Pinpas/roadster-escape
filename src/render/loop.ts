import { advanceClock } from '../sim/fixed-step';
import type { RenderFlags } from './flags';

export interface FrameScheduler {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
  isHidden(): boolean;
}

export interface LoopFrame {
  readonly nowMs: number;
  /** Fixed 60 Hz steps since the loop started. */
  readonly tick: number;
  /** How far the frame sits between the last step and the next, in [0, 1). */
  readonly alpha: number;
}

export interface Loop {
  readonly start: () => void;
  /** Wire to `visibilitychange`: stops while hidden and resumes without a catch-up burst. */
  readonly visibilityChanged: () => void;
}

export function createLoop(options: {
  readonly flags: RenderFlags;
  readonly scheduler: FrameScheduler;
  readonly render: (frame: LoopFrame) => void;
}): Loop {
  const { flags, scheduler, render } = options;
  const renderGapMs = flags.fps === undefined ? 0 : 1000 / flags.fps;
  let accumulator = 0;
  let tick = 0;
  let lastFrameMs: number | undefined;
  let nextRenderMs = 0;
  let frameRequest: number | undefined;
  let stopped = false;

  const frame = (nowMs: number): void => {
    frameRequest = undefined;
    const advance = advanceClock(
      accumulator,
      lastFrameMs === undefined ? 0 : (nowMs - lastFrameMs) / 1000,
    );
    lastFrameMs = nowMs;
    accumulator = advance.accumulator;
    tick += advance.steps;

    // Renders keep a steady cadence; after a stall the cadence restarts instead of bursting.
    if (nowMs >= nextRenderMs) {
      const next = nextRenderMs + renderGapMs;
      nextRenderMs = next <= nowMs ? nowMs + renderGapMs : next;
      render({ nowMs, tick, alpha: advance.alpha });
      stopped = flags.still;
    }
    schedule();
  };

  const schedule = (): void => {
    if (!stopped && !scheduler.isHidden() && frameRequest === undefined) {
      frameRequest = scheduler.request(frame);
    }
  };

  return {
    start: schedule,
    visibilityChanged: () => {
      if (scheduler.isHidden() && frameRequest !== undefined) {
        scheduler.cancel(frameRequest);
        frameRequest = undefined;
      }
      lastFrameMs = undefined;
      schedule();
    },
  };
}
