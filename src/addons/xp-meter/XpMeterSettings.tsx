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
const CUSTOM_DEFAULT_MIN = 10;
const CUSTOM_MAX_MIN = 1440;

function isPresetWindow(windowMs: number): boolean {
  return xpMeterWindowOptions.some((o) => o.value === windowMs);
}

export function XpMeterSettings() {
  const [config, setConfigState] = useState<XpMeterConfig>(xpMeterDefaultConfig);
  const [customDraft, setCustomDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAddonConfig(ADDON_ID, xpMeterDefaultConfig)
      .then((c) => {
        if (cancelled) return;
        setConfigState(c);
        if (!isPresetWindow(c.windowMs)) {
          setCustomDraft(String(c.windowMs / 60_000));
        }
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

  const isCustom = !isPresetWindow(config.windowMs);

  const selectCustom = () => {
    const parsed = parseInt(customDraft, 10);
    const minutes =
      Number.isFinite(parsed) && parsed > 0 && parsed <= CUSTOM_MAX_MIN
        ? parsed
        : CUSTOM_DEFAULT_MIN;
    setCustomDraft(String(minutes));
    void update({ windowMs: minutes * 60_000 });
  };

  const onCustomInputChange = (raw: string) => {
    setCustomDraft(raw);
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= CUSTOM_MAX_MIN) {
      void update({ windowMs: parsed * 60_000 });
    }
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
          <label className="modal-radio">
            <input
              type="radio"
              name="xp-window-ms"
              checked={isCustom}
              onChange={selectCustom}
            />
            <span>Personalizado</span>
            <input
              type="number"
              className="modal-input modal-input--inline"
              min={1}
              max={CUSTOM_MAX_MIN}
              step={1}
              placeholder="min"
              value={customDraft}
              onChange={(e) => onCustomInputChange(e.target.value)}
              onFocus={() => {
                if (!isCustom) selectCustom();
              }}
            />
            <span>min</span>
          </label>
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
