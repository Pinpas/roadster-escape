import type { World } from '../sim/runner';
import { sirenLevel } from './tuning';

const SIREN_GAIN = 0.15;
const SIREN_HZ: readonly [number, number] = [960, 770];

/** The run's continuous layer: the cops' hi-lo siren and the Roadster's thruster hum. */
export class Chase {
  private readonly sources: OscillatorNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly siren: OscillatorNode[];
  private readonly sirenGain: GainNode;
  private readonly engine: OscillatorNode[];
  private readonly engineFilter: BiquadFilterNode;
  private readonly engineGain: GainNode;
  private nextFlip = 0;
  private high = true;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    const now = ctx.currentTime;

    const sirenFilter = this.node(ctx.createBiquadFilter());
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 2400;
    this.sirenGain = this.node(ctx.createGain());
    this.sirenGain.gain.value = 0;
    this.siren = (['square', 'triangle'] as const).map((wave, i) => {
      const osc = this.osc(wave, SIREN_HZ[0]);
      osc.detune.value = i * 9;
      osc.connect(sirenFilter);
      return osc;
    });
    sirenFilter.connect(this.sirenGain).connect(out);

    this.engineFilter = this.node(ctx.createBiquadFilter());
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = this.node(ctx.createGain());
    this.engineGain.gain.value = 0;
    this.engine = [-8, 8].map((cents) => {
      const osc = this.osc('sawtooth', 60);
      osc.detune.value = cents;
      osc.connect(this.engineFilter);
      return osc;
    });
    this.engineFilter.connect(this.engineGain).connect(out);

    for (const source of this.sources) source.start(now);
    this.nextFlip = now;
  }

  /** Follows the cop gap, speed, boost and height; call once per rendered frame. */
  update(world: World): void {
    const now = this.ctx.currentTime;
    const closeness = sirenLevel(world.copGap);
    this.sirenGain.gain.setTargetAtTime(SIREN_GAIN * closeness, now, 0.15);

    if (this.nextFlip < now) this.nextFlip = now;
    const period = 0.6 - 0.2 * closeness;
    while (this.nextFlip < now + 0.2) {
      const hz = SIREN_HZ[this.high ? 0 : 1] * (1 + 0.04 * closeness);
      for (const osc of this.siren) osc.frequency.setTargetAtTime(hz, this.nextFlip, 0.012);
      this.high = !this.high;
      this.nextFlip += period;
    }

    const boosting = world.boostLeft > 0;
    const hz = (42 + world.speed * 0.7) * (boosting ? 1.3 : 1) * (world.y > 0 ? 1.08 : 1);
    for (const osc of this.engine) osc.frequency.setTargetAtTime(hz, now, 0.1);
    this.engineFilter.frequency.setTargetAtTime(
      180 + world.speed * 5 + (boosting ? 900 : 0),
      now,
      0.1,
    );
    this.engineGain.gain.setTargetAtTime(boosting ? 0.08 : 0.05, now, 0.1);
  }

  /** Fades out over `seconds`, then frees every node. */
  stop(seconds: number): void {
    const now = this.ctx.currentTime;
    for (const gain of [this.sirenGain, this.engineGain]) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, seconds / 4);
    }
    const [first] = this.sources;
    if (first) {
      first.onended = () => {
        for (const node of this.nodes) node.disconnect();
      };
    }
    for (const source of this.sources) source.stop(now + seconds + 0.05);
  }

  private node<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private osc(wave: OscillatorType, hz: number): OscillatorNode {
    const osc = this.node(this.ctx.createOscillator());
    osc.type = wave;
    osc.frequency.value = hz;
    this.sources.push(osc);
    return osc;
  }
}
