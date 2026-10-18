import { RUN, type SimEvent, type World } from '../sim/runner';
import { clearText, crashText, crashWarning, levelLine, smashText, streakCall } from './copy';
import { element } from './dom';

export interface Popups {
  show(events: readonly SimEvent[], world: World): void;
}

type Tone = 'good' | 'smash' | 'bad' | 'power' | 'air';

interface Slot {
  readonly root: HTMLDivElement;
  readonly main: HTMLSpanElement;
  readonly sub: HTMLSpanElement;
  key: string;
  /** When it last popped, in ms; 0 means it never has. */
  at: number;
  animation: Animation | undefined;
}

/** Where each popup slot sits, in px from a spot just above the Roadster, so a burst fans out. */
const SPOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-30, -58],
  [30, -116],
  [-20, 58],
  [20, -174],
];
const POP_MS = 1000;
/** The same kind of popup this soon after the last one updates it instead of stacking a new one. */
const MERGE_MS = 600;
/** Donuts further apart than this many sim steps start a new streak. */
const STREAK_STEPS = 90;
const STREAK_MS = 1600;
const BANNER_MS = 2400;

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** With reduced motion the popups only fade. */
const fade = (frames: Keyframe[]): Keyframe[] =>
  calm ? frames.map((frame) => ({ ...frame, transform: 'none' })) : frames;

const POP = fade([
  { opacity: 0, transform: 'translateY(12px) scale(0.4)' },
  { opacity: 1, transform: 'translateY(0) scale(1.2)', offset: 0.12 },
  { opacity: 1, transform: 'translateY(-6px) scale(1)', offset: 0.24 },
  { opacity: 1, transform: 'translateY(-34px) scale(1)', offset: 0.75 },
  { opacity: 0, transform: 'translateY(-64px) scale(0.92)' },
]);
const STREAK = fade([
  { opacity: 1, transform: 'scale(1.3)' },
  { opacity: 1, transform: 'scale(1)', offset: 0.12 },
  { opacity: 1, transform: 'scale(1)', offset: 0.75 },
  { opacity: 0, transform: 'scale(0.9)' },
]);
const BANNER = fade([
  { opacity: 0, transform: 'scale(2.4) rotate(-6deg)' },
  { opacity: 1, transform: 'scale(0.94) rotate(-3deg)', offset: 0.1 },
  { opacity: 1, transform: 'scale(1) rotate(-3deg)', offset: 0.16 },
  { opacity: 1, transform: 'scale(1.04) rotate(-3deg)', offset: 0.82 },
  { opacity: 0, transform: 'scale(0.8) rotate(-3deg) translateY(-40px)' },
]);

const play = (node: HTMLElement, frames: Keyframe[], duration: number): Animation =>
  node.animate(frames, { duration, easing: 'ease-out' });

/** Floating shouts for what just happened. A fixed pool of nodes keeps the DOM small. */
export function createPopups(root: HTMLElement): Popups {
  const layer = element('div', 'popups');
  layer.setAttribute('aria-hidden', 'true');

  const slots: Slot[] = SPOTS.map(([x, y]) => {
    const node = element('div', 'popup');
    node.style.left = `calc(50% + ${String(x)}px)`;
    node.style.top = `calc(46% + ${String(y)}px)`;
    const main = element('span', 'popup-main');
    const sub = element('span', 'popup-sub');
    node.append(main, sub);
    layer.append(node);
    return { root: node, main, sub, key: '', at: 0, animation: undefined };
  });

  const streakBox = element('div', 'popup-streak');
  const streakMain = element('span', 'popup-main');
  const streakSub = element('span', 'popup-sub');
  streakBox.append(streakMain, streakSub);
  let streakAnimation: Animation | undefined;
  let streak = 0;
  let streakPoints = 0;
  let streakCalled: string | undefined;
  let lastDonutStep = -Infinity;

  const banner = element('div', 'popup-banner');
  const bannerLevel = element('span', 'banner-level');
  const bannerSub = element('span', 'banner-sub');
  const bannerLine = element('span', 'banner-line');
  banner.append(bannerLevel, bannerSub, bannerLine);
  let bannerAnimation: Animation | undefined;

  layer.append(streakBox, banner);
  root.append(layer);

  let chain = 0;
  let chainPoints = 0;

  /** Pops a shout; one of the same `key` still on screen is reused, so bursts merge. */
  const say = (key: string, main: string, sub: string, tone: Tone, now: number): void => {
    const live = slots.find((slot) => slot.key === key && now - slot.at < MERGE_MS);
    const slot =
      live ??
      slots.find((candidate) => now - candidate.at >= POP_MS) ??
      slots.reduce((oldest, candidate) => (candidate.at < oldest.at ? candidate : oldest));
    slot.key = key;
    slot.at = now;
    slot.root.className = `popup popup-${tone}`;
    slot.main.textContent = main;
    slot.sub.textContent = sub;
    slot.animation?.cancel();
    slot.animation = play(slot.root, POP, POP_MS);
  };

  const donut = (points: number, world: World): void => {
    if (world.step - lastDonutStep > STREAK_STEPS || world.step < lastDonutStep) {
      streak = 0;
      streakPoints = 0;
      streakCalled = undefined;
    }
    lastDonutStep = world.step;
    streak += 1;
    streakPoints += points;
    streakCalled = streakCall(streak) ?? streakCalled;
    streakMain.textContent = `🍩 x${String(streak)}`;
    const total = `+${String(streakPoints)}`;
    streakSub.textContent = streakCalled ? `${streakCalled} ${total}` : total;
    streakAnimation?.cancel();
    streakAnimation = play(streakBox, STREAK, STREAK_MS);
  };

  const levelUp = (level: number): void => {
    bannerLevel.textContent = `LEVEL ${String(level)}`;
    const speed = level >= RUN.maxLevel ? 'MAX SPEED!' : 'FASTER!';
    bannerSub.textContent = `${speed} · SCORE ×${String(level)}`;
    bannerLine.textContent = levelLine(level);
    bannerAnimation?.cancel();
    bannerAnimation = play(banner, BANNER, BANNER_MS);
  };

  const clearAll = (): void => {
    for (const slot of slots) {
      slot.animation?.cancel();
      slot.at = 0;
    }
    streakAnimation?.cancel();
    bannerAnimation?.cancel();
    lastDonutStep = -Infinity;
  };

  return {
    show(events, world) {
      const now = performance.now();
      for (const event of events) {
        switch (event.kind) {
          case 'smash': {
            const merging = slots.some((slot) => slot.key === 'smash' && now - slot.at < MERGE_MS);
            chain = merging ? chain + 1 : 1;
            chainPoints = (merging ? chainPoints : 0) + event.points;
            const combo = chain > 1 ? ` · x${String(chain)} COMBO` : '';
            say('smash', smashText(event.thing), `+${String(chainPoints)}${combo}`, 'smash', now);
            break;
          }
          case 'clear':
            say('clear', clearText(event.thing), `+${String(event.points)}`, 'good', now);
            break;
          case 'ramp':
            say('air', 'AIR TIME!', `+${String(RUN.points.ramp * world.level)}`, 'air', now);
            break;
          case 'crash':
            say('crash', crashText(event.thing), crashWarning(world.copGap), 'bad', now);
            break;
          case 'donut':
            donut(event.points, world);
            break;
          case 'power':
            if (event.power === 'canister') say('power', 'FULL TANK!', 'BOOST READY', 'power', now);
            else say('power', 'DONUT MAGNET!', 'Their donuts. Your car.', 'power', now);
            break;
          case 'boost':
            say('boost', 'BOOST!', 'SMASH EVERYTHING', 'smash', now);
            break;
          case 'levelUp':
            levelUp(event.level);
            break;
          case 'busted':
            clearAll();
            break;
          default:
            break;
        }
      }
    },
  };
}
