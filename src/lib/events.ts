import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  CaptureStats,
  ClientDetected,
  ClientUpdate,
  ExpGain,
  ExpTotalUpdate,
  ForegroundChanged,
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

export function onExpGain(handler: (gain: ExpGain) => void): Promise<UnlistenFn> {
  return listen<ExpGain>("packet:exp-gain", (e) => handler(e.payload));
}

export function onExpTotal(
  handler: (update: ExpTotalUpdate) => void,
): Promise<UnlistenFn> {
  return listen<ExpTotalUpdate>("packet:exp-totals", (e) => handler(e.payload));
}
