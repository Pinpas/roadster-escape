import { TUNING } from '../sim/tuning';
import { starsFor } from '../sim/wanted';
import { scoreOf, type World } from '../sim/world';

export interface BustResult {
  readonly score: number;
  readonly best: number;
  readonly line: string;
}

export interface Ui {
  title(onStart: () => void, best: number): void;
  playing(): void;
  busted(result: BustResult, onRetry: () => void): void;
  /** Refreshes the HUD from the world; cheap enough to call every rendered frame. */
  updateHud(world: World): void;
}

/** A retry this soon after a bust is almost always a held hop key, so it waits. */
const RETRY_LOCK_MS = 800;

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

export function createUi(root: HTMLElement): Ui {
  const hud = element('div', 'hud');
  const score = element('div', 'hud-score', '0');
  const combo = element('div', 'hud-combo');
  const stars = element('div', 'hud-stars');
  const airBar = element('div', 'hud-air');
  const airFill = element('div', 'hud-air-fill');
  airBar.append(airFill);
  hud.append(score, combo, stars, airBar);

  const screen = element('div', 'screen');
  root.append(hud, screen);

  let onConfirm: (() => void) | undefined;
  const confirm = (): void => {
    const action = onConfirm;
    onConfirm = undefined;
    action?.();
  };
  window.addEventListener('keydown', (event) => {
    if (onConfirm && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault();
      confirm();
    }
  });

  const show = (...children: HTMLElement[]): void => {
    screen.onclick = null;
    screen.replaceChildren(...children);
    screen.hidden = false;
    hud.hidden = true;
  };

  return {
    title(onStart, best) {
      const start = element('button', 'screen-button', 'Tap to start');
      show(
        element('h1', 'screen-title', 'Roadster Escape'),
        element('p', 'screen-text', best > 0 ? `Best ${String(best)}` : 'The cops are waiting.'),
        element('p', 'screen-text', 'Swipe or use the arrow keys to change lanes.'),
        element(
          'p',
          'screen-text',
          'Swipe up or press Space to hop. Swipe diagonally or press Q / E to barrel-roll.',
        ),
        start,
      );
      screen.onclick = confirm;
      onConfirm = onStart;
    },
    playing() {
      onConfirm = undefined;
      screen.hidden = true;
      hud.hidden = false;
    },
    busted(result, onRetry) {
      const retry = element('button', 'screen-button', 'Retry');
      retry.disabled = true;
      retry.addEventListener('click', confirm);
      show(
        element('h1', 'screen-title screen-busted', 'BUSTED'),
        element('p', 'screen-line', result.line),
        element('p', 'screen-score', `Score ${String(result.score)}`),
        element('p', 'screen-text', `Best ${String(result.best)}`),
        retry,
      );
      window.setTimeout(() => {
        retry.disabled = false;
        retry.focus();
        onConfirm = onRetry;
      }, RETRY_LOCK_MS);
    },
    updateHud(world) {
      score.textContent = String(scoreOf(world));
      combo.textContent = world.combo > 1 ? `x${String(world.combo)}` : '';
      const level = starsFor(world.heat);
      stars.textContent = '★'.repeat(level) + '☆'.repeat(5 - level);
      airFill.style.width = `${String(Math.round((world.roadster.air / TUNING.tankLiters) * 100))}%`;
    },
  };
}
