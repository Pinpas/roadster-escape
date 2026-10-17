import { probeCapabilities } from './caps';
import { choosePath, encode, type EncodePath, type Encoded, type EncodeJob } from './encode';
import { createReplayRenderer, SIZES, type SizeName } from './scene';
import { download, shareClip, shareRoute, xIntentUrl } from './share';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const canvas = $<HTMLCanvasElement>('#scene');
const video = $<HTMLVideoElement>('#result');
const log = $<HTMLPreElement>('#log');
const caps = $<HTMLPreElement>('#caps');
const encodeBtn = $<HTMLButtonElement>('#encode');
const shareBtn = $<HTMLButtonElement>('#share');
const downloadBtn = $<HTMLButtonElement>('#download');
const intent = $<HTMLAnchorElement>('#intent');
intent.href = xIntentUrl();

const renderer = createReplayRenderer(canvas);
renderer.setSize(SIZES.portrait);
renderer.renderAt(0);

const device = navigator.userAgent.match(/iPhone|iPad|Android|Linux|Windows|Macintosh/)?.[0] ?? 'unknown';
const stamp = () => `${device}-${new Date().toISOString().replace(/[:.]/g, '-')}`;

async function upload(name: string, body: Blob) {
  await fetch(`/__artifact?name=${encodeURIComponent(name)}`, { method: 'POST', body }).catch(() => {});
}

const radio = (name: string) => document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)!.value;
const params = new URLSearchParams(location.search);

let clip: File | null = null;

function summary(sizeName: SizeName, r: Encoded) {
  return {
    size: sizeName,
    path: r.path,
    videoBitrate,
    mime: r.mime,
    videoCodec: r.videoCodec,
    audioCodec: r.audioCodec,
    encoderConfig: r.encoderConfig,
    frames: r.frames,
    wallMs: Math.round(r.wallMs),
    renderMs: Math.round(r.renderMs),
    bytes: r.blob.size,
    xSafe: r.xSafe,
    shareRoute: clip ? shareRoute(clip) : null,
  };
}

const videoBitrate = Number(params.get('bitrate') ?? 6_000_000);

async function run(sizeName: SizeName, fps: 30 | 60, pathChoice: EncodePath | 'auto', audio: boolean) {
  const job: EncodeJob = { size: SIZES[sizeName], fps, seconds: 5, audio, videoBitrate };
  const path = pathChoice === 'auto' ? await choosePath(job.size) : pathChoice;
  if (!path) throw new Error('No encoder path on this browser');
  log.textContent = `Encoding ${sizeName} ${fps} fps via ${path}...`;
  const r = await encode(path, job, renderer);
  const ext = r.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  clip = new File([r.blob], `roadster-escape-replay.${ext}`, { type: r.mime.split(';')[0] });
  video.src = URL.createObjectURL(clip);
  const s = summary(sizeName, r);
  log.textContent = JSON.stringify(s, null, 2);
  const base = `${stamp()}-${sizeName}-${fps}-${path}-${videoBitrate / 1e6}M`;
  await upload(`${base}.${ext}`, r.blob);
  await upload(`${base}.json`, new Blob([JSON.stringify(s, null, 2)]));
  shareBtn.disabled = downloadBtn.disabled = false;
  return s;
}

encodeBtn.onclick = async () => {
  encodeBtn.disabled = true;
  try {
    await run(radio('size') as SizeName, Number(radio('fps')) as 30 | 60, radio('path') as EncodePath | 'auto', $<HTMLInputElement>('input[name=audio]').checked);
  } catch (e) {
    log.textContent = `Encode failed: ${(e as Error).name}: ${(e as Error).message}`;
  } finally {
    encodeBtn.disabled = false;
  }
};

shareBtn.onclick = () => {
  if (!clip) return;
  shareClip(clip)
    .then((route) => (log.textContent += `\nshared via ${route}`))
    .catch((e: Error) => (log.textContent += `\nshare failed: ${e.name}: ${e.message}`));
};
downloadBtn.onclick = () => clip && download(clip);

const capsReady = probeCapabilities().then(async (c) => {
  caps.textContent = JSON.stringify(c, null, 2);
  await upload(`${stamp()}-caps.json`, new Blob([JSON.stringify(c, null, 2)]));
  return c;
});

declare global {
  interface Window {
    __spike?: { done: boolean; results: unknown[]; error?: string };
    __frameAt?: (size: SizeName, t: number) => string;
    __readbackMs?: (size: SizeName, frames: number) => number;
  }
}

if (params.has('auto')) {
  window.__frameAt = (size, t) => {
    renderer.setSize(SIZES[size]);
    renderer.renderAt(t);
    return canvas.toDataURL('image/png');
  };
  window.__readbackMs = (size, frames) => {
    renderer.setSize(SIZES[size]);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      renderer.renderAt(i / 30);
      new VideoFrame(canvas, { timestamp: i }).close();
    }
    return performance.now() - t0;
  };
  window.__spike = { done: false, results: [] };
  const fps = Number(params.get('fps') ?? 30) as 30 | 60;
  const path = (params.get('path') ?? 'auto') as EncodePath | 'auto';
  const audio = params.get('audio') !== '0';
  (async () => {
    await capsReady;
    for (const size of ['portrait', 'landscape'] as const) window.__spike!.results.push(await run(size, fps, path, audio));
  })()
    .catch((e: Error) => (window.__spike!.error = `${e.name}: ${e.message}`))
    .finally(() => (window.__spike!.done = true));
}
