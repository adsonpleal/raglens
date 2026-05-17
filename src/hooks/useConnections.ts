import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onConnectionDetected } from "../lib/events";
import {
  clearConnectionSelection,
  selectConnection,
} from "../lib/invoke";
import {
  fourTupleKey,
  type ConnectionInfo,
  type FourTuple,
} from "../lib/types";

export function useConnections(isRecording: boolean) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [selected, setSelected] = useState<FourTuple | null>(null);

  useEffect(() => {
    if (isRecording) {
      setConnections([]);
      setSelected(null);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    onConnectionDetected((info) => {
      setConnections((prev) => {
        const k = fourTupleKey(info.four_tuple);
        if (prev.some((c) => fourTupleKey(c.four_tuple) === k)) return prev;
        return [...prev, info];
      });
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [isRecording]);

  const selectOne = useCallback(async (ft: FourTuple) => {
    await selectConnection(ft);
    setSelected(ft);
  }, []);

  const followAll = useCallback(async () => {
    await clearConnectionSelection();
    setSelected(null);
  }, []);

  return { connections, selected, selectOne, followAll };
}
