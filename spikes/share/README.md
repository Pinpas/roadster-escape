# Share spike (throwaway)

This spike proves the phase 6 video path before the game exists. It renders a 5 s three.js clip frame by frame, encodes it to an H.264 MP4 in the browser, and shares the file. The decision it supports is in [`docs/SHARE_PLAN.md`](../../docs/SHARE_PLAN.md). Do not import this code into `src/`.

## Run

```bash
npm ci
npm run dev          # http://hugo-agentbox-macbookpro:5104 (plain http, no WebCodecs or Web Share on phones)
npm run dev:https    # https://hugo-agentbox-macbookpro:5105 (self-signed certificate)
```

Every encode and every capability probe is uploaded to `out/` on the dev server, so results from a phone arrive on the box.

## Measure

```bash
npm run verify       # headless Chromium: encode both sizes, click Share, ffprobe and decode each MP4
node scripts/bench.mjs   # 5 alternating runs: 30 fps with and without the 2D frame copy, and 60 fps
npm run size         # minified and gzipped size of the muxer options
```

Run each one through `~/projects/agentbox/scripts/heavy` with a `timeout`. Headless Chromium needs `--use-angle=vulkan` for WebGL on the real GPU; `scripts/gl-probe.mjs` lists the flag sets that were tried.

`evidence/` holds the ffprobe output, decoded frames, preview screenshots, benchmark runs, and one sample MP4.
