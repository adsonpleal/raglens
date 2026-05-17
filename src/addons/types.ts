export type AddonManifest = {
  id: string;
  name: string;
  description: string;
  defaultSize: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  /**
   * Opcodes (u16, LE) the addon listens on. Informational — used by the
   * UI to indicate which addons will see traffic. Subscription happens
   * via Tauri events emitted by the matching decoder.
   */
  requiredOpcodes: number[];
  entryRoute: string;
};
