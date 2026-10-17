import { chromium } from 'playwright-core';

const base = process.env.SPIKE_URL ?? 'http://127.0.0.1:5104/';
const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];
const cases = {
  'encoder emits nothing': [() => (VideoEncoder.prototype.encode = function () {}), /EncoderDroppedFrames: 0 of 150/],
  'flush never resolves': [() => (VideoEncoder.prototype.flush = () => new Promise(() => {})), /EncoderStalled/],
};

const browser = await chromium.launch({ args });
let failed = 0;
try {
  for (const [name, [patch, expected]] of Object.entries(cases)) {
    const page = await browser.newPage();
    await page.addInitScript(patch);
    const t0 = Date.now();
    await page.goto(`${base}?auto=1&path=webcodecs&audio=0`);
    await page.waitForFunction(() => window.__spike?.done, null, { timeout: 30_000 });
    const { error } = await page.evaluate(() => window.__spike);
    const ok = expected.test(error ?? '');
    failed += ok ? 0 : 1;
    console.log(`${ok ? 'pass' : 'FAIL'} ${name}: ${error ?? 'no error'} after ${Date.now() - t0} ms`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed);
