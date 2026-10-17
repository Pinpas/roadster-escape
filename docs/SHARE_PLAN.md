# Share plan

This plan covers how the busted screen turns a run into a short video that the X app plays, and how the player shares it. It is the phase 6 design, written before the engine exists so that the engine exposes what the replay needs. The throwaway spike in [`spikes/share/`](../spikes/share/README.md) backs every measured number here.

Part of #7. Status: the encode and the desktop route are measured. The phone routes and the X app wait on device tests (see [Device checklist](#device-checklist)).

## The pipeline

1. The sim records the run as its seed plus the actions on each tick (#10).
2. On the busted screen, `src/share/` restores a sim snapshot a few seconds before the best moment (#11, #12), then steps the sim at the fixed 60 Hz step.
3. For every second sim tick, the renderer draws that state into a separate 720x1280 canvas at DPR 1 (#13). That gives 30 fps.
4. The frame is copied through a 2D canvas and handed to WebCodecs `VideoEncoder` with H.264. [mediabunny](https://mediabunny.dev/) runs the encoder and writes an MP4 with the index at the front (`fastStart: 'in-memory'`).
5. When the encode is done, the **Share** button turns on. On a phone, a tap calls `navigator.share({ files: [mp4], text })`. On a desktop, a click downloads the MP4 and opens a prepared X post.

The render runs on sim time, not on the wall clock. The encoder takes frames as fast as it can, and a slow phone produces the same video as a fast one, only later.

### Why not record the screen

`canvas.captureStream()` with `MediaRecorder` records in real time. A dropped frame stays dropped, the clip shows whatever the HUD and the screen size were, and the player waits the full clip length. The spike measured Chrome's MediaRecorder on Linux: 5.05 s of wall clock for a 5 s clip, a variable frame rate (149 frames for 150), full-range colour, and Opus audio inside the MP4. Chrome and Safari also write fragmented MP4s with zero duration in the header ([addpipe](https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari.md)). iOS had MediaRecorder MP4 bugs in 18.4 betas and in 26.0 ([WebKit 288459](https://bugs.webkit.org/show_bug.cgi?id=288459), [WebKit 299164](https://bugs.webkit.org/show_bug.cgi?id=299164)). Every browser that lacks `VideoEncoder` also lacks a useful MP4 recorder, so MediaRecorder is not a fallback worth shipping. The spike keeps it as a switchable variant for comparison.

## Output format

| Property | Value | Reason |
| --- | --- | --- |
| Container | MP4, `moov` before `mdat` | X takes MP4 or MOV ([sendcove](https://www.sendcove.app/integrations/twitter/video-specs), third party). Front index plays before it fully downloads. |
| Video | H.264 High, level 3.1 (`avc1.64001f`), `yuv420p` | X needs H.264. mediabunny picks the profile and level. |
| Size | 720x1280 (9:16) | 9:16 fills the screen in X's phone video tab, and 16:9 shows small there ([Kapwing](https://www.kapwing.com/resources/how-to-post-videos-on-x-in-2025-vertical-video-tab/)). On Safari 16.4 to 17.0, H.264 frames larger than 1280x720 produced no output and no error, while 1280x720 worked ([WebKit 258669](https://bugs.webkit.org/show_bug.cgi?id=258669)). |
| Frame rate | 30 fps | Half the encode time and half the file of 60 fps. Level 3.1 allows 720p only up to 30 fps, and mediabunny still labels a 60 fps encode 3.1. |
| Bitrate | VBR, 6 Mbps ceiling, key frame every 1 s | X allows up to 25 Mbps (third party). The flat-shaded spike scene used 2.3 Mbps of the 6 Mbps ceiling. |
| Length | 5 to 8 s | The design's "five-second clip". 8 s at the ceiling is 6 MB at most. |
| Audio | None in v1 | See [Audio](#audio). |

## Measured on the box

Hardware: MacBook Pro 2020, Intel i5 with Iris Plus 645, headless Chromium 156 with WebGL on the real GPU through ANGLE and Vulkan. The probe reports no hardware H.264 encoder, so these numbers come from Chromium's software encoder. Each number is the median of 5 runs with the configs alternated, at a load average of 2.9 to 5.0. Raw runs are in [`bench-runs.json`](../spikes/share/evidence/bench-runs.json).

| Clip, 5 s | Encode wall time (range) | Render share | MP4 size |
| --- | --- | --- | --- |
| 720x1280, 30 fps | 1.16 s (1.00 to 1.60) | 0.10 s | 1.43 MB |
| 1280x720, 30 fps | 1.22 s (1.07 to 3.15) | 0.08 s | 1.58 MB |
| 720x1280, 30 fps, no 2D copy | 1.12 s (1.10 to 1.36) | 0.10 s | 1.43 MB |
| 720x1280, 60 fps | 2.20 s (2.05 to 3.35) | 0.18 s | 2.46 MB |

- **The encoder is the limit.** Rendering takes under 10% of the wall time. Rendering plus `VideoFrame` creation alone takes 0.08 to 0.14 s for 150 frames. 60 fps costs 1.9 times as much as 30 fps, which is linear in the frame count.
- **The 2D frame copy costs nothing measurable.** Its ranges overlap the no-copy runs, so the copy stays on as protection for Safari 16.4 to 17.1.
- **The T3 preview browser is much slower.** It renders WebGL in software (SwiftShader) at DPR 2 and took 6.6 s for one 720x1280 clip (one run).
- **Phones are not measured yet.** Phones encode H.264 in hardware, so the encode may be faster than here, but a phone renders slower. That is a guess until the device checklist runs. The spike's result panel reports `wallMs` on the phone.

Every output was checked with `ffprobe -count_frames` and a full `ffmpeg` decode: H.264 High, 150 of 150 frames, 5.000 s, no decode errors ([`ffprobe.txt`](../spikes/share/evidence/ffprobe.txt)). A decoded frame at 2.5 s matches the canvas at 43 dB PSNR. The spike also reads its own MP4 back in the browser and checks the packet count and that sampled frames differ ([`verify-results.json`](../spikes/share/evidence/verify-results.json)).

## Bundle cost

Sizes are minified with esbuild and gzipped at level 9 (`npm run size` in the spike).

| Import | gzip |
| --- | --- |
| mediabunny 1.61.6, the parts the pipeline uses (`Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, `canEncodeVideo`, plus `AudioBufferSource`) | 57.5 KiB |
| mediabunny, muxer only (`Output`, `Mp4OutputFormat`, `EncodedPacketSource`) | 30.8 KiB |
| mp4-muxer 5.2.2 (MIT, deprecated in favour of mediabunny) | 8.9 KiB |
| three.js 0.186, everything, for scale | 185.6 KiB |

`src/share/` loads mediabunny with a dynamic `import()` when the busted screen opens, so it does not count against the 3 MB budget before the title screen. mediabunny's own size table (17.3 kB for MP4 writing, measured 2025-06-22) is out of date. Sample conversion, codec-string parsing, and the resampler make up most of the 57.5 KiB.

**Choice.** Use mediabunny. mp4-muxer saves about 49 KiB but is deprecated, and it leaves encoder setup, backpressure, codec probing, and the Safari audio workarounds to us. The 49 KiB loads only on the busted screen.

**Licence.** mediabunny is MPL-2.0. An unmodified copy inside an MIT app is allowed, and the app stays MIT ([MPL 2.0 §3.3](https://www.mozilla.org/en-US/MPL/2.0/)). The shipped bundle must say where the MPL source is ([MPL FAQ Q8 and Q16](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)). Vite's `build.license: true` writes `.vite/license.md` with the full notice, which the spike build already does. Add a credits line that links `https://github.com/Vanilagy/mediabunny`. Do not edit mediabunny's files.

## Per-platform behaviour

Support versions come from MDN browser-compat-data 8.1.6 ([VideoEncoder](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoEncoder.json), [Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)). "Measured" means the spike ran there. "Device test" means a step in the checklist.

| Platform | Encode | Share route | Evidence |
| --- | --- | --- | --- |
| iOS Safari 17.2 and later, including 26 | WebCodecs H.264, video only | Share sheet with the MP4 | Sourced. Device test. |
| iOS Safari 16.4 to 17.1 | WebCodecs H.264 with the 2D frame copy. 720p at most. | Share sheet | Sourced bugs: repeated frames ([WebKit 255869](https://bugs.webkit.org/show_bug.cgi?id=255869)), silent failure above 720p ([WebKit 258669](https://bugs.webkit.org/show_bug.cgi?id=258669)), mostly-key-frame output on 17.0 to 17.4 ([WebKit 264893](https://bugs.webkit.org/show_bug.cgi?id=264893)). |
| iOS Safari before 16.4 | None | X post with text and link only | Sourced. |
| X app on iOS (WKWebView since X 11.42) | WebCodecs H.264 per compat data | Share sheet per compat data. Fallback hint to open in Safari. | Untested inside X. Device test. |
| Android Chrome | WebCodecs H.264 | Share sheet with the MP4 | Sourced. Device test. |
| X app on Android (Android WebView) | WebCodecs H.264 | None. `navigator.share` is missing and `blob:` downloads fail. Show **Open in Chrome**. | Sourced. Whether X lets an `intent://` link out is unknown. Device test. |
| Firefox for Android | None, no `VideoEncoder` | X post with text and link only | Sourced. |
| Desktop Chrome and Edge | WebCodecs H.264 | Download plus X post | Measured on Linux headless Chromium 156 and in the T3 preview (Chrome 154). |
| Desktop Safari | WebCodecs H.264 | Download plus X post | Sourced. |
| Desktop Firefox | WebCodecs H.264 on macOS and Windows. On Linux only with a system FFmpeg that has libx264 ([searchfox](https://searchfox.org/mozilla-central/source/dom/media/platforms/ffmpeg/FFmpegDataEncoder.cpp)). | Download plus X post | Sourced. Gate on `canEncodeVideo('avc')`. |

The X app's in-app browser was SFSafariViewController on iOS until late 2025. It is now an app-owned WKWebView, and the Android app uses Android WebView ([AppsFlyer](https://www.appsflyer.com/blog/measurement-analytics/deep-links-x-ios/), [user-agent log](https://roboin.io/article/en/2026/09/19/x-in-app-browser-user-agent-string/)). Detect them with `Twitter for iPhone` and `TwitterAndroid` in the user agent. Most players arrive from a post, so this row matters more than desktop Firefox.

When a platform cannot encode H.264, the busted screen still offers the X post with the score text and the game link. It never offers a WebM, because X does not take one.

## The share step

- **Encode before the tap.** `navigator.share` needs transient user activation and rejects with `NotAllowedError` without it ([Web Share spec](https://www.w3.org/TR/2023/REC-web-share-20230530/)). WebKit's activation lasts a few seconds ([WebKit blog](https://webkit.org/blog/13862/the-user-activation-api/)). Start the encode when the busted screen opens and show progress on the Share button. In the tap handler, build nothing and await nothing before `navigator.share`.
- **Phones get the share sheet, desktops do not.** Desktop Safari and desktop Chrome also accept files in `navigator.share`, but their share sheets rarely reach X. The spike routes on `(pointer: coarse)` plus `navigator.canShare({ files })`.
- **The desktop post cannot carry the video.** X's web intent takes `text`, `url`, `hashtags`, and `via`, and no media ([X docs](https://docs.x.com/x-for-websites/post-button/guides/web-intent)). The documented URL is `https://x.com/intent/tweet?text=...&url=...`. After the download, the screen tells the player to attach `roadster-escape.mp4` from the Downloads folder.
- **The share text** carries the date, the score, and the daily-chase seed, and stays under 280 characters with the link.

## Audio

v1 ships silent clips. One third-party guide says X accepts MP4s without an audio track ([sendcove](https://www.sendcove.app/integrations/twitter/video-specs)), and the feed autoplays muted. The device checklist confirms it on both phones.

Audio is possible later, in this order:

1. Safari 26 and Chrome have a WebCodecs AAC encoder. Safari 26 writes a broken AAC description that mutes the track ([WebKit 302253](https://bugs.webkit.org/show_bug.cgi?id=302253)), and mediabunny repairs it. Chromium on this Linux box has no AAC encoder. The spike's probe says `aac: false` in both headless Chromium 156 and the T3 preview's Chrome 154.
2. Safari 16.4 to 18.x has no `AudioEncoder` at all. mediabunny's optional `@mediabunny/aac-encoder` is FFmpeg's AAC encoder in WebAssembly ([docs](https://mediabunny.dev/guide/extensions/aac-encoder)). It brings FFmpeg's LGPL terms ([FFmpeg legal](https://ffmpeg.org/legal.html)) and a 4.7 MB unpacked package.
3. The sound itself must come from sim events rendered into an `OfflineAudioContext`, the same way the frames come from sim time. The spike does that for a placeholder engine hum (`src/audio.ts`).

## Device tests need HTTPS

`VideoEncoder` and `navigator.share` exist only in secure contexts. On a phone, the Tailnet URL `http://hugo-agentbox-macbookpro:5104` is plain http and therefore not secure, so it can test only the capability probe and the MediaRecorder variant. The tailnet has no HTTPS certificates (`tailscale status` lists no `CertDomains`), and `tailscale serve` is off-limits on this box.

Three ways to test, best first:

1. **The Cloudflare preview.** Hosting is Cloudflare Workers with static assets, and every branch gets an HTTPS preview URL once Workers Builds is connected. #14 asks the engine owner to put the built spike at `/spikes/share/` on that preview. This is the only route that works inside the X app, because an in-app WebView offers no way past a certificate warning.
2. **A self-signed certificate on the Tailnet.** `npm run dev:https` serves `https://hugo-agentbox-macbookpro:5105`. Whether a phone treats the page as a secure context after the warning is unknown. The capability panel shows `isSecureContext`.
3. **Plain http on the Tailnet.** Use it for the capability probe only.

A small Worker could later render a per-run Open Graph image or serve the daily seed. Neither is needed for v1.

## What the engine must expose

Each item has an `area:engine` issue.

| Issue | Need | Why the replay needs it |
| --- | --- | --- |
| #10 | `RunRecord = { simVersion, seed, actions[] }`, and a headless re-sim from it | The video rebuilds the run instead of recording the screen. |
| #11 | `snapshot()` and `restore()` for the sim state | The replay starts a few seconds before the best moment without re-simulating from tick 0. |
| #12 | Tick-stamped `SimEvent`s: perfect dodge, wreck, near miss, bust | The busted screen picks the best moment, and later the replay's sound and camera cuts. |
| #13 | `renderFrame(target, state, simTime, camera)` with no wall-clock reads in `src/render/` | Frames render faster than real time into a 720x1280 canvas, and every effect advances on sim time. |
| #14 | The built spike served at `/spikes/share/` on the Cloudflare preview | Phone and X-app tests need HTTPS. |

## Risks

| Risk | Likelihood | What happens | Mitigation |
| --- | --- | --- | --- |
| X's share target on iOS or Android drops the video or the text | Unknown | The player lands in X without the clip | Device test. If X drops the text, put the score in the video's end card. |
| Android X WebView cannot share or download | Sourced | No video from inside X on Android | **Open in Chrome** link through `intent://`. Copy-link as a fallback. |
| A phone encodes slowly | Unknown | The Share button waits | Encode while the on-screen replay plays. Fall back to 20 fps or 540x960 when the first 30 frames take longer than 2 s. |
| Offline render repeats frames on iOS 16.4 to 17.1 | Sourced | A frozen video | The 2D frame copy. The on-device self-check counts distinct frames. |
| Render or fx code reads the wall clock | Likely without a rule | Effects freeze or jump in the replay | #13 forbids it. A lint rule can ban `performance.now` in `src/render/`. |
| A sim change breaks old run records | Certain over time | An old run cannot replay | `simVersion` in the record. Replays only happen on the busted screen of the same session. |
| X rejects a silent MP4 | Low, third-party source says no | No upload | Device test with `evidence/sample-portrait-30fps.mp4`. Otherwise add a silent AAC track. |
| X re-encodes the upload to a lower quality | Certain | A softer clip | The 6 Mbps ceiling gives X a clean source. |

## Device checklist

Each step waits on Hugo. The spike uploads every result and every MP4 to `spikes/share/out/` on the box when it runs from the Tailnet, so the share owner can run `ffprobe` on the phone's file. On the Cloudflare preview there is no upload, so take a screenshot of the **Result** and **Capabilities** panels.

1. **Desktop upload to X.** Download [`sample-portrait-30fps.mp4`](../spikes/share/evidence/sample-portrait-30fps.mp4). Attach it to a post on x.com and post it to a test account. Check that it plays in the X app on both phones. This proves X takes a silent H.264 High 3.1 MP4.
2. **iPhone, Safari.** Open the HTTPS spike URL (the Cloudflare preview once #14 lands, or `https://hugo-agentbox-macbookpro:5105` after you accept the warning). Write down the iOS version and `isSecureContext`. Tap **Encode** with 720x1280 and 30. Check that `selfCheck.ok` is `true`, and note `wallMs`. Tap **Share**, pick X, and check that the composer shows the video and the text. Post it and play it in the X app.
3. **Android, Chrome.** Repeat step 2.
4. **iPhone, inside X.** Send yourself the Cloudflare preview URL in an X DM and open it from X. Check that the blue banner says `x-ios`. Repeat step 2. If Share fails, tap **open in Safari** and note what happens.
5. **Android, inside X.** Repeat step 4. The banner says `x-android`. Share is expected to be missing. Tap **open in Chrome** and note whether Chrome opens.
6. **Optional, 1280x720.** Repeat step 2 at 1280x720 and compare the two posts in the timeline.

## Sources

Fetched or read from search results on 2026-10-17. A source marked "search result" was seen only as a search snippet.

- MDN browser-compat-data 8.1.6, from npm and from GitHub ([VideoEncoder](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoEncoder.json), [Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)).
- caniuse, WebCodecs, where note 1 is "Video-only support" for Safari 16.4 to 18.7 ([webcodecs.json](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/webcodecs.json)).
- WebKit bugs [255869](https://bugs.webkit.org/show_bug.cgi?id=255869), [258669](https://bugs.webkit.org/show_bug.cgi?id=258669), [264893](https://bugs.webkit.org/show_bug.cgi?id=264893), [264894](https://bugs.webkit.org/show_bug.cgi?id=264894), [288459](https://bugs.webkit.org/show_bug.cgi?id=288459), [299164](https://bugs.webkit.org/show_bug.cgi?id=299164), [302253](https://bugs.webkit.org/show_bug.cgi?id=302253), [198606](https://bugs.webkit.org/show_bug.cgi?id=198606), and [216918](https://bugs.webkit.org/show_bug.cgi?id=216918).
- X developer docs, [Web intent](https://docs.x.com/x-for-websites/post-button/guides/web-intent).
- X video limits, third party: [sendcove](https://www.sendcove.app/integrations/twitter/video-specs) (search result) and [postfa.st](https://postfa.st/sizes/x/video) (search result).
- X's in-app browser: [AppsFlyer](https://www.appsflyer.com/blog/measurement-analytics/deep-links-x-ios/), [roboin.io user-agent log](https://roboin.io/article/en/2026/09/19/x-in-app-browser-user-agent-string/), and the [X developer forum thread](https://devcommunity.x.com/t/issue-regarding-deep-links-failing-due-to-in-app-browser-changes-in-x-for-ios/252070) (search result).
- 9:16 on X: [Kapwing](https://www.kapwing.com/resources/how-to-post-videos-on-x-in-2025-vertical-video-tab/).
- MediaRecorder: [addpipe demo](https://addpipe.com/tech-demos/media-recorder-api-demo/), [addpipe on fMP4 duration](https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari.md), and [WebKit MediaRecorder post](https://webkit.org/blog/11353/mediarecorder-api/).
- Web Share: [W3C Recommendation](https://www.w3.org/TR/2023/REC-web-share-20230530/) (search result), [WebKit user activation](https://webkit.org/blog/13862/the-user-activation-api/), and [web.dev](https://web.dev/articles/web-share) (search result).
- Firefox encoders: [FFmpegDataEncoder.cpp](https://searchfox.org/mozilla-central/source/dom/media/platforms/ffmpeg/FFmpegDataEncoder.cpp) and [AppleEncoderModule.cpp](https://searchfox.org/mozilla-central/source/dom/media/platforms/apple/AppleEncoderModule.cpp).
- mediabunny: [guide](https://mediabunny.dev/guide/introduction), [media sources](https://mediabunny.dev/guide/media-sources), and [AAC encoder](https://mediabunny.dev/guide/extensions/aac-encoder). Licence: [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/) and its [FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). npm metadata through `npm view` for `mediabunny`, `mp4-muxer`, and `three`.
- Vite [build options](https://vite.dev/config/build-options), for `build.license`.
