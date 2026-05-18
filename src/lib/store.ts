// Thin wrapper around tauri-plugin-store. Persists:
//   - Overlay bounds + lock state per addon
//   - Enabled addon ids
//   - Selected network interface ipv4
//
// All values are written into a single `raglens.json` file under the
// Tauri app config dir. Keys are namespaced flatly with dots.

import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_APPEARANCE, type OverlayAppearance } from "./appearance";

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

export async function getOverlayUserHidden(addonId: string): Promise<boolean> {
  return (await store.get<boolean>(`overlay.${addonId}.userHidden`)) ?? false;
}

export async function setOverlayUserHidden(
  addonId: string,
  value: boolean,
): Promise<void> {
  await store.set(`overlay.${addonId}.userHidden`, value);
  await store.save();
}

export async function getOverlayAppearance(
  addonId: string,
): Promise<OverlayAppearance> {
  const stored = await store.get<Partial<OverlayAppearance>>(
    `overlay.${addonId}.appearance`,
  );
  return { ...DEFAULT_APPEARANCE, ...(stored ?? {}) };
}

export async function setOverlayAppearance(
  addonId: string,
  appearance: OverlayAppearance,
): Promise<void> {
  await store.set(`overlay.${addonId}.appearance`, appearance);
  await store.save();
}

export async function getOverlayShortcut(
  addonId: string,
): Promise<string | null> {
  return (await store.get<string>(`overlay.${addonId}.shortcut`)) ?? null;
}

export async function setOverlayShortcut(
  addonId: string,
  shortcut: string | null,
): Promise<void> {
  if (shortcut === null) {
    await store.delete(`overlay.${addonId}.shortcut`);
  } else {
    await store.set(`overlay.${addonId}.shortcut`, shortcut);
  }
  await store.save();
}

/** Per-addon arbitrary config blob. The caller supplies defaults
 *  and the returned object is the defaults merged with whatever the
 *  store has, so newly-added fields gracefully take their default
 *  value on old saved configs. */
export async function getAddonConfig<T extends object>(
  addonId: string,
  defaults: T,
): Promise<T> {
  const stored = await store.get<Partial<T>>(`addon.${addonId}.config`);
  return { ...defaults, ...(stored ?? {}) };
}

export async function setAddonConfig<T extends object>(
  addonId: string,
  config: T,
): Promise<void> {
  await store.set(`addon.${addonId}.config`, config);
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

export async function getDismissedUpdateVersion(): Promise<string | null> {
  return (await store.get<string>("app.dismissedUpdateVersion")) ?? null;
}

export async function setDismissedUpdateVersion(version: string): Promise<void> {
  await store.set("app.dismissedUpdateVersion", version);
  await store.save();
}
