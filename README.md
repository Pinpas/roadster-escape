# Roadster Escape

A flying roadster, a Texas highway, and every cop in the state. Barrel-roll out of PIT maneuvers, hop over traffic on cold-gas thrusters, and see how long you last before they bust you.

Roadster Escape runs in any browser on a phone, tablet, or computer. No install, no account.

> Status: version 1 is playable: title, chase, bust, and retry. Replay, sharing, sound, and the daily chase come later.

## Play

The game goes live on Cloudflare Workers once Hugo connects the repository (see Deploy). Tap or press Space to start. Swerve, hop over traffic, and barrel-roll away from PIT lunges. Near misses refill your air and build a combo.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Change lane | Swipe left or right | `A` `D` or arrow keys |
| Hop | Swipe up | `W` or `Space` |
| Barrel roll | Swipe diagonally up | `Q` `E` |

## How it is made

- [Game design](docs/GAME_DESIGN.md) explains the chase, the air tank, the police, and the share moment.
- [Art direction](docs/ART_DIRECTION.md) explains the soft toon look and the rendering rules for phones.
- [Roadmap](docs/ROADMAP.md) lists the phases of version 1.

The game uses Three.js and TypeScript. Every 3D model is built by a Python script that runs in Blender without a window, so you can rebuild or change any asset from source.

## Develop

Dev-poorten: 5100–5109

You need Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev
```

The dev server listens on `0.0.0.0:5100`. On the build box, open `http://hugo-agentbox-macbookpro:5100`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server on port 5100. |
| `npm run lint` | Runs ESLint and checks formatting with Prettier. |
| `npm run format` | Rewrites files in the Prettier style. |
| `npm run typecheck` | Type-checks the game and the browser tests. |
| `npm test` | Runs the Vitest suite once. |
| `npm run test:e2e` | Runs the Playwright browser tests at desktop and phone sizes. |
| `npm run build` | Builds the game into `dist/`. |
| `npm run preview` | Serves `dist/` with Vite on port 5108. |
| `npm run preview:cf` | Builds and serves `dist/` with the Cloudflare Workers runtime on port 5106. |

On this box, run installs, builds, and browser tests through `~/projects/agentbox/scripts/heavy`. Run browser tests under a shell `timeout`, for example `~/projects/agentbox/scripts/heavy timeout 180s npm run test:e2e`.

The code is split by owner. `src/sim/` holds the deterministic simulation and imports nothing from three.js or the DOM. ESLint and `tsconfig.sim.json` enforce this, as a tripwire rather than a proof. `src/render/` holds the three.js scene and the frame loop in `loop.ts`, which steps the simulation at a fixed 60 Hz and renders between steps. `src/main.ts` wires them to the browser.

### URL flags

These flags make the game cheap to run in a software-rendered test browser.

| Flag | Effect |
| --- | --- |
| `?fps=N` | Renders at most N frames per second. The simulation still steps at 60 Hz. |
| `?still` | Renders one frame, then stops the loop. |
| `?dpr=N` | Renders at pixel ratio N, up to 4, instead of the device pixel ratio, which is capped at 2. |
| `?tier=low` | Forces the low quality tier: one toon shader, no render target, no bloom. `?tier=high` asks for the default tier. |
| `?debug` | Shows the version, the render rate, and the simulation tick, and exposes `window.__roadster` with the chosen tier, last-frame draw calls and triangles, and `bench(frames)`. |

The loop also stops while the page is hidden.

Phones that cannot render to half-float targets get the low tier automatically. The look itself, its palette and its two tiers are described in [Art direction](docs/ART_DIRECTION.md).

### Base path

The build uses `/` as its base path. To embed the game under a sub-path of another site, build with `npm run build -- --base=/<path>/`.

## Deploy

Cloudflare Workers serves `dist/` as static assets. `wrangler.jsonc` configures the Worker, and `public/_headers` sets the cache rules. Hashed files under `/assets/` are cached for a year. `index.html` is revalidated on every request, so a new deploy shows at once.

Cloudflare Workers Builds deploys through its GitHub integration. A merge to `main` deploys production. Every other branch gets its own Worker Preview. The repository holds no Cloudflare token, and GitHub Actions runs no deploy job. Agents never run `wrangler login`, `wrangler deploy`, `wrangler preview`, `wrangler versions upload`, or `wrangler secret put` on this box.

Enter these settings in the Cloudflare dashboard, under the Worker's build settings.

### Production

| Setting | Value |
| --- | --- |
| Git repository | `Pinpas/roadster-escape` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variables | None |
| Secrets | None |

### Previews Base

| Setting | Value |
| --- | --- |
| Enable Preview Builds | On |
| Preview command | `npx wrangler preview` |
| Build variables | None |
| Secrets | None |

Previews do not inherit production settings. Preview vars and bindings go in the `previews` block of `wrangler.jsonc`, which is empty for now. Worker Previews need wrangler 4.135.0 or later, and Workers Builds uses the version in `package.json`.

To serve the build with the Workers runtime locally, run `npm run preview:cf`. It builds, then runs `npx wrangler dev --ip 0.0.0.0 --port 5106`, which needs no login. Agents on the build box use `.claude/skills/verify-roadster-escape/scripts/dev-server.sh start-cf` instead, which builds through `heavy` and can stop the server cleanly. `npm run deploy` deploys production by hand and is for Hugo only.

CI runs lint, type checks, tests, and a production build on every pull request.

## Releases

Every commit message and every pull request title follows [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`. The scope is one of `engine`, `art`, `share`, `sim`, `render`, `ui`, `ci`, `docs`, or `deps`, and it may be left out. CI runs commitlint on every commit of a pull request and on its title. Pull requests land with rebase merges, so each commit reaches `main` as written. Keep commits small, and fold review fixes into the commit they fix with `git commit --fixup` and `git rebase --autosquash` before merge.

release-please reads the commits on `main` and keeps a release pull request open with the next version and its `CHANGELOG.md` entry. Merging that pull request tags `vX.Y.Z` and publishes a GitHub Release. That merge is a release, so it is Hugo's step. Commitlint stays out of the required checks, because release-please opens its pull request with `GITHUB_TOKEN`, which starts no workflows. A required check would block every release pull request. Before 1.0.0, a `feat` raises the minor version and a `fix` raises the patch version. The plan is one minor version per finished roadmap phase, starting at 0.1.0, and 1.0.0 at launch.

The game shows its version and commit in the bottom-right corner, for example `v0.1.0 · 1a2b3c4`. Add `?debug` to the URL for an overlay with the version, the render rate, and the simulation tick. Quote the version in bug reports.

## Disclaimer

Roadster Escape is an unofficial fan game. It is not affiliated with, endorsed by, or sponsored by Tesla, Inc. or SpaceX. All names and models in the game are original or generic.

## License

[MIT](LICENSE)
