import { describe, expect, it } from "vitest";
import { scoreNews2 } from "./news2";
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

const allMissing: VitalsInput = {
  respiratoryRate: null,
  spo2: null,
  onSupplementalOxygen: null,
  systolicBp: null,
  pulse: null,
  consciousness: null,
  temperature: null,
};

const scale1Context: AssessmentContext = {
  age: 40,
  pregnancyWeeks: null,
  hasSpinalCordInjury: null,
  useScale2: false,
};

const scale2Context: AssessmentContext = { ...scale1Context, useScale2: true };

function withVital(overrides: Partial<VitalsInput>): VitalsInput {
  return { ...normalVitals, ...overrides };
}

describe("scoreNews2 - fully normal vitals", () => {
  it("scores 0 for a fully-normal vitals set", () => {
    const result = scoreNews2(normalVitals, scale1Context);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(0);
    for (const p of result.parameterScores) {
      expect(p.missing).toBe(false);
      expect(p.score).toBe(0);
    }
  });
});

describe("scoreNews2 - respiration rate boundaries", () => {
  const cases: Array<[number, number]> = [
    [7, 3],
    [8, 3],
    [9, 1],
    [11, 1],
    [12, 0],
    [20, 0],
    [21, 2],
    [24, 2],
    [25, 3],
    [26, 3],
  ];
  for (const [value, expected] of cases) {
    it(`respiratoryRate ${value} => score ${expected}`, () => {
      const result = scoreNews2(withVital({ respiratoryRate: value }), scale1Context);
      const p = result.parameterScores.find((p) => p.parameter === "respiratoryRate");
      expect(p?.score).toBe(expected);
    });
  }

  it("respiration 9-11 scores 1 but 21-24 scores 2 (asymmetric)", () => {
    const low = scoreNews2(withVital({ respiratoryRate: 10 }), scale1Context);
    const high = scoreNews2(withVital({ respiratoryRate: 22 }), scale1Context);
    expect(low.parameterScores.find((p) => p.parameter === "respiratoryRate")?.score).toBe(1);
    expect(high.parameterScores.find((p) => p.parameter === "respiratoryRate")?.score).toBe(2);
  });
});

describe("scoreNews2 - SpO2 Scale 1 boundaries", () => {
  const cases: Array<[number, number]> = [
    [90, 3],
    [91, 3],
    [92, 2],
    [93, 2],
    [94, 1],
    [95, 1],
    [96, 0],
    [97, 0],
  ];
  for (const [value, expected] of cases) {
    it(`spo2 (scale 1) ${value} => score ${expected}`, () => {
      const result = scoreNews2(withVital({ spo2: value }), scale1Context);
      const p = result.parameterScores.find((p) => p.parameter === "spo2");
      expect(p?.score).toBe(expected);
    });
  }
});

describe("scoreNews2 - SpO2 Scale 2 boundaries", () => {
  const belowThreshold: Array<[number, number]> = [
    [82, 3],
    [83, 3],
    [84, 2],
    [85, 2],
    [86, 1],
    [87, 1],
    [88, 0],
    [92, 0],
  ];
  for (const [value, expected] of belowThreshold) {
    it(`spo2 (scale 2) ${value} => score ${expected}, oxygen status irrelevant`, () => {
      const onAir = scoreNews2(
        withVital({ spo2: value, onSupplementalOxygen: false }),
        scale2Context,
      );
      const onO2 = scoreNews2(
        withVital({ spo2: value, onSupplementalOxygen: true }),
        scale2Context,
      );
      expect(onAir.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(expected);
      expect(onO2.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(expected);
    });
  }

  it("spo2 >= 93 on air => 0", () => {
    const result = scoreNews2(
      withVital({ spo2: 93, onSupplementalOxygen: false }),
      scale2Context,
    );
    expect(result.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(0);
    const high = scoreNews2(
      withVital({ spo2: 99, onSupplementalOxygen: false }),
      scale2Context,
    );
    expect(high.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(0);
  });

  const onOxygen: Array<[number, number]> = [
    [93, 1],
    [94, 1],
    [95, 2],
    [96, 2],
    [97, 3],
    [98, 3],
  ];
  for (const [value, expected] of onOxygen) {
    it(`spo2 ${value} on oxygen (scale 2) => score ${expected}`, () => {
      const result = scoreNews2(
        withVital({ spo2: value, onSupplementalOxygen: true }),
        scale2Context,
      );
      expect(result.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(expected);
    });
  }

  it("scale 2 is not scale 1 shifted (different shape)", () => {
    // At 90%, Scale 1 scores 3 but Scale 2 (on air) scores 0.
    const scale1 = scoreNews2(withVital({ spo2: 90 }), scale1Context);
    const scale2 = scoreNews2(
      withVital({ spo2: 90, onSupplementalOxygen: false }),
      scale2Context,
    );
    expect(scale1.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(3);
    expect(scale2.parameterScores.find((p) => p.parameter === "spo2")?.score).toBe(0);
  });

  it("spo2 >= 93 on scale 2 with unknown oxygen status is missing, not assumed", () => {
    const result = scoreNews2(
      withVital({ spo2: 93, onSupplementalOxygen: null }),
      scale2Context,
    );
    const p = result.parameterScores.find((p) => p.parameter === "spo2");
    expect(p?.missing).toBe(true);
    expect(result.missing).toContain("spo2");
  });

  it("spo2 < 93 on scale 2 with unknown oxygen status is NOT missing (resolvable without it)", () => {
    const result = scoreNews2(
      withVital({ spo2: 86, onSupplementalOxygen: null }),
      scale2Context,
    );
    const p = result.parameterScores.find((p) => p.parameter === "spo2");
    expect(p?.missing).toBe(false);
    expect(p?.score).toBe(1);
  });
});

describe("scoreNews2 - supplemental oxygen +2", () => {
  it("applies under Scale 1", () => {
    const air = scoreNews2(withVital({ onSupplementalOxygen: false }), scale1Context);
    const oxygen = scoreNews2(withVital({ onSupplementalOxygen: true }), scale1Context);
    expect(air.parameterScores.find((p) => p.parameter === "oxygen")?.score).toBe(0);
    expect(oxygen.parameterScores.find((p) => p.parameter === "oxygen")?.score).toBe(2);
  });

  it("applies under Scale 2", () => {
    const air = scoreNews2(
      withVital({ spo2: 90, onSupplementalOxygen: false }),
      scale2Context,
    );
    const oxygen = scoreNews2(
      withVital({ spo2: 90, onSupplementalOxygen: true }),
      scale2Context,
    );
    expect(air.parameterScores.find((p) => p.parameter === "oxygen")?.score).toBe(0);
    expect(oxygen.parameterScores.find((p) => p.parameter === "oxygen")?.score).toBe(2);
  });

  it("missing oxygen status is flagged missing, not assumed air", () => {
    const result = scoreNews2(withVital({ onSupplementalOxygen: null }), scale1Context);
    const p = result.parameterScores.find((p) => p.parameter === "oxygen");
    expect(p?.missing).toBe(true);
    expect(result.missing).toContain("oxygen");
  });
});

describe("scoreNews2 - systolic BP boundaries", () => {
  const cases: Array<[number, number]> = [
    [89, 3],
    [90, 3],
    [91, 2],
    [100, 2],
    [101, 1],
    [110, 1],
    [111, 0],
    [219, 0],
    [220, 3],
    [221, 3],
  ];
  for (const [value, expected] of cases) {
    it(`systolicBp ${value} => score ${expected}`, () => {
      const result = scoreNews2(withVital({ systolicBp: value }), scale1Context);
      expect(result.parameterScores.find((p) => p.parameter === "systolicBp")?.score).toBe(
        expected,
      );
    });
  }

  it("has no score-2 band on the high side - jumps 0 to 3 at 220", () => {
    const at219 = scoreNews2(withVital({ systolicBp: 219 }), scale1Context);
    const at220 = scoreNews2(withVital({ systolicBp: 220 }), scale1Context);
    expect(at219.parameterScores.find((p) => p.parameter === "systolicBp")?.score).toBe(0);
    expect(at220.parameterScores.find((p) => p.parameter === "systolicBp")?.score).toBe(3);
  });
});

describe("scoreNews2 - pulse boundaries", () => {
  const cases: Array<[number, number]> = [
    [39, 3],
    [40, 3],
    [41, 1],
    [50, 1],
    [51, 0],
    [90, 0],
    [91, 1],
    [110, 1],
    [111, 2],
    [130, 2],
    [131, 3],
    [132, 3],
  ];
  for (const [value, expected] of cases) {
    it(`pulse ${value} => score ${expected}`, () => {
      const result = scoreNews2(withVital({ pulse: value }), scale1Context);
      expect(result.parameterScores.find((p) => p.parameter === "pulse")?.score).toBe(expected);
    });
  }

  it("pulse 41-50 scores 1, not 2 (asymmetric around normal)", () => {
    const result = scoreNews2(withVital({ pulse: 45 }), scale1Context);
    expect(result.parameterScores.find((p) => p.parameter === "pulse")?.score).toBe(1);
  });
});

describe("scoreNews2 - consciousness (ACVPU)", () => {
  it("all of C, V, P, U score 3 identically", () => {
    for (const level of ["confusion", "voice", "pain", "unresponsive"] as const) {
      const result = scoreNews2(withVital({ consciousness: level }), scale1Context);
      expect(result.parameterScores.find((p) => p.parameter === "consciousness")?.score).toBe(3);
    }
  });

  it("alert scores 0", () => {
    const result = scoreNews2(withVital({ consciousness: "alert" }), scale1Context);
    expect(result.parameterScores.find((p) => p.parameter === "consciousness")?.score).toBe(0);
  });
});

describe("scoreNews2 - temperature boundaries", () => {
  const cases: Array<[number, number]> = [
    [34.9, 3],
    [35.0, 3],
    [35.1, 1],
    [36.0, 1],
    [36.1, 0],
    [38.0, 0],
    [38.1, 1],
    [39.0, 1],
    [39.1, 2],
    [40.0, 2],
  ];
  for (const [value, expected] of cases) {
    it(`temperature ${value} => score ${expected}`, () => {
      const result = scoreNews2(withVital({ temperature: value }), scale1Context);
      expect(result.parameterScores.find((p) => p.parameter === "temperature")?.score).toBe(
        expected,
      );
    });
  }

  it("temperature >= 39.1 scores 2, not 3 (the only parameter whose top band is not 3)", () => {
    const result = scoreNews2(withVital({ temperature: 41.0 }), scale1Context);
    expect(result.parameterScores.find((p) => p.parameter === "temperature")?.score).toBe(2);
  });
});

describe("scoreNews2 - aggregate", () => {
  it("aggregate >= 7", () => {
    // respiratoryRate 3 + spo2 3 + oxygen 0 + systolicBp 0 + pulse 0 + consciousness 0 + temp 0 = 6
    // bump pulse to 131 (+3) => 9
    const result = scoreNews2(
      withVital({ respiratoryRate: 3, spo2: 90, pulse: 131 }),
      scale1Context,
    );
    expect(result.score).toBeGreaterThanOrEqual(7);
  });

  it("a single parameter scoring 3 can coexist with a low aggregate", () => {
    const result = scoreNews2(withVital({ pulse: 35 }), scale1Context);
    expect(result.score).toBe(3);
    expect(result.parameterScores.some((p) => p.score === 3)).toBe(true);
  });
});

describe("scoreNews2 - missing parameters", () => {
  it("all seven parameters missing does not crash, reports all as missing, and scores null (not 0)", () => {
    const result = scoreNews2(allMissing, scale1Context);
    expect(result.score).toBeNull();
    expect(result.missing).toHaveLength(7);
    expect(result.allPresent).toBe(false);
    for (const p of result.parameterScores) {
      expect(p.missing).toBe(true);
    }
  });

  it("one parameter missing is reported and aggregate still computed from the rest", () => {
    const result = scoreNews2(withVital({ pulse: null }), scale1Context);
    expect(result.missing).toEqual(["pulse"]);
    expect(result.score).toBe(0);
    expect(result.allPresent).toBe(false);
  });
});

describe("scoreNews2 - allPresent", () => {
  it("true when all seven parameters are present", () => {
    const result = scoreNews2(normalVitals, scale1Context);
    expect(result.allPresent).toBe(true);
  });

  it("false when any parameter is missing", () => {
    const result = scoreNews2(withVital({ temperature: null }), scale1Context);
    expect(result.allPresent).toBe(false);
  });
});

describe("scoreNews2 - determinism", () => {
  it("returns identical output when called twice with identical input", () => {
    const first = scoreNews2(normalVitals, scale1Context);
    const second = scoreNews2(normalVitals, scale1Context);
    expect(first).toEqual(second);
  });
});
