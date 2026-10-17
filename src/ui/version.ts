export const VERSION_TEXT = `v${__APP_VERSION__} · ${__GIT_SHA__}`;

export function mountVersionLabel(parent: HTMLElement): void {
  const label = document.createElement('div');
  label.className = 'version-label';
  label.textContent = VERSION_TEXT;
  parent.append(label);
}
