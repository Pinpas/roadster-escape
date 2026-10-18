import type { SimEvent, ThingKind, World } from '../sim/runner';
import { pickFrom, type Lines, type Random } from './copy';

/** What the busted screen knows about a run; `cause` is undefined when no crash ended it. */
export interface BustStory {
  readonly cause: ThingKind | undefined;
  readonly donuts: number;
  readonly level: number;
  readonly distance: number;
}

/** The crash that ended the run is in the events of the step that busted it. */
export const bustCause = (events: readonly SimEvent[]): ThingKind | undefined => {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.kind === 'crash') return event.thing;
  }
  return undefined;
};

export const storyOf = (world: World): BustStory => ({
  cause: bustCause(world.events),
  donuts: world.donuts,
  level: world.level,
  distance: Math.floor(world.distance),
});

const COW: Lines = [
  'Taken down by livestock. Texas justice is swift.',
  'In Texas the cow always has right of way.',
  'The cow is fine. Your dignity is not.',
  'Moo-ving violation.',
  'You had one job: avoid the cow.',
  'The cow has already filed a complaint.',
  'Udder failure.',
];

const SEMI: Lines = [
  'You tried to out-stubborn eighteen wheels.',
  "It's a semi. It was a whole semi.",
  'The truck driver did not even notice.',
  'Physics called. The truck won.',
  'Pro tip: trucks are taller than they look. And they look tall.',
  'You found the one thing harder than a cop: a parked semi.',
];

const CAR: Lines = [
  'Rear-ended in a traffic jam. In a flying car.',
  'You had thrusters. You chose the bumper.',
  'Their insurance is going to love this.',
  'A flying car that forgot to fly.',
  'That minivan has seen things now.',
  'Jumping was right there, partner.',
];

const CONE: Lines = ['Beaten by a cone. A traffic cone.', 'The cone won. Let that sink in.'];

const CAUSES: Partial<Record<ThingKind, Lines>> = {
  cow: COW,
  semi: SEMI,
  cone: CONE,
  hatch: CAR,
  sedan: CAR,
  suv: CAR,
  pickup: CAR,
};

const DONUTS: Lines = [
  'You stole {donuts} donuts. They took it personally.',
  '{donuts} donuts. The cops will never forgive you.',
  'Evidence found in your car: {donuts} donuts.',
  'Charged with grand theft donut, {donuts} counts.',
  '{donuts} donuts later, the cops finally got a sugar rush.',
];

const EARLY: Lines = [
  'That chase was shorter than a coffee break.',
  'Fastest arrest in Texas history.',
  'The cops did not even finish their donut.',
  '{distance} m. The cruisers barely warmed up.',
];

const LEGEND: Lines = [
  'Level {level}. They will tell this story at every barbecue.',
  'It took all of Texas to stop you at level {level}.',
  'Level {level}. The sheriff wants your autograph. And your license.',
];

const GENERAL: Lines = [
  'License and registration, flyboy.',
  "Flying car, no pilot's license. Bold.",
  'Turns out cold gas does not outrun warm donuts.',
  'Your car can fly. Your excuses cannot.',
  'Texas 1, you 0.',
  'Officer Dave has never been happier.',
  'You have the right to remain airborne. Not anymore.',
  'Everything is bigger in Texas, including your fine.',
  'The cops would like their donuts back now.',
  'Flying cars before an alibi. Classic.',
  'Howdy, partner. You are under arrest.',
];

const fill = (line: string, story: BustStory): string =>
  line
    .replace('{donuts}', String(story.donuts))
    .replace('{level}', String(story.level))
    .replace('{distance}', String(story.distance));

/** Picks a line that fits how the run ended; the cause wins most often. */
export function pickBustLine(story: BustStory, random: Random = Math.random): string {
  const pools: Lines[] = [GENERAL];
  const cause = story.cause && CAUSES[story.cause];
  if (cause) pools.push(cause, cause, cause);
  if (story.donuts >= 15) pools.push(DONUTS, DONUTS);
  if (story.distance < 300) pools.push(EARLY, EARLY);
  if (story.level >= 5) pools.push(LEGEND, LEGEND);
  const pool = pools[Math.floor(random() * pools.length)] ?? GENERAL;
  return fill(pickFrom(pool, random), story);
}

const CAUSE_LABELS: Partial<Record<ThingKind, string>> = {
  cow: 'a cow 🐄',
  semi: 'a semi truck 🚛',
  cone: 'a traffic cone 🚧',
  hatch: 'a hatchback 🚗',
  sedan: 'a sedan 🚗',
  suv: 'an SUV 🚙',
  pickup: 'a pickup 🛻',
};

/** Who to blame, for the line above the joke. */
export const causeLabel = (cause: ThingKind | undefined): string =>
  `Taken out by ${(cause && CAUSE_LABELS[cause]) ?? 'the long arm of the law 🚓'}`;
