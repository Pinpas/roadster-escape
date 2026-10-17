import { chromium } from 'playwright-core';

const sets = [
  '--enable-gpu --ignore-gpu-blocklist --use-angle=gl-egl',
  '--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan',
  '--use-angle=swiftshader --enable-unsafe-swiftshader',
];
for (const s of sets) {
  const browser = await chromium.launch({ args: s.split(' '), timeout: 20_000 });
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no webgl2';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    console.log(`${s} => ${r}`);
  } finally {
    await browser.close();
  }
}
