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
  await page.goto('/?debug&fps=10&dpr=1');
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toContainText(/render fps \d+/);
  await page.waitForTimeout(1200);
  const [label = '', fpsLine = '', tickLine = ''] = (await overlay.innerText()).split('\n');
  expect(label).toMatch(versionText);
  const fps = Number(/render fps (\d+)/.exec(fpsLine)?.[1]);
  expect(fps, 'render rate stays near the ?fps=10 cap').toBeGreaterThanOrEqual(6);
  expect(fps, 'render rate stays near the ?fps=10 cap').toBeLessThanOrEqual(11);
  const tick = Number(/sim tick (\d+)/.exec(tickLine)?.[1]);
  expect(tick, 'the simulation keeps stepping at 60 Hz').toBeGreaterThan(60);
});
