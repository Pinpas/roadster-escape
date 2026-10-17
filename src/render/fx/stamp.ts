import { Color } from 'three';
import { palette } from '../palette';

const rgba = (hex: string, alpha: number): string => {
  const c = new Color(hex);
  return `rgba(${String(Math.round(c.r * 255))}, ${String(Math.round(c.g * 255))}, ${String(Math.round(c.b * 255))}, ${String(alpha)})`;
};

const style = (): string => `
.busted-stamp {
  position: fixed; left: 50%; top: 38%; z-index: 10; pointer-events: none;
  padding: 0.15em 0.45em; border: 0.12em solid currentColor; border-radius: 0.18em;
  color: ${palette.policeRed}; background: ${rgba(palette.lanePaint, 0.85)};
  font: 900 clamp(40px, 12vw, 128px)/1 system-ui, sans-serif; letter-spacing: 0.06em;
  transform: translate(-50%, -50%) rotate(-12deg);
  animation: busted-slam 420ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
  box-shadow: 0 0.06em 0 ${rgba(palette.shadow, 0.45)};
}
.busted-stamp:empty { display: none; }
@keyframes busted-slam {
  from { transform: translate(-50%, -50%) rotate(-24deg) scale(3); opacity: 0; }
  to { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .busted-stamp { animation: none; } }
`;

let styled = false;

export interface Stamp {
  show(text: string): void;
  hide(): void;
}

/**
 * The rubber-stamp slam that ends a run. Plain DOM, so it costs nothing in the WebGL frame. The
 * element is a live region from the start, so screen readers announce the text when it appears.
 */
export function createStamp(parent: HTMLElement = document.body): Stamp {
  if (!styled) {
    const el = document.createElement('style');
    el.textContent = style();
    document.head.append(el);
    styled = true;
  }
  const el = document.createElement('div');
  el.className = 'busted-stamp';
  el.setAttribute('role', 'status');
  parent.append(el);
  return {
    show(text) {
      el.textContent = text;
    },
    hide() {
      el.textContent = '';
    },
  };
}
