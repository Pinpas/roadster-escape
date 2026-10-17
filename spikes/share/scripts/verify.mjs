import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const ffprobe = require('ffprobe-static').path;
const ffmpeg = require('ffmpeg-static');

const base = process.env.SPIKE_URL ?? 'http://127.0.0.1:5104/';
const fps = process.env.FPS ?? '30';
const path = process.env.ENCODER ?? 'auto';
const bitrate = process.env.BITRATE ?? '6000000';
// Real Intel GPU through ANGLE/Vulkan: WebGL without SwiftShader, which the box rules forbid looping on.
const args = (process.env.CHROMIUM_ARGS ?? '--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan').split(' ').filter(Boolean);
const outDir = resolve(import.meta.dirname, '../out');
mkdirSync(outDir, { recursive: true });
const startedAt = Date.now();

const browser = await chromium.launch({ args });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  const crashed = new Promise((_, reject) => page.on('pageerror', reject));
  await page.goto(`${base}?auto=1&fps=${fps}&path=${path}&bitrate=${bitrate}`);
  await Promise.race([page.waitForFunction(() => window.__spike?.done, null, { timeout: 150_000 }), crashed]);
  const spike = await page.evaluate(() => window.__spike);
  const caps = await page.locator('#caps').textContent();
  console.log('caps', caps);
  console.log('results', JSON.stringify(spike, null, 2));
  if (spike.error) throw new Error(`encode failed: ${spike.error}`);

  for (const size of ['portrait', 'landscape']) {
    const png = await page.evaluate((s) => window.__frameAt(s, 2.5), size);
    writeFileSync(join(outDir, `canvas-${size}-t2.5.png`), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`render+readback only, ${size}, ${spike.results[0].frames} frames:`, Math.round(await page.evaluate(([s, n]) => window.__readbackMs(s, n), [size, spike.results[0].frames])), 'ms');
  }

  const [download, popup] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.waitForEvent('popup', { timeout: 15_000 }),
    page.click('#share'),
  ]);
  const saved = join(outDir, `share-download-${download.suggestedFilename()}`);
  await download.saveAs(saved);
  console.log('share route: download', download.suggestedFilename(), statSync(saved).size, 'bytes');
  console.log('share route: popup', popup.url());
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
  const decodeErrors = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const png = file.replace(/\.(mp4|webm)$/, '-t2.5.png');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', '2.5', '-i', file, '-frames:v', '1', png]);
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
    decodeErrors: decodeErrors || 'none',
    frame: png,
  };
  report.push(entry);
  console.log(JSON.stringify(entry));
}
writeFileSync(join(outDir, `verify-${startedAt}.json`), JSON.stringify(report, null, 2));
