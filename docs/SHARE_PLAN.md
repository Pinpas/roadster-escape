# Share plan

This plan covers how the busted screen turns a run into a short video that the X app plays, and how the player shares it. It is the phase 6 design, written before the engine exists so that the engine exposes what the replay needs. The throwaway spike in [`spikes/share/`](../spikes/share/README.md) backs the measured numbers here. Each number links to the raw output it comes from, or says that it was observed once and not recorded.

Part of #7. Status: the encode and the desktop route are measured on the box. The phone routes and the X app wait on device tests (see [Device checklist](#device-checklist)).

## The pipeline

1. The sim records the run as its seed plus the actions on each tick (#10).
2. On the busted screen, `src/share/` picks the best moment from the sim's events (#12). It then re-simulates the run headless from tick 0 up to a few seconds before that moment. #10 sets the budget: a 3 minute run must re-simulate in well under a second, on a desktop and on the test phone. While it does, the sim needs no snapshots (#11 stays optional).
3. A replay timeline maps video time to sim time. The video runs at 30 fps. Most of the clip plays at 1x, and a perfect dodge plays slowed down, for example at 0.25x for one second, which is 2 video frames per sim tick. The sim still steps at its fixed 60 Hz. Only the sampling changes. For each video frame, the renderer draws the sim time that the timeline gives, interpolated between the two ticks around it (#13).
4. The game's own renderer draws the replay. The busted screen covers the game canvas with an opaque overlay, sets its drawing buffer to 720x1280 at DPR 1, renders every replay frame into it, and restores the size afterwards. No second WebGL context exists, so no shader compiles twice and no texture uploads twice.
5. Right after each render, in the same task, the frame goes to WebCodecs `VideoEncoder` with H.264. A same-task capture does not need `preserveDrawingBuffer`. [mediabunny](https://mediabunny.dev/) runs the encoder and writes an MP4 with the index at the front.
6. A watchdog guards the encoder. If the encoder emits no packet for 5 s, the encode fails. It also fails if the encoder emitted fewer packets than it got frames. On failure the busted screen retries once at 576x1024, then falls back to the X post with text and a link only. mediabunny cannot cancel a flush that has started, so the game runs mediabunny in a Worker: the main thread renders, wraps each frame in a `VideoFrame`, and transfers it to the Worker. A stalled Worker is terminated before the retry. The spike runs both checks on the main thread, and `scripts/stall-test.mjs` proves that both fire ([`stall-test.txt`](../spikes/share/evidence/stall-test.txt)).
7. The finished MP4 plays on the busted screen as the replay, in a `<video>` element. The player sees the exact file they will share. While the encode runs, the screen shows the run's stats.
8. The **Share** button turns on when the encode is done. On a phone, a tap calls `navigator.share({ files: [mp4], text })`. On a desktop, a click downloads the MP4 and opens a prepared X post.

The render runs on sim time, not on the wall clock. The encoder takes frames as fast as it can, so a slow phone produces the same video as a fast one, only later.

### Why not record the screen

`canvas.captureStream()` with `MediaRecorder` records in real time. A dropped frame stays dropped, the clip shows whatever the HUD and the screen size were, slow motion has to play out in real time, and the player waits the full clip length. The spike's MediaRecorder variant in Chrome 156 on Linux took 5.02 s for a 5 s clip and wrote H.264 Constrained Baseline at a variable frame rate. A full `ffmpeg` decode of its 1280x720 file reports "non monotonically increasing dts" ([`verify-mediarecorder-copy1.json`](../spikes/share/evidence/verify-mediarecorder-copy1.json)). An earlier spike version that also recorded audio got Opus inside the MP4, which X does not take (observed once, not recorded). Chrome and Safari also write fragmented MP4s with zero duration in the header ([addpipe](https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari.md)), and iOS had MediaRecorder MP4 bugs in the 18.4 betas and in 26.0 ([WebKit 288459](https://bugs.webkit.org/show_bug.cgi?id=288459), [WebKit 299164](https://bugs.webkit.org/show_bug.cgi?id=299164)).

The only browsers that have an MP4 MediaRecorder but no `VideoEncoder` are iOS Safari 14.3 to 16.3. Supporting them would mean a second pipeline with real-time capture for a small, shrinking group. They get the text post instead. The spike keeps MediaRecorder as a switchable variant for comparison.

## Output format

X's own media spec is written for API uploads ([X media best practices](https://docs.x.com/x-api/media/quickstart/best-practices)). It recommends H.264 High, 30 or 60 fps, and 720x1280 for portrait. It requires YUV 4:2:0, progressive scan, no open GOP, a 1:1 pixel aspect ratio, at least 0.5 s, and AAC-LC if there is audio. The pipeline meets each of these.

| Property | Value | Reason |
| --- | --- | --- |
| Container | MP4, `moov` before `mdat` | mediabunny's default for an in-memory target. It also lets the busted screen's `<video>` start at once. |
| Video | H.264 High, level 3.1 (`avc1.64001f`), `yuv420p`, key frame every 1 s | X recommends High. If the device cannot encode High, the encoder tries Main (`avc1.4d001f`), then Constrained Baseline (`avc1.42e01f`). Android requires only Baseline from hardware encoders. The spike probes exactly these three strings. |
| Size | 720x1280 (9:16) | X recommends it for portrait. 9:16 fills the screen in X's phone video tab, and 16:9 shows small there ([Kapwing](https://www.kapwing.com/resources/how-to-post-videos-on-x-in-2025-vertical-video-tab/)). |
| Fallback size | 576x1024 | 9:16, a multiple of 16 in both directions, and inside the "32x32 to 1280x1024" limit that X's API page also states. |
| Frame rate | 30 fps | 60 fps takes 2.0 times as long to encode and makes a 1.7 times larger file (measured below). Level 3.1 allows 720p only up to 30 fps. |
| Bitrate | VBR with a 6 Mbps target | X's page recommends at least 5 Mbps but suggests 2 Mbps for 1280x720 in its own table, and it states no maximum. X re-encodes every upload. The flat-shaded spike scene used only 2.3 Mbps of the target. The real scene, with haze and particles, will use more. |
| Length | 5 to 8 s, slow motion included | The design's "five-second clip". 8 s at the target is 6 MB at most. |
| Audio | None in v1 | See [Audio](#audio). |

## Measured on the box

Hardware: MacBook Pro 2020, Intel i5 with Iris Plus 645, headless Chromium 156 with WebGL on the real GPU through ANGLE and Vulkan. The capability probe reports no hardware H.264 encoder, so these numbers come from Chromium's software encoder ([`verify-webcodecs-copy1.json`](../spikes/share/evidence/verify-webcodecs-copy1.json), `caps.webgl` and `caps.avc`). Each row is the median of 5 runs with the configurations alternated, at a load average of 2.0 to 5.0. The raw output of `scripts/bench.mjs` is [`bench-runs.json`](../spikes/share/evidence/bench-runs.json).

| Clip, 5 s, 6 Mbps target | Encode wall time (range) | Render time | MP4 size |
| --- | --- | --- | --- |
| 720x1280, 30 fps, no 2D copy | 1.11 s (1.10 to 1.26) | 0.09 s | 1.43 MB |
| 720x1280, 30 fps, 2D copy | 1.21 s (1.09 to 1.23) | 0.11 s | 1.43 MB |
| 1280x720, 30 fps, 2D copy | 1.23 s (1.22 to 1.24) | 0.10 s | 1.58 MB |
| 720x1280, 60 fps, 2D copy | 2.41 s (1.88 to 3.32) | 0.19 s | 2.46 MB |

- **The encoder is the limit.** Rendering is under 10% of the wall time in every bench row. Rendering plus `VideoFrame` creation alone, without encoding, took 0.10 to 0.28 s for 150 frames across the committed verify runs (`readbackMs`), a noisy number but at most a quarter of the encode. 60 fps at the same 6 Mbps target costs 2.0 times the 30 fps time, which is linear in the frame count.
- **The bitrate target is not what sets the file size here.** The 60 fps file is 2.46 MB at both a 6 Mbps and an 8 Mbps target ([8 Mbps runs at `8e2ad0e`](https://github.com/Pinpas/roadster-escape/blob/8e2ad0e/spikes/share/evidence/bench-runs.json)), because the encoder undershoots on this flat scene.
- **The 2D frame copy costs about 0.1 s per 150 frames here.** The ranges overlap, so the cost is close to the noise. On a phone with a hardware encoder the copy can be a larger share. The copy protects against repeated frames on Safari 16.4 to 17.1 ([WebKit 255869](https://bugs.webkit.org/show_bug.cgi?id=255869)), so the game applies it on those versions only. The spike never ran on an affected Safari, so this protection is untested.
- **The T3 preview browser is much slower.** It renders WebGL in software (SwiftShader) at DPR 2 and took 6.6 s for one 720x1280 clip (observed once, not recorded).
- **Phones are not measured yet.** Phones encode H.264 in hardware, so the encode may be faster than here, but they render slower. That is a guess until the device checklist runs. The spike's result panel shows `wallMs` on the phone.

Each WebCodecs output was checked with `ffprobe -count_frames` and a full `ffmpeg` decode: H.264 High, 150 of 150 frames, 5.000 s, and no decode errors ([`ffprobe.txt`](../spikes/share/evidence/ffprobe.txt), and `files` in the verify JSON). A decoded frame at 2.5 s matches the canvas at the same time at 42.8 to 43.2 dB PSNR. The spike also reads its own MP4 back in the browser and confirms 150 packets and 5 of 5 distinct sampled frames. Without `preserveDrawingBuffer` and without the 2D copy, the output is the same ([`verify-webcodecs-copy0.json`](../spikes/share/evidence/verify-webcodecs-copy0.json)).

## Bundle cost

Sizes are minified with esbuild and gzipped at level 9 ([`bundle-size.txt`](../spikes/share/evidence/bundle-size.txt), from `npm run size`).

| Import | gzip |
| --- | --- |
| mediabunny 1.61.6, v1 video encode (`Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, `Quality`, `canEncodeVideo`) | 50.8 KiB |
| The same, plus audio (`AudioBufferSource`, `canEncodeAudio`) | 57.5 KiB |
| The same as v1, plus MP4 read-back (`Input`, `BlobSource`, `CanvasSink`, `MP4`) | 82.8 KiB |
| mediabunny, muxer only (`Output`, `Mp4OutputFormat`, `EncodedPacketSource`) | 30.8 KiB |
| mp4-muxer 5.2.2 (MIT, deprecated in favour of mediabunny) | 8.9 KiB |
| three.js 0.186, everything, for scale | 185.6 KiB |

`src/share/` loads mediabunny with a dynamic `import()` when the busted screen opens, so it does not count against the 3 MB budget before the title screen. The game ships the 50.8 KiB entry. Its packet count comes from the encoder for free, so the read-back check stays in the spike as a device diagnostic.

**Choice.** Use mediabunny. mp4-muxer saves about 42 KiB, but it is deprecated, and it leaves encoder setup, backpressure, codec probing, and the Safari audio fixes to us.

**Licence.** mediabunny is MPL-2.0. An unmodified copy inside an MIT app is allowed, and the app stays MIT ([MPL 2.0 §3.3](https://www.mozilla.org/en-US/MPL/2.0/)). The shipped bundle must say where the MPL source is ([MPL FAQ Q8 and Q16](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)). Vite's `build.license: true` writes `.vite/license.md` with the full notice, which the spike build already does. Add a credits line that links `https://github.com/Vanilagy/mediabunny`. Do not edit mediabunny's files.

## Per-platform behaviour

Support versions come from MDN browser-compat-data 8.1.6 ([VideoEncoder](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoEncoder.json), [Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)). "Measured" means the spike ran there. "Device test" means a step in the checklist. Every row encodes video only in v1.

| Platform | Encode | Share route | Evidence |
| --- | --- | --- | --- |
| iOS Safari 17.5 and later, including 18 and 26 | WebCodecs H.264 | Share sheet with the MP4 | Sourced. Device test. |
| iOS Safari 17.2 to 17.4 | WebCodecs H.264. Output is mostly key frames, so the file is larger at the same quality ([WebKit 264893](https://bugs.webkit.org/show_bug.cgi?id=264893)). | Share sheet | Sourced. |
| iOS Safari 17.0 to 17.1 | WebCodecs H.264 with the 2D frame copy ([WebKit 255869](https://bugs.webkit.org/show_bug.cgi?id=255869)). Output is mostly key frames (WebKit 264893). | Share sheet | Sourced. The copy is untested. |
| iOS Safari 16.4 to 16.x | WebCodecs H.264 with the 2D frame copy. Some frame sizes produced no output and no error: 912x1000 failed and 1280x720 worked ([WebKit 258669](https://bugs.webkit.org/show_bug.cgi?id=258669)). 720x1280 is untested. The watchdog catches a silent failure. | Share sheet | Sourced bugs. The 720x1280 behaviour is unknown. |
| iOS Safari 14.3 to 16.3 | None, no `VideoEncoder` | X post with text and link only | Sourced. |
| X app on iOS | WebCodecs H.264 per compat data for iOS WebViews | Share sheet per compat data. Fallback hint to open in Safari. | X uses its own in-app WebView, not Safari, according to reports from late 2025 ([AppsFlyer](https://www.appsflyer.com/blog/measurement-analytics/deep-links-x-ios/)). Unverified inside X. Device test. |
| Android Chrome | WebCodecs H.264, profile ladder High, Main, Baseline | Share sheet with the MP4 | Sourced. Device test. |
| X app on Android (Android WebView) | WebCodecs H.264 | None. `navigator.share` is missing and `blob:` downloads fail. Show **Open in Chrome**. | Sourced. Whether X lets an `intent://` link out is unknown. Device test. |
| Firefox for Android | None, no `VideoEncoder` | X post with text and link only | Sourced. |
| Desktop Chrome and Edge | WebCodecs H.264 | Download plus X post | Measured on Linux in headless Chromium 156 and in the T3 preview (Chrome 154). |
| Desktop Safari | WebCodecs H.264 | Download plus X post | Sourced. |
| Desktop Firefox | WebCodecs H.264 on macOS and Windows. On Linux only with a system FFmpeg that has libx264 ([searchfox](https://searchfox.org/mozilla-central/source/dom/media/platforms/ffmpeg/FFmpegDataEncoder.cpp)). | Download plus X post | Sourced. The profile ladder decides. |

The Android X app is an Android WebView: its user agent carries the `; wv` token and `TwitterAndroid` ([user-agent log](https://roboin.io/article/en/2026/09/19/x-in-app-browser-user-agent-string/)). The same post gives `Twitter for iPhone` for iOS, but its author inferred that from logs without an iPhone. The spike detects both tokens and shows the full user agent, so device step 4 confirms or corrects the iOS token. Most players arrive from a post, so the X rows matter more than desktop Firefox.

The game reads the iOS version for the copy from the `OS 17_1` part of the user agent. In-app WebViews keep that part too (inferred, and device step 4 records the full user agent).

When a platform cannot encode H.264, the busted screen still offers the X post with the score text and the game link. It never offers a WebM, because X does not take one.

## The share step

- **Encode before the tap.** `navigator.share` needs transient user activation and rejects with `NotAllowedError` without it ([Web Share spec](https://www.w3.org/TR/2023/REC-web-share-20230530/)). WebKit's activation lasts a few seconds ([WebKit blog](https://webkit.org/blog/13862/the-user-activation-api/)). Start the encode when the busted screen opens and show progress on the Share button. In the tap handler, build nothing and await nothing before `navigator.share`.
- **Phones get the share sheet, desktops do not.** Desktop Safari, and desktop Chrome on Windows, macOS, and ChromeOS, also accept files in `navigator.share`, but their share sheets rarely reach X. Chrome on Linux has no `navigator.share`. The spike routes on `(pointer: coarse)` plus `navigator.canShare({ files })`.
- **The desktop post cannot carry the video.** X's web intent takes `text`, `url`, `hashtags`, and `via`, and no media ([X docs](https://docs.x.com/x-for-websites/post-button/guides/web-intent)). The documented URL is `https://x.com/intent/tweet?text=...&url=...`. After the download, the screen tells the player to attach `roadster-escape.mp4` from the Downloads folder.
- **The share text** carries the date, the score, and the daily-chase seed, and stays under 280 characters with the link.

## Audio

v1 ships silent clips. X's spec does not say that audio is required, and the feed autoplays muted. Device step 1 confirms that X takes a silent MP4.

Audio is possible later, in this order:

1. Safari 26 has a WebCodecs AAC encoder, and Chrome's depends on the platform. Safari 26 writes a broken AAC description that mutes the track ([WebKit 302253](https://bugs.webkit.org/show_bug.cgi?id=302253)), and mediabunny repairs it. Chromium on this Linux box has no AAC encoder: the spike's probe says `aac: false`.
2. Safari 16.4 to 18.x has no `AudioEncoder` at all. mediabunny's optional `@mediabunny/aac-encoder` is FFmpeg's AAC encoder in WebAssembly ([docs](https://mediabunny.dev/guide/extensions/aac-encoder)). It brings FFmpeg's LGPL terms ([FFmpeg legal](https://ffmpeg.org/legal.html)) and a 4.7 MB unpacked package.
3. The sound itself must come from sim events rendered into an `OfflineAudioContext` on the same replay timeline as the frames. The spike does that for a placeholder engine hum (`src/audio.ts`).

## Device tests need HTTPS

`VideoEncoder` and `navigator.share` exist only in secure contexts. On a phone, the Tailnet URL `http://hugo-agentbox-macbookpro:5104` is plain http and therefore not secure, so it can test only the capability probe and the MediaRecorder variant.

Four ways to test, best first:

1. **A Tailscale certificate (waits on Hugo).** HTTPS certificates are off for this tailnet (`tailscale status` lists no `CertDomains`). Hugo turns them on in the Tailscale admin console under DNS, then runs `sudo tailscale set --operator=hugo` once. After that, `tailscale cert hugo-agentbox-macbookpro.tail56275f.ts.net` works without sudo and gives a Let's Encrypt certificate that both phones and the X app's WebView trust. Then `SPIKE_CERT=<crt> SPIKE_KEY=<key> npm run dev:https` serves the spike with that certificate at `https://hugo-agentbox-macbookpro.tail56275f.ts.net:5105`. This route needs neither `tailscale serve` nor `tailscale funnel`.
2. **The Cloudflare preview.** Hosting is Cloudflare Workers with static assets, and every branch gets an HTTPS preview URL once Workers Builds is connected. #14 asks the engine owner to put the built spike at `/spikes/share/` on that preview. This route works inside the X app too.
3. **A self-signed certificate.** `npm run dev:https` serves `https://hugo-agentbox-macbookpro:5105`. Whether a phone treats the page as a secure context after the warning is unknown, and an in-app WebView offers no way past the warning. The capability panel shows `isSecureContext`.
4. **Plain http on the Tailnet.** Use it for the capability probe only.

A small Worker could later render a per-run Open Graph image or serve the daily seed. Neither is needed for v1.

## What the engine must expose

Each item has an `area:engine` issue.

| Issue | Need | Why the replay needs it |
| --- | --- | --- |
| #10 | `RunRecord = { simVersion, seed, actions[] }`, and a headless re-sim from it that meets its budget on a desktop and on the test phone | The video rebuilds the run instead of recording the screen. `simVersion` is for records that outlive their session later, such as a shared replay link or a daily-chase ghost. |
| #11 | `snapshot()` and `restore()`, only if the #10 re-sim misses its budget on the test phone | A shortcut for long runs. Not needed while re-sim is fast. |
| #12 | Tick-stamped `SimEvent`s: perfect dodge, wreck, near miss, bust | The busted screen picks the best moment and places the slow motion. |
| #13 | Render an interpolated sim state at any size into the existing renderer, as a pure function of sim time | Slow motion needs sub-tick sim times. One renderer avoids a second WebGL context. No wall clock keeps effects in step at any speed. |
| #14 | The built spike served at `/spikes/share/` on the Cloudflare preview | Phone and X-app tests need HTTPS. |

## Risks

| Risk | Likelihood | What happens | Mitigation |
| --- | --- | --- | --- |
| The encoder stalls or emits nothing | Sourced on Safari 16.x, unknown elsewhere | The Share button never turns on | Fail when no packet arrives for 5 s, and check the packet count. Terminate the encode Worker, retry at 576x1024, then text post. |
| X's share target on iOS or Android drops the video or the text | Unknown | The player lands in X without the clip | Device test. If X drops the text, put the score in the video's end card. |
| X enforces its API limit of 1280x1024 on app uploads | Unknown | 720x1280 is rejected | Device step 1. If it fails, switch the default to 576x1024. |
| Android X WebView cannot share or download | Sourced | No video from inside X on Android | **Open in Chrome** link through `intent://`. Copy-link as a fallback. |
| A phone encodes slowly | Unknown | The Share button waits | Measure on the device first. If needed, encode at 576x1024 at 30 fps. Keep 30 fps, which X recommends. |
| Resizing the renderer at bust time causes a stall | Possible on phones | A pause before the encode starts | The renderer and its shaders already exist. Only the drawing buffer changes size. Measure on the device. |
| Offline render repeats frames on iOS 16.4 to 17.1 | Sourced | A frozen video | The 2D frame copy on those versions only, gated on the iOS version in the user agent. |
| Render or fx code reads the wall clock | Likely without a rule | Effects freeze or jump in the replay | #13 forbids `performance.now`, `Date.now`, rAF timestamps, `THREE.Clock`, and `THREE.Timer` in `src/render/`. A lint rule can enforce it. |
| A sim change breaks an old run record | Certain once records outlive a session | An old run cannot replay | `simVersion` in the record. In v1 a replay only happens in the session that recorded it. |
| X rejects a silent MP4 | Low | No upload | Device step 1 with `evidence/sample-portrait-30fps.mp4`. Otherwise add a silent AAC track. |
| X re-encodes the upload to a lower quality | Certain | A softer clip | The 6 Mbps target gives X a clean source. |

## Device checklist

Each step waits on Hugo. On the Tailnet routes the spike uploads every result and every MP4 to `spikes/share/out/` on the box, so the share owner can run `ffprobe` on the phone's file. On the Cloudflare preview there is no upload, so take a screenshot of the **Result** and **Capabilities** panels.

1. **Desktop upload to X.** Download [`sample-portrait-30fps.mp4`](../spikes/share/evidence/sample-portrait-30fps.mp4), a silent 720x1280 H.264 High file. Attach it to a post on x.com and post it to a test account. Check that X accepts it and that it plays in the X app on both phones. This tests silent MP4s and the 1280x1024 limit.
2. **iPhone, Safari.** Open the HTTPS spike URL from [Device tests need HTTPS](#device-tests-need-https). Write down the iOS version and `isSecureContext`. Tap **Encode** with 720x1280 and 30. Check that `selfCheck.ok` is `true`, and note `wallMs`. If `ok` is `false`, note `reason`. A reason of "timed out" means only the read-back check was slow. The encode itself already passed its packet count, so carry on. Encode once more with **Copy each frame** off and note `wallMs` again. Tap **Share**, pick X, and check that the composer shows the video and the text. Post it and play it in the X app.
3. **Android, Chrome.** Repeat step 2. Also note `encoderConfig.codec`, which shows the H.264 profile the phone accepted.
4. **iPhone, inside X.** Send yourself the HTTPS URL in an X DM and open it from X. Copy the full `userAgent` from the Capabilities panel. Check whether the blue banner says `x-ios`. Repeat step 2. If Share fails, tap **open in Safari** and note what happens.
5. **Android, inside X.** Repeat step 4. The banner should say `x-android`, and Share is expected to be missing. Tap **open in Chrome** and note whether Chrome opens.
6. **Optional, 1280x720.** Repeat step 2 at 1280x720 and compare the two posts in the timeline.

## Sources

Fetched or read from search results on 2026-10-17. A source marked "search result" was seen only as a search snippet.

- X developer docs: [media best practices](https://docs.x.com/x-api/media/quickstart/best-practices) and [web intent](https://docs.x.com/x-for-websites/post-button/guides/web-intent).
- MDN browser-compat-data 8.1.6, from npm and from GitHub ([VideoEncoder](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoEncoder.json), [Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)).
- caniuse, WebCodecs, where note 1 is "Video-only support" for Safari 16.4 to 18.7 ([webcodecs.json](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/webcodecs.json)).
- WebKit bugs [255869](https://bugs.webkit.org/show_bug.cgi?id=255869), [258669](https://bugs.webkit.org/show_bug.cgi?id=258669), [264893](https://bugs.webkit.org/show_bug.cgi?id=264893), [288459](https://bugs.webkit.org/show_bug.cgi?id=288459), [299164](https://bugs.webkit.org/show_bug.cgi?id=299164), [302253](https://bugs.webkit.org/show_bug.cgi?id=302253), [198606](https://bugs.webkit.org/show_bug.cgi?id=198606), and [216918](https://bugs.webkit.org/show_bug.cgi?id=216918).
- X's in-app browser: [AppsFlyer](https://www.appsflyer.com/blog/measurement-analytics/deep-links-x-ios/) and the [roboin.io user-agent log](https://roboin.io/article/en/2026/09/19/x-in-app-browser-user-agent-string/).
- 9:16 on X: [Kapwing](https://www.kapwing.com/resources/how-to-post-videos-on-x-in-2025-vertical-video-tab/).
- MediaRecorder: [addpipe demo](https://addpipe.com/tech-demos/media-recorder-api-demo/), [addpipe on fMP4 duration](https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari.md), and [WebKit MediaRecorder post](https://webkit.org/blog/11353/mediarecorder-api/).
- Web Share: [W3C Recommendation](https://www.w3.org/TR/2023/REC-web-share-20230530/) (search result), [WebKit user activation](https://webkit.org/blog/13862/the-user-activation-api/), and [web.dev](https://web.dev/articles/web-share) (search result).
- Firefox encoders: [FFmpegDataEncoder.cpp](https://searchfox.org/mozilla-central/source/dom/media/platforms/ffmpeg/FFmpegDataEncoder.cpp) and [AppleEncoderModule.cpp](https://searchfox.org/mozilla-central/source/dom/media/platforms/apple/AppleEncoderModule.cpp).
- mediabunny: [guide](https://mediabunny.dev/guide/introduction), [media sources](https://mediabunny.dev/guide/media-sources), and [AAC encoder](https://mediabunny.dev/guide/extensions/aac-encoder). Licence: [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/) and its [FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). npm metadata through `npm view` for `mediabunny`, `mp4-muxer`, and `three`.
- Vite [build options](https://vite.dev/config/build-options), for `build.license`.
