import type { AddonManifest } from "../types";

// Single addon, two webviews:
//   - primary  → LastTeleportMap (transparent overlay over the
//     in-game minimap with top/bottom alignment edges + marker SVG).
//     Default lock behaviour (setIgnoreCursorEvents(true) → full
//     passthrough when locked, so the minimap underneath stays
//     usable).
//   - secondary → LastTeleportControls (small toolbar widget with
//     Prev / Next / Copy and the active-entry label). Opts into
//     `secondaryInteractiveWhenLocked` so the buttons keep working
//     while the addon is locked.
//
// Both webviews share one config blob at
// `addon.last-teleport.config`, one lock state, one always-visible
// flag, one shortcut. Bounds are persisted per-window under
// `overlay.last-teleport.bounds` and `overlay.last-teleport.secondary.bounds`.

export const lastTeleportManifest: AddonManifest = {
  id: "last-teleport",
  name: "Última Localização",
  description:
    "Marca os últimos pontos de teleporte no minimapa, com controles para navegar o histórico e copiar /navi.",
  // PRIMARY = the transparent minimap overlay. Window is NOT
  // drag-resizable — size is driven entirely by `mapUiScale` in
  // the addon config and the current map's image aspect
  // (LastTeleportMap resizes the window when either changes).
  // 128×128 is the spawn-before-any-map-known default; the
  // component re-sizes to the actual image aspect on first map
  // load.
  defaultSize: { width: 128, height: 128 },
  resizable: false,
  // ZC_NPCACK_MAPMOVE — fires for every player warp on latamRO
  // (Fly Wing, portal, Kafra, NPC warpers, /memo recall…). Decoded
  // in src-tauri/src/decoders/warp.rs.
  requiredOpcodes: [0x0091],
  entryRoute: "last-teleport",
  defaultShortcut: "Alt+Shift+L",
  hasInfoModal: true,

  // SECONDARY = the controls widget. Auto-sizes to content in BOTH
  // dimensions (just the button row) and is not drag-resizable.
  secondaryEntryRoute: "last-teleport-controls",
  secondaryDefaultSize: { width: 120, height: 36 },
  secondaryResizable: false,
  secondaryAutoSize: true,
  // Buttons stay clickable while the addon is locked; the CSS in
  // the component absorbs background clicks so the JS drag can't
  // fire.
  secondaryInteractiveWhenLocked: true,
};
