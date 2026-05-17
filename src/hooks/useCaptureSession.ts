import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  listInterfaces,
  startCapture,
  stopCapture,
} from "../lib/invoke";
import {
  onCaptureError,
  onCaptureStats,
  onCaptureStopped,
} from "../lib/events";
import type {
  CaptureStats,
  CaptureStatus,
  NetworkInterface,
} from "../lib/types";
import {
  getSelectedInterface,
  setSelectedInterface,
} from "../lib/store";

export function useCaptureSession() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedIp, setSelectedIpState] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [stats, setStats] = useState<CaptureStats>({
    packets_seen: 0,
    matched: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ifs = await listInterfaces();
        if (cancelled) return;
        setInterfaces(ifs);
        const persisted = await getSelectedInterface();
        const initial =
          (persisted && ifs.find((i) => i.ipv4 === persisted)?.ipv4) ??
          ifs.find((i) => !i.is_loopback)?.ipv4 ??
          null;
        setSelectedIpState(initial);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedIp = useCallback((ip: string) => {
    setSelectedIpState(ip);
    setSelectedInterface(ip).catch((e) => console.warn("[store] persist nic failed:", e));
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    Promise.all([
      onCaptureStats(setStats),
      onCaptureError(setError),
      onCaptureStopped(() =>
        setStatus((s) => (s === "recording" ? "stopped" : s)),
      ),
    ]).then((fns) => {
      if (cancelled) {
        fns.forEach((u) => u());
      } else {
        unsubs.push(...fns);
      }
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [status]);

  const start = useCallback(async () => {
    if (!selectedIp) return;
    setError(null);
    setStats({ packets_seen: 0, matched: 0 });
    try {
      await startCapture(selectedIp);
      setStatus("recording");
    } catch (e) {
      setError(String(e));
    }
  }, [selectedIp]);

  const stop = useCallback(async () => {
    try {
      await stopCapture();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return {
    interfaces,
    selectedIp,
    setSelectedIp,
    status,
    stats,
    error,
    start,
    stop,
  };
}
