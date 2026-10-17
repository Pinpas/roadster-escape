/**
 * The look's palette, as sRGB hex. `docs/ART_DIRECTION.md` lists the same values in its
 * palette table, and `palette.test.ts` fails when the two drift apart.
 */
export const palette = {
  skyTop: '#5b8fd9',
  skyMid: '#b9a9dd',
  skyLow: '#f6b4a6',
  skyHorizon: '#ffc89a',
  hazeSun: '#ffd9a8',
  sun: '#ffe3b0',
  sunCore: '#fff2d8',
  shadow: '#6a5acd',
  rim: '#ffb46e',
  cloudTop: '#fff6ec',
  cloudBase: '#e6dcf0',
  cloudCore: '#a88cbf',
  cloudBody: '#f2a4a2',
  cloudEdge: '#ffd2a4',
  hazeNear: '#d98a8a',
  hazeMid: '#c595b4',
  hazeFar: '#b4a2d4',
  hazeRidge: '#cdb8e0',
  sand: '#e8a565',
  mesa: '#c8664a',
  ridge: '#b86a5a',
  asphalt: '#4a4458',
  lanePaint: '#fff4d6',
  roadster: '#d9d6d0',
  roadsterLower: '#1f1d24',
  roadsterRed: '#e8322e',
  policeBlue: '#2f6bff',
  policeRed: '#ff3048',
  thruster: '#eaf6ff',
} as const;

export type PaletteKey = keyof typeof palette;
