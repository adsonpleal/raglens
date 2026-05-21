import type { AddonManifest } from "./types";
import { disconnectNotifyManifest } from "./disconnect-notify/manifest";
import { lastTeleportManifest } from "./last-teleport/manifest";
import { petFeederManifest } from "./pet-feeder/manifest";
import { xpMeterManifest } from "./xp-meter/manifest";

export const ADDONS: readonly AddonManifest[] = [
  xpMeterManifest,
  petFeederManifest,
  lastTeleportManifest,
  disconnectNotifyManifest,
];

export function getAddon(id: string): AddonManifest | undefined {
  return ADDONS.find((a) => a.id === id);
}
