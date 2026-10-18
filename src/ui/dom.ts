export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

/** Plays a one-shot transform bump; the Web Animations API restarts it without a reflow. */
export const bump = (node: HTMLElement, scale = 1.25, ms = 220): void => {
  const rest = { transform: 'scale(1)' };
  node.animate([rest, { transform: `scale(${String(scale)})` }, rest], {
    duration: ms,
    easing: 'ease-out',
  });
};
