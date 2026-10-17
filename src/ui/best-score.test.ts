import { describe, expect, it } from 'vitest';
import { loadBest, saveBest } from './best-score';

const memory = (initial?: string) => {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set('roadster-escape.best', initial);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

describe('best score', () => {
  it('starts at 0', () => {
    expect(loadBest(memory())).toBe(0);
  });

  it('keeps the higher of the stored and the new score', () => {
    const storage = memory();
    expect(saveBest(storage, 1200)).toBe(1200);
    expect(saveBest(storage, 800)).toBe(1200);
    expect(loadBest(storage)).toBe(1200);
  });

  it.each(['abc', '-5', '1.5', ''])('treats a stored %j as 0', (stored) => {
    expect(loadBest(memory(stored))).toBe(0);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: (): string => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('denied');
      },
    };
    expect(saveBest(broken, 500)).toBe(500);
  });
});
