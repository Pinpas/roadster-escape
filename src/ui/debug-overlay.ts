import { VERSION_TEXT } from './version';

const FPS_WINDOW_MS = 500;

export interface DebugOverlay {
  /** Call once per rendered frame. */
  rendered(nowMs: number, tick: number): void;
}

export function mountDebugOverlay(parent: HTMLElement): DebugOverlay {
  const panel = document.createElement('pre');
  panel.className = 'debug-overlay';
  panel.textContent = `${VERSION_TEXT}\nrender fps -\nsim tick 0`;
  parent.append(panel);

  let windowStartMs: number | undefined;
  let frames = 0;
  return {
    rendered(nowMs, tick) {
      windowStartMs ??= nowMs;
      frames++;
      const elapsedMs = nowMs - windowStartMs;
      if (elapsedMs < FPS_WINDOW_MS) return;
      const fps = Math.round((frames * 1000) / elapsedMs);
      panel.textContent = `${VERSION_TEXT}\nrender fps ${String(fps)}\nsim tick ${String(tick)}`;
      windowStartMs = nowMs;
      frames = 0;
    },
  };
}
