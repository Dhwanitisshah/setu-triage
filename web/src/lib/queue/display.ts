// Pure display/formatting helpers for the live queue (Phase 5). No I/O, no
// database coupling -- mirrors the read-only spirit of lib/triage/*.
//
// This module does NOT sort anything. v_queue's own ORDER BY (see
// supabase/migrations/0002_nullable_band.sql, 0005_queue_partial_score.sql)
// is the single source of truth for queue order -- bandRank below exists
// only to compute a display-only grouping label for consecutive rows that
// already arrive in that order, never to re-sort them.

import type { TriageBand } from "@/types/database";

export type QueueBandInput = {
  band: TriageBand | null;
  /** Whether a triage_results row exists at all (v_queue's `triaged` column). */
  triaged: boolean;
};

const BAND_GROUP_LABEL = {
  red: "Red",
  unbanded: "Needs manual triage",
  yellow: "Yellow",
  green: "Green",
  untriaged: "Not yet triaged",
} as const;

export type BandGroup = keyof typeof BAND_GROUP_LABEL;

// Mirrors v_queue's ORDER BY CASE exactly: red, unbanded, yellow, green,
// never-triaged. Keep these two in lockstep if either changes.
export function bandGroup({ band, triaged }: QueueBandInput): BandGroup {
  if (band === "red") return "red";
  if (triaged && band === null) return "unbanded";
  if (band === "yellow") return "yellow";
  if (band === "green") return "green";
  return "untriaged";
}

export function bandRank(input: QueueBandInput): number {
  const order: BandGroup[] = ["red", "unbanded", "yellow", "green", "untriaged"];
  return order.indexOf(bandGroup(input));
}

export function bandGroupLabel(group: BandGroup): string {
  return BAND_GROUP_LABEL[group];
}

/**
 * docs/TRIAGE_BANDS.md §2.4 -- a partial NEWS2 score is a lower bound, never
 * a conclusion. band = null is not a severity at all, so "at least" never
 * applies to it regardless of isPartialScore.
 */
export function formatBandLabel(band: TriageBand | null, isPartialScore: boolean): string {
  if (band === null) return "Needs manual triage";
  const label = band.charAt(0).toUpperCase() + band.slice(1);
  return isPartialScore ? `At least ${label}` : label;
}

export function formatNews2Score(score: number | null): string {
  return score === null ? "Not scored" : String(score);
}

/** docs/NEWS2_REFERENCE.md -- band=null is not a severity; must not read as one. */
export function isManualTriageBand(band: TriageBand | null): boolean {
  return band === null;
}

export function formatElapsed(arrivedAt: string, now: Date): string {
  const arrivedMs = new Date(arrivedAt).getTime();
  const diffMs = Math.max(0, now.getTime() - arrivedMs);
  const totalMinutes = Math.floor(diffMs / 60000);

  if (totalMinutes < 1) return "just arrived";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
