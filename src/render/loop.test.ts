import { describe, expect, it } from 'vitest';
import { parseRenderFlags } from './flags';
import { createLoop, type FrameScheduler, type LoopFrame } from './loop';

const fakeBrowser = (search = '') => {
  let pending: { handle: number; callback: (nowMs: number) => void } | undefined;
  let nextHandle = 1;
  let hidden = false;
  const renders: LoopFrame[] = [];
  const scheduler: FrameScheduler = {
    request(callback) {
      if (pending) throw new Error('the loop requested a second frame before the first ran');
      pending = { handle: nextHandle++, callback };
      return pending.handle;
    },
    cancel(handle) {
      if (pending?.handle === handle) pending = undefined;
    },
    isHidden: () => hidden,
  };
  const loop = createLoop({
    flags: parseRenderFlags(search),
    scheduler,
    render: (frame) => renders.push(frame),
  });
  return {
    loop,
    renders,
    hasPendingFrame: () => pending !== undefined,
    setHidden(value: boolean) {
      hidden = value;
      loop.visibilityChanged();
    },
    /** Runs the pending animation frame at `nowMs`, as the browser would. */
    frameAt(nowMs: number) {
      const due = pending;
      pending = undefined;
      due?.callback(nowMs);
    },
    runDisplay(hz: number, fromMs: number, seconds: number) {
      for (let i = 0; i < hz * seconds; i++) this.frameAt(fromMs + (i * 1000) / hz);
    },
  };
};

describe('createLoop', () => {
  it('renders every frame and steps the sim at 60 Hz without flags', () => {
    const browser = fakeBrowser();
    browser.loop.start();
    browser.runDisplay(60, 0, 2);
    expect(browser.renders).toHaveLength(120);
    expect(browser.renders.at(-1)?.tick).toBe(119);
  });

  it('caps rendering at ?fps=10 while the sim keeps 60 Hz', () => {
    const browser = fakeBrowser('?fps=10');
    browser.loop.start();
    browser.runDisplay(60, 0, 2);
    expect(browser.renders).toHaveLength(20);
    expect(browser.renders.at(-1)?.tick).toBeGreaterThanOrEqual(110);
  });

  it.each([
    [60, 10, 20],
    [60, 30, 60],
    [144, 60, 120],
    [120, 30, 60],
  ])('caps a %i Hz display at %i fps (%i renders in 2 s)', (displayHz, capFps, expected) => {
    const browser = fakeBrowser(`?fps=${String(capFps)}`);
    browser.loop.start();
    browser.runDisplay(displayHz, 0, 2);
    expect(browser.renders.length).toBeLessThanOrEqual(expected);
    expect(browser.renders.length).toBeGreaterThanOrEqual(expected - 1);
  });

  it('renders every frame when the display is slower than the cap', () => {
    const browser = fakeBrowser('?fps=60');
    browser.loop.start();
    browser.runDisplay(30, 0, 2);
    expect(browser.renders).toHaveLength(60);
  });

  it('restarts the render cadence after a stall instead of rendering a burst', () => {
    const browser = fakeBrowser('?fps=10');
    browser.loop.start();
    browser.runDisplay(60, 0, 1);
    const before = browser.renders.length;
    browser.frameAt(5000);
    browser.frameAt(5000 + 1000 / 60);
    expect(browser.renders.length - before, 'one render after the stall, then the cap').toBe(1);
  });

  it('renders exactly one frame with ?still and then requests no more', () => {
    const browser = fakeBrowser('?still');
    browser.loop.start();
    browser.runDisplay(60, 0, 1);
    expect(browser.renders).toHaveLength(1);
    expect(browser.hasPendingFrame()).toBe(false);
    browser.setHidden(true);
    browser.setHidden(false);
    expect(browser.hasPendingFrame()).toBe(false);
  });

  it('requests no frame while hidden and starts when shown', () => {
    const browser = fakeBrowser();
    browser.setHidden(true);
    browser.loop.start();
    expect(browser.hasPendingFrame()).toBe(false);
    browser.setHidden(false);
    expect(browser.hasPendingFrame()).toBe(true);
  });

  it('cancels the pending frame when hidden and resumes without catching up', () => {
    const browser = fakeBrowser();
    browser.loop.start();
    browser.runDisplay(60, 0, 1);
    const tickBeforeHide = browser.renders.at(-1)?.tick ?? 0;
    browser.setHidden(true);
    expect(browser.hasPendingFrame()).toBe(false);

    browser.setHidden(false);
    browser.frameAt(60_000);
    expect(browser.renders.at(-1)?.tick, 'no steps for the hidden minute').toBe(tickBeforeHide);
    browser.frameAt(60_000 + 1000 / 60);
    expect(browser.renders.at(-1)?.tick).toBe(tickBeforeHide + 1);
  });
});
