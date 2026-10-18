import { describe, expect, it } from 'vitest';
import { crashWarning, levelLine, pickFrom, smashText, streakCall } from './copy';

describe('popup copy', () => {
  it('picks within bounds for any random number', () => {
    expect(pickFrom(['a', 'b'], () => 0)).toBe('a');
    expect(pickFrom(['a', 'b'], () => 0.999)).toBe('b');
  });

  it('shouts per thing', () => {
    expect(smashText('cow', () => 0)).toBe('MOO!');
    expect(smashText('cone', () => 0)).toBe('BONK');
    expect(smashText('semi', () => 0)).toBe('TRUCK? WHAT TRUCK');
  });

  it('warns harder when the cops are close', () => {
    expect(crashWarning(15)).toContain('GAINING');
    expect(crashWarning(5)).toContain('TOAST');
  });

  it('has a joke for every level up, and the last one stays for the top level', () => {
    expect(levelLine(2)).toBe('The cops called their cousins.');
    expect(levelLine(10)).toMatch(/^MAX LEVEL/);
    expect(levelLine(14)).toBe(levelLine(10));
  });

  it('calls out round donut streaks only', () => {
    expect(streakCall(5)).toBe('SNACK ATTACK');
    expect(streakCall(6)).toBeUndefined();
  });
});
