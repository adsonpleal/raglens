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
  /**
   * When true, locking the overlay does NOT call
   * `setIgnoreCursorEvents(true)` — the lock still prevents drag and
   * resize (the addon's CSS uses `pointer-events: none` on its
   * background so background clicks don't drag the window), but
   * buttons and other interactive elements inside the overlay stay
   * clickable. Useful for addons that show in-overlay controls
   * (e.g. the last-teleport history Prev/Next/Copy buttons).
   */
  interactiveWhenLocked?: boolean;
  /**
   * When true, the addon row in the main window shows a "?" button
   * that opens an addon-specific info modal explaining how the addon
   * works (alignment, semantics, gotchas). Wired in
   * `AddonInfoModal`. Lets the user read about the addon before
   * enabling it — without this, the only info button lives inside
   * the overlay itself, which only shows once the addon is on.
   */
  hasInfoModal?: boolean;
  /**
   * Optional secondary window for the addon. When present, enabling
   * the addon spawns TWO transparent webviews — a *primary*
   * (entryRoute / defaultSize / defaultPosition) and a *secondary*
   * (these fields). Both windows share the addon's lock /
   * always-visible / user-hidden state but have independent bounds
   * persisted under `overlay.<id>.secondary.bounds`. Use when one
   * conceptual addon has two visually-distinct surfaces (e.g.
   * last-teleport: a transparent minimap overlay + a small toolbar
   * widget that the user positions separately).
   */
  secondaryEntryRoute?: string;
  secondaryDefaultSize?: { width: number; height: number };
  secondaryDefaultPosition?: { x: number; y: number };
  /** Per-window override of `interactiveWhenLocked` for the
   *  secondary webview. The primary uses the top-level
   *  `interactiveWhenLocked`. */
  secondaryInteractiveWhenLocked?: boolean;
  /** When false, the OS window has no resize handles — the user
   *  can't drag-resize, and any resize is driven programmatically
   *  by the addon (typically tied to a config slider). Defaults to
   *  true (drag-resize allowed). Applies to the primary window. */
  resizable?: boolean;
  /** Per-window override for the secondary webview. Defaults to
   *  true. */
  secondaryResizable?: boolean;
  /** When true, the secondary window auto-sizes to its content in
   *  BOTH dimensions (width and height). Combined with
   *  `secondaryResizable: false` this makes the window snap to
   *  whatever its content takes up — useful for tiny toolbar
   *  widgets that should never be larger than the buttons inside.
   *  Without this flag, `OverlayHost` only locks the height. */
  secondaryAutoSize?: boolean;
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
