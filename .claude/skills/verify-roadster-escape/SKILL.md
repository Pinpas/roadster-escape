---
name: verify-roadster-escape
description: Launch and drive the Roadster Escape browser game (Vite + three.js) the way a player sees it, at desktop 1280x720 and phone 390x844, through T3 preview tabs and Playwright, and capture screenshots and console evidence. Use it to prove any change to the game in this repo, before opening or updating a PR, or when asked to check that the game renders.
---

# Verify Roadster Escape

Roadster Escape is a single-page WebGL game. The surface is one full-viewport `<canvas id="game">`. There is no DOM UI yet. The T3 preview browser and the Playwright config render WebGL through SwiftShader on the CPU. An uncapped scene at pixel ratio 2 burns several cores. Every recipe below therefore loads the game with a render flag and closes the browser tab right after its snapshot.

Read [`features/README.md`](features/README.md) first, then drive the feature files that your change touches.

## Rules that protect the box

- Load the game with `?still&dpr=1` (one frame, then the loop stops) or `?fps=10&dpr=1` (animated, capped). Never load it without a flag in a T3 preview tab.
- Close every preview tab with `t3_preview_close` right after its snapshot. Never leave a WebGL tab open between steps. Check with `t3_preview_list` at the end.
- Run installs, builds, and Playwright through `~/projects/agentbox/scripts/heavy`, and Playwright also under `timeout 180s`.
- Use only ports from the project block. `5100` is the main dev server, `5106` is `wrangler dev`, `5107` is the default Playwright server, and `5108` is `npm run preview`. Other owners and worktrees verify in parallel, so when a default port is busy, take a free one from `5101`–`5105` or `5109`. The helper's busy message names the first free one.

## Launch

Install once per checkout:

```bash
~/projects/agentbox/scripts/heavy npm ci
```

Start the dev server with the helper. It refuses a busy port, starts the server in its own process group, writes a pidfile under `.verify/`, waits up to 30 seconds for the page, and runs the doctor. If the server exits early, it prints the last log lines and stops.

```bash
.claude/skills/verify-roadster-escape/scripts/dev-server.sh start        # port 5100
.claude/skills/verify-roadster-escape/scripts/dev-server.sh start 5101   # when 5100 is taken; use the port the busy message names
```

Ready means the doctor prints `doctor: OK`. The game is then at `http://hugo-agentbox-macbookpro:<port>/`.

For production parity, serve the built game with the Cloudflare Workers runtime instead. `start-cf` builds through `heavy`, then starts `wrangler dev` the same way:

```bash
.claude/skills/verify-roadster-escape/scripts/dev-server.sh start-cf     # port 5106
```

## Doctor

```bash
.claude/skills/verify-roadster-escape/scripts/dev-server.sh doctor [port]
```

It checks four things: the pidfile's process is alive, it runs in this checkout, a process in its group owns the port, and the page holds `<canvas id="game">`. It also counts the browser console errors and unhandled errors that Vite forwards into `.verify/server-<port>.log`. That count is a secondary check. The primary console evidence is the `consoleEntries` list of a T3 snapshot or a passing Playwright run. Run the doctor first whenever anything looks off. Never drive a server the doctor does not report as `OK`. Another agent may own it.

## Drive

### T3 preview (the human-visible proof)

Size the tab before the page loads, because `?still` draws only once:

1. `preview_open` with `open: false` and `reuseExistingTab: false`, and no URL. Keep the returned `tabId` for every later call.
2. `preview_resize` with `{ mode: "freeform", width: 1280, height: 720 }`.
3. `preview_navigate` to `http://hugo-agentbox-macbookpro:<port>/?still&dpr=1`.
4. `preview_evaluate` with the expression below. Expect `css` to equal the viewport, `buffer` to equal `css` at `dpr=1`, and a SwiftShader `renderer`.
5. `preview_snapshot` with `save: true` and `includeImage: true`. With `save` alone the result holds only the path. `consoleEntries` must hold no `error` entry. Keep the returned `screenshotPath`.
6. For the phone size, `preview_resize` to `{ mode: "freeform", width: 390, height: 844 }`, then `preview_navigate` again to reload. Repeat steps 4 and 5.
7. `t3_preview_close` with the `tabId`.

```js
(() => {
  const c = document.querySelector('#game');
  const gl = c.getContext('webgl2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    css: [c.clientWidth, c.clientHeight],
    buffer: [c.width, c.height],
    devicePixelRatio,
    hidden: document.hidden,
    renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
  };
})()
```

### Playwright (the scripted proof)

```bash
~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e
```

`e2e/playwright.config.ts` starts its own Vite server on `$E2E_PORT`, default 5107, and stops it afterwards. If another checkout's run holds 5107, Playwright stops with "is already used"; rerun with a free port, for example `E2E_PORT=5109 ~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e`. It runs every spec in a `desktop` project (1280x720) and a `phone` project (390x844, device scale 3, touch). The specs load `?fps=10` and `?still&dpr=1`. They sample pixels from real screenshots and fail on any console error or page error.

### Unit tests and static checks

```bash
~/projects/agentbox/scripts/heavy sh -c 'npm run lint && npm run typecheck && npm test && npm run build'
```

`npm test` runs Vitest over `src/**/*.test.ts`, including the simulation determinism tests. `npm run build` prints the JS bundle size and its gzip size.

## Evidence

- Playwright writes `.verify/evidence/empty-scene-desktop.png` and `.verify/evidence/empty-scene-phone.png`. On failure, Playwright keeps a trace and a screenshot under `e2e/test-results/`. Open the trace with `npx playwright show-trace <path>/trace.zip`.
- T3 snapshots land at the `screenshotPath` each `preview_snapshot` returns, under `/home/hugo/.t3/userdata/browser-artifacts/`.
- For a PR, copy the 1280x720 and 390x844 shots to `docs/media/<phase>/`, keep each file small, and embed them in the PR body.
- Report the console result (the `consoleEntries` list or the doctor's error count), the evaluate output, and the commands with their pass or fail lines. Proof drives the real page through its URL. Do not set game state from the console.

## Cleanup

```bash
.claude/skills/verify-roadster-escape/scripts/dev-server.sh stop [port]   # 5100 by default; pass 5106 for wrangler dev
```

`stop` runs the doctor's ownership checks first. It stops the process group only when this skill started the server in this checkout and that server still owns the port. Otherwise it removes a stale pidfile and kills nothing. Then call `t3_preview_list` and close any tab still open. Other owners run their own servers in this port block, so never kill a process by name or by port. Cleanup keeps `.verify/evidence/` and the T3 screenshot files.

## Helpers

- `scripts/dev-server.sh start|start-cf|doctor|stop [port]` starts, checks, and stops one server per port. `start` runs Vite, and its port defaults to `$VERIFY_PORT`, then `5100`. `start-cf` builds and runs `wrangler dev`, and its port defaults to `5106`. Logs go to `.verify/server-<port>.log`.
