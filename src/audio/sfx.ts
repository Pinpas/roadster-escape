import type { PowerKind, ThingKind } from '../sim/runner';
import type { Synth, Voice } from './synth';
import { midiHz } from './tuning';

/** Cold-gas thruster puff: noise sweeping up plus a cartoon "fwip". */
export function jump(s: Synth, at: number): void {
  s.noiseBurst({
    at,
    dur: 0.3,
    gain: 0.35,
    attack: 0.01,
    filter: {
      type: 'bandpass',
      hz: [
        [0, 700],
        [0.25, 3200],
      ],
      q: 2,
    },
  });
  s.tone({
    wave: 'sine',
    at,
    dur: 0.18,
    gain: 0.09,
    hz: [
      [0, 260],
      [0.16, 640],
    ],
  });
}

export function land(s: Synth, at: number): void {
  s.tone({
    wave: 'sine',
    at,
    dur: 0.18,
    gain: 0.5,
    hz: [
      [0, 140],
      [0.14, 48],
    ],
  });
  s.noiseBurst({ at, dur: 0.09, gain: 0.2, filter: { type: 'lowpass', hz: 500 } });
}

export function lane(s: Synth, at: number): void {
  s.noiseBurst({
    at,
    dur: 0.12,
    gain: 0.16,
    attack: 0.02,
    filter: {
      type: 'bandpass',
      hz: [
        [0, 1400],
        [0.12, 2800],
      ],
      q: 3,
    },
  });
}

/** Ignition kaboom, then three seconds of rising rocket roar; returns the parts to cut early. */
export function boost(s: Synth, at: number): Voice[] {
  s.tone({
    wave: 'sine',
    at,
    dur: 0.35,
    gain: 0.6,
    hz: [
      [0, 170],
      [0.3, 45],
    ],
  });
  return [
    s.noiseBurst({
      at,
      dur: 3.1,
      gain: 0.32,
      attack: 0.04,
      hold: 2.5,
      filter: {
        type: 'bandpass',
        hz: [
          [0, 380],
          [2.9, 1500],
        ],
        q: 0.8,
      },
    }),
    s.tone({
      wave: 'sawtooth',
      at,
      dur: 3.1,
      gain: 0.13,
      attack: 0.05,
      hold: 2.5,
      hz: [
        [0, 70],
        [2.9, 165],
      ],
      vibrato: { rate: 11, depth: 4 },
      filter: {
        type: 'lowpass',
        hz: [
          [0, 400],
          [2.9, 1300],
        ],
      },
    }),
    s.tone({
      wave: 'sine',
      at: at + 0.15,
      dur: 2.9,
      gain: 0.05,
      attack: 0.3,
      hold: 2.2,
      hz: [
        [0, 600],
        [2.8, 1700],
      ],
      vibrato: { rate: 6, depth: 18 },
    }),
  ];
}

/** Out of gas: a few dry pops and a deflating "pfffrt". */
export function boostEnd(s: Synth, at: number): void {
  for (const offset of [0, 0.11, 0.25]) {
    s.noiseBurst({
      at: at + offset,
      dur: 0.06,
      gain: 0.3,
      filter: { type: 'bandpass', hz: 500 + offset * 1200, q: 2 },
    });
  }
  s.tone({
    wave: 'sawtooth',
    at,
    dur: 0.45,
    gain: 0.16,
    hz: [
      [0, 150],
      [0.4, 48],
    ],
    vibrato: { rate: 28, depth: 22 },
    filter: { type: 'lowpass', hz: 700 },
  });
}

/** Spring "boing" with a gleeful "wheee" sliding up. */
export function ramp(s: Synth, at: number): void {
  s.tone({
    wave: 'triangle',
    at,
    dur: 0.55,
    gain: 0.28,
    hz: [
      [0, 140],
      [0.08, 420],
      [0.5, 720],
    ],
    vibrato: { rate: 15, depth: 45 },
  });
  s.tone({
    wave: 'square',
    at: at + 0.06,
    dur: 0.65,
    gain: 0.05,
    attack: 0.05,
    hz: [
      [0, 650],
      [0.6, 1700],
    ],
    vibrato: { rate: 7, depth: 30 },
    filter: { type: 'lowpass', hz: 2400 },
  });
  s.noiseBurst({
    at,
    dur: 0.35,
    gain: 0.25,
    filter: {
      type: 'bandpass',
      hz: [
        [0, 600],
        [0.3, 3000],
      ],
      q: 1.5,
    },
  });
}

/** Bell ding; `semitones` comes from the donut combo, so a donut streak plays a rising tune. */
export function donut(s: Synth, at: number, semitones: number): void {
  const hz = midiHz(76 + semitones);
  s.tone({ wave: 'sine', at, dur: 0.4, gain: 0.22, attack: 0.003, hz });
  s.tone({ wave: 'triangle', at, dur: 0.16, gain: 0.07, attack: 0.003, hz: hz * 2 });
}

/** Comedic cow: a sawtooth through vowel formants, "mm" opening into a sagging "OOOoo". */
function moo(s: Synth, at: number, gain: number, surprised: boolean): void {
  s.tone({
    wave: 'sawtooth',
    at,
    dur: surprised ? 0.45 : 1.1,
    gain,
    attack: 0.06,
    hold: surprised ? 0.2 : 0.55,
    hz: surprised
      ? [
          [0, 105],
          [0.4, 175],
        ]
      : [
          [0, 112],
          [0.15, 152],
          [0.6, 138],
          [1.05, 80],
        ],
    vibrato: { rate: 5.5, depth: 5 },
    filter: {
      type: 'lowpass',
      hz: [
        [0, 260],
        [0.2, 1500],
        [0.9, 650],
      ],
    },
    formants: [380, 820],
  });
}

function thud(s: Synth, at: number, big: boolean): void {
  s.tone({
    wave: 'sine',
    at,
    dur: big ? 0.5 : 0.3,
    gain: 0.6,
    hz: big
      ? [
          [0, 85],
          [0.45, 30],
        ]
      : [
          [0, 115],
          [0.25, 38],
        ],
  });
}

function crunch(s: Synth, at: number, big: boolean): void {
  s.noiseBurst({
    at,
    dur: big ? 0.55 : 0.32,
    gain: 0.5,
    filter: {
      type: 'bandpass',
      hz: [
        [0, 2600],
        [big ? 0.5 : 0.3, 600],
      ],
      q: 0.9,
    },
  });
}

/** Plastic traffic-cone "bonk". */
function bonk(s: Synth, at: number): void {
  s.tone({
    wave: 'triangle',
    at,
    dur: 0.15,
    gain: 0.32,
    hz: [
      [0, 540],
      [0.12, 290],
    ],
  });
  s.tone({
    wave: 'sine',
    at,
    dur: 0.06,
    gain: 0.1,
    hz: [
      [0, 1100],
      [0.05, 700],
    ],
  });
}

/** Car horn with a wobble; a semi gets the deep falling air horn. */
function honk(s: Synth, at: number, semi: boolean): void {
  const pair = semi ? [233, 294] : [392, 494];
  for (const hz of pair) {
    s.tone({
      wave: semi ? 'sawtooth' : 'square',
      at,
      dur: semi ? 0.95 : 0.42,
      gain: semi ? 0.09 : 0.06,
      attack: 0.02,
      hold: semi ? 0.6 : 0.28,
      hz: semi
        ? [
            [0, hz],
            [0.65, hz],
            [0.95, hz * 0.8],
          ]
        : hz,
      vibrato: { rate: 9, depth: semi ? 2 : 6 },
      filter: { type: 'lowpass', hz: 1900 },
    });
  }
}

function clang(s: Synth, at: number): void {
  for (const hz of [523, 1259]) {
    s.tone({
      wave: 'square',
      at,
      dur: 0.45,
      gain: 0.05,
      attack: 0.002,
      hz: [
        [0, hz],
        [0.4, hz * 0.94],
      ],
      filter: { type: 'lowpass', hz: 3500 },
    });
  }
}

/** Boosting straight through something. */
export function smash(s: Synth, at: number, thing: ThingKind): void {
  if (thing === 'cone') {
    bonk(s, at);
    return;
  }
  if (thing === 'cow') {
    thud(s, at, false);
    moo(s, at + 0.04, 1.3, false);
    return;
  }
  const big = thing === 'semi';
  crunch(s, at, big);
  thud(s, at, big);
  s.noiseBurst({ at: at + 0.03, dur: 0.14, gain: 0.18, filter: { type: 'highpass', hz: 4500 } });
  if (big) honk(s, at + 0.1, true);
}

/** Hitting something without a boost: clang plus the victim's horn. */
export function crash(s: Synth, at: number, thing: ThingKind, busted: boolean): void {
  if (thing === 'cone') {
    bonk(s, at);
    return;
  }
  thud(s, at, thing === 'semi');
  if (thing === 'cow') {
    moo(s, at + 0.05, 1.3, false);
    return;
  }
  clang(s, at);
  crunch(s, at, false);
  if (busted) return;
  honk(s, at + 0.12, thing === 'semi');
  if (thing !== 'semi') honk(s, at + 0.6, false);
}

/** Whoosh of something passing under or beside; a cow you hop over says "moo?". */
export function clear(s: Synth, at: number, thing: ThingKind): void {
  const big = thing === 'semi';
  s.noiseBurst({
    at,
    dur: big ? 0.5 : 0.28,
    gain: big ? 0.3 : 0.15,
    attack: 0.03,
    filter: {
      type: 'bandpass',
      hz: [
        [0, 2600],
        [big ? 0.45 : 0.26, 650],
      ],
      q: 1.5,
    },
  });
  if (thing === 'cow') moo(s, at + 0.05, 0.9, true);
}

/** Bright pickup arpeggio; the magnet adds a wobbly "woo-oo". */
export function power(s: Synth, at: number, kind: PowerKind): void {
  const notes = kind === 'canister' ? [84, 88, 91, 96] : [79, 83, 86, 91];
  notes.forEach((note, i) => {
    s.tone({
      wave: 'square',
      at: at + i * 0.05,
      dur: 0.14,
      gain: 0.06,
      hz: midiHz(note),
      filter: { type: 'lowpass', hz: 5000 },
    });
  });
  if (kind === 'canister') {
    s.noiseBurst({ at, dur: 0.4, gain: 0.08, filter: { type: 'highpass', hz: 5000 } });
  } else {
    s.tone({
      wave: 'sine',
      at,
      dur: 0.5,
      gain: 0.12,
      hz: [
        [0, 400],
        [0.45, 1200],
      ],
      vibrato: { rate: 12, depth: 60 },
    });
  }
}

const JINGLE: readonly (readonly [number, number, number])[] = [
  [0, 72, 0.09],
  [0.1, 76, 0.09],
  [0.2, 79, 0.09],
  [0.3, 84, 0.12],
  [0.45, 79, 0.09],
  [0.55, 84, 0.5],
];

/** Short triumphant fanfare. */
export function levelUp(s: Synth, at: number): void {
  for (const [offset, note, dur] of JINGLE) {
    const long = dur > 0.2;
    s.tone({
      wave: 'square',
      at: at + offset,
      dur,
      gain: 0.07,
      hz: midiHz(note),
      filter: { type: 'lowpass', hz: 4000 },
      ...(long && { hold: 0.25, vibrato: { rate: 6, depth: 8 } }),
    });
  }
  s.tone({ wave: 'triangle', at, dur: 0.3, gain: 0.2, hz: midiHz(48) });
  s.tone({ wave: 'triangle', at: at + 0.55, dur: 0.5, gain: 0.2, hold: 0.2, hz: midiHz(48) });
}

/** Siren wail as they box you in, then the sad trombone: wah, wah, wah, waaah. */
export function busted(s: Synth, at: number): void {
  s.tone({
    wave: 'square',
    at,
    dur: 1.5,
    gain: 0.1,
    attack: 0.05,
    hold: 1.1,
    hz: [
      [0, 600],
      [0.35, 1250],
      [0.7, 600],
      [1.05, 1250],
      [1.5, 480],
    ],
    filter: { type: 'lowpass', hz: 2200 },
  });
  const start = at + 1.35;
  [233, 220, 208].forEach((hz, i) => {
    s.tone({
      wave: 'sawtooth',
      at: start + i * 0.42,
      dur: 0.38,
      gain: 0.3,
      attack: 0.03,
      hold: 0.2,
      hz,
      filter: {
        type: 'lowpass',
        hz: [
          [0, 300],
          [0.12, 1500],
          [0.36, 400],
        ],
        q: 4,
      },
    });
  });
  s.tone({
    wave: 'sawtooth',
    at: start + 1.26,
    dur: 1.4,
    gain: 0.3,
    attack: 0.03,
    hold: 0.9,
    hz: [
      [0, 196],
      [0.9, 196],
      [1.35, 170],
    ],
    vibrato: { rate: 6, depth: 7 },
    filter: {
      type: 'lowpass',
      hz: [
        [0, 300],
        [0.15, 1500],
        [1.3, 300],
      ],
      q: 4,
    },
  });
}
