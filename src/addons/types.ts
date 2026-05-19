export type AddonManifest = {
  id: string;
  name: string;
  description: string;
  /** Omitted on headless addons (background services with no overlay
   *  window). When present, the addon gets a dedicated overlay
   *  webview spawned from `lib/overlays.ts`. */
  defaultSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  /**
   * Opcodes (u16, LE) the addon listens on. Informational — used by the
   * UI to indicate which addons will see traffic. Subscription happens
   * via Tauri events emitted by the matching decoder.
   */
  requiredOpcodes: number[];
  /** Optional. Headless addons leave this off — they have no overlay
   *  webview, just a background subscription mounted in MainWindow. */
  entryRoute?: string;
  /**
   * Default global keyboard shortcut for the show/hide toggle, in
   * Tauri accelerator syntax (e.g. "Alt+Shift+E"). Per-user override
   * is persisted under `overlay.<id>.shortcut` in the store. Headless
   * addons leave this off — there's no overlay to toggle.
   */
  defaultShortcut?: string;
};

/** Manifest narrowed to the shape that's guaranteed for overlay
 *  addons — `defaultSize` and `entryRoute` are both required. Drops
 *  out as the return type of the `hasOverlay` type guard. */
export type OverlayAddonManifest = AddonManifest & {
  defaultSize: NonNullable<AddonManifest["defaultSize"]>;
  entryRoute: NonNullable<AddonManifest["entryRoute"]>;
};

/** Type guard: true when the manifest describes an overlay-spawning
 *  addon. Headless service addons return false. Used to filter UI
 *  surfaces that assume an overlay (lock/always-visible toggles,
 *  OverlayHost, appearance editor, shortcut registration). */
export function hasOverlay(
  manifest: AddonManifest,
): manifest is OverlayAddonManifest {
  return manifest.defaultSize !== undefined && manifest.entryRoute !== undefined;
}
