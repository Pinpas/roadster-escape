const KEY = 'roadster-escape.best';

/** Reads the stored best score; anything missing or malformed counts as 0. */
export function loadBest(storage: Pick<Storage, 'getItem'>): number {
  try {
    const best = Number(storage.getItem(KEY));
    return Number.isSafeInteger(best) && best > 0 ? best : 0;
  } catch {
    return 0;
  }
}

/** Stores `score` if it beats the stored best, and returns the best. */
export function saveBest(storage: Pick<Storage, 'getItem' | 'setItem'>, score: number): number {
  const best = Math.max(loadBest(storage), score);
  try {
    storage.setItem(KEY, String(best));
  } catch {
    // Private browsing can refuse writes; the best still shows for this session.
  }
  return best;
}
