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

/** View suffix for addons that own a secondary webview. Bounds are
 *  persisted per-view; lock / appearance / always-visible /
 *  user-hidden are still per-addon (shared by both windows). */
export type OverlayView = "primary" | "secondary";

function boundsKey(addonId: string, view: OverlayView): string {
  return view === "secondary"
    ? `overlay.${addonId}.secondary.bounds`
    : `overlay.${addonId}.bounds`;
}

export async function getOverlayBounds(
  addonId: string,
  view: OverlayView = "primary",
): Promise<OverlayBounds | null> {
  return (await store.get<OverlayBounds>(boundsKey(addonId, view))) ?? null;
}

export async function setOverlayBounds(
  addonId: string,
  bounds: OverlayBounds,
  view: OverlayView = "primary",
): Promise<void> {
  await store.set(boundsKey(addonId, view), bounds);
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

/** Discrete tick model for a pet type: how many hunger points the
 *  server decrements per hungry tick, and how often the tick fires.
 *  Modelled as `{intervalMs, dropPerTick}` rather than a single
 *  points/sec rate because the on-the-wire behaviour is a step
 *  function — hunger sits at a value for the full interval, then
 *  jumps down by `dropPerTick` in one packet (latamRO observed:
 *  3 pts every 60s, so hunger goes 79 → 76 → 73, never landing on
 *  intermediate values). A continuous-rate model underestimates the
 *  time to the next stage transition because it assumes hunger drifts
 *  smoothly across the threshold, when in reality the next packet
 *  always arrives one full tick after the previous one — and that
 *  packet may overshoot the threshold by up to `dropPerTick - 1`
 *  points. Per-pet because rAthena's `HungryDelay` is configured per
 *  pet type — Porings ≠ Mastering ≠ latamRO's custom values.
 *  Persisted across sessions so each pet type's "Até ideal" countdown
 *  is accurate on first render. See
 *  https://github.com/rathena/rathena/blob/master/db/re/pet_db.yml */
export type PetTickModel = { intervalMs: number; dropPerTick: number };
export type PetHungerTicks = Record<string, PetTickModel>;

export async function getPetHungerTicks(): Promise<PetHungerTicks> {
  return (await store.get<PetHungerTicks>("addon.pet-feeder.ticks")) ?? {};
}

export async function setPetHungerTick(
  petType: number,
  model: PetTickModel,
): Promise<void> {
  const ticks = await getPetHungerTicks();
  ticks[String(petType)] = model;
  await store.set("addon.pet-feeder.ticks", ticks);
  await store.save();
}
