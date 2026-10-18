import type { SimEvent, World } from '../sim/runner';
import { Chase } from './chase';
import { Music } from './music';
import * as sfx from './sfx';
import { Synth, type Voice } from './synth';
import { DONUT_SCALE, nextDonutStep } from './tuning';

/** Game sound, synthesised with WebAudio; every method is a no-op until `unlock` succeeds. */
export interface Audio {
  /** Read once at startup for the mute button's initial state. */
  readonly muted: boolean;
  /** Call inside the user gesture that starts a run: creates or resumes the AudioContext. */
  unlock(): void;
  setPhase(phase: 'title' | 'playing' | 'busted'): void;
  /** The events of one sim step, while playing. */
  play(events: readonly SimEvent[], world: World): void;
  /** Once per rendered frame while playing: siren, engine and the music clock. */
  update(world: World): void;
  /** Returns the new muted state and stores it. */
  toggleMute(): boolean;
}

type Phase = 'title' | 'playing' | 'busted';

const MUTED_KEY = 'roadster-escape.muted';
const MASTER = 0.85;
const MUSIC = 0.42;
/** Voices one sim step or one frame may start; the music lookahead can need a few more. */
const VOICES_PER_STEP = 14;
const VOICES_PER_FRAME = 18;

interface Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly effects: GainNode;
  readonly music: GainNode;
  readonly synth: Synth;
  readonly score: Music;
}

type AudioContextClass = typeof AudioContext;

function createContext(): AudioContext | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Context) return undefined;
  try {
    return new Context({ latencyHint: 'interactive' });
  } catch {
    return undefined;
  }
}

function build(ctx: AudioContext, muted: boolean): Engine {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  limiter.connect(master).connect(ctx.destination);

  const effects = ctx.createGain();
  effects.gain.value = 0.9;
  effects.connect(limiter);
  const music = ctx.createGain();
  music.gain.value = 0;
  music.connect(limiter);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;

  const synth = new Synth(ctx, effects, music, noise);
  return { ctx, master, effects, music, synth, score: new Music(synth) };
}

/** iOS only unlocks output after a sound starts inside the gesture. */
function primeOutput(ctx: AudioContext): void {
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  source.connect(ctx.destination);
  source.onended = () => {
    source.disconnect();
  };
  source.start();
}

function resume(ctx: AudioContext): void {
  if (ctx.state === 'running') return;
  ctx.resume().catch(() => undefined);
}

function readMuted(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Builds the game's sound; nothing touches WebAudio before `unlock`. */
export function createAudio(storage: Pick<Storage, 'getItem' | 'setItem'>): Audio {
  let muted = readMuted(storage);
  let phase: Phase = 'title';
  let engine: Engine | undefined;
  let chase: Chase | undefined;
  let boostVoices: Voice[] = [];
  let donutStep = 0;
  let lastDonutAt = -Infinity;
  let lastClearAt = -Infinity;

  const live = (): Engine | undefined =>
    engine && engine.ctx.state === 'running' ? engine : undefined;

  const cutBoost = (seconds: number): void => {
    for (const voice of boostVoices) voice.fade(seconds);
    boostVoices = [];
  };

  const startRun = (e: Engine): void => {
    chase?.stop(0.05);
    chase = new Chase(e.ctx, e.effects);
    e.music.gain.cancelScheduledValues(e.ctx.currentTime);
    e.music.gain.setTargetAtTime(MUSIC, e.ctx.currentTime, 0.05);
    e.score.restart();
    donutStep = 0;
    lastDonutAt = -Infinity;
  };

  const endRun = (e: Engine, seconds: number): void => {
    chase?.stop(seconds);
    chase = undefined;
    cutBoost(0.1);
    e.music.gain.cancelScheduledValues(e.ctx.currentTime);
    e.music.gain.setTargetAtTime(0, e.ctx.currentTime, seconds / 4);
  };

  const onVisibility = (): void => {
    if (!engine) return;
    if (document.hidden) engine.ctx.suspend().catch(() => undefined);
    else resume(engine.ctx);
  };

  const playEvent = (e: Engine, event: SimEvent, at: number, caught: boolean): void => {
    const s = e.synth;
    switch (event.kind) {
      case 'jump':
        sfx.jump(s, at);
        return;
      case 'land':
        sfx.land(s, at);
        return;
      case 'lane':
        sfx.lane(s, at);
        return;
      case 'boost':
        cutBoost(0.05);
        boostVoices = sfx.boost(s, at);
        return;
      case 'boostEnd':
        cutBoost(0.15);
        sfx.boostEnd(s, at);
        return;
      case 'ramp':
        sfx.ramp(s, at);
        return;
      case 'smash':
        sfx.smash(s, at, event.thing);
        return;
      case 'crash':
        sfx.crash(s, at, event.thing, caught);
        return;
      case 'clear':
        if (at - lastClearAt < 0.08) return;
        lastClearAt = at;
        sfx.clear(s, at, event.thing);
        return;
      case 'donut': {
        if (at - lastDonutAt < 0.04) return;
        donutStep = nextDonutStep(donutStep, at - lastDonutAt);
        lastDonutAt = at;
        sfx.donut(s, at, DONUT_SCALE[donutStep] ?? 0);
        return;
      }
      case 'power':
        sfx.power(s, at, event.power);
        return;
      case 'levelUp':
        sfx.levelUp(s, at);
        return;
      case 'busted':
        cutBoost(0.1);
        sfx.busted(s, at + 0.15);
        return;
    }
  };

  return {
    get muted() {
      return muted;
    },

    unlock() {
      if (!engine) {
        const ctx = createContext();
        if (!ctx) return;
        engine = build(ctx, muted);
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibility);
        }
      }
      try {
        primeOutput(engine.ctx);
      } catch {
        // A closed context cannot play; the game stays silent.
      }
      resume(engine.ctx);
    },

    setPhase(next) {
      phase = next;
      if (!engine) return;
      if (next === 'playing') startRun(engine);
      else endRun(engine, next === 'busted' ? 0.4 : 0.2);
    },

    play(events, world) {
      const e = live();
      if (!e || muted || phase !== 'playing') return;
      e.synth.allow(VOICES_PER_STEP);
      const at = e.ctx.currentTime + 0.01;
      const caught = world.busted;
      const seen = new Set<string>();
      for (const event of events) {
        if (event.kind !== 'donut' && seen.has(event.kind)) continue;
        seen.add(event.kind);
        playEvent(e, event, at, caught);
      }
    },

    update(world) {
      const e = live();
      if (!e || phase !== 'playing') return;
      chase?.update(world);
      e.synth.allow(VOICES_PER_FRAME);
      e.score.schedule(world.level, muted);
    },

    toggleMute() {
      muted = !muted;
      try {
        storage.setItem(MUTED_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be blocked; the toggle still works for this visit.
      }
      if (engine) {
        const now = engine.ctx.currentTime;
        engine.master.gain.cancelScheduledValues(now);
        engine.master.gain.setTargetAtTime(muted ? 0 : MASTER, now, 0.02);
        if (!muted) resume(engine.ctx);
      }
      return muted;
    },
  };
}
