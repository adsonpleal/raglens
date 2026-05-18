// Thin wrapper around tauri-plugin-store. Persists:
//   - Overlay bounds + lock state per addon
//   - Enabled addon ids
//   - Selected network interface ipv4
//
// All values are written into a single `raglens.json` file under the
// Tauri app config dir. Keys are namespaced flatly with dots.

import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("raglens.json");

export type OverlayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function getOverlayBounds(
  addonId: string,
): Promise<OverlayBounds | null> {
  return (await store.get<OverlayBounds>(`overlay.${addonId}.bounds`)) ?? null;
}

export async function setOverlayBounds(
  addonId: string,
  bounds: OverlayBounds,
): Promise<void> {
  await store.set(`overlay.${addonId}.bounds`, bounds);
  await store.save();
}

export async function getOverlayLocked(addonId: string): Promise<boolean> {
  return (await store.get<boolean>(`overlay.${addonId}.locked`)) ?? false;
}

export async function setOverlayLocked(
  addonId: string,
  locked: boolean,
): Promise<void> {
  await store.set(`overlay.${addonId}.locked`, locked);
  await store.save();
}

export async function getOverlayAlwaysVisible(addonId: string): Promise<boolean> {
  return (await store.get<boolean>(`overlay.${addonId}.alwaysVisible`)) ?? false;
}

export async function setOverlayAlwaysVisible(
  addonId: string,
  value: boolean,
): Promise<void> {
  await store.set(`overlay.${addonId}.alwaysVisible`, value);
  await store.save();
}

export async function getEnabledAddons(): Promise<string[]> {
  return (await store.get<string[]>("app.enabledAddons")) ?? [];
}

export async function setEnabledAddons(ids: string[]): Promise<void> {
  await store.set("app.enabledAddons", ids);
  await store.save();
}

export async function getSelectedInterface(): Promise<string | null> {
  return (await store.get<string>("app.selectedInterface")) ?? null;
}

export async function setSelectedInterface(ipv4: string): Promise<void> {
  await store.set("app.selectedInterface", ipv4);
  await store.save();
}
