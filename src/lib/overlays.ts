// Overlay window lifecycle. Each enabled addon spawns ONE webview by
// default; addons that declare `secondaryEntryRoute` in their
// manifest spawn TWO (a primary + a secondary, conceptually one
// addon with two surfaces — used by last-teleport for its
// transparent minimap layer + the separate toolbar widget).
//
// Visibility is foreground-driven: shown when the selected client's
// Ragexe is in the foreground (or raglens itself is), hidden
// otherwise. The OverlayHost component handles that — overlays.ts is
// only responsible for spawning, closing, lock-state, and bounds
// persistence.

import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  WebviewWindow,
  getAllWebviewWindows,
} from "@tauri-apps/api/webviewWindow";
import { getAddon } from "../addons/registry";
import type { AddonManifest } from "../addons/types";
import { hasOverlay } from "../addons/types";
import { emitOverlayConfigChanged } from "./events";
import {
  OverlayBounds,
  type OverlayView,
  getOverlayBounds,
  getOverlayLocked,
  setOverlayBounds,
  setOverlayLocked,
} from "./store";

const DEBOUNCE_MS = 400;
const SECONDARY_SUFFIX = "-secondary";

export function overlayLabel(addonId: string): string {
  return `overlay-${addonId}`;
}

export function overlaySecondaryLabel(addonId: string): string {
  return `overlay-${addonId}${SECONDARY_SUFFIX}`;
}

export function parseOverlayLabel(
  label: string,
): { addonId: string; view: OverlayView } | null {
  if (!label.startsWith("overlay-")) return null;
  const tail = label.slice("overlay-".length);
  if (tail.endsWith(SECONDARY_SUFFIX)) {
    return {
      addonId: tail.slice(0, -SECONDARY_SUFFIX.length),
      view: "secondary",
    };
  }
  return { addonId: tail, view: "primary" };
}

/** Per-view shape of the bits `spawnAddonOverlay` needs to spawn a
 *  webview — lets the same spawn logic work for both views without
 *  branching on `view` everywhere. */
type ViewSpec = {
  label: string;
  entryRoute: string;
  defaultSize: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  interactiveWhenLocked?: boolean;
  resizable?: boolean;
};

function primarySpec(manifest: AddonManifest): ViewSpec | null {
  if (!hasOverlay(manifest)) return null;
  return {
    label: overlayLabel(manifest.id),
    entryRoute: manifest.entryRoute,
    defaultSize: manifest.defaultSize,
    defaultPosition: manifest.defaultPosition,
    interactiveWhenLocked: manifest.interactiveWhenLocked,
    resizable: manifest.resizable,
  };
}

function secondarySpec(manifest: AddonManifest): ViewSpec | null {
  if (!manifest.secondaryEntryRoute || !manifest.secondaryDefaultSize) {
    return null;
  }
  return {
    label: overlaySecondaryLabel(manifest.id),
    entryRoute: manifest.secondaryEntryRoute,
    defaultSize: manifest.secondaryDefaultSize,
    defaultPosition: manifest.secondaryDefaultPosition,
    interactiveWhenLocked: manifest.secondaryInteractiveWhenLocked,
    resizable: manifest.secondaryResizable,
  };
}

async function spawnOne(
  manifest: AddonManifest,
  spec: ViewSpec,
  view: OverlayView,
): Promise<WebviewWindow | null> {
  const existing = await WebviewWindow.getByLabel(spec.label);
  if (existing) return existing;

  const persisted = await getOverlayBounds(manifest.id, view);
  const bounds: OverlayBounds = persisted ?? {
    x: spec.defaultPosition?.x ?? 120,
    y: spec.defaultPosition?.y ?? 120,
    width: spec.defaultSize.width,
    height: spec.defaultSize.height,
  };
  const locked = await getOverlayLocked(manifest.id);

  const viewParam = view === "secondary" ? "&view=secondary" : "";
  const w = new WebviewWindow(spec.label, {
    url: `/?w=overlay&addon=${encodeURIComponent(manifest.id)}${viewParam}`,
    title:
      view === "secondary"
        ? `${manifest.name} (controles)`
        : manifest.name,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    alwaysOnTop: true,
    decorations: false,
    skipTaskbar: true,
    resizable: spec.resizable ?? true,
    transparent: true,
    shadow: false,
    visible: false, // OverlayHost shows itself once foreground state is known
  });

  w.once("tauri://created", async () => {
    if (locked && !spec.interactiveWhenLocked) {
      await w.setIgnoreCursorEvents(true);
    }
    bindBoundsPersistence(w, manifest.id, view);
    // WebView2 + Tauri 2 transparency only kicks in after the first
    // resize — without this nudge the window stays painted with its
    // pre-composition opaque backing.
    // https://stackoverflow.com/questions/77344488
    try {
      const size = await w.outerSize();
      const scale = await w.scaleFactor();
      const w1 = Math.round(size.width / scale);
      const h1 = Math.round(size.height / scale);
      await w.setSize(new LogicalSize(w1 + 1, h1));
      await w.setSize(new LogicalSize(w1, h1));
    } catch (e) {
      console.warn(
        `[overlay] transparency nudge failed for ${spec.label}:`,
        e,
      );
    }
  });
  w.once("tauri://error", (e) => {
    console.error(`[overlay] failed to create ${spec.label}:`, e);
  });

  return w;
}

export async function spawnAddonOverlay(
  manifest: AddonManifest,
): Promise<WebviewWindow | null> {
  // Headless addons (service-only, no overlay window) never spawn a
  // webview. Calling this on one is a no-op rather than an error so
  // callers can pass any manifest without first checking.
  const primary = primarySpec(manifest);
  if (!primary) return null;

  const primaryWin = await spawnOne(manifest, primary, "primary");
  const secondary = secondarySpec(manifest);
  if (secondary) {
    await spawnOne(manifest, secondary, "secondary");
  }
  return primaryWin;
}

export async function closeAddonOverlay(addonId: string): Promise<void> {
  // Close both webviews if the addon has a secondary. Tolerates the
  // primary-only case (the secondary lookup just returns null).
  const labels = [overlayLabel(addonId), overlaySecondaryLabel(addonId)];
  for (const label of labels) {
    const w = await WebviewWindow.getByLabel(label);
    if (w) await w.close();
  }
}

export async function setAddonOverlayLocked(
  addonId: string,
  locked: boolean,
): Promise<void> {
  const manifest = getAddon(addonId);

  // Apply the OS-level cursor-ignore per-window — the primary and
  // secondary may have different `interactiveWhenLocked` settings.
  const primaryWin = await WebviewWindow.getByLabel(overlayLabel(addonId));
  if (primaryWin && !manifest?.interactiveWhenLocked) {
    await primaryWin.setIgnoreCursorEvents(locked);
  }
  const secondaryWin = await WebviewWindow.getByLabel(
    overlaySecondaryLabel(addonId),
  );
  if (secondaryWin && !manifest?.secondaryInteractiveWhenLocked) {
    await secondaryWin.setIgnoreCursorEvents(locked);
  }

  await setOverlayLocked(addonId, locked);

  // Tell any interactive-when-locked window to update its own
  // visual lock styling (drag suppression via CSS). Fired once per
  // addon id — both windows listen for the same event.
  if (
    manifest?.interactiveWhenLocked ||
    manifest?.secondaryInteractiveWhenLocked
  ) {
    await emitOverlayConfigChanged({ addon_id: addonId, locked });
  }
}

/** Reconcile the open overlays against the enabled-addon set.
 *  Idempotent. Handles both primary and secondary webviews. */
export async function syncOverlays(
  enabledAddons: readonly AddonManifest[],
): Promise<void> {
  // Build the set of every label that SHOULD exist for the current
  // enabled set — primary for any overlay addon, plus secondary
  // when the manifest declares one.
  const wanted = new Set<string>();
  const spawnable: AddonManifest[] = [];
  for (const m of enabledAddons) {
    if (!hasOverlay(m)) continue;
    spawnable.push(m);
    wanted.add(overlayLabel(m.id));
    if (m.secondaryEntryRoute) {
      wanted.add(overlaySecondaryLabel(m.id));
    }
  }

  const all = await getAllWebviewWindows();
  const existing = new Set<string>();
  for (const w of all) {
    if (!w.label.startsWith("overlay-")) continue;
    existing.add(w.label);
    if (!wanted.has(w.label)) {
      await w.close();
    }
  }

  for (const m of spawnable) {
    const primaryLabel = overlayLabel(m.id);
    const secondaryLabel = overlaySecondaryLabel(m.id);
    const needPrimary = !existing.has(primaryLabel);
    const needSecondary =
      Boolean(m.secondaryEntryRoute) && !existing.has(secondaryLabel);

    if (needPrimary || needSecondary) {
      // spawnAddonOverlay is idempotent (returns the existing
      // webview if already open) so calling it when only one of
      // the two needs spawning is safe.
      await spawnAddonOverlay(m);
    }
  }
}

function bindBoundsPersistence(
  w: WebviewWindow,
  addonId: string,
  view: OverlayView,
): void {
  let timer: number | null = null;
  const debounceSave = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const pos = await w.outerPosition();
        const size = await w.outerSize();
        const scale = await w.scaleFactor();
        await setOverlayBounds(
          addonId,
          {
            x: Math.round(pos.x / scale),
            y: Math.round(pos.y / scale),
            width: Math.round(size.width / scale),
            height: Math.round(size.height / scale),
          },
          view,
        );
      } catch (e) {
        console.warn(
          `[overlay] persist failed for ${addonId} (${view}):`,
          e,
        );
      }
    }, DEBOUNCE_MS);
  };
  w.onMoved(debounceSave);
  w.onResized(debounceSave);
}
