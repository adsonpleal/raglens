import type { AddonManifest } from "./types";
import { petFeederManifest } from "./pet-feeder/manifest";
import { xpMeterManifest } from "./xp-meter/manifest";

export const ADDONS: readonly AddonManifest[] = [
  xpMeterManifest,
  petFeederManifest,
];

export function getAddon(id: string): AddonManifest | undefined {
  return ADDONS.find((a) => a.id === id);
}
