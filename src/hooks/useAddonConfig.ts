// Reads a per-addon settings blob from the store and keeps it in
// sync with `overlay-config-changed` events that mark the config as
// changed. Used by the overlay-side component (e.g. XpMeter) so the
// UI updates the moment the user flips a checkbox in the settings
// modal.

import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onOverlayConfigChanged } from "../lib/events";
import { getAddonConfig } from "../lib/store";

export function useAddonConfig<T extends object>(
  addonId: string,
  defaults: T,
): T {
  const [config, setConfig] = useState<T>(defaults);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const load = async () => {
      try {
        const next = await getAddonConfig(addonId, defaults);
        if (!cancelled) setConfig(next);
      } catch (e) {
        console.warn(`[config] load ${addonId} failed:`, e);
      }
    };

    load();
    onOverlayConfigChanged((evt) => {
      if (evt.addon_id === addonId && evt.addon_config_changed) {
        void load();
      }
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // `defaults` is structural — caller passes a stable reference at
    // module scope so this effect doesn't churn on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonId]);

  return config;
}
