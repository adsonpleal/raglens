import { XpMeter } from "../addons/xp-meter/XpMeter";
import { getAddon } from "../addons/registry";
import "../styles/overlay.css";

type Props = {
  addonId: string;
};

const ADDON_COMPONENTS: Record<string, React.FC> = {
  "xp-meter": XpMeter,
};

export function OverlayHost({ addonId }: Props) {
  const manifest = getAddon(addonId);
  const Component = ADDON_COMPONENTS[addonId];

  if (!manifest || !Component) {
    return (
      <div className="overlay-shell" data-tauri-drag-region>
        <div className="overlay-body">Addon não encontrado: {addonId}</div>
      </div>
    );
  }

  return (
    <div className="overlay-shell" data-tauri-drag-region>
      <div className="overlay-body" data-tauri-drag-region>
        <Component />
      </div>
    </div>
  );
}
