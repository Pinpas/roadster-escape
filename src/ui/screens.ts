import { isBoosting, scoreOf, type World } from '../sim/runner';

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

/** `onBoost` fires from the on-screen BOOST button, for phones. */
export function createUi(root: HTMLElement, onBoost: () => void): Ui {
  const hud = element('div', 'hud');
  const score = element('div', 'hud-score', '0');
  const cops = element('div', 'hud-cops');
  const airBar = element('div', 'hud-air');
  const airFill = element('div', 'hud-air-fill');
  airBar.append(airFill);
  hud.append(score, cops, airBar);
  const boost = element('button', 'boost-button', 'BOOST');
  boost.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    onBoost();
  });

  const screen = element('div', 'screen');
  boost.hidden = true;
  root.append(hud, boost, screen);

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
    boost.hidden = true;
  };

  return {
    title(onStart, best) {
      const start = element('button', 'screen-button', 'Tap to start');
      show(
        element('h1', 'screen-title', 'Roadster Escape'),
        element('p', 'screen-text', best > 0 ? `Best ${String(best)}` : 'The cops are waiting.'),
        element('p', 'screen-text', 'Swipe left/right (or ← →) to dodge traffic.'),
        element(
          'p',
          'screen-text',
          'Tap, swipe up or Space to jump over cars. Trucks are too tall.',
        ),
        element(
          'p',
          'screen-text',
          'Full meter? Hit BOOST (swipe down or Shift) to smash through everything.',
        ),
        element('p', 'screen-text', 'Crash twice and the cops have you.'),
        start,
      );
      screen.onclick = confirm;
      onConfirm = onStart;
    },
    playing() {
      onConfirm = undefined;
      screen.hidden = true;
      hud.hidden = false;
      boost.hidden = false;
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
      cops.textContent = `🚓 ${String(Math.ceil(world.copGap))} m`;
      cops.classList.toggle('hud-cops-close', world.copGap < 10);
      const boosting = isBoosting(world);
      airFill.style.width = `${String(boosting ? 100 : Math.round(world.boostMeter * 100))}%`;
      const ready = world.boostMeter >= 1 && !boosting;
      boost.classList.toggle('boost-ready', ready);
      boost.classList.toggle('boost-on', boosting);
    },
  };
}
