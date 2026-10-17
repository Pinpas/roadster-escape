import type { View } from './scene';

/**
 * `?debug` exposes the view on `window.__roadster` for agents and the T3 preview:
 * the chosen tier, last-frame stats, and a benchmark that renders frames back to back.
 */
export function exposeDebug(view: View, canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext('webgl2');
  const pixel = new Uint8Array(4);
  // gl.finish() returns early in Chrome; reading one pixel waits for the GPU to finish.
  const sync = () => gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const bench = (frames = 5, simSeconds = 0) => {
    view.render(simSeconds);
    sync();
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      view.render(simSeconds);
      sync();
    }
    return { msPerFrame: (performance.now() - start) / frames, ...view.stats(), tier: view.tier };
  };
  Object.assign(window, { __roadster: { tier: view.tier, stats: () => view.stats(), bench } });
}
