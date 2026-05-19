import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import type { OverlayAppearance } from "./appearance";
import type {
  CaptureStats,
  ClientDetected,
  ClientReset,
  ClientUpdate,
  ExpGain,
  ExpTotalUpdate,
  ForegroundChanged,
  PetFedRequest,
  PetStateUpdate,
  SelectedClient,
} from "./types";

export function onCaptureStarted(handler: () => void): Promise<UnlistenFn> {
  return listen("capture-started", () => handler());
}

export function onCaptureStopped(handler: () => void): Promise<UnlistenFn> {
  return listen("capture-stopped", () => handler());
}

export function onCaptureError(handler: (msg: string) => void): Promise<UnlistenFn> {
  return listen<string>("capture-error", (e) => handler(e.payload));
}

export function onCaptureStats(handler: (stats: CaptureStats) => void): Promise<UnlistenFn> {
  return listen<CaptureStats>("capture-stats", (e) => handler(e.payload));
}

export function onClientDetected(
  handler: (info: ClientDetected) => void,
): Promise<UnlistenFn> {
  return listen<ClientDetected>("client-detected", (e) => handler(e.payload));
}

export function onClientUpdated(
  handler: (update: ClientUpdate) => void,
): Promise<UnlistenFn> {
  return listen<ClientUpdate>("client-updated", (e) => handler(e.payload));
}

export function onForegroundChanged(
  handler: (event: ForegroundChanged) => void,
): Promise<UnlistenFn> {
  return listen<ForegroundChanged>("foreground-changed", (e) => handler(e.payload));
}

export function onSelectedClientChanged(
  handler: (event: SelectedClient) => void,
): Promise<UnlistenFn> {
  return listen<SelectedClient>("selected-client-changed", (e) => handler(e.payload));
}

/** Frontend-only event. Main window emits when any per-addon overlay
 *  config setting changes. Overlay windows subscribe and re-fetch
 *  whichever fields they care about from the store. */
export type OverlayConfigChanged = {
  addon_id: string;
  always_visible?: boolean;
  user_hidden?: boolean;
  /** Set true when the addon-specific config (the modal-driven blob
   *  at `addon.<id>.config`) changed. Overlays re-read the config
   *  via `getAddonConfig` rather than receiving it in the payload —
   *  shape is per-addon. */
  addon_config_changed?: boolean;
  /** New per-overlay appearance. Sent inline so consumers don't need
   *  a second store read. */
  appearance?: OverlayAppearance;
};

export function emitOverlayConfigChanged(
  payload: OverlayConfigChanged,
): Promise<void> {
  return emit("overlay-config-changed", payload);
}

export function onOverlayConfigChanged(
  handler: (event: OverlayConfigChanged) => void,
): Promise<UnlistenFn> {
  return listen<OverlayConfigChanged>("overlay-config-changed", (e) =>
    handler(e.payload),
  );
}

export function onExpGain(handler: (gain: ExpGain) => void): Promise<UnlistenFn> {
  return listen<ExpGain>("packet:exp-gain", (e) => handler(e.payload));
}

export function onExpTotal(
  handler: (update: ExpTotalUpdate) => void,
): Promise<UnlistenFn> {
  return listen<ExpTotalUpdate>("packet:exp-totals", (e) => handler(e.payload));
}

export function onPetState(
  handler: (update: PetStateUpdate) => void,
): Promise<UnlistenFn> {
  return listen<PetStateUpdate>("packet:pet-state", (e) => handler(e.payload));
}

export function onPetFedRequest(
  handler: (event: PetFedRequest) => void,
): Promise<UnlistenFn> {
  return listen<PetFedRequest>("packet:pet-fed-request", (e) =>
    handler(e.payload),
  );
}

export function onClientReset(
  handler: (event: ClientReset) => void,
): Promise<UnlistenFn> {
  return listen<ClientReset>("client-reset", (e) => handler(e.payload));
}
