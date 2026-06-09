// Per-addon state — enable/disable, lock, always-visible, the
// global shortcut accelerator, and the shortcut-driven userHidden
// toggle. One overlay window per enabled addon; the overlay binds
// to the currently-selected client at runtime via useSelectedPid.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADDONS, getAddon } from "../addons/registry";
import type { AddonManifest } from "../addons/types";
import { emitOverlayConfigChanged } from "../lib/events";
import {
  closeAddonOverlay,
  setAddonOverlayLocked,
  syncOverlays,
} from "../lib/overlays";
import {
  getEnabledAddons,
  getOverlayAlwaysVisible,
  getOverlayLocked,
  getOverlayLockToGameWindow,
  getOverlayShortcut,
  setEnabledAddons,
  setOverlayAlwaysVisible,
  setOverlayLockToGameWindow,
  setOverlayShortcut,
} from "../lib/store";

export function useAddonState() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState<Map<string, boolean>>(new Map());
  const [alwaysVisible, setAlwaysVisible] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [lockToGame, setLockToGame] = useState<Map<string, boolean>>(new Map());
  const [shortcuts, setShortcuts] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await getEnabledAddons();
      const valid = e.filter((id) => getAddon(id));
      if (cancelled) return;

      const l = new Map<string, boolean>();
      const v = new Map<string, boolean>();
      const g = new Map<string, boolean>();
      const s = new Map<string, string>();
      for (const id of valid) {
        l.set(id, await getOverlayLocked(id));
        v.set(id, await getOverlayAlwaysVisible(id));
        g.set(id, await getOverlayLockToGameWindow(id));
        const sc =
          (await getOverlayShortcut(id)) ?? getAddon(id)?.defaultShortcut;
        if (sc) s.set(id, sc);
      }
      if (cancelled) return;

      setEnabled(new Set(valid));
      setLocked(l);
      setAlwaysVisible(v);
      setLockToGame(g);
      setShortcuts(s);
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

  const refreshShortcutFor = useCallback(async (id: string) => {
    const sc = (await getOverlayShortcut(id)) ?? getAddon(id)?.defaultShortcut;
    setShortcuts((m) => {
      const nm = new Map(m);
      if (sc) nm.set(id, sc);
      else nm.delete(id);
      return nm;
    });
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
          setShortcuts((m) => {
            const nm = new Map(m);
            nm.delete(id);
            return nm;
          });
        } else {
          const next = new Set(enabled);
          next.add(id);
          await persistEnabled(next);
          const [storeLocked, storeAlways, storeLockToGame] =
            await Promise.all([
              getOverlayLocked(id),
              getOverlayAlwaysVisible(id),
              getOverlayLockToGameWindow(id),
            ]);
          setLocked((m) => {
            const nm = new Map(m);
            nm.set(id, storeLocked);
            return nm;
          });
          setAlwaysVisible((m) => {
            const nm = new Map(m);
            nm.set(id, storeAlways);
            return nm;
          });
          setLockToGame((m) => {
            const nm = new Map(m);
            nm.set(id, storeLockToGame);
            return nm;
          });
          await refreshShortcutFor(id);
        }
      } catch (e) {
        console.error(`[addon] toggle ${id} failed:`, e);
      }
    },
    [enabled, persistEnabled, refreshShortcutFor],
  );

  const setOneLocked = useCallback(async (id: string, value: boolean) => {
    await setAddonOverlayLocked(id, value);
    setLocked((m) => {
      const nm = new Map(m);
      nm.set(id, value);
      return nm;
    });
  }, []);

  const setOneAlwaysVisible = useCallback(
    async (id: string, value: boolean) => {
      await setOverlayAlwaysVisible(id, value);
      setAlwaysVisible((m) => {
        const nm = new Map(m);
        nm.set(id, value);
        return nm;
      });
      await emitOverlayConfigChanged({
        addon_id: id,
        always_visible: value,
      });
    },
    [],
  );

  const setOneLockToGame = useCallback(async (id: string, value: boolean) => {
    await setOverlayLockToGameWindow(id, value);
    setLockToGame((m) => {
      const nm = new Map(m);
      nm.set(id, value);
      return nm;
    });
    await emitOverlayConfigChanged({ addon_id: id, lock_to_game: value });
  }, []);

  const setOneShortcut = useCallback(
    async (id: string, shortcut: string | null) => {
      await setOverlayShortcut(id, shortcut);
      await refreshShortcutFor(id);
    },
    [refreshShortcutFor],
  );

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
    alwaysVisible,
    lockToGame,
    shortcuts,
    toggle,
    setOneLocked,
    setOneAlwaysVisible,
    setOneLockToGame,
    setOneShortcut,
    lockAll,
    unlockAll,
    allLocked,
  };
}
