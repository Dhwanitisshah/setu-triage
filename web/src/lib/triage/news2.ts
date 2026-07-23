// The unmodified NEWS2 aggregate score (docs/NEWS2_REFERENCE.md).
// This module knows nothing about Setu's green/yellow/red banding — see
// rules-engine.ts for that layer.

import {
  Band,
  CONSCIOUSNESS_SCORES,
  OXYGEN_SCORES,
  PULSE_BANDS,
  RESPIRATION_RATE_BANDS,
  SPO2_SCALE_1_BANDS,
  SPO2_SCALE_2_BASE_BANDS,
  SPO2_SCALE_2_ON_AIR_BAND,
  SPO2_SCALE_2_ON_OXYGEN_BANDS,
  SYSTOLIC_BP_BANDS,
  TEMPERATURE_BANDS,
} from "./news2-table";
import type { AssessmentContext, ParameterScore, VitalsInput } from "./types";

function lookupBand(bands: Band[], value: number): number {
  for (const band of bands) {
    if (value >= band.min && value <= band.max) {
      return band.score;
    }
  }
  throw new Error(`No NEWS2 band covers value ${value}`);
}

function missingScore(parameter: ParameterScore["parameter"]): ParameterScore {
  return { parameter, value: null, score: 0, missing: true };
}

function scoreSpo2(
  spo2: number | null,
  onSupplementalOxygen: boolean | null,
  useScale2: boolean,
): ParameterScore {
  if (spo2 === null) {
    return missingScore("spo2");
  }

  if (!useScale2) {
    return { parameter: "spo2", value: spo2, score: lookupBand(SPO2_SCALE_1_BANDS, spo2), missing: false };
  }

  if (spo2 <= 92) {
    return {
      parameter: "spo2",
      value: spo2,
      score: lookupBand(SPO2_SCALE_2_BASE_BANDS, spo2),
      missing: false,
    };
  }

  // spo2 >= 93 on Scale 2: air-vs-oxygen must be known to resolve the band.
  if (onSupplementalOxygen === null) {
    return missingScore("spo2");
  }

  const score = onSupplementalOxygen
    ? lookupBand(SPO2_SCALE_2_ON_OXYGEN_BANDS, spo2)
    : lookupBand([SPO2_SCALE_2_ON_AIR_BAND], spo2);

  return { parameter: "spo2", value: spo2, score, missing: false };
}

function scoreOxygen(onSupplementalOxygen: boolean | null): ParameterScore {
  if (onSupplementalOxygen === null) {
    return missingScore("oxygen");
  }
  return {
    parameter: "oxygen",
    value: onSupplementalOxygen,
    score: onSupplementalOxygen ? OXYGEN_SCORES.oxygen : OXYGEN_SCORES.air,
    missing: false,
  };
}

function scoreConsciousness(consciousness: VitalsInput["consciousness"]): ParameterScore {
  if (consciousness === null) {
    return missingScore("consciousness");
  }
  return {
    parameter: "consciousness",
    value: consciousness,
    score: CONSCIOUSNESS_SCORES[consciousness],
    missing: false,
  };
}

function scoreNumeric(
  parameter: "respiratoryRate" | "systolicBp" | "pulse" | "temperature",
  value: number | null,
  bands: Band[],
): ParameterScore {
  if (value === null) {
    return missingScore(parameter);
  }
  return { parameter, value, score: lookupBand(bands, value), missing: false };
}

export function scoreNews2(
  input: VitalsInput,
  context: AssessmentContext,
): { score: number; parameterScores: ParameterScore[]; missing: string[] } {
  const parameterScores: ParameterScore[] = [
    scoreNumeric("respiratoryRate", input.respiratoryRate, RESPIRATION_RATE_BANDS),
    scoreSpo2(input.spo2, input.onSupplementalOxygen, context.useScale2),
    scoreOxygen(input.onSupplementalOxygen),
    scoreNumeric("systolicBp", input.systolicBp, SYSTOLIC_BP_BANDS),
    scoreNumeric("pulse", input.pulse, PULSE_BANDS),
    scoreConsciousness(input.consciousness),
    scoreNumeric("temperature", input.temperature, TEMPERATURE_BANDS),
  ];

  const score = parameterScores.reduce((sum, p) => (p.missing ? sum : sum + p.score), 0);
  const missing = parameterScores.filter((p) => p.missing).map((p) => p.parameter);

  return { score, parameterScores, missing };
}
