import { describe, expect, it } from 'vitest';
import { createWorld } from '../sim/runner';
import { bustCause, causeLabel, pickBustLine, storyOf } from './bust-lines';

const story = { cause: undefined, donuts: 0, level: 1, distance: 1000 } as const;

describe('bust lines', () => {
  it('finds the crash that ended the run', () => {
    expect(bustCause([{ kind: 'land' }, { kind: 'crash', thing: 'cow' }, { kind: 'busted' }])).toBe(
      'cow',
    );
    expect(bustCause([{ kind: 'busted' }])).toBeUndefined();
  });

  it('reads the story from a busted world', () => {
    const world = createWorld(1);
    world.events = [{ kind: 'crash', thing: 'semi' }, { kind: 'busted' }];
    world.donuts = 7;
    world.distance = 812.6;
    expect(storyOf(world)).toEqual({ cause: 'semi', donuts: 7, level: 1, distance: 812 });
  });

  it('blames the cause most of the time', () => {
    const line = pickBustLine({ ...story, cause: 'cow' }, () => 0.99);
    expect(line.toLowerCase()).toMatch(/cow|moo|udder|livestock|complaint/);
  });

  it('fills the run into donut lines', () => {
    const line = pickBustLine({ ...story, donuts: 42 }, () => 0.99);
    expect(line).toContain('42');
    expect(line).not.toContain('{');
  });

  it('always returns a line, whatever the random number', () => {
    for (const roll of [0, 0.25, 0.5, 0.999]) {
      expect(
        pickBustLine({ ...story, cause: 'cone', level: 6, distance: 100 }, () => roll),
      ).not.toBe('');
    }
  });

  it('names the culprit', () => {
    expect(causeLabel('semi')).toContain('semi');
    expect(causeLabel(undefined)).toContain('law');
  });
});
