"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { advanceVisitStatus } from "@/app/(app)/queue/actions";
import {
  bandGroup,
  bandGroupLabel,
  formatBandLabel,
  formatElapsed,
  formatNews2Score,
  type BandGroup,
} from "@/lib/queue/display";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { QueueRow } from "@/types/database";

const DEBOUNCE_MS = 500;
const POLL_MS = 30000;
const UPDATED_FLASH_MS = 2500;

type ConnectionState = "connected" | "connecting" | "disconnected";

const BAND_BADGE: Record<BandGroup, { glyph: string; classes: string }> = {
  red: { glyph: "●", classes: "border-red-600 text-red-700 dark:border-red-500 dark:text-red-400" },
  unbanded: {
    glyph: "▲",
    classes: "border-black/40 text-black/80 dark:border-white/40 dark:text-white/80",
  },
  yellow: {
    glyph: "◆",
    classes: "border-yellow-600 text-yellow-800 dark:border-yellow-500 dark:text-yellow-400",
  },
  green: {
    glyph: "○",
    classes: "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
  },
  untriaged: {
    glyph: "·",
    classes: "border-black/25 text-black/50 dark:border-white/25 dark:text-white/50",
  },
};

export function QueueList({ initialRows }: { initialRows: QueueRow[] }) {
  const [rows, setRows] = useState<QueueRow[]>(initialRows);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [justUpdated, setJustUpdated] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabaseRef = useRef(createSupabaseBrowserClient());

  const refetch = useCallback(async () => {
    const { data, error } = await supabaseRef.current.from("v_queue").select("*");
    if (error) return;
    setRows(data ?? []);
    setJustUpdated(true);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setJustUpdated(false), UPDATED_FLASH_MS);
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refetch, DEBOUNCE_MS);
  }, [refetch]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "triage_results" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "vitals" }, scheduleRefetch)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("disconnected");
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (flashRef.current) clearTimeout(flashRef.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefetch]);

  // The channel dropped: silently showing a frozen list would be worse than
  // a visible warning, so fall back to polling until it reconnects.
  useEffect(() => {
    if (connection !== "disconnected") return;
    const interval = setInterval(refetch, POLL_MS);
    return () => clearInterval(interval);
  }, [connection, refetch]);

  // Keep "time waiting" labels fresh without needing a data refetch.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-black/60 sm:px-8 dark:text-white/60">
        No patients waiting.
      </div>
    );
  }

  let lastGroup: BandGroup | null = null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 sm:px-8">
      <div className="flex min-h-5 items-center justify-between gap-2 text-xs">
        <span
          aria-live="polite"
          className={justUpdated ? "text-black/60 dark:text-white/60" : "invisible"}
        >
          Updated
        </span>
        {connection === "disconnected" && (
          <span className="rounded border border-yellow-600 px-2 py-1 font-medium text-yellow-800 dark:border-yellow-500 dark:text-yellow-400">
            Connection lost — refreshing every 30s, list may be briefly stale
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const group = bandGroup({ band: row.band, triaged: row.triaged });
          const showHeader = group !== lastGroup;
          lastGroup = group;

          return (
            <li key={row.visit_id} className="flex flex-col gap-1">
              {showHeader && (
                <div className="pt-1 text-xs font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
                  {bandGroupLabel(group)}
                </div>
              )}
              <QueueRowCard row={row} group={group} now={now} onChanged={refetch} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QueueRowCard({
  row,
  group,
  now,
  onChanged,
}: {
  row: QueueRow;
  group: BandGroup;
  now: Date;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const badge = BAND_BADGE[group];

  function handleAdvance() {
    setActionError(null);
    startTransition(async () => {
      const result = await advanceVisitStatus(row.visit_id);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-black/[.12] p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[.15]">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${badge.classes}`}
          aria-hidden="true"
        >
          {badge.glyph}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate font-medium">{row.full_name}</span>
            {row.age !== null && (
              <span className="text-xs text-black/60 dark:text-white/60">{row.age}y</span>
            )}
          </div>
          <p className="truncate text-sm text-black/70 dark:text-white/70">
            {row.chief_complaint ?? "No chief complaint recorded"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium">{formatBandLabel(row.band, row.is_partial_score === true)}</span>
            <span className="text-black/60 dark:text-white/60">
              NEWS2: {formatNews2Score(row.news2_score)}
            </span>
            <span className="text-black/60 dark:text-white/60">
              Waiting {formatElapsed(row.arrived_at, now)}
            </span>
            {row.requires_manual_review === true && (
              <span className="rounded border border-yellow-600 px-1.5 py-0.5 font-medium text-yellow-800 dark:border-yellow-500 dark:text-yellow-400">
                Manual review required
              </span>
            )}
          </div>
          {actionError && <p className="mt-1 text-xs text-red-600">{actionError}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdvance}
        disabled={pending}
        className="w-fit shrink-0 rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
      >
        {/* v_queue only ever contains status = 'waiting' rows, so the only
            transition a queue row can offer is into in_consult. */}
        {pending ? "Working…" : "Start consult"}
      </button>
    </div>
  );
}
