import { describe, expect, it } from 'vitest';
import { actionForKey, classifySwipe } from './gestures';

describe('classifySwipe', () => {
  it.each([
    [-80, 5, 'left'],
    [80, -10, 'right'],
    [5, -80, 'jump'],
    [10, 80, 'boost'],
  ] as const)('maps a swipe of (%i, %i) px to %s', (dx, dy, action) => {
    expect(classifySwipe(dx, dy)).toBe(action);
  });

  it('ignores a short move', () => {
    expect(classifySwipe(10, -10)).toBeUndefined();
  });
});

describe('actionForKey', () => {
  it('maps arrows, WASD, Space and Shift', () => {
    expect(actionForKey('ArrowLeft')).toBe('left');
    expect(actionForKey('KeyD')).toBe('right');
    expect(actionForKey('Space')).toBe('jump');
    expect(actionForKey('ShiftLeft')).toBe('boost');
    expect(actionForKey('KeyZ')).toBeUndefined();
  });
});
