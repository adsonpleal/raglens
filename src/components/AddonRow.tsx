import type { AddonManifest } from "../addons/types";
import { t } from "../i18n/pt-br";

type Props = {
  manifest: AddonManifest;
  enabled: boolean;
  locked: boolean;
  onToggle: () => void;
  onLockToggle: (value: boolean) => void;
};

export function AddonRow({
  manifest,
  enabled,
  locked,
  onToggle,
  onLockToggle,
}: Props) {
  return (
    <li className="addon-row">
      <div className="addon-meta">
        <strong>{manifest.name}</strong>
        <span className="muted">{manifest.description}</span>
      </div>
      <div className="addon-controls">
        {enabled && (
          <button
            className="ghost"
            onClick={() => onLockToggle(!locked)}
          >
            {locked ? t.addons.unlock : t.addons.lock}
          </button>
        )}
        <label className="switch" aria-label={manifest.name}>
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span className="slider" />
        </label>
      </div>
    </li>
  );
}
