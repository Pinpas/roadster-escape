/** Automation points: [seconds after the voice starts, value]. Values must stay above 0. */
export type Glide = readonly (readonly [number, number])[];

export interface FilterSpec {
  readonly type: BiquadFilterType;
  /** Hz, fixed or gliding. */
  readonly hz: number | Glide;
  readonly q?: number;
}

interface VoiceSpec {
  /** Context time the voice starts. */
  readonly at: number;
  /** Seconds until the envelope has died away. */
  readonly dur: number;
  readonly gain: number;
  readonly attack?: number;
  /** Seconds the peak holds before the decay. */
  readonly hold?: number;
  readonly filter?: FilterSpec;
  /** Parallel band-pass peaks after the filter, for vowel-like sounds. */
  readonly formants?: readonly number[];
  readonly bus?: 'sfx' | 'music';
}

export interface ToneSpec extends VoiceSpec {
  readonly wave: OscillatorType;
  /** Hz, fixed or gliding. */
  readonly hz: number | Glide;
  readonly vibrato?: { readonly rate: number; readonly depth: number };
  readonly detune?: number;
}

export type NoiseSpec = VoiceSpec;

/** A playing sound that can be cut short. */
export interface Voice {
  fade(seconds: number): void;
}

const SILENT = 0.0001;
/** Voices alive at once; past this, new sounds are dropped rather than piling up nodes. */
const MAX_LIVE = 40;
const NOOP_VOICE: Voice = { fade: () => undefined };

function automate(param: AudioParam, value: number | Glide, at: number): void {
  if (typeof value === 'number') {
    param.setValueAtTime(value, at);
    return;
  }
  const [first] = value;
  if (!first) return;
  param.setValueAtTime(first[1], at);
  for (const [offset, target] of value) param.exponentialRampToValueAtTime(target, at + offset);
}

/** Builds short-lived synth voices and cleans each one up when it ends. */
export class Synth {
  private live = 0;
  private budget = 0;

  constructor(
    readonly ctx: AudioContext,
    private readonly sfx: AudioNode,
    private readonly music: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Caps how many voices the caller may start before the next call. */
  allow(voices: number): void {
    this.budget = voices;
  }

  tone(spec: ToneSpec): Voice {
    if (!this.claim()) return NOOP_VOICE;
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    automate(osc.frequency, spec.hz, spec.at);
    if (spec.detune !== undefined) osc.detune.value = spec.detune;
    const nodes: AudioNode[] = [osc];
    const end = spec.at + spec.dur + 0.03;
    if (spec.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = spec.vibrato.rate;
      depth.gain.value = spec.vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(spec.at);
      lfo.stop(end);
      nodes.push(lfo, depth);
    }
    osc.start(spec.at);
    return this.finish(osc, nodes, spec, end);
  }

  noiseBurst(spec: NoiseSpec): Voice {
    if (!this.claim()) return NOOP_VOICE;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.start(spec.at, Math.random() * this.noise.duration);
    return this.finish(source, [source], spec, spec.at + spec.dur + 0.03);
  }

  private claim(): boolean {
    if (this.budget <= 0 || this.live >= MAX_LIVE) return false;
    this.budget -= 1;
    this.live += 1;
    return true;
  }

  private finish(
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
    spec: VoiceSpec,
    end: number,
  ): Voice {
    const { ctx } = this;
    let tail: AudioNode = source;
    if (spec.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = spec.filter.type;
      filter.Q.value = spec.filter.q ?? 1;
      automate(filter.frequency, spec.filter.hz, spec.at);
      tail = tail.connect(filter);
      nodes.push(filter);
    }
    const envelope = ctx.createGain();
    nodes.push(envelope);
    if (spec.formants) {
      for (const hz of spec.formants) {
        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.value = hz;
        formant.Q.value = 5;
        tail.connect(formant).connect(envelope);
        nodes.push(formant);
      }
    } else {
      tail.connect(envelope);
    }

    const peakAt = spec.at + (spec.attack ?? 0.005);
    const gain = envelope.gain;
    gain.setValueAtTime(0, spec.at);
    gain.linearRampToValueAtTime(spec.gain, peakAt);
    if (spec.hold !== undefined) gain.setValueAtTime(spec.gain, peakAt + spec.hold);
    gain.exponentialRampToValueAtTime(SILENT, spec.at + spec.dur);
    envelope.connect(spec.bus === 'music' ? this.music : this.sfx);

    source.stop(end);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      this.live -= 1;
    };
    return {
      fade: (seconds) => {
        const now = ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + seconds);
      },
    };
  }
}
