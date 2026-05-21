// Shared config for the two last-teleport addons (map + controls).
// Persists under `addon.last-teleport.config` — both addons read
// from the same key via `useAddonConfig("last-teleport", ...)` and
// the settings panel writes there + emits a single
// `overlay-config-changed` event with `addon_id: "last-teleport"`
// that both windows listen for.

export type MarkerShape = "dot" | "cross";

export type LastTeleportConfig = {
  /** How many past teleports to keep in the rolling history. The
   *  oldest entries are dropped when this is exceeded. Larger values
   *  let the player scroll further back with Prev/Next, smaller
   *  values keep the minimap legible. */
  maxHistory: number;
  /** How many of the most recent history entries to draw as markers
   *  on the minimap. Clamped to `maxHistory` by the settings UI.
   *  Separate from `maxHistory` so the player can remember more than
   *  they want cluttering the minimap. */
  markersShown: number;
  /** Master toggle for the marker SVG layer in the **map** window.
   *  When off, only the bare minimap image renders — useful for a
   *  streamer who wants the map visible but the teleport trail
   *  private. Toggling the entire controls addon off (in the addon
   *  list) replaces what `showButtons` used to do — the controls
   *  window IS the buttons. */
  showOverlay: boolean;
  /** Visual style of each history marker. */
  markerShape: MarkerShape;
  /** Marker diameter (dot) or arm length (cross) in CSS pixels. */
  markerSize: number;
  /** Opacity of the underlying map image, 0..100. The teleport
   *  markers and player square always render at full opacity on
   *  top — only the minimap PNG fades. Defaults to a slight fade
   *  so the markers pop against the green map terrain. */
  mapOpacity: number;
  /** UI scale for the **map** window (0.5..2.0). Multiplies the
   *  manifest's default 220×220 — drag-resize is disabled, so this
   *  slider is the only way to grow / shrink the map window. */
  mapUiScale: number;
  /** UI scale for the **controls** window — applied as CSS `zoom`
   *  to the toolbar + active label (0.5..2.0). The controls window
   *  is width-resizable / height-locked-to-content so a scale
   *  change automatically widens/narrows the window via the
   *  OverlayHost's normal content-driven sizing. */
  controlsUiScale: number;
  /** Global keyboard shortcut (Tauri accelerator syntax) for moving
   *  the history cursor one step *back* (toward older entries).
   *  Empty string disables the shortcut. */
  shortcutPrev: string;
  /** Global shortcut for the *forward* (toward newer entries) step. */
  shortcutNext: string;
  /** Global shortcut for "copy /navi command for the active entry to
   *  the clipboard". Lets the player paste it into game chat without
   *  alt-tabbing to Raglens. */
  shortcutCopy: string;
};

export const lastTeleportDefaultConfig: LastTeleportConfig = {
  maxHistory: 5,
  markersShown: 3,
  showOverlay: true,
  markerShape: "dot",
  markerSize: 5,
  mapOpacity: 80,
  mapUiScale: 1,
  controlsUiScale: 1,
  shortcutPrev: "Alt+Shift+Left",
  shortcutNext: "Alt+Shift+Right",
  shortcutCopy: "Alt+Shift+C",
};

/** Both addon ids store config under this single key — keep them
 *  in sync by using the same `useAddonConfig` argument. */
export const LAST_TELEPORT_CONFIG_KEY = "last-teleport";

/** Bounds enforced by the settings UI. `maxHistory` upper bound is
 *  arbitrary — more than 20 markers on a minimap becomes noise. */
export const MAX_HISTORY_LIMIT = 20;
export const MIN_HISTORY_LIMIT = 1;
