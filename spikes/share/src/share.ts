export type ShareRoute = 'share-sheet' | 'download-and-intent';

export const SHARE_TEXT = 'I escaped 3 cops in Roadster Escape. Daily chase 2026-10-17, score 12 480.';
export const GAME_URL = `${location.origin}/`;

export function xIntentUrl(text = SHARE_TEXT, url = GAME_URL): string {
  const q = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${q}`;
}

export function shareRoute(file: File): ShareRoute {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
    ? 'share-sheet'
    : 'download-and-intent';
}

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Must run inside the tap's user activation: no awaits before navigator.share.
export async function shareClip(file: File): Promise<ShareRoute> {
  const route = shareRoute(file);
  if (route === 'share-sheet') {
    await navigator.share({ files: [file], text: `${SHARE_TEXT} ${GAME_URL}` });
  } else {
    download(file);
    window.open(xIntentUrl(), '_blank', 'noopener');
  }
  return route;
}
