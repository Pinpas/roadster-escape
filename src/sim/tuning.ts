import { STEP_HZ, STEP_SECONDS } from './fixed-step';
import type { SimEvent } from './world';

export const steps = (ms: number): number => Math.round((ms * STEP_HZ) / 1000);

const perStep = (perSecond: number): number => perSecond * STEP_SECONDS;

/** Air in liters, distances in meters, speeds in meters per second, durations in steps. */
export const TUNING = {
  tankLiters: 600,
  hopLiters: 50,
  rollLiters: 100,
  hopSteps: steps(700),
  rollSteps: steps(500),
  laneChangeSteps: steps(250),
  inputBufferSteps: steps(150),
  perfectDodgeSteps: steps(200),

  startSpeed: 30,
  topSpeed: 55,
  speedGainPerStep: perStep(0.15),

  firstSpawnSteps: steps(2000),
  copSpawnGap: 60,
  copHoldGap: 20,
  copClosingPerStep: perStep(12),
  copFallBackPerStep: perStep(8),
  copLength: 5,
  copDespawnGap: 120,
  lungeSteps: steps(300),
  copRecoverSteps: steps(1000),
  wreckHeat: steps(10_000),

  carLength: 4,
  trafficSpeed: 10,
  trafficSpawnAhead: 140,
  trafficSpacing: 30,
  trafficDespawnBehind: 30,
  trafficMinEverySteps: steps(700),
  trafficMaxEverySteps: steps(1800),
  nearMissLiters: 60,

  comboSteps: steps(5000),
  maxCombo: 9,
} as const;

/** Style points per event, before the combo multiplier. */
export const STYLE_POINTS = {
  nearMiss: 50,
  wrecked: 250,
  perfectDodge: 500,
} as const satisfies Partial<Record<SimEvent['kind'], number>>;
