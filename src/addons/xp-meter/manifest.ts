import type { AddonManifest } from "../types";

export const xpMeterManifest: AddonManifest = {
  id: "xp-meter",
  name: "Medidor de Experiência",
  description: "XP/min, %/min e ETA para o próximo nível (base e job).",
  defaultSize: { width: 240, height: 190 },
  // ZC_NOTIFY_EXP (0x0acc) for the per-kill delta + ZC_LONGPAR_CHANGE
  // (0x0acb) types 1/2/22/23 for running totals and next-level
  // thresholds. All four decoders live under src-tauri/src/decoders/.
  requiredOpcodes: [0x0acc, 0x0acb],
  entryRoute: "xp-meter",
};
