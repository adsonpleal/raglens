import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { CaptureStats, ConnectionInfo } from "./types";

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

export function onConnectionDetected(
  handler: (info: ConnectionInfo) => void,
): Promise<UnlistenFn> {
  return listen<ConnectionInfo>("connection-detected", (e) => handler(e.payload));
}
