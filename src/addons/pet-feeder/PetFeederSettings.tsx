// Settings panel for the pet feeder. Mirrors XpMeterSettings'
// structure (load on mount, update via the shared store + emit a
// config-changed event so the overlay re-reads). Sections: Aparência
// (which rows show), Alertas visuais, Som (per-event sounds +
// volume), Notificações (push/Windows masters + per-event matrix),
// and Tamanho (UI scale).

import { useEffect, useRef, useState } from "react";
import { NtfyHelpModal } from "../../components/NtfyHelpModal";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import {
  BUILT_IN_SOUNDS,
  PET_NOTIFICATION_EVENTS,
  petFeederDefaultConfig,
  type PetFeederConfig,
} from "./config";
import { sendNtfyPush } from "./ntfy";
import { importSound, listCustomSounds, playSound } from "./sounds";
import { ensureWinPermission, sendWindowsNotification } from "./winNotify";

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
  const [showNtfyHelp, setShowNtfyHelp] = useState(false);
  type TestStatus = "idle" | "sending" | "sent" | "failed" | "denied";
  const [pushTestStatus, setPushTestStatus] = useState<TestStatus>("idle");
  const [winTestStatus, setWinTestStatus] = useState<TestStatus>("idle");
  /** `null` until we've checked, then `true`/`false`. Drives the
   *  inline "permission denied" hint under the master toggle so the
   *  user sees *why* enabling the channel won't produce toasts. */
  const [winPermissionGranted, setWinPermissionGranted] = useState<
    boolean | null
  >(null);
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
        <h3>Notificações</h3>
        <p className="muted modal-hint">
          Avise você quando o mascote precisa de atenção, mesmo com
          o Raglens em segundo plano. Cada evento pode ser silenciado
          em um canal sem afetar o outro.
        </p>

        <div className="notify-channel">
          <label className="modal-radio">
            <input
              type="checkbox"
              checked={config.pushEnabled}
              onChange={(e) => {
                setPushTestStatus("idle");
                void update({ pushEnabled: e.target.checked });
              }}
            />
            <span>
              <strong>Push (ntfy.sh)</strong> — envia para o celular
            </span>
          </label>
          <div className="modal-shortcut-row">
            <input
              id="pet-ntfy-topic"
              className="modal-input"
              type="text"
              placeholder="ex: pet-abelha-rainha-x7k2"
              spellCheck={false}
              value={config.pushNtfyTopic}
              disabled={!config.pushEnabled}
              onChange={(e) => {
                setPushTestStatus("idle");
                void update({ pushNtfyTopic: e.target.value });
              }}
            />
            <button
              type="button"
              className="ghost"
              title="Como configurar"
              onClick={() => setShowNtfyHelp(true)}
            >
              ?
            </button>
            <button
              type="button"
              className="ghost"
              disabled={
                !config.pushEnabled ||
                !config.pushNtfyTopic.trim() ||
                pushTestStatus === "sending"
              }
              onClick={async () => {
                setPushTestStatus("sending");
                const ok = await sendNtfyPush(config.pushNtfyTopic, {
                  title: "Raglens - teste",
                  body: "Se você está lendo isso no celular, a configuração do ntfy está funcionando.",
                  priority: "default",
                  tags: ["test_tube"],
                });
                setPushTestStatus(ok ? "sent" : "failed");
              }}
            >
              {pushTestStatus === "sending" ? "Enviando…" : "Testar"}
            </button>
          </div>
          {pushTestStatus === "sent" && (
            <span className="muted modal-hint">
              ✓ Enviado. Cheque o app ntfy no celular.
            </span>
          )}
          {pushTestStatus === "failed" && (
            <span className="muted modal-hint" style={{ color: "#ffb070" }}>
              ✗ Falhou. Verifique a conexão e o nome do tópico.
            </span>
          )}
        </div>

        <div className="notify-channel">
          <label className="modal-radio">
            <input
              type="checkbox"
              checked={config.winEnabled}
              onChange={async (e) => {
                // Update the config *first* so the checkbox visibly
                // toggles regardless of permission state — the
                // permission check follows and surfaces an inline
                // hint if Windows hasn't granted yet. Without this
                // ordering, a denied permission silently swallowed
                // the click and the user thought the toggle was
                // broken.
                const enabling = e.target.checked;
                setWinTestStatus("idle");
                await update({ winEnabled: enabling });
                if (enabling) {
                  const granted = await ensureWinPermission();
                  setWinPermissionGranted(granted);
                }
              }}
            />
            <span>
              <strong>Windows</strong> — toast nativo do sistema
            </span>
          </label>
          {config.winEnabled && winPermissionGranted === false && (
            <span className="muted modal-hint" style={{ color: "#ffb070" }}>
              Permissão do Windows não concedida. Libere em
              Configurações → Sistema → Notificações → Raglens, ou
              tente o botão Testar abaixo.
            </span>
          )}
          <div className="modal-shortcut-row">
            <button
              type="button"
              className="ghost"
              disabled={!config.winEnabled || winTestStatus === "sending"}
              onClick={async () => {
                setWinTestStatus("sending");
                // The test button is the user's "try again" path —
                // re-request permission here too in case they granted
                // it via Windows Settings between the master-toggle
                // click and now.
                const granted = await ensureWinPermission();
                setWinPermissionGranted(granted);
                if (!granted) {
                  setWinTestStatus("denied");
                  return;
                }
                const ok = await sendWindowsNotification(
                  "Raglens - teste",
                  "Se você está vendo esta notificação no Windows, a configuração está OK.",
                );
                setWinTestStatus(ok ? "sent" : "failed");
              }}
            >
              {winTestStatus === "sending" ? "Enviando…" : "Testar"}
            </button>
            {winTestStatus === "sent" && (
              <span className="muted modal-hint">✓ Enviada.</span>
            )}
            {winTestStatus === "failed" && (
              <span className="muted modal-hint" style={{ color: "#ffb070" }}>
                ✗ Falhou — verifique as notificações do Windows.
              </span>
            )}
            {winTestStatus === "denied" && (
              <span className="muted modal-hint" style={{ color: "#ffb070" }}>
                Permissão negada. Libere em Configurações do Windows
                → Sistema → Notificações.
              </span>
            )}
          </div>
        </div>

        <div className="notify-matrix" role="grid">
          <div className="notify-matrix__row notify-matrix__head" role="row">
            <span role="columnheader">Evento</span>
            <span role="columnheader">Push</span>
            <span role="columnheader">Windows</span>
          </div>
          {PET_NOTIFICATION_EVENTS.map(({ id, label, pushKey, winKey }) => (
            <div className="notify-matrix__row" role="row" key={id}>
              <span role="rowheader">{label}</span>
              <input
                type="checkbox"
                role="gridcell"
                aria-label={`Push: ${label}`}
                checked={config[pushKey] as boolean}
                disabled={!config.pushEnabled}
                onChange={(e) =>
                  void update({
                    [pushKey]: e.target.checked,
                  } as Partial<PetFeederConfig>)
                }
              />
              <input
                type="checkbox"
                role="gridcell"
                aria-label={`Windows: ${label}`}
                checked={config[winKey] as boolean}
                disabled={!config.winEnabled}
                onChange={(e) =>
                  void update({
                    [winKey]: e.target.checked,
                  } as Partial<PetFeederConfig>)
                }
              />
            </div>
          ))}
        </div>
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
      {showNtfyHelp && (
        <NtfyHelpModal
          onClose={() => setShowNtfyHelp(false)}
          topicExample="pet-abelha-rainha-x7k2"
        />
      )}
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
