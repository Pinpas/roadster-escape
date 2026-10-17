# Roadster Escape verification map

This directory is the maintained source for verifying what a player sees in Roadster Escape. Read this index, then drive the feature files that your change touches. Add a file here when a phase adds a player-facing feature, such as the chase, the HUD, or the busted screen.

## Baseline preconditions

- Dependencies are installed with `~/projects/agentbox/scripts/heavy npm ci`.
- A server started by `scripts/dev-server.sh start [port]` or `scripts/dev-server.sh start-cf` reports `doctor: OK`.
- Never drive a server that this run did not start.

## Driving conventions

- Load the game only with `?still&dpr=1` or `?fps=10&dpr=1` in a T3 preview tab.
- Size the tab with `preview_resize` before `preview_navigate`, because `?still` draws once.
- Close each preview tab with `t3_preview_close` right after its snapshot.
- Verify at 1280x720 and at 390x844 every time.

## Proof and skip reporting

- A visual proof is a saved `preview_snapshot` or a Playwright screenshot at both sizes, plus the console result.
- Name the URL, flags, and size with every artifact.
- Report a check that could not run as inconclusive, with the command and the reason. A unit test is not proof of what renders.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on the player-visible behaviour. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with T3 preview and Playwright`, and `Gotchas`.

## Features

- [Empty scene](./empty-scene.md) covers the sky, ground, placeholder box, viewport fit, and pixel ratio.
- [Render flags](./render-flags.md) covers `?fps`, `?still`, `?dpr`, and the pause while hidden.
- [Production build](./production-build.md) covers the built game on the Cloudflare Workers runtime and its cache headers.
- [Version label and debug overlay](./version-and-debug.md) covers the corner version label and the `?debug` overlay.
