import { describe, expect, it } from 'vitest';
import { actionForKey, classifySwipe } from './gestures';

describe('classifySwipe', () => {
  it.each([
    [-80, 5, { kind: 'lane', side: 'left' }],
    [80, -10, { kind: 'lane', side: 'right' }],
    [5, -80, { kind: 'hop' }],
    [-60, -70, { kind: 'roll', side: 'left' }],
    [60, -70, { kind: 'roll', side: 'right' }],
  ] as const)('maps a swipe of (%i, %i) px', (dx, dy, action) => {
    expect(classifySwipe(dx, dy)).toEqual(action);
  });

  it.each([
    [10, -10],
    [0, 80],
    [5, 120],
  ])('ignores a tap or a downward swipe of (%i, %i) px', (dx, dy) => {
    expect(classifySwipe(dx, dy)).toBeUndefined();
  });
});

describe('actionForKey', () => {
  it('maps the documented keys', () => {
    expect(actionForKey('ArrowLeft', false)).toEqual({ kind: 'lane', side: 'left' });
    expect(actionForKey('KeyD', false)).toEqual({ kind: 'lane', side: 'right' });
    expect(actionForKey('Space', false)).toEqual({ kind: 'hop' });
    expect(actionForKey('KeyQ', false)).toEqual({ kind: 'roll', side: 'left' });
    expect(actionForKey('KeyE', false)).toEqual({ kind: 'roll', side: 'right' });
  });

  it('rolls when Shift is held with a direction', () => {
    expect(actionForKey('ArrowRight', true)).toEqual({ kind: 'roll', side: 'right' });
    expect(actionForKey('KeyW', true)).toEqual({ kind: 'hop' });
  });

  it('ignores other keys', () => {
    expect(actionForKey('KeyZ', false)).toBeUndefined();
  });
});
