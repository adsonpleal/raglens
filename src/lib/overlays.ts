// Overlay window lifecycle: spawn, close, lock/unlock, persist bounds.
//
// Each addon gets one WebviewWindow with label `overlay-<addon-id>`.
// Windows are runtime-created from the main window — they're not
// declared in tauri.conf.json. The same Vite bundle serves all
// webviews; routing happens in src/main.tsx via the ?w= query.
//
// Lock/unlock uses Tauri 2's `setIgnoreCursorEvents` API — locked =
// clicks pass through (overlay invisible to mouse), unlocked =
// draggable. No Win32 calls needed.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AddonManifest } from "../addons/types";
import {
  OverlayBounds,
  getOverlayBounds,
  getOverlayLocked,
  setOverlayBounds,
  setOverlayLocked,
} from "./store";

const DEBOUNCE_MS = 400;

function overlayLabel(addonId: string): string {
  return `overlay-${addonId}`;
}

export async function spawnAddonOverlay(
  manifest: AddonManifest,
): Promise<WebviewWindow> {
  const label = overlayLabel(manifest.id);
  const persisted = await getOverlayBounds(manifest.id);
  const bounds: OverlayBounds = persisted ?? {
    x: manifest.defaultPosition?.x ?? 120,
    y: manifest.defaultPosition?.y ?? 120,
    width: manifest.defaultSize.width,
    height: manifest.defaultSize.height,
  };
  const locked = await getOverlayLocked(manifest.id);

  const w = new WebviewWindow(label, {
    url: `/?w=overlay&addon=${encodeURIComponent(manifest.id)}`,
    title: manifest.name,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    alwaysOnTop: true,
    decorations: false,
    transparent: true,
    skipTaskbar: true,
    resizable: true,
  });

  w.once("tauri://created", async () => {
    if (locked) {
      await w.setIgnoreCursorEvents(true);
    }
    bindBoundsPersistence(w, manifest.id);
  });

  w.once("tauri://error", (e) => {
    console.error(`[overlay] failed to create ${label}:`, e);
  });

  return w;
}

export async function closeAddonOverlay(addonId: string): Promise<void> {
  const w = await WebviewWindow.getByLabel(overlayLabel(addonId));
  if (w) await w.close();
}

export async function setAddonOverlayLocked(
  addonId: string,
  locked: boolean,
): Promise<void> {
  const w = await WebviewWindow.getByLabel(overlayLabel(addonId));
  if (!w) return;
  await w.setIgnoreCursorEvents(locked);
  await setOverlayLocked(addonId, locked);
}

export async function isAddonOverlayOpen(addonId: string): Promise<boolean> {
  return (await WebviewWindow.getByLabel(overlayLabel(addonId))) !== null;
}

function bindBoundsPersistence(w: WebviewWindow, addonId: string): void {
  let timer: number | null = null;
  const debounceSave = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const pos = await w.outerPosition();
        const size = await w.outerSize();
        const scale = await w.scaleFactor();
        await setOverlayBounds(addonId, {
          x: Math.round(pos.x / scale),
          y: Math.round(pos.y / scale),
          width: Math.round(size.width / scale),
          height: Math.round(size.height / scale),
        });
      } catch (e) {
        // Window may have been closed mid-debounce.
        console.warn(`[overlay] persist failed for ${addonId}:`, e);
      }
    }, DEBOUNCE_MS);
  };
  w.onMoved(debounceSave);
  w.onResized(debounceSave);
}
