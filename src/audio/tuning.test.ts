import { describe, expect, it } from 'vitest';
import { DONUT_SCALE, midiHz, musicBpm, nextDonutStep, sirenLevel } from './tuning';

describe('sirenLevel', () => {
  it('is faint at 20 m and beyond', () => {
    expect(sirenLevel(20)).toBeCloseTo(0.04);
    expect(sirenLevel(30)).toBeCloseTo(0.04);
  });

  it('is full under 8 m and grows as the cops close in', () => {
    expect(sirenLevel(8)).toBe(1);
    expect(sirenLevel(0)).toBe(1);
    expect(sirenLevel(12)).toBeGreaterThan(sirenLevel(16));
  });
});

describe('musicBpm', () => {
  it('rises with the level and stays bounded', () => {
    expect(musicBpm(1)).toBe(132);
    expect(musicBpm(10)).toBe(186);
    expect(musicBpm(99)).toBe(186);
    expect(musicBpm(5)).toBeGreaterThan(musicBpm(4));
  });
});

describe('nextDonutStep', () => {
  it('climbs on quick donuts, caps at the top and resets after a pause', () => {
    let step = 0;
    for (let i = 0; i < 20; i += 1) step = nextDonutStep(step, 0.2);
    expect(step).toBe(DONUT_SCALE.length - 1);
    expect(nextDonutStep(step, 2)).toBe(0);
  });
});

describe('midiHz', () => {
  it('tunes A4 to 440 Hz and doubles per octave', () => {
    expect(midiHz(69)).toBe(440);
    expect(midiHz(81)).toBeCloseTo(880);
  });
});
