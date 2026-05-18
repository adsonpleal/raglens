// Overlay window lifecycle: one window per (addon, client PID), with
// foreground-driven visibility handled by the overlay itself.
//
// Label scheme: `overlay-<addon-id>-<pid>`. PID is the stable
// per-client identifier; the AID/name fill in over time but aren't
// known at spawn. Bounds are persisted per addon globally (all
// overlays of the same addon share the saved size; positions cascade
// by index so they don't stack).

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
const CASCADE_STEP = 32;

export function overlayLabel(addonId: string, pid: number): string {
  return `overlay-${addonId}-${pid}`;
}

export function parseOverlayLabel(
  label: string,
): { addonId: string; pid: number } | null {
  const m = label.match(/^overlay-(.+)-(\d+)$/);
  if (!m) return null;
  return { addonId: m[1], pid: parseInt(m[2], 10) };
}

export async function spawnAddonOverlayForClient(
  manifest: AddonManifest,
  pid: number,
  cascadeIndex: number,
): Promise<WebviewWindow | null> {
  const label = overlayLabel(manifest.id, pid);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) return existing;

  const persisted = await getOverlayBounds(manifest.id);
  const base = persisted ?? {
    x: manifest.defaultPosition?.x ?? 120,
    y: manifest.defaultPosition?.y ?? 120,
    width: manifest.defaultSize.width,
    height: manifest.defaultSize.height,
  };
  // Cascade offset so multi-client overlays don't pile on top of each
  // other. User drags wherever they want from there.
  const bounds: OverlayBounds = {
    x: base.x + cascadeIndex * CASCADE_STEP,
    y: base.y + cascadeIndex * CASCADE_STEP,
    width: base.width,
    height: base.height,
  };
  const locked = await getOverlayLocked(manifest.id);

  const w = new WebviewWindow(label, {
    url: `/?w=overlay&addon=${encodeURIComponent(manifest.id)}&pid=${pid}`,
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
    visible: false, // visibility is foreground-driven; overlay shows itself once the watcher fires
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

export async function closeAddonOverlay(
  addonId: string,
  pid: number,
): Promise<void> {
  const w = await WebviewWindow.getByLabel(overlayLabel(addonId, pid));
  if (w) await w.close();
}

export async function closeAllAddonOverlays(addonId: string): Promise<void> {
  const all = await getAllWebviewWindows();
  for (const w of all) {
    const parsed = parseOverlayLabel(w.label);
    if (parsed?.addonId === addonId) {
      await w.close();
    }
  }
}

export async function setAddonOverlaysLocked(
  addonId: string,
  locked: boolean,
): Promise<void> {
  const all = await getAllWebviewWindows();
  for (const w of all) {
    const parsed = parseOverlayLabel(w.label);
    if (parsed?.addonId === addonId) {
      await w.setIgnoreCursorEvents(locked);
    }
  }
  await setOverlayLocked(addonId, locked);
}

/** Reconcile the open overlay windows against the desired set
 *  (enabled addons × detected clients). Idempotent — safe to call on
 *  every clients/enabled state change. */
export async function syncOverlays(
  enabledAddons: readonly AddonManifest[],
  pids: number[],
): Promise<void> {
  const wanted = new Map<string, { manifest: AddonManifest; pid: number }>();
  for (const m of enabledAddons) {
    pids.forEach((pid) => wanted.set(overlayLabel(m.id, pid), { manifest: m, pid }));
  }

  const all = await getAllWebviewWindows();
  const existingLabels = new Set<string>();
  for (const w of all) {
    if (!w.label.startsWith("overlay-")) continue;
    existingLabels.add(w.label);
    if (!wanted.has(w.label)) {
      await w.close();
    }
  }

  let cascadeIndex = 0;
  for (const [label, { manifest, pid }] of wanted) {
    if (!existingLabels.has(label)) {
      await spawnAddonOverlayForClient(manifest, pid, cascadeIndex);
    }
    cascadeIndex++;
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
