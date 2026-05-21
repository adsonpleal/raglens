// Per-addon settings dialog. Rendered from MainWindow when the user
// clicks the "Configurar" button on an addon row. The shortcut
// editor section is generic to every addon; the section below it
// switches on addonId for addon-specific config UI (currently only
// the XP meter has any).

import { useEffect, useState } from "react";
import { getAddon } from "../addons/registry";
import { DisconnectNotifySettings } from "../addons/disconnect-notify/DisconnectNotifySettings";
import { LastTeleportSettings } from "../addons/last-teleport/LastTeleportSettings";
import { PetFeederSettings } from "../addons/pet-feeder/PetFeederSettings";
import { XpMeterSettings } from "../addons/xp-meter/XpMeterSettings";
import { hasOverlay } from "../addons/types";
import { AppearanceSection } from "./AppearanceSection";
import { Modal } from "./Modal";

type Props = {
  addonId: string | null;
  currentShortcut: string | undefined;
  onSaveShortcut: (id: string, shortcut: string | null) => void | Promise<void>;
  onClose: () => void;
};

export function AddonSettingsModal({
  addonId,
  currentShortcut,
  onSaveShortcut,
  onClose,
}: Props) {
  if (!addonId) return null;
  const manifest = getAddon(addonId);
  if (!manifest) return null;

  // Shortcut + appearance only apply to addons with an overlay
  // window. Headless service addons (disconnect-notify) skip both
  // and render their own settings directly.
  const showOverlayChrome = hasOverlay(manifest);

  return (
    <Modal title={manifest.name} onClose={onClose}>
      {showOverlayChrome && (
        <>
          <ShortcutSection
            addonId={addonId}
            current={currentShortcut}
            defaultShortcut={manifest.defaultShortcut}
            onSave={onSaveShortcut}
          />
          {/* last-teleport renders the map image edge-to-edge so
            * the overlay background is never visible — hide the
            * appearance picker (bg colour + opacity) for it; the
            * map image gets its own opacity slider inside
            * LastTeleportSettings. */}
          {addonId !== "last-teleport" && (
            <AppearanceSection addonId={addonId} />
          )}
        </>
      )}
      {addonId === "xp-meter" && <XpMeterSettings />}
      {addonId === "pet-feeder" && <PetFeederSettings />}
      {addonId === "last-teleport" && <LastTeleportSettings />}
      {addonId === "disconnect-notify" && <DisconnectNotifySettings />}
    </Modal>
  );
}

function ShortcutSection({
  addonId,
  current,
  defaultShortcut,
  onSave,
}: {
  addonId: string;
  current: string | undefined;
  defaultShortcut: string | undefined;
  onSave: (id: string, shortcut: string | null) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(current ?? "");

  // Keep the input in sync if the outside value changes while the
  // modal is open (e.g. user opens, closes, edits another addon, etc.).
  useEffect(() => {
    setDraft(current ?? "");
  }, [current]);

  const apply = async () => {
    const trimmed = draft.trim();
    await onSave(addonId, trimmed.length === 0 ? null : trimmed);
  };

  const reset = async () => {
    await onSave(addonId, null);
    setDraft(defaultShortcut ?? "");
  };

  return (
    <section className="modal-section">
      <h3>Atalho global</h3>
      <p className="muted modal-hint">
        Pressione esta combinação em qualquer janela para mostrar ou
        esconder o overlay. Use sintaxe estilo{" "}
        <code>Alt+Shift+E</code>.
      </p>
      <div className="modal-shortcut-row">
        <input
          className="modal-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={defaultShortcut ?? "ex: Alt+Shift+E"}
          spellCheck={false}
        />
        <button className="ghost" onClick={apply}>
          Aplicar
        </button>
        <button className="ghost" onClick={reset} title="Voltar ao padrão">
          Padrão
        </button>
      </div>
    </section>
  );
}
