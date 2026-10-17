import './style.css';
import { createView } from './render/scene';
import { STEP_SECONDS, advanceClock } from './sim/fixed-step';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html is missing the #game canvas');

const view = createView(canvas);
let accumulator = 0;
let tick = 0;
let lastFrameMs: number | undefined;

const frame = (nowMs: number): void => {
  const advance = advanceClock(
    accumulator,
    lastFrameMs === undefined ? 0 : (nowMs - lastFrameMs) / 1000,
  );
  lastFrameMs = nowMs;
  accumulator = advance.accumulator;
  tick += advance.steps;
  view.render((tick + advance.alpha) * STEP_SECONDS);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
