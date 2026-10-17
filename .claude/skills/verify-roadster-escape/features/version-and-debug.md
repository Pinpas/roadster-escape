# Version label and debug overlay

Every build shows its version and commit in the bottom-right corner, for example `v0.1.0 · 1a2b3c4`, so bug reports and shared clips carry a version. `?debug` adds an overlay in the top-left corner with the version, the measured render rate, and the simulation tick.

## Sub-features

- `version-label` shows `v<package version> · <7-character commit>` in the corner.
- `debug-overlay` appears only with `?debug`.
- `debug-fps` reports the measured render rate, which follows `?fps`.
- `debug-tick` reports the simulation tick, which grows by 60 per second.

## How to get to it (user POV)

- Open the game. The label is always in the bottom-right corner.
- Add `?debug` to the URL for the overlay.

## Driving it with T3 preview and Playwright

Preconditions:

- A dev server reports `doctor: OK`.

- **Scripted.** Run `~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e`. `e2e/version.spec.ts` checks the label text against `package.json` and reads the overlay at `?debug&fps=10&dpr=1`. The render rate must sit between 6 and 11 fps, and the tick must pass 60.
- **Visual.** Open a blank tab, resize to 390x844, and navigate to `/?debug&still&dpr=1`. `preview_snapshot` with `save: true` and `includeImage: true` shows the overlay top left and the label bottom right, both clear of the notch areas. Close the tab.

## Gotchas

- With `?still`, the overlay shows `render fps -`, because it measures over half a second and the loop stops after one frame. Use `?fps=10` to read a rate.
- The commit is `unknown` when the build has no git checkout and no `WORKERS_CI_COMMIT_SHA`.
