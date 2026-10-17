import { Color } from 'three';

export const palette = {
  skyTop: '#5b8fd9',
  skyHorizon: '#ffc89a',
  sun: '#ffe3b0',
  shadow: '#6a5acd',
  sand: '#e8a565',
  mesa: '#c8664a',
  asphalt: '#4a4458',
  lanePaint: '#fff4d6',
  roadster: '#e8322e',
  policeBlue: '#2f6bff',
  policeRed: '#ff3048',
  thruster: '#eaf6ff',
} as const;

export type PaletteKey = keyof typeof palette;

export const col = (hex: string): Color => new Color(hex);
