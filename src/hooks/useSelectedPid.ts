// Single source of truth for "which client is currently being
// followed". Backed by the ConnectionsState in Rust; updated via the
// `selected-client-changed` event so every webview (main + overlays)
// stays in sync without the windows talking to each other.

import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onSelectedClientChanged } from "../lib/events";
import { getSelectedPid } from "../lib/invoke";

export function useSelectedPid(): number | null {
  const [pid, setPid] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    getSelectedPid()
      .then((p) => {
        if (!cancelled) setPid(p);
      })
      .catch((e) => console.warn("[selected] initial get failed:", e));

    onSelectedClientChanged((e) => {
      if (!cancelled) setPid(e.pid);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return pid;
}
