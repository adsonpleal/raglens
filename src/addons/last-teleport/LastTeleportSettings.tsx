// Shared settings panel for the two last-teleport addons (map +
// controls). Reads/writes a SINGLE config blob at
// `addon.last-teleport.config` and emits `overlay-config-changed`
// with `addon_id: "last-teleport"` — both overlay windows call
// `useAddonConfig("last-teleport", ...)` so they pick up the change.

import { useEffect, useState } from "react";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import {
  LAST_TELEPORT_CONFIG_KEY,
  MAX_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT,
  lastTeleportDefaultConfig,
  type LastTeleportConfig,
  type MarkerShape,
} from "./config";
import { LastTeleportHelpModal } from "./LastTeleportHelpModal";

export function LastTeleportSettings() {
  const [config, setConfigState] = useState<LastTeleportConfig>(
    lastTeleportDefaultConfig,
  );
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAddonConfig(LAST_TELEPORT_CONFIG_KEY, lastTeleportDefaultConfig)
      .then((c) => {
        if (!cancelled) setConfigState(c);
      })
      .catch((e) =>
        console.warn("[last-teleport settings] load failed:", e),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<LastTeleportConfig>) => {
    // Clamp `markersShown` whenever it (or `maxHistory`) changes so
    // the UI never persists an inconsistent pair. The visual side
    // also clamps on render, but persisting the clamped value keeps
    // the input fields from snapping back on next mount.
    const merged: LastTeleportConfig = { ...config, ...patch };
    merged.maxHistory = clamp(
      merged.maxHistory,
      MIN_HISTORY_LIMIT,
      MAX_HISTORY_LIMIT,
    );
    merged.markersShown = clamp(
      merged.markersShown,
      MIN_HISTORY_LIMIT,
      merged.maxHistory,
    );
    setConfigState(merged);
    await setAddonConfig(LAST_TELEPORT_CONFIG_KEY, merged);
    await emitOverlayConfigChanged({
      addon_id: LAST_TELEPORT_CONFIG_KEY,
      addon_config_changed: true,
    });
  };

  return (
    <>
      <section className="modal-section">
        <h3>Histórico</h3>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Guardar últimas:&nbsp;
            <input
              type="number"
              className="modal-input"
              min={MIN_HISTORY_LIMIT}
              max={MAX_HISTORY_LIMIT}
              value={config.maxHistory}
              onChange={(e) =>
                void update({
                  maxHistory: parseInt(e.target.value, 10) || MIN_HISTORY_LIMIT,
                })
              }
            />
          </label>
        </div>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Mostrar no minimapa:&nbsp;
            <input
              type="number"
              className="modal-input"
              min={MIN_HISTORY_LIMIT}
              max={config.maxHistory}
              value={config.markersShown}
              onChange={(e) =>
                void update({
                  markersShown:
                    parseInt(e.target.value, 10) || MIN_HISTORY_LIMIT,
                })
              }
            />
          </label>
          <button
            type="button"
            className="ghost"
            title="Como funciona"
            onClick={() => setShowHelp(true)}
          >
            ?
          </button>
        </div>
        <p className="muted modal-hint">
          O histórico guarda até {MAX_HISTORY_LIMIT} entradas. A
          quantidade mostrada como marcadores é limitada ao que está
          guardado.
        </p>
      </section>

      <section className="modal-section">
        <h3>Visibilidade</h3>
        <ul className="modal-checklist">
          <li>
            <label>
              <input
                type="checkbox"
                checked={config.showOverlay}
                onChange={(e) =>
                  void update({ showOverlay: e.target.checked })
                }
              />
              <span>Mostrar marcadores no minimapa</span>
            </label>
          </li>
        </ul>
      </section>

      <section className="modal-section">
        <h3>Atalhos das ações</h3>
        <p className="muted modal-hint">
          Atalhos globais (funcionam mesmo com o jogo em foco). Sintaxe
          estilo <code>Alt+Shift+Left</code>. Deixe em branco para
          desligar.
        </p>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Anterior:&nbsp;
            <input
              type="text"
              className="modal-input"
              value={config.shortcutPrev}
              spellCheck={false}
              onChange={(e) => void update({ shortcutPrev: e.target.value })}
            />
          </label>
        </div>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Próximo:&nbsp;
            <input
              type="text"
              className="modal-input"
              value={config.shortcutNext}
              spellCheck={false}
              onChange={(e) => void update({ shortcutNext: e.target.value })}
            />
          </label>
        </div>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Copiar /navi:&nbsp;
            <input
              type="text"
              className="modal-input"
              value={config.shortcutCopy}
              spellCheck={false}
              onChange={(e) => void update({ shortcutCopy: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="modal-section">
        <h3>Aparência dos marcadores</h3>
        <div className="modal-shortcut-row">
          <label className="modal-label">
            Forma:&nbsp;
            <select
              className="modal-select"
              value={config.markerShape}
              onChange={(e) =>
                void update({
                  markerShape: e.target.value as MarkerShape,
                })
              }
            >
              <option value="cross">Cruz</option>
              <option value="dot">Bolinha</option>
            </select>
          </label>
        </div>
        <label className="modal-label">
          Tamanho: {config.markerSize}px
        </label>
        <input
          type="range"
          min={1}
          max={9}
          step={1}
          className="appearance-slider"
          value={config.markerSize}
          onChange={(e) =>
            void update({ markerSize: parseInt(e.target.value, 10) })
          }
        />
      </section>

      <section className="modal-section">
        <h3>Tamanho da janela do mapa</h3>
        <p className="muted modal-hint">
          A janela do mapa não pode ser redimensionada arrastando —
          ajuste o tamanho aqui. A escala multiplica o tamanho
          padrão (220×220).
        </p>
        <label className="modal-label">
          Escala: {Math.round(config.mapUiScale * 100)}%
        </label>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          className="appearance-slider"
          value={Math.round(config.mapUiScale * 100)}
          onChange={(e) =>
            void update({ mapUiScale: parseInt(e.target.value, 10) / 100 })
          }
        />
      </section>

      <section className="modal-section">
        <h3>Opacidade do mapa</h3>
        <p className="muted modal-hint">
          Deixa a imagem do minimapa um pouco transparente para que
          os marcadores se destaquem. Os marcadores e a posição do
          jogador continuam em opacidade total — só a imagem do
          mapa desbota.
        </p>
        <label className="modal-label">
          Opacidade: {config.mapOpacity}%
        </label>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          className="appearance-slider"
          value={config.mapOpacity}
          onChange={(e) =>
            void update({ mapOpacity: parseInt(e.target.value, 10) })
          }
        />
      </section>

      <section className="modal-section">
        <h3>Tamanho da janela dos controles</h3>
        <p className="muted modal-hint">
          Escala os botões e os rótulos da janela de controles.
          A largura da janela acompanha o conteúdo escalado;
          a altura é fixada pelo conteúdo.
        </p>
        <label className="modal-label">
          Escala: {Math.round(config.controlsUiScale * 100)}%
        </label>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          className="appearance-slider"
          value={Math.round(config.controlsUiScale * 100)}
          onChange={(e) =>
            void update({
              controlsUiScale: parseInt(e.target.value, 10) / 100,
            })
          }
        />
      </section>

      {showHelp && (
        <LastTeleportHelpModal onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
