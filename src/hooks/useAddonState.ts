// Per-addon enable/lock state. Combined with the live client list,
// drives the overlay reconciler: one overlay per (enabled addon,
// detected PID).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADDONS, getAddon } from "../addons/registry";
import type { AddonManifest } from "../addons/types";
import {
  closeAllAddonOverlays,
  setAddonOverlaysLocked,
  syncOverlays,
} from "../lib/overlays";
import {
  getEnabledAddons,
  getOverlayLocked,
  setEnabledAddons,
} from "../lib/store";
import type { ClientInfo } from "../lib/types";

export function useAddonState(clients: ClientInfo[]) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await getEnabledAddons();
      const valid = e.filter((id) => getAddon(id));
      if (cancelled) return;

      const l = new Map<string, boolean>();
      for (const id of valid) l.set(id, await getOverlayLocked(id));
      if (cancelled) return;

      setEnabled(new Set(valid));
      setLocked(l);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reconcile (enabled addons) × (clients with PIDs) → overlays.
  // Runs on every change to either input. Idempotent.
  useEffect(() => {
    const pids = clients
      .map((c) => c.pid)
      .filter((p): p is number => p !== null);
    const enabledManifests = ADDONS.filter((m) => enabled.has(m.id));
    syncOverlays(enabledManifests, pids).catch((e) =>
      console.warn("[addon] syncOverlays failed:", e),
    );
  }, [enabled, clients]);

  const persistEnabled = useCallback(async (next: Set<string>) => {
    setEnabled(next);
    await setEnabledAddons([...next]);
  }, []);

  const toggle = useCallback(
    async (manifest: AddonManifest) => {
      const id = manifest.id;
      try {
        if (enabled.has(id)) {
          // Effect handles closing — clear enabled set, sync removes them
          const next = new Set(enabled);
          next.delete(id);
          await persistEnabled(next);
          // Belt-and-braces: also close explicitly in case syncOverlays
          // hasn't run yet (e.g., clients list is empty).
          await closeAllAddonOverlays(id);
        } else {
          const next = new Set(enabled);
          next.add(id);
          await persistEnabled(next);
          // The reconciler effect spawns the overlays for current clients.
          // Initialize the locked-map entry as well so the row label
          // matches what the overlays do.
          const storeLocked = await getOverlayLocked(id);
          setLocked((m) => {
            const nm = new Map(m);
            nm.set(id, storeLocked);
            return nm;
          });
        }
      } catch (e) {
        console.error(`[addon] toggle ${id} failed:`, e);
      }
    },
    [enabled, persistEnabled],
  );

  const setOne = useCallback(async (id: string, value: boolean) => {
    await setAddonOverlaysLocked(id, value);
    setLocked((m) => {
      const nm = new Map(m);
      nm.set(id, value);
      return nm;
    });
  }, []);

  const lockAll = useCallback(async () => {
    for (const id of enabled) {
      await setAddonOverlaysLocked(id, true);
    }
    setLocked((m) => {
      const nm = new Map(m);
      for (const id of enabled) nm.set(id, true);
      return nm;
    });
  }, [enabled]);

  const unlockAll = useCallback(async () => {
    for (const id of enabled) {
      await setAddonOverlaysLocked(id, false);
    }
    setLocked((m) => {
      const nm = new Map(m);
      for (const id of enabled) nm.set(id, false);
      return nm;
    });
  }, [enabled]);

  const allLocked = useMemo(
    () =>
      enabled.size > 0 &&
      Array.from(enabled).every((id) => locked.get(id) === true),
    [enabled, locked],
  );

  return {
    manifests: ADDONS,
    enabled,
    locked,
    toggle,
    setOne,
    lockAll,
    unlockAll,
    allLocked,
  };
}
