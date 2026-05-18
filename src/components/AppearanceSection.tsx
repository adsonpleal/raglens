import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_APPEARANCE,
  PRESET_ORDER,
  type OverlayAppearance,
} from "../lib/appearance";
import { emitOverlayConfigChanged } from "../lib/events";
import { getOverlayAppearance, setOverlayAppearance } from "../lib/store";
import { t } from "../i18n/pt-br";

const PERSIST_DEBOUNCE_MS = 300;

type Props = { addonId: string };

export function AppearanceSection({ addonId }: Props) {
  const [appearance, setAppearance] =
    useState<OverlayAppearance>(DEFAULT_APPEARANCE);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOverlayAppearance(addonId)
      .then((a) => {
        if (!cancelled) setAppearance(a);
      })
      .catch((e) =>
        console.warn(`[appearance] load(${addonId}) failed:`, e),
      );
    return () => {
      cancelled = true;
    };
  }, [addonId]);

  // Flush any pending persist on unmount so a write isn't lost if the
  // modal closes mid-drag.
  useEffect(() => {
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, []);

  const update = (next: OverlayAppearance) => {
    if (
      next.preset === appearance.preset &&
      next.opacity === appearance.opacity
    ) {
      return;
    }
    setAppearance(next);
    void emitOverlayConfigChanged({ addon_id: addonId, appearance: next });
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
    }
    persistTimer.current = window.setTimeout(() => {
      void setOverlayAppearance(addonId, next);
    }, PERSIST_DEBOUNCE_MS);
  };

  return (
    <section className="modal-section">
      <h3>{t.appearance.title}</h3>
      <p className="muted modal-hint">{t.appearance.preset}</p>
      <div className="appearance-swatches" role="radiogroup">
        {PRESET_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={appearance.preset === p}
            className={`appearance-swatch appearance-swatch--${p} ${
              appearance.preset === p ? "is-active" : ""
            }`}
            title={t.appearance.presets[p]}
            onClick={() => update({ ...appearance, preset: p })}
          />
        ))}
      </div>

      <p className="muted modal-hint">
        {t.appearance.opacity}: {appearance.opacity}%
      </p>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        className="appearance-slider"
        value={appearance.opacity}
        disabled={appearance.preset === "transparent"}
        onChange={(e) =>
          update({
            ...appearance,
            opacity: parseInt(e.target.value, 10),
          })
        }
      />
    </section>
  );
}
