// Subscribes to the dispatcher's packet:exp-gain and packet:exp-totals
// streams, filtered to one client (the overlay's bound PID).
//
// Each XP-gain event becomes a sample in the rolling history used by
// format.ts to compute XP/min. The total-update events keep us in sync
// with the running base/job totals and the next-level thresholds, so
// the meter can render real %/min and ETA values.

import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onExpGain, onExpTotal } from "../../lib/events";
import type { ExpField, ExpGain } from "../../lib/types";
import type { ExpSample } from "./format";

const HISTORY_LIMIT = 600;

export type XpTotals = {
  base: number | null;
  job: number | null;
  nextBase: number | null;
  nextJob: number | null;
};

export type XpEventsState = {
  samples: readonly ExpSample[];
  totals: XpTotals;
  lastGain: ExpGain | null;
  hasEverReceived: boolean;
};

export function useXpEvents(pid: number): XpEventsState {
  const [samples, setSamples] = useState<ExpSample[]>([]);
  const [totals, setTotals] = useState<XpTotals>({
    base: null,
    job: null,
    nextBase: null,
    nextJob: null,
  });
  const [lastGain, setLastGain] = useState<ExpGain | null>(null);
  const hasEverReceivedRef = useRef(false);
  const [hasEverReceived, setHasEverReceived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    onExpGain((gain) => {
      if (gain.pid !== pid) return;
      const sample: ExpSample = {
        timestampMs: Date.now(),
        delta: gain.delta,
        kind: gain.kind,
      };
      setSamples((prev) => {
        const next = prev.concat(sample);
        return next.length > HISTORY_LIMIT
          ? next.slice(next.length - HISTORY_LIMIT)
          : next;
      });
      setLastGain(gain);
      if (!hasEverReceivedRef.current) {
        hasEverReceivedRef.current = true;
        setHasEverReceived(true);
      }
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    onExpTotal((update) => {
      if (update.pid !== pid) return;
      setTotals((prev) => applyTotal(prev, update.field, update.value));
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pid]);

  return { samples, totals, lastGain, hasEverReceived };
}

function applyTotal(prev: XpTotals, field: ExpField, value: number): XpTotals {
  switch (field) {
    case "base-exp":
      return { ...prev, base: value };
    case "job-exp":
      return { ...prev, job: value };
    case "next-base-exp":
      return { ...prev, nextBase: value };
    case "next-job-exp":
      return { ...prev, nextJob: value };
  }
}
