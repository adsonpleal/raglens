import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { DEFAULT_APPEARANCE, type OverlayAppearance } from "../lib/appearance";
import { onOverlayConfigChanged } from "../lib/events";
import { getOverlayAppearance } from "../lib/store";

export function useOverlayAppearance(addonId: string): OverlayAppearance {
  const [appearance, setAppearance] =
    useState<OverlayAppearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    getOverlayAppearance(addonId)
      .then((a) => {
        if (!cancelled) setAppearance(a);
      })
      .catch((e) =>
        console.warn(`[appearance] load(${addonId}) failed:`, e),
      );

    onOverlayConfigChanged((evt) => {
      if (evt.addon_id !== addonId || cancelled) return;
      if (evt.appearance) setAppearance(evt.appearance);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [addonId]);

  return appearance;
}
