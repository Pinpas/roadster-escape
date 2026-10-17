import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 5107);

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    // The game needs WebGL, and --disable-software-rasterizer leaves Chromium without a context,
    // so SwiftShader stays on. A Vulkan path to the Intel GPU also works, but measured no cheaper
    // for these frame-capped tests (8.2 s wall, 4.6 s CPU either way). Run under a shell timeout.
    launchOptions: { args: ['--disable-gpu', '--use-angle=swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
    {
      name: 'phone',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}`,
    cwd: resolve(import.meta.dirname, '..'),
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
