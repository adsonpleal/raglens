import type { AddonManifest } from "./types";
import { xpMeterManifest } from "./xp-meter/manifest";

export const ADDONS: readonly AddonManifest[] = [xpMeterManifest];

export function getAddon(id: string): AddonManifest | undefined {
  return ADDONS.find((a) => a.id === id);
}
