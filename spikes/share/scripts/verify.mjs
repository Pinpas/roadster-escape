import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const ffprobe = require('ffprobe-static').path;
const ffmpeg = require('ffmpeg-static');

const base = process.env.SPIKE_URL ?? 'http://127.0.0.1:5104/';
const fps = process.env.FPS ?? '30';
const path = process.env.ENCODER ?? 'webcodecs';
const bitrate = process.env.BITRATE ?? '6000000';
const copy = process.env.COPY ?? '1';
const label = process.env.LABEL ?? `${path}-copy${copy}`;
// Real Intel GPU through ANGLE/Vulkan: WebGL without SwiftShader, which the box rules steer away from.
const args = (process.env.CHROMIUM_ARGS ?? '--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan').split(' ').filter(Boolean);
const outDir = resolve(import.meta.dirname, '../out');
mkdirSync(outDir, { recursive: true });
const startedAt = Date.now();
const run = { label, startedAt, fps, path, bitrate, copy, args, readbackMs: {}, share: {} };

const browser = await chromium.launch({ args });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  const crashed = new Promise((_, reject) => page.on('pageerror', reject));
  await page.goto(`${base}?auto=1&fps=${fps}&path=${path}&bitrate=${bitrate}&copy=${copy}`);
  await Promise.race([page.waitForFunction(() => window.__spike?.done, null, { timeout: 150_000 }), crashed]);
  const spike = await page.evaluate(() => window.__spike);
  const caps = await page.locator('#caps').textContent();
  run.caps = JSON.parse(caps);
  run.results = spike.results;
  console.log('results', JSON.stringify(spike.results.map(({ encoderConfig, ...r }) => r), null, 2));
  if (spike.error) throw new Error(`encode failed: ${spike.error}`);

  for (const size of ['portrait', 'landscape']) {
    const png = await page.evaluate((s) => window.__frameAt(s, 2.5), size);
    writeFileSync(join(outDir, `canvas-${size}-t2.5.png`), Buffer.from(png.split(',')[1], 'base64'));
    run.readbackMs[size] = Math.round(await page.evaluate(([s, n]) => window.__readbackMs(s, n), [size, spike.results[0].frames]));
    console.log(`render + VideoFrame only, ${size}, ${spike.results[0].frames} frames: ${run.readbackMs[size]} ms`);
  }

  const [download, popup] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.waitForEvent('popup', { timeout: 15_000 }),
    page.click('#share'),
  ]);
  const saved = join(outDir, `share-download-${download.suggestedFilename()}`);
  await download.saveAs(saved);
  run.share = { download: download.suggestedFilename(), bytes: statSync(saved).size, popup: popup.url() };
  console.log('share route', JSON.stringify(run.share));
} finally {
  await browser.close();
}

const report = [];
for (const f of readdirSync(outDir).filter((n) => /\.(mp4|webm)$/.test(n))) {
  const file = join(outDir, f);
  if (statSync(file).mtimeMs < startedAt) continue;
  const probe = JSON.parse(
    execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_format', '-show_streams', '-of', 'json', file]).toString(),
  );
  const decode = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const png = file.replace(/\.(mp4|webm)$/, '-t2.5.png');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '2.5', '-i', file, '-frames:v', '1', png]);
  const size = f.match(/portrait|landscape/)?.[0];
  const canvasPng = size && !f.startsWith('share-') ? join(outDir, `canvas-${size}-t2.5.png`) : null;
  const psnr = canvasPng
    ? spawnSync(ffmpeg, ['-i', canvasPng, '-i', png, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/average:([\d.]+)/)?.[1]
    : undefined;
  const streams = probe.streams.map((s) => ({
    type: s.codec_type,
    codec: s.codec_name,
    profile: s.profile,
    size: s.width ? `${s.width}x${s.height}` : undefined,
    pix_fmt: s.pix_fmt,
    fps: s.avg_frame_rate,
    frames: s.nb_read_frames,
    sample_rate: s.sample_rate,
    channels: s.channels,
  }));
  const entry = {
    file: f,
    bytes: Number(probe.format.size),
    format: probe.format.format_name,
    duration: Number(probe.format.duration),
    bit_rate: Number(probe.format.bit_rate),
    streams,
    decodeExit: decode.status,
    decodeErrors: decode.stderr.trim() || 'none',
    psnrVsCanvasAt2_5s: psnr ? Number(psnr) : undefined,
  };
  report.push(entry);
  console.log(JSON.stringify(entry));
}
run.files = report;
writeFileSync(join(outDir, `verify-${label}.json`), JSON.stringify(run, null, 2));
