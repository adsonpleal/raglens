// Settings panel rendered inside the per-addon modal:
//   - row visibility checkboxes (one per displayed line)
//   - rolling window radio group used by all rate / ETA calcs

import { useEffect, useState } from "react";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import {
  xpMeterDefaultConfig,
  xpMeterRowLabels,
  xpMeterWindowOptions,
  type XpMeterConfig,
  type XpMeterRowKey,
} from "./config";

const ADDON_ID = "xp-meter";

export function XpMeterSettings() {
  const [config, setConfigState] = useState<XpMeterConfig>(xpMeterDefaultConfig);

  useEffect(() => {
    let cancelled = false;
    getAddonConfig(ADDON_ID, xpMeterDefaultConfig)
      .then((c) => {
        if (!cancelled) setConfigState(c);
      })
      .catch((e) => console.warn("[xp settings] load failed:", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<XpMeterConfig>) => {
    const next = { ...config, ...patch };
    setConfigState(next);
    await setAddonConfig(ADDON_ID, next);
    await emitOverlayConfigChanged({
      addon_id: ADDON_ID,
      addon_config_changed: true,
    });
  };

  const rows = Object.entries(xpMeterRowLabels(config.windowMs)) as [
    XpMeterRowKey,
    string,
  ][];

  return (
    <>
      <section className="modal-section">
        <h3>Janela de tempo</h3>
        <p className="muted modal-hint">
          Período usado pra calcular XP/min e ETA.
        </p>
        <div className="modal-radio-group">
          {xpMeterWindowOptions.map((opt) => (
            <label key={opt.value} className="modal-radio">
              <input
                type="radio"
                name="xp-window-ms"
                value={opt.value}
                checked={config.windowMs === opt.value}
                onChange={() => update({ windowMs: opt.value })}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="modal-section">
        <h3>Exibição</h3>
        <p className="muted modal-hint">
          Desmarque para ocultar a linha no overlay.
        </p>
        <ul className="modal-checklist">
          {rows.map(([key, label]) => (
            <li key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={config[key] as boolean}
                  onChange={(e) =>
                    update({
                      [key]: e.target.checked,
                    } as Partial<XpMeterConfig>)
                  }
                />
                <span>{label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
