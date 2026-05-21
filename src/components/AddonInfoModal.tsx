// Addon info modal dispatcher. Switches on addonId so each addon
// owns its own help/explainer content (mirrors how
// AddonSettingsModal dispatches settings panels). Opened from the
// "?" button in the addon list row — that button is rendered when
// the addon's manifest has `hasInfoModal: true`.

import { LastTeleportHelpModal } from "../addons/last-teleport/LastTeleportHelpModal";

type Props = {
  addonId: string | null;
  onClose: () => void;
};

export function AddonInfoModal({ addonId, onClose }: Props) {
  if (!addonId) return null;

  if (addonId === "last-teleport") {
    return <LastTeleportHelpModal onClose={onClose} />;
  }

  return null;
}
