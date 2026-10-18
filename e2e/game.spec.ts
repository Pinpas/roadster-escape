import { expect, test, type Page } from '@playwright/test';

const collectErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

// The first rendered frame sizes the canvas buffer to its CSS box times the pixel ratio.
const firstFrame = (page: Page, pixelRatio?: number) =>
  page.waitForFunction((fixedRatio) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) return false;
    const ratio = fixedRatio ?? Math.min(window.devicePixelRatio, 2);
    return (
      canvas.width === Math.floor(canvas.clientWidth * ratio) &&
      canvas.height === Math.floor(canvas.clientHeight * ratio)
    );
  }, pixelRatio);

// highway-scene.spec.ts covers the look, the ?fps cap, ?still, and ?dpr behind the title.
test('a run goes from title to chase to BUSTED to retry, and the best score survives a reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  const touch = testInfo.project.name === 'phone';
  const press = async (button: string, key: string): Promise<void> => {
    if (touch) await page.getByRole('button', { name: button }).tap();
    else await page.keyboard.press(key);
  };

  await page.goto('/?fps=10&dpr=1&seed=1&debug');
  await firstFrame(page, 1);
  await press('Tap to start', 'Space');
  await expect(page.locator('.hud-score')).toBeVisible();

  interface DebugWorld {
    y: number;
    lane: number;
    boostLeft: number;
    boostMeter: number;
  }
  const world = () =>
    page.evaluate(() =>
      (window as unknown as { __roadster: { world(): DebugWorld } }).__roadster.world(),
    );
  if (touch) await page.locator('#game').tap();
  else await page.keyboard.press('Space');
  await expect
    .poll(async () => (await world()).y, { message: 'the Roadster jumps' })
    .toBeGreaterThan(1);
  if (!touch) {
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await world()).lane, { message: 'it changes lane' }).toBe(0);
  }
  await page.evaluate(() => {
    (window as unknown as { __roadster: { world(): DebugWorld } }).__roadster.world().boostMeter =
      1;
  });
  if (touch) await page.getByRole('button', { name: 'BOOST' }).tap({ force: true });
  else await page.keyboard.press('Shift');
  await expect
    .poll(async () => (await world()).boostLeft, { message: 'it boosts' })
    .toBeGreaterThan(0);

  // Two crashes bust a run; the cops catch up at once here so the test stays short.
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    (
      window as unknown as { __roadster: { world(): { busted: boolean } } }
    ).__roadster.world().busted = true;
  });
  const busted = page.getByRole('heading', { name: 'BUSTED' });
  await expect(busted).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: `.verify/evidence/busted-${testInfo.project.name}.png`,
    scale: 'css',
  });
  const score = Number(/Score (\d+)/.exec(await page.locator('.screen-score').innerText())?.[1]);
  expect(score, 'the run scored the distance it drove').toBeGreaterThan(100);
  const stored = await page.evaluate(() => localStorage.getItem('roadster-escape.best'));
  expect(Number(stored), 'the best score is saved').toBeGreaterThanOrEqual(score);

  const retry = page.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeEnabled();
  await press('Retry', 'Enter');
  await expect(busted).toBeHidden();
  await expect(page.locator('.hud-score')).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Best ${String(stored)}`)).toBeVisible();
  expect(errors, 'console errors').toEqual([]);
});
