# Chase run

A player starts from the title, dodges traffic and cops until a PIT or a crash busts them, sees the BUSTED screen with the score, the best score, and a bust line, and retries. The best score survives a reload.

## Sub-features

- `run-start` starts a run from the title by tap or Space.
- `run-controls` changes lane, hops, and barrel-rolls by swipe or keys.
- `run-hud` shows the score, the combo, the air tank, and the wanted stars.
- `run-bust` ends the run on a PIT or a traffic crash and shows BUSTED.
- `run-retry` starts a fresh run by tap or Enter, after an 800 ms lock.
- `run-best` keeps the best score in `localStorage` under `roadster-escape.best`.

## How to get to it (user POV)

- Open the game and tap anywhere, or press Space.
- `?seed=N` makes a run repeatable. With no input a run busts after about 7 to 9 seconds.

## Driving it with T3 preview and Playwright

Preconditions:

- A dev server reports `doctor: OK`.

- **Scripted.** Run `~/projects/agentbox/scripts/heavy timeout 300s npm run test:e2e`. `e2e/game.spec.ts` plays a full run in both projects: keyboard only on desktop and touch taps on the phone. It reads the score from the BUSTED screen, checks `localStorage`, retries, reloads, and expects `Best N` on the title. Evidence lands in `.verify/evidence/busted-<project>.png`.
- **Live.** Open a blank tab, resize, and navigate to `/?fps=10&dpr=1&seed=1`. Click "Tap to start" with `preview_click`, wait about 10 s, and take a snapshot of BUSTED. Read the best with `preview_evaluate` and `localStorage.getItem('roadster-escape.best')`. Close the tab.

## Gotchas

- Retry stays disabled for 800 ms after the bust, so a held hop key cannot restart the run.
- The HUD hides on the title and the BUSTED screen.
