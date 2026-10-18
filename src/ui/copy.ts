import type { ThingKind } from '../sim/runner';

/** Returns a number in [0, 1), like `Math.random`; tests pass a fixed one. */
export type Random = () => number;

export type Lines = readonly [string, ...string[]];

export const pickFrom = (lines: Lines, random: Random = Math.random): string =>
  lines[Math.floor(random() * lines.length)] ?? lines[0];

const CAR_SMASH: Lines = ['KABOOM!', 'YEET!', 'BUMPER CARS!', 'EXCUSE ME!', 'SCRAP METAL!'];

const SMASH: Partial<Record<ThingKind, Lines>> = {
  cow: ['MOO!', 'MOO-VE IT!', 'UDDERLY SMASHED'],
  cone: ['BONK', 'BOINK', 'CONE ZONE'],
  semi: ['TRUCK? WHAT TRUCK', '18 WHEELS, 0 CHANCE', 'SEMI-DESTROYED'],
  hatch: ['HATCH-BACKFLIP!', ...CAR_SMASH],
  sedan: ['SEE-YA, SEDAN!', ...CAR_SMASH],
  suv: ['SUV? SU-BYE!', ...CAR_SMASH],
  pickup: ['PICKUP? PUT DOWN!', ...CAR_SMASH],
};

/** The shout for smashing through a thing while boosting. */
export const smashText = (thing: ThingKind, random: Random = Math.random): string =>
  pickFrom(SMASH[thing] ?? CAR_SMASH, random);

const CLEAR: Partial<Record<ThingKind, Lines>> = {
  semi: ['OVER THE TRUCK!', 'TRUCK HOP!'],
  cow: ['THE CAR JUMPED OVER THE COW', 'MOO-N SHOT!'],
};
const CAR_CLEAR: Lines = ['NICE JUMP', 'HOP!', 'SKY HIGH', 'TOO EASY', 'LEAPFROG!'];

/** The cheer for hopping clean over a thing. */
export const clearText = (thing: ThingKind, random: Random = Math.random): string =>
  pickFrom(CLEAR[thing] ?? CAR_CLEAR, random);

const CRASH: Partial<Record<ThingKind, Lines>> = {
  cow: ['SORRY, BESSIE!', 'MOO-CH!'],
  semi: ["THAT'S A SEMI.", 'WALL OF TRUCK'],
};
const CAR_CRASH: Lines = ['OOF!', 'CRASH!', 'WHOOPS!', 'OUCH!', 'FENDER BENDER!'];

/** The groan for hitting a thing without a boost. */
export const crashText = (thing: ThingKind, random: Random = Math.random): string =>
  pickFrom(CRASH[thing] ?? CAR_CRASH, random);

/** The warning under a crash; one more hit this close busts the run. */
export const crashWarning = (copGap: number): string =>
  copGap < 10 ? "ONE MORE AND YOU'RE TOAST" : 'COPS GAINING 🚨';

const STREAK_CALLS: ReadonlyMap<number, string> = new Map([
  [5, 'SNACK ATTACK'],
  [10, 'DONUT DEVOURER'],
  [15, "COPS' LUNCH: GONE"],
  [20, 'GLAZED & CONFUSED'],
  [30, 'SUGAR RUSH!'],
  [50, 'DONUT DEITY'],
]);

/** A shout for a donut streak that just hit a round number, if it did. */
export const streakCall = (streak: number): string | undefined => STREAK_CALLS.get(streak);

const LEVEL_LINES: Lines = [
  'The cops called their cousins.',
  'Dispatch just spilled their coffee.',
  'Someone told the sheriff about the donuts.',
  'The Texas Rangers have entered the chat.',
  'The cows are unionizing.',
  'The helicopter is warming up. Probably.',
  'Your insurance just hung up on you.',
  'The cops are now legally a NASCAR team.',
  'MAX LEVEL. All of Texas is behind you.',
];

/** The joke under a level-up banner, from level 2 on. */
export const levelLine = (level: number): string =>
  LEVEL_LINES[Math.min(level, LEVEL_LINES.length + 1) - 2] ?? LEVEL_LINES[0];

export const TAGLINES: Lines = [
  "A flying car. No pilot's license. What could go wrong?",
  'Steal their donuts. Outrun their cruisers.',
  'Everything is bigger in Texas. Especially the police chase.',
  'Cold gas. Hot pursuit.',
  'The cops want their donuts back.',
  'Traffic is jammed. You are not.',
];
