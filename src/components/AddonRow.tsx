import type { AddonManifest } from "../addons/types";
import { hasOverlay } from "../addons/types";
import { t } from "../i18n/pt-br";

type Props = {
  manifest: AddonManifest;
  enabled: boolean;
  locked: boolean;
  alwaysVisible: boolean;
  lockToGame: boolean;
  onToggle: () => void;
  onLockToggle: (value: boolean) => void;
  onAlwaysVisibleToggle: (value: boolean) => void;
  onLockToGameToggle: (value: boolean) => void;
  onConfigure: () => void;
  onInfo: () => void;
};

export function AddonRow({
  manifest,
  enabled,
  locked,
  alwaysVisible,
  lockToGame,
  onToggle,
  onLockToggle,
  onAlwaysVisibleToggle,
  onLockToGameToggle,
  onConfigure,
  onInfo,
}: Props) {
  return (
    <li className="addon-row">
      <div className="addon-meta">
        <strong>{manifest.name}</strong>
        <span className="muted">{manifest.description}</span>
      </div>
      <div className="addon-controls">
        {manifest.hasInfoModal && (
          <button
            className="ghost icon-button"
            onClick={onInfo}
            title="Como funciona"
            aria-label={`Informações sobre ${manifest.name}`}
          >
            ?
          </button>
        )}
        {enabled && (
          <>
            {hasOverlay(manifest) && (
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
                <label className="addon-check">
                  <input
                    type="checkbox"
                    checked={lockToGame}
                    onChange={(e) => onLockToGameToggle(e.target.checked)}
                  />
                  <span>{t.addons.lockToGame}</span>
                </label>
              </>
            )}
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
