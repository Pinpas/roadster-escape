export type ShareRoute = 'share-sheet' | 'download-and-intent';

export const SHARE_TEXT = 'I escaped 3 cops in Roadster Escape. Daily chase 2026-10-17, score 12 480.';
export const GAME_URL = `${location.origin}/`;

export function xIntentUrl(text = SHARE_TEXT, url = GAME_URL): string {
  const q = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${q}`;
}

// Desktop Safari and Chrome can share files too, but their share sheets rarely reach X,
// so only touch devices get the sheet.
export function shareRoute(file: File): ShareRoute {
  const touch = matchMedia('(pointer: coarse)').matches;
  return touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
    ? 'share-sheet'
    : 'download-and-intent';
}

export type InAppBrowser = 'x-ios' | 'x-android' | null;

export function inAppBrowser(ua = navigator.userAgent): InAppBrowser {
  if (/Twitter for iP(hone|ad)/.test(ua)) return 'x-ios';
  if (/TwitterAndroid/.test(ua)) return 'x-android';
  return null;
}

export function escapeUrl(kind: InAppBrowser): string | null {
  const here = `${location.host}${location.pathname}${location.search}`;
  if (kind === 'x-android') return `intent://${here}#Intent;scheme=https;package=com.android.chrome;end`;
  if (kind === 'x-ios') return `x-safari-https://${here}`;
  return null;
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
