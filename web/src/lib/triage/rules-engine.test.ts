import { describe, expect, it } from "vitest";
import { assess } from "./rules-engine";
import type { AssessmentContext, VitalsInput } from "./types";

const normalVitals: VitalsInput = {
  respiratoryRate: 16,
  spo2: 98,
  onSupplementalOxygen: false,
  systolicBp: 120,
  pulse: 70,
  consciousness: "alert",
  temperature: 37.0,
};

const baseContext: AssessmentContext = {
  age: 40,
  pregnancyWeeks: null,
  hasSpinalCordInjury: null,
  useScale2: false,
};

function withVital(overrides: Partial<VitalsInput>): VitalsInput {
  return { ...normalVitals, ...overrides };
}

function withContext(overrides: Partial<AssessmentContext>): AssessmentContext {
  return { ...baseContext, ...overrides };
}

describe("assess - banding", () => {
  it("fully normal vitals => green", () => {
    const result = assess(normalVitals, baseContext);
    expect(result.news2Score).toBe(0);
    expect(result.band).toBe("green");
    expect(result.requiresManualReview).toBe(false);
    expect(result.isPartialScore).toBe(false);
  });

  it("a single parameter scoring 3 with a low aggregate => yellow, not green", () => {
    // pulse <=40 scores 3; aggregate is only 3, well under 5.
    const result = assess(withVital({ pulse: 35 }), baseContext);
    expect(result.news2Score).toBe(3);
    expect(result.band).toBe("yellow");
    expect(result.rulesTriggered.some((r) => r.includes("single parameter scored 3"))).toBe(true);
  });

  it("aggregate 5-6 => yellow", () => {
    // respiratoryRate 21-24 (+2) + pulse 111-130 (+2) + systolicBp 91-100 (+2) = 6, no single param at 3.
    const result = assess(
      withVital({ respiratoryRate: 22, pulse: 115, systolicBp: 95 }),
      baseContext,
    );
    expect(result.news2Score).toBe(6);
    expect(result.band).toBe("yellow");
    expect(result.rulesTriggered.some((r) => r.includes("5-6"))).toBe(true);
  });

  it("aggregate >= 7 => red", () => {
    const result = assess(
      withVital({ respiratoryRate: 3, spo2: 90, pulse: 131 }),
      baseContext,
    );
    expect(result.news2Score).toBeGreaterThanOrEqual(7);
    expect(result.band).toBe("red");
    expect(result.rulesTriggered.some((r) => r.includes(">= 7"))).toBe(true);
  });

  it("red band wins even if aggregate >= 7 also has a single red score", () => {
    const result = assess(
      withVital({ pulse: 35, respiratoryRate: 3, spo2: 90 }),
      baseContext,
    );
    expect(result.news2Score).toBeGreaterThanOrEqual(7);
    expect(result.band).toBe("red");
  });
});

describe("assess - supplemental oxygen +2 under both scales", () => {
  it("Scale 1: oxygen adds +2 and can push band to yellow", () => {
    const air = assess(withVital({ onSupplementalOxygen: false }), baseContext);
    const oxygen = assess(withVital({ onSupplementalOxygen: true }), baseContext);
    expect(air.news2Score).toBe(0);
    expect(oxygen.news2Score).toBe(2);
    expect(oxygen.band).toBe("green");
  });

  it("Scale 2: oxygen adds +2 independent of the spo2 band it also affects", () => {
    const context = withContext({ useScale2: true });
    const air = assess(withVital({ spo2: 86, onSupplementalOxygen: false }), context);
    const oxygen = assess(withVital({ spo2: 86, onSupplementalOxygen: true }), context);
    expect(air.news2Score).toBe(1); // spo2 base band score, oxygen +0
    expect(oxygen.news2Score).toBe(3); // spo2 base band score (1) + oxygen +2
    expect(oxygen.band).toBe("green");
  });
});

describe("assess - missing parameters", () => {
  const allMissing: VitalsInput = {
    respiratoryRate: null,
    spo2: null,
    onSupplementalOxygen: null,
    systolicBp: null,
    pulse: null,
    consciousness: null,
    temperature: null,
  };

  it("all seven parameters missing => requiresManualReview, no crash", () => {
    expect(() => assess(allMissing, baseContext)).not.toThrow();
    const result = assess(allMissing, baseContext);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingParameters).toHaveLength(7);
    expect(result.isPartialScore).toBe(true);
  });

  it("one parameter missing => isPartialScore true", () => {
    const result = assess(withVital({ pulse: null }), baseContext);
    expect(result.isPartialScore).toBe(true);
    expect(result.requiresManualReview).toBe(true);
    expect(result.missingParameters).toEqual(["pulse"]);
  });
});

describe("assess - paediatric override", () => {
  it("age < 16 => paediatric caveat, manual review, band forced to red", () => {
    const result = assess(normalVitals, withContext({ age: 15 }));
    expect(result.caveats).toContain("paediatric");
    expect(result.requiresManualReview).toBe(true);
    expect(result.band).toBe("red");
    expect(result.news2Score).toBe(0); // score still reported, just not used for banding
  });

  it("age 16 does not trigger paediatric caveat", () => {
    const result = assess(normalVitals, withContext({ age: 16 }));
    expect(result.caveats).not.toContain("paediatric");
    expect(result.band).toBe("green");
  });

  it("age null does not trigger paediatric caveat", () => {
    const result = assess(normalVitals, withContext({ age: null }));
    expect(result.caveats).not.toContain("paediatric");
  });
});

describe("assess - obstetric override", () => {
  it("pregnancyWeeks 19 does not trigger obstetric caveat", () => {
    const result = assess(normalVitals, withContext({ pregnancyWeeks: 19 }));
    expect(result.caveats).not.toContain("obstetric");
    expect(result.band).toBe("green");
    expect(result.requiresManualReview).toBe(false);
  });

  it("pregnancyWeeks 20 => obstetric caveat, manual review, band forced to red", () => {
    const result = assess(normalVitals, withContext({ pregnancyWeeks: 20 }));
    expect(result.caveats).toContain("obstetric");
    expect(result.requiresManualReview).toBe(true);
    expect(result.band).toBe("red");
    expect(result.news2Score).toBe(0);
  });
});

describe("assess - spinal cord injury override", () => {
  it("hasSpinalCordInjury true => caveat and manual review, band still produced normally", () => {
    const result = assess(normalVitals, withContext({ hasSpinalCordInjury: true }));
    expect(result.caveats).toContain("spinal-cord-injury");
    expect(result.requiresManualReview).toBe(true);
    expect(result.band).toBe("green"); // band is still produced, unlike paediatric/obstetric
  });

  it("hasSpinalCordInjury false does not trigger the caveat", () => {
    const result = assess(normalVitals, withContext({ hasSpinalCordInjury: false }));
    expect(result.caveats).not.toContain("spinal-cord-injury");
  });

  it("hasSpinalCordInjury null does not trigger the caveat", () => {
    const result = assess(normalVitals, withContext({ hasSpinalCordInjury: null }));
    expect(result.caveats).not.toContain("spinal-cord-injury");
  });
});

describe("assess - determinism", () => {
  it("returns identical output when called twice with identical input", () => {
    const first = assess(normalVitals, baseContext);
    const second = assess(normalVitals, baseContext);
    expect(first).toEqual(second);
  });

  it("returns identical output for override-heavy input called twice", () => {
    const context = withContext({ age: 10, hasSpinalCordInjury: true, pregnancyWeeks: 25 });
    const first = assess(withVital({ pulse: null }), context);
    const second = assess(withVital({ pulse: null }), context);
    expect(first).toEqual(second);
  });
});
