// Setu's green/yellow/red banding and hard override rules, layered on top of
// the unmodified NEWS2 aggregate. Every rule here is documented in
// docs/TRIAGE_BANDS.md — do not add a band-affecting rule here without adding
// it there first.

import { scoreNews2 } from "./news2";
import type { AssessmentContext, TriageAssessment, TriageBand, VitalsInput } from "./types";

export function assess(input: VitalsInput, context: AssessmentContext): TriageAssessment {
  const { score, parameterScores, missing } = scoreNews2(input, context);

  const isPartialScore = missing.length > 0;
  const rulesTriggered: string[] = [];
  const caveats: string[] = [];
  let requiresManualReview = false;

  // docs/TRIAGE_BANDS.md §2.1 — a missing vital is never scored as normal.
  if (isPartialScore) {
    requiresManualReview = true;
    rulesTriggered.push(
      `missing parameter(s) [${missing.join(", ")}]: not scored as normal, requires manual review`,
    );
  }

  const hasSingleRedScore = parameterScores.some((p) => !p.missing && p.score === 3);

  // docs/TRIAGE_BANDS.md §1 — band mapping.
  let band: TriageBand;
  if (score >= 7) {
    band = "red";
    rulesTriggered.push(`aggregate ${score} >= 7 => red`);
  } else if (score >= 5) {
    band = "yellow";
    rulesTriggered.push(`aggregate ${score} in 5-6 => yellow`);
  } else if (hasSingleRedScore) {
    band = "yellow";
    rulesTriggered.push("single parameter scored 3 => yellow");
  } else {
    band = "green";
    rulesTriggered.push(`aggregate ${score} in 0-4 with no single parameter scoring 3 => green`);
  }

  // NEWS2_REFERENCE.md "Scope and exclusions" — use with caution for spinal
  // cord injury. The band is still produced; this is not an exclusion.
  if (context.hasSpinalCordInjury === true) {
    caveats.push("spinal-cord-injury");
    requiresManualReview = true;
    rulesTriggered.push(
      "spinal cord injury: NEWS2 score may be unreliable, band still produced, requires manual review",
    );
  }

  const isPaediatric = context.age !== null && context.age < 16;
  const isObstetric = context.pregnancyWeeks !== null && context.pregnancyWeeks >= 20;

  // docs/TRIAGE_BANDS.md §2.3 — patients under 16 excluded from automated banding.
  if (isPaediatric) {
    caveats.push("paediatric");
    requiresManualReview = true;
    band = "red";
    rulesTriggered.push(
      "age < 16: NEWS2 not validated for children, not used for banding, forced to red pending manual review",
    );
  }

  // NEWS2_REFERENCE.md "Scope and exclusions" — NEWS2 not valid past 20 weeks
  // of pregnancy; docs/TRIAGE_BANDS.md §3 flags this as a known gap once
  // gestational age is captured.
  if (isObstetric) {
    caveats.push("obstetric");
    requiresManualReview = true;
    band = "red";
    rulesTriggered.push(
      "pregnancy >= 20 weeks: NEWS2 not valid past 20 weeks, not used for banding, forced to red pending manual review",
    );
  }

  return {
    news2Score: score,
    isPartialScore,
    band,
    parameterScores,
    rulesTriggered,
    missingParameters: missing,
    requiresManualReview,
    caveats,
  };
}
