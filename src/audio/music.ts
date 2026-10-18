import type { Synth } from './synth';
import { midiHz, musicBpm } from './tuning';

/** Seconds of notes queued ahead of the clock, enough to ride out a janky frame. */
const LOOKAHEAD = 0.15;
const STEPS_PER_BAR = 16;

/** Chase progression Am, F, G, E: root note and chord tones (third, fifth, octave). */
const BARS: readonly (readonly [number, readonly number[]])[] = [
  [45, [0, 3, 7, 12]],
  [41, [0, 4, 7, 12]],
  [43, [0, 4, 7, 12]],
  [40, [0, 4, 7, 12]],
];

/** Lead arpeggio per bar: an index into the chord tones, or -1 for a rest. */
const LEAD = [0, -1, 1, -1, 2, -1, 3, 2, -1, 1, -1, 2, 0, -1, 1, 2];

/** Chiptune chase loop on the AudioContext clock; its tempo follows the level. */
export class Music {
  private nextAt = 0;
  private step = 0;

  constructor(private readonly synth: Synth) {}

  restart(): void {
    this.nextAt = this.synth.now + 0.05;
    this.step = 0;
  }

  /** Queues the notes due in the lookahead window; muted, it only keeps time. */
  schedule(level: number, muted: boolean): void {
    const now = this.synth.now;
    if (this.nextAt < now) this.nextAt = now + 0.02;
    const sixteenth = 60 / musicBpm(level) / 4;
    while (this.nextAt < now + LOOKAHEAD) {
      if (!muted) this.notes(this.nextAt, sixteenth, level);
      this.nextAt += sixteenth;
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS.length * 2);
    }
  }

  private notes(at: number, sixteenth: number, level: number): void {
    const s = this.synth;
    const beat = this.step % STEPS_PER_BAR;
    const bar = BARS[Math.floor(this.step / STEPS_PER_BAR) % BARS.length];
    if (!bar) return;
    const [root, chord] = bar;
    const secondPass = this.step >= STEPS_PER_BAR * BARS.length;

    if (beat % 8 === 0) {
      s.tone({
        wave: 'sine',
        at,
        dur: 0.14,
        gain: 0.5,
        hz: [
          [0, 150],
          [0.09, 45],
        ],
        bus: 'music',
      });
    }
    if (beat % 8 === 4) {
      s.noiseBurst({
        at,
        dur: 0.1,
        gain: 0.2,
        filter: { type: 'bandpass', hz: 1800, q: 0.7 },
        bus: 'music',
      });
    }
    if (beat % 4 === 2 || (level >= 3 && beat % 2 === 1)) {
      s.noiseBurst({
        at,
        dur: 0.035,
        gain: beat % 4 === 2 ? 0.07 : 0.035,
        filter: { type: 'highpass', hz: 7000 },
        bus: 'music',
      });
    }
    if (beat % 2 === 0) {
      s.tone({
        wave: 'square',
        at,
        dur: sixteenth * 1.6,
        gain: 0.1,
        hz: midiHz(root + (beat % 4 === 2 ? 12 : 0)),
        filter: { type: 'lowpass', hz: 900 },
        bus: 'music',
      });
    }
    const tone = chord[LEAD[beat] ?? -1];
    if (tone !== undefined) {
      s.tone({
        wave: 'square',
        at,
        dur: sixteenth * 0.9,
        gain: 0.04,
        hz: midiHz(root + 24 + tone + (secondPass && level >= 2 ? 12 : 0)),
        filter: { type: 'lowpass', hz: secondPass ? 4500 : 2800 },
        bus: 'music',
      });
    }
  }
}
