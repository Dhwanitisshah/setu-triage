import { describe, expect, it } from "vitest";
import {
  bandRank,
  formatBandLabel,
  formatElapsed,
  formatNews2Score,
} from "./display";

describe("bandRank ordering", () => {
  it("orders red before unbanded before yellow before green before untriaged", () => {
    const red = bandRank({ band: "red", triaged: true });
    const unbanded = bandRank({ band: null, triaged: true });
    const yellow = bandRank({ band: "yellow", triaged: true });
    const green = bandRank({ band: "green", triaged: true });
    const untriaged = bandRank({ band: null, triaged: false });

    expect(red).toBeLessThan(unbanded);
    expect(unbanded).toBeLessThan(yellow);
    expect(yellow).toBeLessThan(green);
    expect(green).toBeLessThan(untriaged);
  });
});

describe("formatBandLabel", () => {
  it("prefixes 'At least' only when isPartialScore is true", () => {
    expect(formatBandLabel("red", true)).toBe("At least Red");
    expect(formatBandLabel("red", false)).toBe("Red");
    expect(formatBandLabel("yellow", true)).toBe("At least Yellow");
    expect(formatBandLabel("green", false)).toBe("Green");
  });

  it("never applies 'At least' to a null band, regardless of isPartialScore", () => {
    expect(formatBandLabel(null, true)).toBe("Needs manual triage");
    expect(formatBandLabel(null, false)).toBe("Needs manual triage");
  });
});

describe("formatNews2Score", () => {
  it("renders null as 'Not scored', never 0 or a dash", () => {
    expect(formatNews2Score(null)).toBe("Not scored");
  });

  it("renders a real score, including 0, as the number", () => {
    expect(formatNews2Score(0)).toBe("0");
    expect(formatNews2Score(7)).toBe("7");
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("shows 'just arrived' for under a minute", () => {
    expect(formatElapsed("2026-07-24T11:59:30Z", now)).toBe("just arrived");
  });

  it("shows minutes under an hour", () => {
    expect(formatElapsed("2026-07-24T11:45:00Z", now)).toBe("15m");
  });

  it("shows hours and minutes over an hour", () => {
    expect(formatElapsed("2026-07-24T09:30:00Z", now)).toBe("2h 30m");
  });

  it("omits minutes when exactly on the hour", () => {
    expect(formatElapsed("2026-07-24T10:00:00Z", now)).toBe("2h");
  });
});
