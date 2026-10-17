# Roadmap

Version 1 ships in phases. Each phase lands as one or more pull requests and ends in something you can play or look at. The design lives in `GAME_DESIGN.md` and the look lives in `ART_DIRECTION.md`.

## Technical constraints

These constraints shape every phase. Change one only with a written reason in the pull request.

- **Stack.** Vite, TypeScript in strict mode, and Three.js. No UI framework inside the game loop. The HUD and menus may use plain DOM.
- **Deterministic simulation.** The game simulates at a fixed 60 Hz step, separate from rendering. All randomness comes from one seeded generator. The same seed and the same inputs give the same run. The daily chase and the replay both depend on this.
- **State machines.** The Roadster and each cop are explicit state machines. Spawn rules per wanted level are a data table, not branching code.
- **Input actions.** Touch, keyboard, and gamepad all produce the same small set of actions. The simulation sees only actions.
- **Assets.** Every model comes from a Blender script under `art/`. Generated `.glb` files are committed, so the game builds without Blender.
- **Budget.** Under 3 MB transferred before the title screen is playable, and 60 fps on a mid-range phone at the default tier.

## Version 1 cut

On 17 October 2026 Hugo cut version 1 down to a small, funny, working game: title, chase, bust, and retry, with the score on screen and the best score kept in the browser. Version 1 ships phases 0 to 3, the look from phase 1, the assets from phase 2, and a plain title, HUD, and busted screen from phase 5.

These move to later: replay, video, sharing, the daily chase and its shared seed, sound, the settings menu, the PWA, automatic quality tiers, the launch kit, and accounts. Phases 4, 6, and 7 below stay as the plan for after version 1. Version 1 counts a near miss only for a car cleared with a hop or a roll. Near misses for swerving out of a car's lane, and for cops, come later.

## Phases

### Phase 0. Scaffold

The repository builds, runs, and deploys an empty scene.

- Vite, TypeScript, Three.js, ESLint, Prettier, and Vitest.
- A dev server on `0.0.0.0:5100`.
- GitHub Actions that run lint, type checks, tests, and a production build on every pull request.
- Cloudflare Workers with static assets, deployed by Workers Builds: `main` to production and every other branch to a Worker Preview.
- A verification skill for agents, made with `/t3-pstack:create-verification-skill`.

**Done when** the empty scene renders in a phone browser and CI is green.

### Phase 1. Look development

Pick the look before building on it.

- Two or three competing scene prototypes of the highway at golden hour with a placeholder car. Each one is a different take on the soft toon shading, the sky, and the haze.
- Screenshots of each prototype on a desktop and on a phone-sized viewport.
- Hugo picks one. The winning shaders, palette, and lighting become the base.

**Done when** one look is chosen and committed as reusable materials and a scene setup.

### Phase 2. Asset pipeline and the Roadster

- The Blender script pipeline with export, compression, and preview renders.
- The Roadster, with thruster nozzles, spinning wheels, and body lean.
- A police car, five traffic silhouettes, spike strips, roadblocks, and roadside scenery.

**Done when** every asset loads in the chosen look, with preview images in the pull request.

### Phase 3. Core gameplay

- The simulation: lanes, speed, hop, barrel roll, and the air tank.
- Police state machines with the warning and lunge.
- Traffic, collisions, near misses, and wrecks.
- The wanted level and its spawn table.
- Score and combo.

**Done when** a full run from start to bust plays on a phone and on a desktop, and simulation tests cover determinism and each state machine.

### Phase 4. Game feel

- Gas puffs, spiral trails, sparks, wind lines, and light-bar bloom.
- Camera lag, lean, shake, and field-of-view kick.
- Slow motion on a perfect dodge.
- Sound: engine, thrusters, sirens with Doppler, crashes, and a music track with a license that allows open source.

**Done when** a recorded run feels fast and readable, judged on video.

### Phase 5. Menus and the busted screen

- Title screen, HUD, pause, settings, and the busted screen.
- Local high score and the daily chase.

**Done when** the whole flow from title to retry works with touch alone and with keyboard alone.

### Phase 6. Replay and sharing

- The game records the inputs of the run and replays the best moment from cinematic cameras.
- The replay is encoded to a short video in the browser.
- Sharing uses the Web Share API with the video on phones, and a download plus a prepared X post on desktops.

**Done when** a video shared from an iPhone and from Android plays in the X app.

### Phase 7. Performance and launch

- Quality tiers chosen automatically from measured frame time.
- Load-time and frame-time measurements on a real phone.
- An Open Graph image, a README GIF, and a short trailer captured from the game.
- A launch post for X.

**Done when** the performance budget holds on the test phone and the launch kit is ready for Hugo.
