import { expect, test, type Page } from '@playwright/test';

interface Sample {
  readonly sky: readonly number[];
  readonly ground: readonly number[];
  readonly redPixels: number;
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
    let redPixels = 0;
    let centreHash = 0;
    for (let gy = 0; gy < 40; gy++) {
      for (let gx = 0; gx < 40; gx++) {
        const [r = 0, g = 0, b = 0] = pixel(0.2 + gx * 0.015, 0.25 + gy * 0.0125);
        if (r > 90 && g < 60 && b < 60) redPixels++;
        centreHash = (centreHash * 31 + r + g * 7 + b * 13) >>> 0;
      }
    }
    return { sky: pixel(0.5, 0.02), ground: pixel(0.5, 0.98), redPixels, centreHash };
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

const expectScene = (sample: Sample): void => {
  const [skyR = 0, , skyB = 0] = sample.sky;
  expect(skyB, 'top of the frame is blue sky').toBeGreaterThan(skyR);
  const [groundR = 0, , groundB = 0] = sample.ground;
  expect(groundR, 'bottom of the frame is sand').toBeGreaterThan(groundB);
  expect(sample.redPixels, 'the red placeholder box is in view').toBeGreaterThan(20);
};

test('the scene animates at a capped pixel ratio with ?fps=10', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto('/?fps=10');
  await firstFrame(page);
  const first = await sampleScreen(page);
  await expect
    .poll(async () => (await sampleScreen(page)).centreHash, { message: 'the box moves' })
    .not.toBe(first.centreHash);
  await page.screenshot({ path: `.verify/evidence/empty-scene-${testInfo.project.name}.png` });

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
