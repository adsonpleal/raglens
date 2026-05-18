// Per-addon enable/lock state. One overlay per enabled addon; the
// overlay binds to the currently-selected client at runtime via
// useSelectedPid (no per-PID overlay multiplexing here).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADDONS, getAddon } from "../addons/registry";
import type { AddonManifest } from "../addons/types";
import {
  closeAddonOverlay,
  setAddonOverlayLocked,
  syncOverlays,
} from "../lib/overlays";
import {
  getEnabledAddons,
  getOverlayLocked,
  setEnabledAddons,
} from "../lib/store";

export function useAddonState() {
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

  // Reconcile open overlays against the enabled set. One overlay per
  // enabled addon — no per-client multiplexing.
  useEffect(() => {
    const enabledManifests = ADDONS.filter((m) => enabled.has(m.id));
    syncOverlays(enabledManifests).catch((e) =>
      console.warn("[addon] syncOverlays failed:", e),
    );
  }, [enabled]);

  const persistEnabled = useCallback(async (next: Set<string>) => {
    setEnabled(next);
    await setEnabledAddons([...next]);
  }, []);

  const toggle = useCallback(
    async (manifest: AddonManifest) => {
      const id = manifest.id;
      try {
        if (enabled.has(id)) {
          const next = new Set(enabled);
          next.delete(id);
          await persistEnabled(next);
          await closeAddonOverlay(id);
        } else {
          const next = new Set(enabled);
          next.add(id);
          await persistEnabled(next);
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
    await setAddonOverlayLocked(id, value);
    setLocked((m) => {
      const nm = new Map(m);
      nm.set(id, value);
      return nm;
    });
  }, []);

  const lockAll = useCallback(async () => {
    for (const id of enabled) {
      await setAddonOverlayLocked(id, true);
    }
    setLocked((m) => {
      const nm = new Map(m);
      for (const id of enabled) nm.set(id, true);
      return nm;
    });
  }, [enabled]);

  const unlockAll = useCallback(async () => {
    for (const id of enabled) {
      await setAddonOverlayLocked(id, false);
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
