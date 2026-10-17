import type { WebGLRenderer } from 'three';

/** Frame stats for the ?debug overlay and for preview_evaluate via window.__lookdev. */
export interface FrameStats {
  calls: number;
  triangles: number;
  cpuMs: number;
  frameMs: number;
  gpuMs: number | null;
  width: number;
  height: number;
  pixelRatio: number;
}

/** GPU time through EXT_disjoint_timer_query_webgl2 where the browser exposes it. */
function gpuTimer(gl: WebGL2RenderingContext) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  if (!ext) return { begin() {}, end() {}, last: () => null as number | null };
  const pending: WebGLQuery[] = [];
  let last: number | null = null;
  let active: WebGLQuery | null = null;
  return {
    begin() {
      if (active || pending.length > 3) return;
      active = gl.createQuery();
      if (active) gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (!active) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift()!;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) last = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
      }
    },
    last: () => last,
  };
}

export function createStats(renderer: WebGLRenderer, show: boolean) {
  renderer.info.autoReset = false;
  const el = show ? Object.assign(document.createElement('div'), { id: 'debug' }) : null;
  if (el) document.body.append(el);
  const timer = gpuTimer(renderer.getContext() as WebGL2RenderingContext);
  const stats: FrameStats = { calls: 0, triangles: 0, cpuMs: 0, frameMs: 0, gpuMs: null, width: 0, height: 0, pixelRatio: 1 };
  let prev = performance.now();
  let start = 0;
  let frames = 0;
  return {
    stats,
    begin() {
      renderer.info.reset();
      start = performance.now();
      timer.begin();
    },
    end(lookTitle: string) {
      timer.end();
      const now = performance.now();
      const k = 0.05;
      stats.cpuMs += (now - start - stats.cpuMs) * k;
      stats.frameMs += (now - prev - stats.frameMs) * k;
      prev = now;
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      const g = timer.last();
      if (g !== null) stats.gpuMs = stats.gpuMs === null ? g : stats.gpuMs + (g - stats.gpuMs) * k;
      if (el && ++frames % 10 === 0) {
        el.textContent = [
          lookTitle,
          `draw calls ${stats.calls}`,
          `triangles  ${stats.triangles.toLocaleString('en')}`,
          `frame      ${stats.frameMs.toFixed(1)} ms (${(1000 / stats.frameMs).toFixed(0)} fps)`,
          `cpu        ${stats.cpuMs.toFixed(2)} ms`,
          `gpu        ${stats.gpuMs === null ? 'n/a' : stats.gpuMs.toFixed(2) + ' ms'}`,
          `buffer     ${stats.width}x${stats.height} @${stats.pixelRatio}`,
        ].join('\n');
      }
    },
  };
}
