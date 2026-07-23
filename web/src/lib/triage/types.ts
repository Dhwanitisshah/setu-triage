// Pure types for the NEWS2 rules engine. No I/O, no database coupling.

export type Consciousness = "alert" | "confusion" | "voice" | "pain" | "unresponsive";

export type VitalsInput = {
  respiratoryRate: number | null;
  spo2: number | null;
  onSupplementalOxygen: boolean | null;
  systolicBp: number | null;
  pulse: number | null;
  consciousness: Consciousness | null;
  temperature: number | null;
};

export type AssessmentContext = {
  age: number | null;
  /** null = not pregnant or unknown */
  pregnancyWeeks: number | null;
  hasSpinalCordInjury: boolean | null;
  useScale2: boolean;
};

export type ParameterName =
  | "respiratoryRate"
  | "spo2"
  | "oxygen"
  | "systolicBp"
  | "pulse"
  | "consciousness"
  | "temperature";

export type ParameterScore = {
  parameter: ParameterName;
  value: number | boolean | Consciousness | null;
  score: number;
  missing: boolean;
};

export type TriageBand = "green" | "yellow" | "red";

export type TriageAssessment = {
  news2Score: number | null;
  isPartialScore: boolean;
  /** null = unbanded: NEWS2 is not valid for this patient, a human must triage them. */
  band: TriageBand | null;
  parameterScores: ParameterScore[];
  rulesTriggered: string[];
  missingParameters: string[];
  requiresManualReview: boolean;
  caveats: string[];
};
