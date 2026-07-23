// Scoring bands transcribed from docs/NEWS2_REFERENCE.md, Chart 1.
// Pure data only — no logic. Boundaries are INCLUSIVE on both ends.
// If this file and docs/NEWS2_REFERENCE.md ever disagree, the doc wins.

import type { Consciousness } from "./types";

export type Band = {
  min: number;
  max: number;
  score: number;
};

// docs/NEWS2_REFERENCE.md, Chart 1 > "Respiration rate (breaths per minute)"
export const RESPIRATION_RATE_BANDS: Band[] = [
  { min: -Infinity, max: 8, score: 3 },
  { min: 9, max: 11, score: 1 },
  { min: 12, max: 20, score: 0 },
  { min: 21, max: 24, score: 2 },
  { min: 25, max: Infinity, score: 3 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "SpO2 Scale 1 (%) — use for the majority of patients"
export const SPO2_SCALE_1_BANDS: Band[] = [
  { min: -Infinity, max: 91, score: 3 },
  { min: 92, max: 93, score: 2 },
  { min: 94, max: 95, score: 1 },
  { min: 96, max: Infinity, score: 0 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "SpO2 Scale 2 (%)" — bands below 93 do not
// depend on air-vs-oxygen.
export const SPO2_SCALE_2_BASE_BANDS: Band[] = [
  { min: -Infinity, max: 83, score: 3 },
  { min: 84, max: 85, score: 2 },
  { min: 86, max: 87, score: 1 },
  { min: 88, max: 92, score: 0 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "SpO2 Scale 2 (%)" — "≥ 93 on air"
export const SPO2_SCALE_2_ON_AIR_BAND: Band = { min: 93, max: Infinity, score: 0 };

// docs/NEWS2_REFERENCE.md, Chart 1 > "SpO2 Scale 2 (%)" — the three bands that
// require the patient to be on supplemental oxygen at spo2 >= 93.
export const SPO2_SCALE_2_ON_OXYGEN_BANDS: Band[] = [
  { min: 93, max: 94, score: 1 },
  { min: 95, max: 96, score: 2 },
  { min: 97, max: Infinity, score: 3 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "Air or oxygen"
export const OXYGEN_SCORES = {
  air: 0,
  oxygen: 2,
} as const;

// docs/NEWS2_REFERENCE.md, Chart 1 > "Systolic blood pressure (mmHg)"
export const SYSTOLIC_BP_BANDS: Band[] = [
  { min: -Infinity, max: 90, score: 3 },
  { min: 91, max: 100, score: 2 },
  { min: 101, max: 110, score: 1 },
  { min: 111, max: 219, score: 0 },
  { min: 220, max: Infinity, score: 3 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "Pulse (beats per minute)"
export const PULSE_BANDS: Band[] = [
  { min: -Infinity, max: 40, score: 3 },
  { min: 41, max: 50, score: 1 },
  { min: 51, max: 90, score: 0 },
  { min: 91, max: 110, score: 1 },
  { min: 111, max: 130, score: 2 },
  { min: 131, max: Infinity, score: 3 },
];

// docs/NEWS2_REFERENCE.md, Chart 1 > "Consciousness (ACVPU)"
export const CONSCIOUSNESS_SCORES: Record<Consciousness, number> = {
  alert: 0,
  confusion: 3,
  voice: 3,
  pain: 3,
  unresponsive: 3,
};

// docs/NEWS2_REFERENCE.md, Chart 1 > "Temperature (°C)"
export const TEMPERATURE_BANDS: Band[] = [
  { min: -Infinity, max: 35.0, score: 3 },
  { min: 35.1, max: 36.0, score: 1 },
  { min: 36.1, max: 38.0, score: 0 },
  { min: 38.1, max: 39.0, score: 1 },
  { min: 39.1, max: Infinity, score: 2 },
];
