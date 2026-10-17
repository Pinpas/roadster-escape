import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const allowedHosts = ['hugo-agentbox-macbookpro'];

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// Cloudflare Workers Builds sets WORKERS_CI_COMMIT_SHA; local and CI builds read git.
const gitSha = (): string => {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  // Browser console errors reach the server log for every caller, not only detected agents.
  server: { host: true, port: 5100, strictPort: true, allowedHosts, forwardConsole: true },
  preview: { host: true, port: 5108, strictPort: true, allowedHosts },
  test: { include: ['src/**/*.test.ts'] },
});
