import './style.css';
import { parseRenderFlags } from './render/flags';
import { createLoop } from './render/loop';
import { createView } from './render/scene';
import { STEP_SECONDS } from './sim/fixed-step';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html is missing the #game canvas');

const flags = parseRenderFlags(location.search);
const view = createView(canvas, flags.pixelRatio);

const loop = createLoop({
  flags,
  scheduler: {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
    isHidden: () => document.hidden,
  },
  render: ({ tick, alpha }) => {
    view.render((tick + alpha) * STEP_SECONDS);
  },
});
document.addEventListener('visibilitychange', loop.visibilityChanged);
loop.start();
