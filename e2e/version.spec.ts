import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const versionText = new RegExp(`^v${version.replaceAll('.', '\\.')} · ([0-9a-f]{7}|unknown)$`);

test('the corner label shows the package version and the commit', async ({ page }) => {
  await page.goto('/?still&dpr=1');
  await expect(page.locator('.version-label')).toHaveText(versionText);
  await expect(page.locator('.debug-overlay')).toHaveCount(0);
});

test('?debug shows the version, the capped render rate, and the sim tick', async ({ page }) => {
  // The highway scene renders on the CPU in this test browser; the low tier at a tiny pixel ratio
  // keeps each frame cheap enough that the ?fps=10 cap, not the renderer, sets the rate.
  await page.goto('/?debug&fps=10&dpr=0.25&tier=low');
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toContainText(/render fps \d+/);
  // The overlay reports the last 500 ms; skip the shader-compile stalls right after load.
  await page.waitForTimeout(3000);
  const [label = '', fpsLine = '', tickLine = ''] = (await overlay.innerText()).split('\n');
  expect(label).toMatch(versionText);
  const fps = Number(/render fps (\d+)/.exec(fpsLine)?.[1]);
  expect(fps, 'render rate stays near the ?fps=10 cap').toBeGreaterThanOrEqual(6);
  expect(fps, 'render rate stays near the ?fps=10 cap').toBeLessThanOrEqual(11);
  const tick = Number(/sim tick (\d+)/.exec(tickLine)?.[1]);
  expect(tick, 'the simulation keeps stepping at 60 Hz').toBeGreaterThan(60);
});
