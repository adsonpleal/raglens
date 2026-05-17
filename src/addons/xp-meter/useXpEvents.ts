// Subscribe to `packet:exp-gain` from the Rust dispatcher.
//
// The opcode for ZC_NOTIFY_EXP on latamRO is unknown — until a decoder
// is registered under src-tauri/src/decoders/, this event never fires
// and the hook returns an empty sample list. That's the intended shape
// of this initial scaffold.

import { useEffect, useRef, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ExpKind, ExpSample } from "./format";

type ExpGainPayload = {
  delta: number;
  kind: ExpKind;
  /** Optional level context, if the decoder can derive it. */
  level?: number;
  level_total_exp?: number;
};

const HISTORY_LIMIT = 600; // ~10 minutes at 1 sample/second worst case

export type XpEventsState = {
  samples: readonly ExpSample[];
  latest: ExpGainPayload | null;
  hasEverReceived: boolean;
};

export function useXpEvents(): XpEventsState {
  const [samples, setSamples] = useState<ExpSample[]>([]);
  const [latest, setLatest] = useState<ExpGainPayload | null>(null);
  const hasEverReceivedRef = useRef(false);
  const [hasEverReceived, setHasEverReceived] = useState(false);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    listen<ExpGainPayload>("packet:exp-gain", (e) => {
      const sample: ExpSample = {
        timestampMs: Date.now(),
        delta: e.payload.delta,
        kind: e.payload.kind,
      };
      setSamples((prev) => {
        const next = prev.concat(sample);
        return next.length > HISTORY_LIMIT
          ? next.slice(next.length - HISTORY_LIMIT)
          : next;
      });
      setLatest(e.payload);
      if (!hasEverReceivedRef.current) {
        hasEverReceivedRef.current = true;
        setHasEverReceived(true);
      }
    }).then((u) => {
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { samples, latest, hasEverReceived };
}
