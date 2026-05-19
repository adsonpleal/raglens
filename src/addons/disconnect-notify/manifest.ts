import type { AddonManifest } from "../types";

// Headless service addon — no overlay window, just a background
// subscription that fires Windows toasts / ntfy.sh pushes when the
// Rust side emits a `client-disconnect` event. No `defaultSize`,
// `entryRoute`, or `defaultShortcut`: the addon list shows it with
// just enable + configure, and the service hook is mounted once in
// MainWindow.
//
// requiredOpcodes lists the ZC_NOTIFY_BAN opcode so the addons UI
// can still hint at what packets feed it. RST and timeout sources
// are out-of-band (TCP control + watchdog) so they don't appear.
export const disconnectNotifyManifest: AddonManifest = {
  id: "disconnect-notify",
  name: "Aviso de Desconexão",
  description:
    "Notifica (Windows e/ou celular) quando você é desconectado do servidor de forma inesperada.",
  requiredOpcodes: [0x0081],
};
