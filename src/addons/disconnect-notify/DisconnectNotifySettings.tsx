// Settings panel for the disconnect-notify addon. Mirrors the
// pet-feeder modal structure (load on mount, persist via the shared
// store, emit a config-changed event so the service hook re-reads).
// Three sections: Eventos (per-kind opt-out), Push (ntfy.sh), and
// Windows (toast). The ntfy help modal is reused from pet-feeder
// patterns — kept inline here so the addon stays self-contained.

import { useEffect, useState } from "react";
import { NtfyHelpModal } from "../../components/NtfyHelpModal";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import { sendNtfyPush } from "../pet-feeder/ntfy";
import {
  ensureWinPermission,
  sendWindowsNotification,
} from "../pet-feeder/winNotify";
import {
  disconnectNotifyDefaultConfig,
  type DisconnectNotifyConfig,
} from "./config";

const ADDON_ID = "disconnect-notify";

type TestStatus = "idle" | "sending" | "sent" | "failed" | "denied";

export function DisconnectNotifySettings() {
  const [config, setConfigState] = useState<DisconnectNotifyConfig>(
    disconnectNotifyDefaultConfig,
  );
  const [showNtfyHelp, setShowNtfyHelp] = useState(false);
  const [pushTestStatus, setPushTestStatus] = useState<TestStatus>("idle");
  const [winTestStatus, setWinTestStatus] = useState<TestStatus>("idle");
  const [winPermissionGranted, setWinPermissionGranted] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getAddonConfig(ADDON_ID, disconnectNotifyDefaultConfig)
      .then((c) => {
        if (!cancelled) setConfigState(c);
      })
      .catch((e) =>
        console.warn("[disconnect-notify settings] load failed:", e),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<DisconnectNotifyConfig>) => {
    const next = { ...config, ...patch };
    setConfigState(next);
    await setAddonConfig(ADDON_ID, next);
    await emitOverlayConfigChanged({
      addon_id: ADDON_ID,
      addon_config_changed: true,
    });
  };

  return (
    <>
      <section className="modal-section">
        <h3>Notificações</h3>
        <p className="muted modal-hint">
          Avisa em tempo real quando você é desconectado do servidor,
          mesmo com o Raglens em segundo plano. Desconexões
          intencionais (voltar à seleção de personagem) nunca
          disparam.
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
              className="modal-input"
              type="text"
              placeholder="ex: raglens-disc-x7k2"
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
                  title: "Raglens — teste",
                  body: "Se você está lendo isso no celular, o aviso de desconexão está pronto.",
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
                const granted = await ensureWinPermission();
                setWinPermissionGranted(granted);
                if (!granted) {
                  setWinTestStatus("denied");
                  return;
                }
                const ok = await sendWindowsNotification(
                  "Raglens — teste",
                  "Se você está vendo esta notificação, o aviso de desconexão está pronto.",
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
                Permissão negada. Libere em Configurações do Windows →
                Sistema → Notificações.
              </span>
            )}
          </div>
        </div>
      </section>
      {showNtfyHelp && (
        <NtfyHelpModal
          onClose={() => setShowNtfyHelp(false)}
          topicExample="raglens-disc-x7k2"
        />
      )}
    </>
  );
}
