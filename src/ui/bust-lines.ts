export const BUST_LINES = [
  'License and registration, flyboy.',
  'Turns out cold gas does not outrun warm donuts.',
  'That was a PIT stop, and not the good kind.',
  'Your car can fly. Your excuses cannot.',
  'Texas 1, you 0.',
  'The air tank was full of hot air.',
  'Officer Dave has never been happier.',
  'You hopped. Just not high enough.',
  'Barrel roll? More like barrel stall.',
  'Flying cars before an alibi. Classic.',
] as const;

export const randomBustLine = (): string =>
  BUST_LINES[Math.floor(Math.random() * BUST_LINES.length)] ?? BUST_LINES[0];
