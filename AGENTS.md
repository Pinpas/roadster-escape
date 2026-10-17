# Agent guide for Roadster Escape

Box rules in `~/.claude/CLAUDE.md` always win over this file.

## Project facts

- Repository: `github.com/Pinpas/roadster-escape`, public, MIT.
- Dev ports: `5100` to `5109`. The main dev server uses `5100` on `0.0.0.0`. Share it as `http://hugo-agentbox-macbookpro:5100`.
- Blender: `~/.local/bin/blender` (5.2 LTS). Run it only headless with `-b --factory-startup`.
- Heavy work goes through `~/projects/agentbox/scripts/heavy`. That covers `npm ci`, builds, Blender exports and renders, and browser tests. Browser tests also get a shell `timeout`.

## Sources of truth

- `docs/GAME_DESIGN.md` defines what the game does.
- `docs/ART_DIRECTION.md` defines how it looks.
- `docs/ROADMAP.md` defines the phases and the technical constraints.

If code and docs disagree, fix whichever is wrong in the same pull request.

## Working rules

- Start every engineering task with `/t3-pstack:poteto-mode`.
- Work on a branch and open a pull request. Never push to `main`.
- Write every commit message and pull request title as Conventional Commits, `type(scope): subject`, with a scope from `engine`, `art`, `share`, `sim`, `render`, `ui`, `ci`, `docs`, or `deps`. Pull requests land with rebase merges, so fold fixes into the commit they fix with `git commit --fixup` and `git rebase --autosquash` before you report a pull request ready.
- Prove visual work with screenshots or a recording from the running game, at a desktop size and at a phone size.
- Keep generated `.glb` files committed next to the Blender script that makes them.
