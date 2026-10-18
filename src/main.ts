import './style.css';
import { createAudio } from './audio/audio';
import { createInput } from './input/input';
import { exposeDebug } from './render/debug';
import { parseRenderFlags } from './render/flags';
import { createLoop } from './render/loop';
import { parseTier } from './render/quality';
import { createView } from './render/scene';
import { STEP_SECONDS } from './sim/fixed-step';
import { createWorld, scoreOf, stepWorld, type World } from './sim/runner';
import { loadBest, saveBest } from './ui/best-score';
import { mountDebugOverlay } from './ui/debug-overlay';
import { createPopups } from './ui/popups';
import { createUi } from './ui/screens';
import { mountVersionLabel } from './ui/version';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html is missing the #game canvas');

const params = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const fixedSeed = Number(params.get('seed'));
const nextSeed = (): number =>
  params.has('seed') && Number.isSafeInteger(fixedSeed)
    ? fixedSeed
    : Math.floor(Math.random() * 0x1_0000_0000);

// Reads go through methods, so a browser that blocks storage throws inside best-score's guard.
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
};

const view = createView(canvas, flags.pixelRatio, parseTier(location.search));
const input = createInput(canvas);
const audio = createAudio(storage);
const ui = createUi(document.body, {
  onBoost: () => {
    input.push('boost');
  },
  onToggleMute: () => audio.toggleMute(),
  muted: audio.muted,
});
const popups = createPopups(document.body);
mountVersionLabel(document.body);
const debugOverlay = params.has('debug') ? mountDebugOverlay(document.body) : undefined;

type Phase = 'title' | 'playing' | 'busted';
let phase: Phase = 'title';
/** On the title the Roadster drives an empty road, so the scene moves behind the menu. */
let world: World = { ...createWorld(nextSeed()), nextRowAt: Infinity };

if (params.has('debug')) exposeDebug(view, canvas, () => world);

const startRun = (): void => {
  phase = 'playing';
  world = createWorld(nextSeed());
  input.drain();
  audio.unlock();
  audio.setPhase('playing');
  ui.playing();
};

const step = (): void => {
  if (phase === 'busted') return;
  const actions = input.drain();
  stepWorld(world, phase === 'playing' ? actions : []);
  if (phase === 'playing' && world.events.length > 0) {
    audio.play(world.events, world);
    popups.show(world.events, world);
    view.onEvents(world.events);
  }
  if (phase === 'playing' && world.busted) {
    phase = 'busted';
    audio.setPhase('busted');
    const score = scoreOf(world);
    ui.busted({ score, best: saveBest(storage, score), world }, startRun);
  }
};

ui.title(startRun, loadBest(storage));

const loop = createLoop({
  flags,
  scheduler: {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
    isHidden: () => document.hidden,
  },
  step,
  render: ({ nowMs, tick, alpha }) => {
    view.render(world, (tick + alpha) * STEP_SECONDS);
    if (phase === 'playing') {
      ui.updateHud(world);
      audio.update(world);
    }
    debugOverlay?.rendered(nowMs, world.step);
  },
});
document.addEventListener('visibilitychange', loop.visibilityChanged);
loop.start();
