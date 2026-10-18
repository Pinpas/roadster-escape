import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld, type SimEvent, type ThingKind } from '../sim/runner';
import { createAudio } from './audio';

class FakeParam {
  value = 0;
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number): void {
    if (!(value > 0)) throw new RangeError('exponential ramp needs a positive value');
    this.value = value;
  }
  setTargetAtTime(_value: number, _at: number, timeConstant: number): void {
    if (!(timeConstant > 0)) throw new RangeError('time constant must be positive');
  }
  cancelScheduledValues(): void {}
}

let created = 0;

class FakeNode {
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly Q = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  type = '';
  loop = false;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  constructor() {
    created += 1;
  }
  connect<T>(target: T): T {
    return target;
  }
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeContext {
  currentTime = 1;
  state = 'running';
  sampleRate = 8000;
  destination = new FakeNode();
  createGain = () => new FakeNode();
  createOscillator = () => new FakeNode();
  createBiquadFilter = () => new FakeNode();
  createBufferSource = () => new FakeNode();
  createDynamicsCompressor = () => new FakeNode();
  createBuffer = (_channels: number, length: number) => ({
    duration: length / this.sampleRate,
    getChannelData: () => new Float32Array(length),
  });
  resume = () => Promise.resolve();
  suspend = () => Promise.resolve();
}

const memory = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

const THINGS: readonly ThingKind[] = ['hatch', 'suv', 'semi', 'cow', 'cone', 'ramp'];
const EVENTS: readonly SimEvent[] = [
  { kind: 'jump' },
  { kind: 'land' },
  { kind: 'lane' },
  { kind: 'boost' },
  { kind: 'boostEnd' },
  { kind: 'ramp' },
  { kind: 'donut', points: 10 },
  { kind: 'power', power: 'canister' },
  { kind: 'power', power: 'magnet' },
  { kind: 'levelUp', level: 2 },
  ...THINGS.flatMap((thing): SimEvent[] => [
    { kind: 'smash', thing, points: 100 },
    { kind: 'crash', thing },
    { kind: 'clear', thing, points: 50 },
  ]),
  { kind: 'busted' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAudio', () => {
  it('is silent and safe without WebAudio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = createAudio(memory());
    const world = createWorld(1);
    audio.unlock();
    audio.setPhase('playing');
    audio.play([{ kind: 'jump' }], world);
    audio.update(world);
    audio.setPhase('busted');
    expect(audio.toggleMute()).toBe(true);
  });

  it('plays every event, runs the chase layer and keeps each step under budget', () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const audio = createAudio(memory());
    const world = createWorld(1);
    audio.unlock();
    audio.setPhase('playing');
    for (const event of EVENTS) {
      created = 0;
      audio.play([event], world);
      expect(created).toBeLessThan(60);
    }
    for (let level = 1; level <= 10; level += 1) {
      audio.update({ ...world, level, copGap: 20 - level * 2, boostLeft: level % 2 });
    }
    audio.setPhase('busted');
    audio.setPhase('playing');
    audio.setPhase('title');
  });

  it('persists the mute toggle', () => {
    const storage = memory();
    const audio = createAudio(storage);
    expect(audio.muted).toBe(false);
    expect(audio.toggleMute()).toBe(true);
    expect(storage.items.get('roadster-escape.muted')).toBe('1');
    expect(createAudio(storage).muted).toBe(true);
  });
});
