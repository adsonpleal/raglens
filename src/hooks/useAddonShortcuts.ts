// Registers global keyboard shortcuts for enabled addons.
//
// Each addon may define a `defaultShortcut` in its manifest
// (Tauri accelerator syntax — e.g. "Alt+Shift+E") and the user may
// override it via a per-addon override persisted as
// `overlay.<id>.shortcut` in the store. Whichever is in effect is
// registered as a process-wide global shortcut: pressing it while
// any other window is focused toggles that addon's `userHidden`
// state, which OverlayHost factors into its show/hide decision.
//
// We reconcile on every change to the enabled set or the shortcut
// map: unregister anything no longer wanted, register what's new.
// On unmount (i.e. main window closes), every registration is torn
// down so the OS doesn't see stale handlers from previous sessions.

import { useEffect, useRef } from "react";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { emitOverlayConfigChanged } from "../lib/events";
import {
  getOverlayUserHidden,
  setOverlayUserHidden,
} from "../lib/store";

export function useAddonShortcuts(shortcuts: Map<string, string>): void {
  // Tracks what's currently registered, keyed by addon id.
  const active = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Unregister anything no longer wanted (addon disabled, or its
      // shortcut changed to something else / nothing).
      for (const [addonId, shortcut] of Array.from(active.current.entries())) {
        if (shortcuts.get(addonId) === shortcut) continue;
        try {
          await unregister(shortcut);
        } catch (e) {
          console.warn(`[shortcut] unregister ${shortcut} failed:`, e);
        }
        active.current.delete(addonId);
      }

      // Register anything new.
      for (const [addonId, shortcut] of shortcuts) {
        if (cancelled) return;
        if (active.current.get(addonId) === shortcut) continue;

        // The OS will reject a duplicate registration, so check first.
        try {
          if (await isRegistered(shortcut)) {
            console.warn(
              `[shortcut] ${shortcut} already registered by another addon or app — skipping ${addonId}`,
            );
            continue;
          }
        } catch (e) {
          console.warn(`[shortcut] isRegistered(${shortcut}) failed:`, e);
        }

        try {
          await register(shortcut, async (event) => {
            // Tauri 2 fires both Pressed and Released; we only act on
            // the down edge so a single key tap toggles once.
            if (event.state !== "Pressed") return;
            const current = await getOverlayUserHidden(addonId);
            const next = !current;
            await setOverlayUserHidden(addonId, next);
            await emitOverlayConfigChanged({
              addon_id: addonId,
              user_hidden: next,
            });
          });
          active.current.set(addonId, shortcut);
        } catch (e) {
          console.warn(`[shortcut] register ${shortcut} for ${addonId} failed:`, e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shortcuts]);

  // Tear everything down on unmount so we don't leak handlers across
  // a dev-mode hot-reload of the main window.
  useEffect(() => {
    const owned = active.current;
    return () => {
      for (const shortcut of owned.values()) {
        unregister(shortcut).catch(() => {});
      }
      owned.clear();
    };
  }, []);
}
