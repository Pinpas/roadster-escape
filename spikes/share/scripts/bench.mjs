import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.SPIKE_URL ?? 'http://127.0.0.1:5104/';
const reps = Number(process.env.REPS ?? 5);
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];
const configs = [
  { fps: 30, bitrate: 6e6, copy: 1 },
  { fps: 30, bitrate: 6e6, copy: 0 },
  { fps: 60, bitrate: 8e6, copy: 1 },
];

const runs = [];
const browser = await chromium.launch({ args });
try {
  for (let rep = 0; rep < reps; rep++) {
    for (const c of configs) {
      const page = await browser.newPage();
      await page.goto(`${base}?auto=1&fps=${c.fps}&bitrate=${c.bitrate}&copy=${c.copy}&audio=0`);
      await page.waitForFunction(() => window.__spike?.done, null, { timeout: 120_000 });
      const spike = await page.evaluate(() => window.__spike);
      await page.close();
      if (spike.error) throw new Error(spike.error);
      for (const r of spike.results) runs.push({ rep, ...c, ...r, load1: loadavg()[0] });
    }
  }
} finally {
  await browser.close();
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], min: s[0], max: s.at(-1) };
};
const groups = {};
for (const r of runs) (groups[`${r.size} ${r.fps}fps copy=${r.copy}`] ??= []).push(r);
for (const [k, rs] of Object.entries(groups)) {
  const failed = rs.filter((r) => !r.xSafe || !r.selfCheck?.ok).length;
  console.log(k, 'n', rs.length, 'failed', failed, 'wallMs', stats(rs.map((r) => r.wallMs)), 'renderMs', stats(rs.map((r) => r.renderMs)), 'bytes', stats(rs.map((r) => r.bytes)), 'codec', rs[0].videoCodec);
}
console.log('encoderConfig', JSON.stringify(runs.find((r) => r.fps === 60)?.encoderConfig));
console.log('load1 range', stats(runs.map((r) => r.load1)));
writeFileSync(resolve(import.meta.dirname, `../out/bench-${Date.now()}.json`), JSON.stringify(runs, null, 2));
