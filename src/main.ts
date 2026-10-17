import './style.css';
import { parseRenderFlags } from './render/flags';
import { createLoop } from './render/loop';
import { createView } from './render/scene';
import { STEP_SECONDS } from './sim/fixed-step';
import { mountDebugOverlay } from './ui/debug-overlay';
import { mountVersionLabel } from './ui/version';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html is missing the #game canvas');

const flags = parseRenderFlags(location.search);
const view = createView(canvas, flags.pixelRatio);
mountVersionLabel(document.body);
const debugOverlay = new URLSearchParams(location.search).has('debug')
  ? mountDebugOverlay(document.body)
  : undefined;

const loop = createLoop({
  flags,
  scheduler: {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
    isHidden: () => document.hidden,
  },
  render: ({ nowMs, tick, alpha }) => {
    view.render((tick + alpha) * STEP_SECONDS);
    debugOverlay?.rendered(nowMs, tick);
  },
});
document.addEventListener('visibilitychange', loop.visibilityChanged);
loop.start();
