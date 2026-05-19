// Settings panel for the pet feeder. Mirrors XpMeterSettings'
// structure (load on mount, update via the shared store + emit a
// config-changed event so the overlay re-reads). Has four sections:
// Aparência (which rows show), Alertas (visual blinks), Som (master
// toggle + per-event sound dropdowns + custom upload + volume), and
// Tamanho (UI scale slider).

import { useEffect, useRef, useState } from "react";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import {
  BUILT_IN_SOUNDS,
  petFeederDefaultConfig,
  type PetFeederConfig,
} from "./config";
import { importSound, listCustomSounds, playSound } from "./sounds";

const ADDON_ID = "pet-feeder";

const APPEARANCE_ROWS: ReadonlyArray<{
  key: keyof PetFeederConfig;
  label: string;
}> = [
  { key: "showHeader", label: "Cabeçalho" },
  { key: "showName", label: "Nome do mascote (quando renomeado)" },
  { key: "showHunger", label: "Fome (estágio + valor)" },
  { key: "showTimer", label: "Tempo até o próximo estágio" },
  { key: "showIntimacy", label: "Lealdade (♥)" },
  { key: "showLevel", label: "Level" },
];

export function PetFeederSettings() {
  const [config, setConfigState] = useState<PetFeederConfig>(
    petFeederDefaultConfig,
  );
  const [customSounds, setCustomSounds] = useState<string[]>([]);
  const optimalUploadRef = useRef<HTMLInputElement>(null);
  const dangerUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAddonConfig(ADDON_ID, petFeederDefaultConfig)
      .then((c) => {
        if (!cancelled) setConfigState(c);
      })
      .catch((e) => console.warn("[pet settings] load failed:", e));
    void refreshSounds();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSounds = async () => {
    setCustomSounds(await listCustomSounds());
  };

  const update = async (patch: Partial<PetFeederConfig>) => {
    const next = { ...config, ...patch };
    setConfigState(next);
    await setAddonConfig(ADDON_ID, next);
    await emitOverlayConfigChanged({
      addon_id: ADDON_ID,
      addon_config_changed: true,
    });
  };

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: "optimalSound" | "dangerSound",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const saved = await importSound(file.name, new Uint8Array(buf));
      await refreshSounds();
      await update({ [slot]: saved } as Partial<PetFeederConfig>);
    } catch (err) {
      console.warn("[pet settings] import failed:", err);
    } finally {
      // Reset so the user can re-pick the same file later.
      e.target.value = "";
    }
  };

  return (
    <>
      <section className="modal-section">
        <h3>Aparência</h3>
        <p className="muted modal-hint">Desmarque para ocultar a linha no overlay.</p>
        <ul className="modal-checklist">
          {APPEARANCE_ROWS.map(({ key, label }) => (
            <li key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={config[key] as boolean}
                  onChange={(e) =>
                    void update({
                      [key]: e.target.checked,
                    } as Partial<PetFeederConfig>)
                  }
                />
                <span>{label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="modal-section">
        <h3>Alertas visuais</h3>
        <ul className="modal-checklist">
          <li>
            <label>
              <input
                type="checkbox"
                checked={config.optimalAlert}
                onChange={(e) =>
                  void update({ optimalAlert: e.target.checked })
                }
              />
              <span>Pisca no estágio ideal (Nenhuma)</span>
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={config.dangerAlert}
                onChange={(e) =>
                  void update({ dangerAlert: e.target.checked })
                }
              />
              <span>Treme em perigo (Fome / Faminto)</span>
            </label>
          </li>
        </ul>
      </section>

      <section className="modal-section">
        <h3>Som</h3>
        <label className="modal-radio">
          <input
            type="checkbox"
            checked={config.soundEnabled}
            onChange={(e) => void update({ soundEnabled: e.target.checked })}
          />
          <span>Tocar sons</span>
        </label>

        <div className="modal-sound-row">
          <span className="modal-sound-label">Estágio ideal</span>
          <select
            className="modal-select"
            value={config.optimalSound}
            disabled={!config.soundEnabled}
            onChange={(e) => void update({ optimalSound: e.target.value })}
          >
            <SoundOptions custom={customSounds} />
          </select>
          <button
            type="button"
            className="ghost"
            disabled={!config.soundEnabled}
            onClick={() =>
              void playSound(config.optimalSound, config.volume, false)
            }
          >
            ▶
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => optimalUploadRef.current?.click()}
          >
            Importar…
          </button>
          <input
            ref={optimalUploadRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => void handleUpload(e, "optimalSound")}
          />
        </div>
        <label className="modal-radio modal-sound-loop">
          <input
            type="checkbox"
            checked={config.optimalSoundLoop}
            disabled={!config.soundEnabled}
            onChange={(e) =>
              void update({ optimalSoundLoop: e.target.checked })
            }
          />
          <span>Tocar em loop enquanto estiver no estágio ideal</span>
        </label>

        <div className="modal-sound-row">
          <span className="modal-sound-label">Perigo</span>
          <select
            className="modal-select"
            value={config.dangerSound}
            disabled={!config.soundEnabled}
            onChange={(e) => void update({ dangerSound: e.target.value })}
          >
            <SoundOptions custom={customSounds} />
          </select>
          <button
            type="button"
            className="ghost"
            disabled={!config.soundEnabled}
            onClick={() =>
              void playSound(config.dangerSound, config.volume, false)
            }
          >
            ▶
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => dangerUploadRef.current?.click()}
          >
            Importar…
          </button>
          <input
            ref={dangerUploadRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => void handleUpload(e, "dangerSound")}
          />
        </div>
        <label className="modal-radio modal-sound-loop">
          <input
            type="checkbox"
            checked={config.dangerSoundLoop}
            disabled={!config.soundEnabled}
            onChange={(e) =>
              void update({ dangerSoundLoop: e.target.checked })
            }
          />
          <span>Tocar em loop enquanto estiver em perigo</span>
        </label>

        <label className="modal-label">Volume: {config.volume}%</label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          className="appearance-slider"
          value={config.volume}
          disabled={!config.soundEnabled}
          onChange={(e) =>
            void update({ volume: parseInt(e.target.value, 10) })
          }
        />
      </section>

      <section className="modal-section">
        <h3>Tamanho da interface</h3>
        <label className="modal-label">
          Escala: {Math.round(config.uiScale * 100)}%
        </label>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          className="appearance-slider"
          value={Math.round(config.uiScale * 100)}
          onChange={(e) =>
            void update({ uiScale: parseInt(e.target.value, 10) / 100 })
          }
        />
      </section>
    </>
  );
}

function SoundOptions({ custom }: { custom: readonly string[] }) {
  return (
    <>
      {BUILT_IN_SOUNDS.map(({ id, label }) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
      {custom.length > 0 && (
        <optgroup label="Personalizados">
          {custom.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
