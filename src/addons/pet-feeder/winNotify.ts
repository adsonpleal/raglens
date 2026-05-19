// Native Windows toast notifications via tauri-plugin-notification.
//
// Symmetric to ntfy.ts: a single `sendWindowsNotification(title, body)`
// that resolves to `true` on success and `false` on permission denial
// or other failure. The caller (PetFeeder transition effect) decides
// when to invoke based on per-event config; this module only handles
// the cross-channel mechanics.
//
// Permission model: on first call Windows shows its standard
// notification permission prompt. The settings-modal "Permitir
// notificações do Windows" toggle drives this via `ensureWinPermission`
// so the user gets the system dialog at the moment they opt in,
// rather than the first time a pet event fires.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// Module-level cache of the per-webview permission state. The plugin
// reports permission per-webview, so the overlay window may still
// answer "ungranted" right after the user clicked Permitir in the
// settings modal (which ran in the main window). Once we observe a
// granted state here, we don't re-ask the plugin on every send.
// Stays `null` until the first observation.
let permissionCache: boolean | null = null;

async function resolvePermission(): Promise<boolean> {
  if (permissionCache === true) return true;
  let granted = await isPermissionGranted();
  if (!granted) {
    const r = await requestPermission();
    granted = r === "granted";
  }
  permissionCache = granted;
  return granted;
}

export async function sendWindowsNotification(
  title: string,
  body: string,
): Promise<boolean> {
  try {
    if (!(await resolvePermission())) {
      console.warn("[win-notify] permission not granted, skipping", {
        title,
      });
      return false;
    }
    await sendNotification({ title, body });
    if (import.meta.env.DEV) console.info("[win-notify] sent", { title });
    return true;
  } catch (e) {
    // Wipe the cache on failure so the next send re-probes — the
    // permission may have been revoked in Windows Settings while
    // the app was running.
    permissionCache = null;
    console.warn("[win-notify] threw:", e, { title });
    return false;
  }
}

/** Returns `true` if Windows notifications are allowed for this app,
 *  requesting the permission once if it hasn't been answered yet.
 *  Called when the user flips the master "Permitir notificações do
 *  Windows" checkbox so the system prompt shows up at the moment
 *  they opt in. Shares the module-level cache with `sendWindows-
 *  Notification`, so a successful prompt here means the next send
 *  skips the IPC round-trip. */
export async function ensureWinPermission(): Promise<boolean> {
  try {
    return await resolvePermission();
  } catch (e) {
    console.warn("[win-notify] permission check threw:", e);
    return false;
  }
}
