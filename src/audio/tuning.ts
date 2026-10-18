/** Pure numbers behind the sound, kept apart so tests run without an AudioContext. */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Converts a MIDI note number to Hz (69 = A4 = 440 Hz). */
export const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Siren loudness from 0 to 1: a faint wail at 20 m that swells to full under 8 m. */
export function sirenLevel(copGap: number): number {
  const close = clamp01((20 - copGap) / 12);
  return 0.04 + 0.96 * close * close;
}

/** Music tempo in beats per minute; every level pushes the chase a little faster. */
export const musicBpm = (level: number): number => 132 + (Math.min(Math.max(level, 1), 10) - 1) * 6;

/** Semitones above the first donut ding; a major pentatonic climbing two octaves. */
export const DONUT_SCALE: readonly number[] = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** Donuts closer together than this keep climbing the scale. */
export const DONUT_COMBO_SECONDS = 0.75;

/** The next step on the donut scale: up one on a quick follow-up, back to the bottom after a pause. */
export const nextDonutStep = (step: number, secondsSinceLast: number): number =>
  secondsSinceLast < DONUT_COMBO_SECONDS ? Math.min(step + 1, DONUT_SCALE.length - 1) : 0;
