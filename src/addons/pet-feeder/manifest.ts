import type { AddonManifest } from "../types";

export const petFeederManifest: AddonManifest = {
  id: "pet-feeder",
  name: "Informações de Mascote",
  description:
    "Mostra a fome do mascote e avisa quando entra na faixa ideal (Nenhuma, 26-75) para ganhar lealdade.",
  // Width tuned to fit "Satisfeito" + 3-digit hunger comfortably;
  // height covers the default set of rows (header + hunger + timer +
  // meta = 4 rows). The ResizeObserver in OverlayHost locks the
  // actual height to the rendered content after first paint, so this
  // is just the spawn size before that snaps.
  defaultSize: { width: 180, height: 110 },
  // ZC_PROPERTY_PET (0x01a2) for the snapshot when the pet info window
  // opens + ZC_CHANGESTATE_PET (0x01a4) for the hunger / intimacy
  // ticks. Decoded in src-tauri/src/decoders/pet_state.rs.
  requiredOpcodes: [0x01a2, 0x01a4],
  entryRoute: "pet-feeder",
  defaultShortcut: "Alt+Shift+J",
};
