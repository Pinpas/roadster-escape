# Render flags

URL flags let a tester or an agent run the game cheaply. They change only how often and how sharply it renders. The simulation keeps its fixed 60 Hz step.

## Sub-features

- `flag-fps` caps rendering at `?fps=N` frames per second.
- `flag-still` renders one frame, then stops the loop.
- `flag-dpr` renders at pixel ratio `?dpr=N`.
- `pause-hidden` stops the loop while the page is hidden and resumes when it is visible.
- `flag-malformed` ignores malformed values such as `?fps=0` or `?dpr=abc`.

## How to get to it (user POV)

- Add the flags to the game URL, for example `/?fps=10&dpr=1` or `/?still&dpr=1`.

## Driving it with T3 preview and Playwright

Preconditions:

- A dev server reports `doctor: OK`.

- **Still frame.** Run `~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e`. The spec `?still&dpr=1 draws one frame at pixel ratio 1 and stops` passes in both projects. It takes two screenshots 400 ms apart and requires them to match.
- **Capped animation.** In the same run, the spec `the scene animates at a capped pixel ratio with ?fps=10` passes. Its two screenshots differ, so the highway scene animates at 10 fps.
- **Parsing and pacing.** `npm test` runs `src/render/flags.test.ts` (defaults, all flags, malformed values, the `?dpr` cap of 4), and `src/render/loop.test.ts` (render counts under each cap on 30 to 144 Hz displays, one render with `?still`, no burst after a stall).
- **Pause while hidden.** `src/render/loop.test.ts` drives the loop with a fake frame scheduler. It checks that no frame is requested while hidden, that hiding cancels the pending frame, and that the first frame after a hidden minute runs no catch-up steps. A browser cannot show this here, because the T3 preview and headless Playwright both report the page as visible.

## Gotchas

- `?fps` limits rendering only. The loop still wakes on every animation frame to step the simulation, which costs almost nothing.
- `?dpr` replaces the cap of 2 entirely, so `?dpr=3` really renders at 3.
