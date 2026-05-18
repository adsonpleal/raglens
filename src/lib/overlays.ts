// Overlay window lifecycle: one window per enabled addon, always.
// Which client's data the overlay shows is decided dynamically by the
// `useSelectedPid` hook reading the backend's selected_pid state, so
// the window doesn't need to respawn when the user changes selection.
//
// Visibility is foreground-driven: shown when the selected client's
// Ragexe is in the foreground (or raglens itself is), hidden
// otherwise. The OverlayHost component handles that — overlays.ts is
// only responsible for spawning, closing, lock-state, and bounds
// persistence.

import {
  WebviewWindow,
  getAllWebviewWindows,
} from "@tauri-apps/api/webviewWindow";
import type { AddonManifest } from "../addons/types";
import {
  OverlayBounds,
  getOverlayBounds,
  getOverlayLocked,
  setOverlayBounds,
  setOverlayLocked,
} from "./store";

const DEBOUNCE_MS = 400;

export function overlayLabel(addonId: string): string {
  return `overlay-${addonId}`;
}

export function parseOverlayLabel(label: string): string | null {
  return label.startsWith("overlay-") ? label.slice("overlay-".length) : null;
}

export async function spawnAddonOverlay(
  manifest: AddonManifest,
): Promise<WebviewWindow | null> {
  const label = overlayLabel(manifest.id);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) return existing;

  const persisted = await getOverlayBounds(manifest.id);
  const bounds: OverlayBounds = persisted ?? {
    x: manifest.defaultPosition?.x ?? 120,
    y: manifest.defaultPosition?.y ?? 120,
    width: manifest.defaultSize.width,
    height: manifest.defaultSize.height,
  };
  const locked = await getOverlayLocked(manifest.id);

  // `backgroundColor` as a spawn option only configures the OS window
  // background, not the webview's own paint — leaving it off here, and
  // OverlayHost calls `getCurrentWebview().setBackgroundColor(null)` at
  // mount time to clear the webview paint so `background: transparent`
  // in CSS actually shows through.
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
    visible: false, // OverlayHost shows itself once foreground state is known
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
  if (w) {
    await w.setIgnoreCursorEvents(locked);
  }
  await setOverlayLocked(addonId, locked);
}

/** Reconcile the open overlays against the enabled-addon set.
 *  Idempotent. */
export async function syncOverlays(
  enabledAddons: readonly AddonManifest[],
): Promise<void> {
  const wanted = new Set(enabledAddons.map((m) => overlayLabel(m.id)));

  const all = await getAllWebviewWindows();
  const existing = new Set<string>();
  for (const w of all) {
    if (!w.label.startsWith("overlay-")) continue;
    existing.add(w.label);
    if (!wanted.has(w.label)) {
      await w.close();
    }
  }

  for (const m of enabledAddons) {
    if (!existing.has(overlayLabel(m.id))) {
      await spawnAddonOverlay(m);
    }
  }
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
        console.warn(`[overlay] persist failed for ${addonId}:`, e);
      }
    }, DEBOUNCE_MS);
  };
  w.onMoved(debounceSave);
  w.onResized(debounceSave);
}
