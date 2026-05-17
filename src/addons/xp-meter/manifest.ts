import type { AddonManifest } from "../types";

export const xpMeterManifest: AddonManifest = {
  id: "xp-meter",
  name: "Medidor de Experiência",
  description: "XP/min, %/min e ETA para o próximo nível (base e job).",
  defaultSize: { width: 260, height: 140 },
  // TBD: identify ZC_NOTIFY_EXP for latamRO via the dev opcode logger
  // (set RAGLENS_LOG_OPCODES=1 and grep around a kill).
  requiredOpcodes: [],
  entryRoute: "xp-meter",
};
