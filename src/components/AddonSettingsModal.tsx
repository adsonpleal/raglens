// Per-addon settings dialog. Rendered from MainWindow when the user
// clicks the "Configurar" button on an addon row. The shortcut
// editor section is generic to every addon; the section below it
// switches on addonId for addon-specific config UI (currently only
// the XP meter has any).

import { useEffect, useState } from "react";
import { getAddon } from "../addons/registry";
import { PetFeederSettings } from "../addons/pet-feeder/PetFeederSettings";
import { XpMeterSettings } from "../addons/xp-meter/XpMeterSettings";
import { AppearanceSection } from "./AppearanceSection";

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

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{manifest.name}</h2>
          <button
            className="ghost icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        <ShortcutSection
          addonId={addonId}
          current={currentShortcut}
          defaultShortcut={manifest.defaultShortcut}
          onSave={onSaveShortcut}
        />

        <AppearanceSection addonId={addonId} />

        {addonId === "xp-meter" && <XpMeterSettings />}
        {addonId === "pet-feeder" && <PetFeederSettings />}
      </div>
    </div>
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
