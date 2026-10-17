import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { renderReplayAudio } from './audio';
import type { FrameSize, ReplayRenderer } from './scene';

export type EncodePath = 'webcodecs' | 'mediarecorder';

export type EncodeJob = {
  size: FrameSize;
  fps: 30 | 60;
  seconds: number;
  audio: boolean;
  videoBitrate: number;
  avcCodec?: string;
  // Safari 16.4 to about 17.1 read the composited WebGL frame instead of the drawing
  // buffer, so offline frames repeat. A 2D copy hands the encoder the real pixels.
  copyFrame: boolean;
};

export type Encoded = {
  path: EncodePath;
  blob: Blob;
  mime: string;
  videoCodec: string;
  audioCodec: string | null;
  encoderConfig: VideoEncoderConfig | null;
  frames: number;
  wallMs: number;
  renderMs: number;
  // X takes MP4 with H.264; anything else needs a different route.
  xSafe: boolean;
};

const RECORDER_MIMES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// mediabunny asks only for High profile. Android requires only Baseline from hardware
// encoders, so walk down the profiles before giving up on video.
const AVC_PROFILES = { high: '6400', main: '4d00', constrainedBaseline: '42e0' } as const;

// A stalled encoder never resolves add() or finalize(); give up instead of leaving
// the Share button off forever.
const STALL_MS = 5000;

export async function pickAvcCodec(size: FrameSize, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const level = fps > 30 ? '20' : '1f';
  for (const profile of Object.values(AVC_PROFILES)) {
    const fullCodecString = `avc1.${profile}${level}`;
    if (await canEncodeVideo('avc', { ...size, frameRate: fps, fullCodecString })) return fullCodecString;
  }
  return null;
}

// Fails when the encoder emits no packet for STALL_MS. mediabunny ignores cancel() once
// finalize() has started, so a stall in the flush only abandons the output here; the
// game runs the encode in a Worker it can terminate.
function packetWatchdog() {
  let lastPacket = performance.now();
  let timer = 0;
  const stalled = new Promise<never>((_, reject) => {
    timer = window.setInterval(() => {
      if (performance.now() - lastPacket < STALL_MS) return;
      clearInterval(timer);
      reject(new Error(`EncoderStalled: no packet for ${STALL_MS} ms`));
    }, 250);
  });
  stalled.catch(() => {});
  return {
    packet: () => (lastPacket = performance.now()),
    guard: <T>(p: Promise<T>) => Promise.race([p, stalled]),
    stop: () => clearInterval(timer),
  };
}

export function recorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return RECORDER_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export async function choosePath(size: FrameSize, fps: number): Promise<{ path: EncodePath; avcCodec?: string } | null> {
  const avcCodec = await pickAvcCodec(size, fps);
  if (avcCodec) return { path: 'webcodecs', avcCodec };
  return recorderMime() ? { path: 'mediarecorder' } : null;
}

export async function encode(path: EncodePath, job: EncodeJob, renderer: ReplayRenderer): Promise<Encoded> {
  return path === 'webcodecs' ? encodeWebCodecs(job, renderer) : encodeMediaRecorder(job, renderer);
}

async function encodeWebCodecs(job: EncodeJob, renderer: ReplayRenderer): Promise<Encoded> {
  const start = performance.now();
  const fullCodecString = job.avcCodec ?? (await pickAvcCodec(job.size, job.fps));
  if (!fullCodecString) throw new Error('No H.264 profile encodes this size');
  renderer.setSize(job.size);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });

  let videoCodec = 'avc';
  let encoderConfig: VideoEncoderConfig | null = null;
  let packets = 0;
  const watchdog = packetWatchdog();
  const copy = job.copyFrame ? Object.assign(document.createElement('canvas'), job.size) : null;
  const copyCtx = copy?.getContext('2d') ?? null;
  const video = new CanvasSource(copy ?? renderer.canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: job.videoBitrate }),
    keyFrameInterval: 1,
    latencyMode: 'quality',
    fullCodecString,
    onEncodedPacket: () => {
      packets++;
      watchdog.packet();
    },
    onEncoderConfig: (c) => {
      videoCodec = c.codec;
      encoderConfig = c;
    },
  });
  output.addVideoTrack(video, { frameRate: job.fps });

  let audio: AudioBufferSource | null = null;
  let audioCodec: string | null = null;
  if (job.audio && (await canEncodeAudio('aac'))) {
    audio = new AudioBufferSource({
      codec: 'aac',
      quality: new Quality({ bitrate: 128_000 }),
      onEncoderConfig: (c) => (audioCodec = c.codec),
    });
    output.addAudioTrack(audio);
  }

  const frames = Math.round(job.seconds * job.fps);
  let renderMs = 0;
  try {
    await output.start();
    for (let i = 0; i < frames; i++) {
      const t = i / job.fps;
      const r0 = performance.now();
      renderer.renderAt(t);
      copyCtx?.drawImage(renderer.canvas, 0, 0);
      renderMs += performance.now() - r0;
      await watchdog.guard(video.add(t, 1 / job.fps));
    }
    if (audio) await audio.add(await renderReplayAudio(job.seconds));
    await watchdog.guard(output.finalize());
  } catch (e) {
    void output.cancel();
    throw e;
  } finally {
    watchdog.stop();
  }
  if (packets !== frames) throw new Error(`EncoderDroppedFrames: ${packets} of ${frames} frames encoded`);

  const blob = new Blob([target.buffer!], { type: 'video/mp4' });
  return {
    path: 'webcodecs',
    blob,
    mime: 'video/mp4',
    videoCodec,
    audioCodec,
    encoderConfig,
    frames,
    wallMs: performance.now() - start,
    renderMs,
    xSafe: videoCodec.startsWith('avc1'),
  };
}

async function encodeMediaRecorder(job: EncodeJob, renderer: ReplayRenderer): Promise<Encoded> {
  const mime = recorderMime();
  if (!mime) throw new Error('MediaRecorder has no usable video type');
  const start = performance.now();
  renderer.setSize(job.size);
  renderer.renderAt(0);

  const stream = renderer.canvas.captureStream(job.fps);
  let audioCtx: AudioContext | null = null;
  // Chrome records Opus into MP4 when AAC is missing; X expects AAC, so drop audio instead.
  const aacInMp4 = /mp4a/.test(mime);
  if (job.audio && aacInMp4) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource();
    src.buffer = await renderReplayAudio(job.seconds, audioCtx.sampleRate);
    src.connect(dest);
    src.start();
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: job.videoBitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  // Real-time capture: wall clock drives the timeline, so a slow frame is a dropped frame.
  let renderMs = 0;
  let frames = 0;
  recorder.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= job.seconds) return resolve();
      const r0 = performance.now();
      renderer.renderAt(t);
      renderMs += performance.now() - r0;
      frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  await audioCtx?.close();

  const type = recorder.mimeType || mime;
  return {
    path: 'mediarecorder',
    blob: new Blob(chunks, { type }),
    mime: type,
    videoCodec: type,
    audioCodec: job.audio && aacInMp4 ? type : null,
    encoderConfig: null,
    frames,
    wallMs: performance.now() - start,
    renderMs,
    xSafe: type.startsWith('video/mp4') && !/opus|vp0?[89]/.test(type),
  };
}
