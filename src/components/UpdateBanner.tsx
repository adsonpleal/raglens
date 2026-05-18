import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../i18n/pt-br";
import type { ReleaseInfo } from "../lib/updates";

type Props = {
  release: ReleaseInfo;
  onDismiss: () => void;
};

export function UpdateBanner({ release, onDismiss }: Props) {
  return (
    <div className="update-banner">
      <button
        className="update-banner__link"
        onClick={() => {
          void openUrl(release.htmlUrl);
        }}
      >
        {t.update.available.replace("{version}", release.tagName)}
      </button>
      <button
        className="update-banner__close"
        onClick={onDismiss}
        aria-label={t.update.dismiss}
        title={t.update.dismiss}
      >
        ×
      </button>
    </div>
  );
}
