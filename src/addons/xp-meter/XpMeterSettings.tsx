// Settings panel rendered inside the per-addon modal. Six checkboxes
// — one per visible row of the XP meter. Default state is all-on;
// unchecking hides that row in the overlay.

import { useEffect, useState } from "react";
import { emitOverlayConfigChanged } from "../../lib/events";
import { getAddonConfig, setAddonConfig } from "../../lib/store";
import {
  xpMeterDefaultConfig,
  xpMeterRowLabels,
  type XpMeterConfig,
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

  const rows = Object.entries(xpMeterRowLabels) as [
    keyof XpMeterConfig,
    string,
  ][];

  return (
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
                checked={config[key]}
                onChange={(e) => update({ [key]: e.target.checked } as Partial<XpMeterConfig>)}
              />
              <span>{label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
