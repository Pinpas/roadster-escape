import './style.css';
import { exposeDebug } from './render/debug';
import { createStamp } from './render/fx/stamp';
import { parseRenderFlags } from './render/flags';
import { createLoop } from './render/loop';
import { parseTier } from './render/quality';
import { createView } from './render/scene';
import { STEP_SECONDS } from './sim/fixed-step';
import { mountDebugOverlay } from './ui/debug-overlay';
import { mountVersionLabel } from './ui/version';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html is missing the #game canvas');

const flags = parseRenderFlags(location.search);
const params = new URLSearchParams(location.search);
const view = createView(canvas, flags.pixelRatio, parseTier(location.search));
mountVersionLabel(document.body);
const debugOverlay = params.has('debug') ? mountDebugOverlay(document.body) : undefined;
if (params.has('debug')) exposeDebug(view, canvas);
// Until the busted screen exists, `?busted` shows the stamp over the running scene.
if (params.has('busted')) createStamp().show('BUSTED');

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
