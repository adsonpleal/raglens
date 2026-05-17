// Manages the user's addon on/off + lock state. On mount, auto-spawns
// every addon the user had enabled last session so overlays come back
// where they were left.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADDONS, getAddon } from "../addons/registry";
import type { AddonManifest } from "../addons/types";
import {
  closeAddonOverlay,
  setAddonOverlayLocked,
  spawnAddonOverlay,
} from "../lib/overlays";
import {
  getEnabledAddons,
  getOverlayLocked,
  setEnabledAddons,
} from "../lib/store";

export function useAddonState() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState<Map<string, boolean>>(new Map());
  const [hydrated, setHydrated] = useState(false);

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
      setHydrated(true);

      for (const id of valid) {
        const manifest = getAddon(id);
        if (manifest) {
          await spawnAddonOverlay(manifest).catch((err) =>
            console.warn(`[addon] failed to respawn ${id}:`, err),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistEnabled = useCallback(async (next: Set<string>) => {
    setEnabled(next);
    await setEnabledAddons([...next]);
  }, []);

  const toggle = useCallback(
    async (manifest: AddonManifest) => {
      const id = manifest.id;
      if (enabled.has(id)) {
        await closeAddonOverlay(id);
        const next = new Set(enabled);
        next.delete(id);
        await persistEnabled(next);
      } else {
        await spawnAddonOverlay(manifest);
        const next = new Set(enabled);
        next.add(id);
        await persistEnabled(next);
        setLocked((m) => {
          const nm = new Map(m);
          nm.set(id, false);
          return nm;
        });
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
    hydrated,
    toggle,
    setOne,
    lockAll,
    unlockAll,
    allLocked,
  };
}
