import "../styles/overlay.css";

type Props = {
  addonId: string;
};

export function OverlayHost({ addonId }: Props) {
  return (
    <div className="overlay-shell" data-tauri-drag-region>
      <div className="overlay-body" data-tauri-drag-region>
        <p>overlay: {addonId}</p>
      </div>
    </div>
  );
}
