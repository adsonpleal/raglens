// Tracks the list of detected Ragnarok clients (one per PID), filling in
// AID and character name as the corresponding decoders fire.
//
// We don't try to maintain a derived shadow of the client table on the
// frontend — instead, every `client-detected` / `client-updated` event
// re-queries the backend's `list_clients()` which already does the
// aggregation. The events arrive at human-scale rates (one client per
// reconnect, one update per character-name resolution) so the round-
// trip cost is negligible.

import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onClientDetected, onClientUpdated } from "../lib/events";
import {
  clearClientSelection,
  listClients,
  selectClient,
} from "../lib/invoke";
import type { ClientInfo } from "../lib/types";

export function useClients(isRecording: boolean) {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  useEffect(() => {
    if (isRecording) {
      setClients([]);
      setSelectedPid(null);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    const refresh = async () => {
      try {
        const fresh = await listClients();
        if (!cancelled) setClients(fresh);
      } catch (e) {
        console.warn("[clients] list_clients failed:", e);
      }
    };

    refresh();
    Promise.all([onClientDetected(refresh), onClientUpdated(refresh)]).then(
      (fns) => {
        if (cancelled) fns.forEach((u) => u());
        else unsubs.push(...fns);
      },
    );

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [isRecording]);

  const selectOne = useCallback(async (pid: number) => {
    await selectClient(pid);
    setSelectedPid(pid);
  }, []);

  const followAll = useCallback(async () => {
    await clearClientSelection();
    setSelectedPid(null);
  }, []);

  return { clients, selectedPid, selectOne, followAll };
}
