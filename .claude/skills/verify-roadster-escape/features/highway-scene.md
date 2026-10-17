# Highway scene

The game opens straight into the look-dev highway at golden hour. A painted sunset sky with 3D cloud puffs sits over sand dunes, mesas and a far ridge that fade into stepped haze. On the three-lane road, the silver placeholder Roadster drives ahead of the camera and a black-and-cream police car lines up beside it, its light bar tinting the road red and blue. Traffic drives ahead. The view fills any viewport, landscape or portrait, without scrollbars.

## Sub-features

- `scene-render` draws the sky, the haze planes, the road, the Roadster, the police car, and traffic.
- `scene-fit` fills the viewport and refits on resize and rotation.
- `scene-dpr` renders at the device pixel ratio, capped at 2.
- `scene-portrait` widens the view and pulls the camera back on a portrait screen, so all three lanes stay in view.
- `scene-tier` renders the default tier (render target, one post pass with bloom) or, with `?tier=low` or on a device without half-float targets, the low tier (one toon shader, no post pass).
- `scene-clean-console` loads with zero console errors.

## How to get to it (user POV)

- Open the game URL. There is no menu yet.

## Driving it with T3 preview and Playwright

Preconditions:

- A dev server reports `doctor: OK`.

- **Desktop.** Open a blank tab, resize to 1280x720, and navigate to `/?still&dpr=1`. `preview_evaluate` (expression in SKILL.md) returns `css` `[1280, 720]` and `buffer` `[1280, 720]`. `preview_snapshot` with `save: true` shows the sunset sky above the road with the silver Roadster in the lower centre, and `consoleEntries` holds no error.
- **Phone.** Resize to 390x844 and navigate again. `css` and `buffer` are `[390, 844]`. All three lanes and the whole Roadster are visible.
- **Low tier.** Navigate to `/?still&dpr=1&tier=low&debug`. `preview_evaluate` of `window.__roadster.tier` returns `{ tier: 'low', reason: 'requested' }`, and the frame shows the same scene without bloom.
- **Pixel-ratio cap.** Run `~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e`. The `phone` project runs at device scale 3 and asserts a buffer at ratio 2, which is 780x1688.
- **Close.** `t3_preview_close` the tab.

## Gotchas

- The T3 preview browser reports `devicePixelRatio` 2 and `document.hidden: false` even when the human cannot see the tab. Without `dpr=1`, the canvas renders four times the pixels.
- Snapshots record "GPU stall due to ReadPixels" warnings in some runs. The screenshot capture causes them, not the game. They are warnings, not errors.
- `?still` does not redraw after a resize. Navigate again after every `preview_resize`.
