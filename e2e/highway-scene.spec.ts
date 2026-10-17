import { expect, test, type Page } from '@playwright/test';

interface Sample {
  readonly sky: readonly number[];
  readonly road: readonly number[];
  readonly roadsterPixels: number;
  readonly centreHash: number;
}

// Sampling the screenshot, not the WebGL buffer, also works after `?still` has stopped the loop.
const sampleScreen = async (page: Page): Promise<Sample> => {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const copy = document.createElement('canvas');
    copy.width = image.width;
    copy.height = image.height;
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(image, 0, 0);
    const pixel = (x: number, y: number): number[] => [
      ...ctx.getImageData(Math.floor(x * copy.width), Math.floor(y * copy.height), 1, 1).data,
    ];
    let roadsterPixels = 0;
    let centreHash = 0;
    for (let gy = 0; gy < 40; gy++) {
      for (let gx = 0; gx < 40; gx++) {
        const [r = 0, g = 0, b = 0] = pixel(0.3 + gx * 0.01, 0.55 + gy * 0.00875);
        // The graded silver body is bright and warm (red at least as high as blue); the violet road
        // is dark, the lit sand low in blue, and the white-blue gas puffs bluer than red.
        if (0.2126 * r + 0.7152 * g + 0.0722 * b > 140 && b > 130 && r >= b) roadsterPixels++;
        centreHash = (centreHash * 31 + r + g * 7 + b * 13) >>> 0;
      }
    }
    return { sky: pixel(0.5, 0.04), road: pixel(0.5, 0.97), roadsterPixels, centreHash };
  }, png);
};

const canvasSizes = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('no #game canvas');
    return {
      css: [canvas.clientWidth, canvas.clientHeight],
      buffer: [canvas.width, canvas.height],
      devicePixelRatio: window.devicePixelRatio,
    };
  });

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

const luma = ([r = 0, g = 0, b = 0]: readonly number[]): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const expectScene = (sample: Sample): void => {
  expect(luma(sample.sky), 'the sunset sky is brighter than the road').toBeGreaterThan(
    luma(sample.road) + 40,
  );
  const [, roadG = 0, roadB = 0] = sample.road;
  expect(roadB, 'bottom of the frame is violet asphalt, not sand').toBeGreaterThan(roadG);
  expect(sample.roadsterPixels, 'the silver Roadster is in view').toBeGreaterThan(40);
};

test('the scene animates at a capped pixel ratio with ?fps=10', async ({ page }, testInfo) => {
  // At pixel ratio 2 the default tier's HDR target and post pass take about a second per frame
  // on the CPU renderer of the build box, and longer under load, so allow minutes, not seconds.
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?fps=10');
  await firstFrame(page);
  const first = await sampleScreen(page);
  await expect
    .poll(async () => (await sampleScreen(page)).centreHash, {
      message: 'the scene moves',
      timeout: 40_000,
    })
    .not.toBe(first.centreHash);
  await page.screenshot({ path: `.verify/evidence/highway-scene-${testInfo.project.name}.png` });

  const sizes = await canvasSizes(page);
  const pixelRatio = Math.min(sizes.devicePixelRatio, 2);
  expect(sizes.css, 'canvas fills the viewport').toEqual([
    page.viewportSize()?.width,
    page.viewportSize()?.height,
  ]);
  const [cssWidth = 0, cssHeight = 0] = sizes.css;
  expect(sizes.buffer, 'canvas buffer uses the device pixel ratio capped at 2').toEqual([
    Math.floor(cssWidth * pixelRatio),
    Math.floor(cssHeight * pixelRatio),
  ]);
  expectScene(first);
  expect(errors, 'console errors').toEqual([]);
});

test('?still&dpr=1 draws one frame at pixel ratio 1 and stops', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?still&dpr=1');
  await firstFrame(page, 1);
  const first = await sampleScreen(page);
  await page.waitForTimeout(400);
  const second = await sampleScreen(page);

  const sizes = await canvasSizes(page);
  expect(sizes.buffer, 'canvas buffer is at pixel ratio 1').toEqual(sizes.css);
  expectScene(first);
  expect(second.centreHash, 'nothing moves after the single frame').toBe(first.centreHash);
  expect(errors, 'console errors').toEqual([]);
});

test('?tier=low renders the same scene in one shader, inside the triangle budget', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?still&dpr=1&tier=low&debug');
  await firstFrame(page, 1);
  const view = await page.evaluate(() => {
    const debug = (
      window as unknown as {
        __roadster: { tier: { tier: string }; stats(): { triangles: number } };
      }
    ).__roadster;
    return { tier: debug.tier.tier, triangles: debug.stats().triangles };
  });
  expect(view.tier, 'the low tier was chosen').toBe('low');
  expect(view.triangles, 'triangles on screen, shadow pass included').toBeLessThan(60_000);
  expectScene(await sampleScreen(page));
  expect(errors, 'console errors').toEqual([]);
});
