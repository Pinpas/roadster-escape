import { defineConfig } from 'vitest/config';

const allowedHosts = ['hugo-agentbox-macbookpro'];

export default defineConfig({
  // Browser console errors reach the server log for every caller, not only detected agents.
  server: { host: true, port: 5100, strictPort: true, allowedHosts, forwardConsole: true },
  preview: { host: true, port: 5108, strictPort: true, allowedHosts },
  test: { include: ['src/**/*.test.ts'] },
});
