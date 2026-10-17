import { PCFShadowMap, WebGLRenderer } from 'three';
import { createStats } from './common/debug';
import type { Look, LookId } from './common/look';
import { createWorld } from './common/world';
import { lookA } from './looks/a';
import { lookB } from './looks/b';
import { lookC } from './looks/c';

const looks: Record<LookId, Look> = { a: lookA, b: lookB, c: lookC };

const params = new URLSearchParams(location.search);
const id = (params.get('look') ?? 'a') as LookId;
const look = looks[id] ?? lookA;
const freeze = params.has('freeze') ? Number(params.get('freeze')) || 12 : null;
// Preview-friendly switches: the box's headless Chrome renders WebGL on the CPU.
const still = params.has('still');
const fps = Number(params.get('fps')) || 0;
const dprParam = Number(params.get('dpr')) || 0;
if (params.has('clean')) document.body.classList.add('clean');

const bar = document.getElementById('bar')!;
for (const l of Object.values(looks)) {
  const q = new URLSearchParams(params);
  q.set('look', l.id);
  const a = Object.assign(document.createElement('a'), { href: `?${q}`, textContent: `${l.id.toUpperCase()} · ${l.title}` });
  if (l.id === look.id) a.setAttribute('aria-current', 'page');
  bar.append(a);
}

const renderer = new WebGLRenderer({ antialias: look.canvasAntialias, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
document.body.prepend(renderer.domElement);

const world = createWorld();
const runtime = look.build(renderer, world);
const stats = createStats(renderer, params.has('debug'));

const resize = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = dprParam || Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  world.resize(w, h);
  runtime.resize(w, h, dpr);
  stats.stats.width = Math.round(w * dpr);
  stats.stats.height = Math.round(h * dpr);
  stats.stats.pixelRatio = dpr;
};
const t0 = performance.now();
const frame = () => {
  const t = freeze ?? (performance.now() - t0) / 1000;
  stats.begin();
  world.update(t);
  runtime.update?.(t);
  runtime.render();
  stats.end(`${look.id.toUpperCase()} · ${look.title}`);
};

let raf = 0;
let last = 0;
const loop = (now: number) => {
  raf = requestAnimationFrame(loop);
  if (fps && now - last < 1000 / fps - 1) return;
  last = now;
  frame();
};
const start = () => {
  if (still) frame();
  else if (!raf && !document.hidden) raf = requestAnimationFrame(loop);
};
const stop = () => {
  cancelAnimationFrame(raf);
  raf = 0;
};
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
window.addEventListener('resize', () => {
  resize();
  if (still) frame();
});
resize();
start();

/**
 * Render n frames back to back. A 1-pixel readPixels forces the GPU process to finish;
 * gl.finish() alone returns early in Chrome. Relative cost only (SwiftShader on this box).
 */
const bench = (n = 10) => {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  frame();
  sync();
  const s0 = performance.now();
  for (let i = 0; i < n; i++) {
    frame();
    sync();
  }
  return { msPerFrame: (performance.now() - s0) / n, calls: stats.stats.calls, triangles: stats.stats.triangles };
};

Object.assign(window, { __lookdev: { renderer, world, stats: stats.stats, look: look.id, frame, bench } });
