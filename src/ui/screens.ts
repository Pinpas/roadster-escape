import { isBoosting, RUN, scoreOf, type World } from '../sim/runner';
import { causeLabel, pickBustLine, storyOf } from './bust-lines';
import { pickFrom, TAGLINES } from './copy';
import { bump, element } from './dom';

export interface BustResult {
  readonly score: number;
  readonly best: number;
  /** The busted run, for the cause of the bust and the run's stats. */
  readonly world: World;
}

export interface UiHooks {
  /** Fires from the on-screen BOOST button, for phones. */
  readonly onBoost: () => void;
  /** Flips the sound and returns whether it is now muted. */
  readonly onToggleMute: () => boolean;
  readonly muted: boolean;
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
/** Closer than this, one more crash busts the run. */
const CLOSE_GAP = 10;
const WARN_GAP = 14;

const controls = (className: string, rows: readonly (readonly [string, string])[]) => {
  const list = element('ul', `controls ${className}`);
  for (const [keys, action] of rows) {
    const row = element('li', 'controls-row');
    row.append(element('span', 'controls-keys', keys), element('span', '', action));
    list.append(row);
  }
  return list;
};

const stat = (value: string, label: string): HTMLDivElement => {
  const cell = element('div', 'bust-stat');
  cell.append(element('strong', '', value), element('span', '', label));
  return cell;
};

function setMuteLabel(button: HTMLButtonElement, muted: boolean): void {
  button.textContent = muted ? '🔇' : '🔊';
  button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  button.setAttribute('aria-pressed', String(muted));
}

export function createUi(root: HTMLElement, hooks: UiHooks): Ui {
  const hud = element('div', 'hud');
  const scoreBox = element('div', 'hud-left');
  const scoreRow = element('div', 'hud-score-row');
  const score = element('span', 'hud-score', '0');
  const multiplier = element('span', 'hud-mult', '×1');
  scoreRow.append(score, multiplier);
  const donuts = element('div', 'hud-donuts', '🍩 0');
  scoreBox.append(scoreRow, donuts);

  const meters = element('div', 'hud-right');
  const cops = element('div', 'hud-meter hud-cops');
  const copsLabel = element('span', 'hud-meter-label');
  const copsTrack = element('div', 'hud-track');
  const copsFill = element('div', 'hud-fill');
  copsTrack.append(copsFill);
  cops.append(copsLabel, copsTrack);
  const air = element('div', 'hud-meter hud-boost');
  const airLabel = element('span', 'hud-meter-label', 'BOOST');
  const airTrack = element('div', 'hud-track');
  const airFill = element('div', 'hud-fill');
  airTrack.append(airFill);
  air.append(airLabel, airTrack);
  meters.append(cops, air);
  hud.append(scoreBox, meters);

  const boost = element('button', 'boost-button');
  boost.setAttribute('aria-label', 'Boost');
  const boostState = element('span', 'boost-state');
  boost.append(
    element('span', 'boost-name', 'BOOST'),
    boostState,
    element('span', 'boost-key', 'SHIFT'),
  );
  boost.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    hooks.onBoost();
  });

  // Pointerdown's default would focus the button, and a focused button eats the Space hop.
  const mute = element('button', 'mute-button');
  setMuteLabel(mute, hooks.muted);
  mute.addEventListener('pointerdown', (event) => {
    event.preventDefault();
  });
  mute.addEventListener('click', () => {
    setMuteLabel(mute, hooks.onToggleMute());
  });

  const speedLines = element('div', 'fx-boost');
  const siren = element('div', 'fx-siren');
  const screen = element('div', 'screen');
  boost.hidden = true;
  hud.hidden = true;
  root.append(speedLines, siren, hud, boost, screen, mute);

  let onConfirm: (() => void) | undefined;
  const confirm = (): void => {
    const action = onConfirm;
    onConfirm = undefined;
    action?.();
  };
  window.addEventListener('keydown', (event) => {
    if (event.target === mute) return;
    if (onConfirm && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault();
      confirm();
    }
  });

  // The HUD writes to the DOM only when a shown value changes.
  let shownScore = -1;
  let shownLevel = -1;
  let shownDonuts = -1;
  let shownGap = -1;
  let shownAir = -1;
  let shownMode = '';

  const show = (className: string, ...children: HTMLElement[]): void => {
    screen.onclick = null;
    screen.className = `screen ${className}`;
    screen.replaceChildren(...children);
    screen.hidden = false;
    hud.hidden = true;
    boost.hidden = true;
    speedLines.classList.remove('is-on');
    siren.classList.remove('is-on');
  };

  return {
    title(onStart, best) {
      const logo = element('h1', 'screen-title title-logo');
      logo.append(
        element('span', 'title-top', 'ROADSTER'),
        ' ',
        element('span', 'title-bottom', 'ESCAPE'),
      );
      const start = element('button', 'screen-button start-button', 'Tap to start');
      start.append(element('span', 'start-key', ' or press Space'));
      show(
        'screen-title-card',
        element('p', 'title-badge', '🚨 WANTED IN TEXAS 🚨'),
        logo,
        element('p', 'title-tagline', pickFrom(TAGLINES)),
        best > 0
          ? element('p', 'title-best', `Best ${String(best)}`)
          : element('p', 'title-best', 'No record yet. The cops like those odds.'),
        controls('controls-touch', [
          ['← swipe →', 'switch lanes'],
          ['tap / swipe ↑', 'jump over cars'],
          ['swipe ↓ / BOOST', 'smash through everything'],
        ]),
        controls('controls-desk', [
          ['← → / A D', 'switch lanes'],
          ['Space / ↑ / W', 'jump over cars'],
          ['Shift / ↓ / S', 'boost and smash everything'],
        ]),
        element('p', 'title-rules', 'Grab the cops’ 🍩. Every crash lets them catch up.'),
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
      shownScore = shownLevel = shownDonuts = shownGap = shownAir = -1;
      shownMode = '';
    },
    busted({ score: runScore, best, world }, onRetry) {
      const story = storyOf(world);
      const retry = element('button', 'screen-button', 'Retry');
      retry.disabled = true;
      retry.addEventListener('click', confirm);
      const record = runScore === best && runScore > 0;
      const stats = element('div', 'bust-stats');
      stats.append(
        stat(`${String(story.distance)} m`, 'distance'),
        stat(`🍩 ${String(story.donuts)}`, 'donuts'),
        stat(String(story.level), 'level'),
      );
      show(
        'screen-bust',
        element('div', 'bust-lights'),
        element('h1', 'screen-title screen-busted', 'BUSTED'),
        element('p', 'bust-cause', causeLabel(story.cause)),
        element('p', 'screen-line', pickBustLine(story)),
        element('p', 'screen-score', `Score ${String(runScore)}`),
        record
          ? element('p', 'bust-record', 'NEW BEST!')
          : element('p', 'screen-text', `Best ${String(best)}`),
        stats,
        retry,
      );
      window.setTimeout(() => {
        retry.disabled = false;
        retry.focus();
        onConfirm = onRetry;
      }, RETRY_LOCK_MS);
    },
    updateHud(world) {
      const points = scoreOf(world);
      if (points !== shownScore) {
        shownScore = points;
        score.textContent = String(points);
      }
      if (world.level !== shownLevel) {
        if (shownLevel > 0) bump(multiplier, 1.6, 420);
        shownLevel = world.level;
        multiplier.textContent = `×${String(world.level)}`;
      }
      if (world.donuts !== shownDonuts) {
        if (shownDonuts >= 0) bump(donuts);
        shownDonuts = world.donuts;
        donuts.textContent = `🍩 ${String(world.donuts)}`;
      }

      const gap = Math.max(0, Math.ceil(world.copGap));
      if (gap !== shownGap) {
        shownGap = gap;
        const close = gap < CLOSE_GAP;
        copsLabel.textContent = close ? `🚨 CLOSE! ${String(gap)} m` : `🚓 ${String(gap)} m`;
        copsFill.style.transform = `scaleX(${String(Math.min(1, gap / RUN.copBoostMaxGap))})`;
        cops.classList.toggle('is-close', close);
        cops.classList.toggle('is-warn', !close && gap < WARN_GAP);
        siren.classList.toggle('is-on', close);
      }

      const boosting = isBoosting(world);
      const fill = boosting ? world.boostLeft / RUN.boostSteps : world.boostMeter;
      const percent = Math.floor(fill * 100);
      if (percent !== shownAir) {
        shownAir = percent;
        airFill.style.transform = `scaleX(${String(percent / 100)})`;
        boost.style.setProperty('--fill', `${String(percent)}%`);
      }
      const mode = boosting ? 'on' : world.boostMeter >= 1 ? 'ready' : 'filling';
      if (mode !== shownMode) {
        shownMode = mode;
        boost.classList.toggle('boost-ready', mode === 'ready');
        boost.classList.toggle('boost-on', mode === 'on');
        air.classList.toggle('is-ready', mode === 'ready');
        air.classList.toggle('is-on', mode === 'on');
        speedLines.classList.toggle('is-on', mode === 'on');
        boostState.textContent = mode === 'ready' ? 'READY!' : mode === 'on' ? 'SMASH!' : '';
        airLabel.textContent =
          mode === 'ready' ? 'BOOST READY' : mode === 'on' ? 'SMASH MODE!' : 'BOOST';
      }
    },
  };
}
