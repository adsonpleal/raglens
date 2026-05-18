import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  CaptureStats,
  ClientDetected,
  ClientUpdate,
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
