import type { AddonManifest } from "../addons/types";
import { t } from "../i18n/pt-br";

type Props = {
  manifest: AddonManifest;
  enabled: boolean;
  locked: boolean;
  alwaysVisible: boolean;
  onToggle: () => void;
  onLockToggle: (value: boolean) => void;
  onAlwaysVisibleToggle: (value: boolean) => void;
  onConfigure: () => void;
};

export function AddonRow({
  manifest,
  enabled,
  locked,
  alwaysVisible,
  onToggle,
  onLockToggle,
  onAlwaysVisibleToggle,
  onConfigure,
}: Props) {
  return (
    <li className="addon-row">
      <div className="addon-meta">
        <strong>{manifest.name}</strong>
        <span className="muted">{manifest.description}</span>
      </div>
      <div className="addon-controls">
        {enabled && (
          <>
            <label className="addon-check">
              <input
                type="checkbox"
                checked={alwaysVisible}
                onChange={(e) => onAlwaysVisibleToggle(e.target.checked)}
              />
              <span>{t.addons.alwaysVisible}</span>
            </label>
            <label className="addon-check">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => onLockToggle(e.target.checked)}
              />
              <span>{t.addons.locked}</span>
            </label>
            <button className="ghost" onClick={onConfigure}>
              {t.addons.configure}
            </button>
          </>
        )}
        <label className="switch" aria-label={manifest.name}>
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span className="slider" />
        </label>
      </div>
    </li>
  );
}
