// Backdrop + framed dialog used by every per-feature modal. Owns the
// click-outside-to-close, the stopPropagation on the inner panel,
// and the sticky title/close-button header so each call site
// (AddonSettingsModal, NtfyHelpModal, future ones) doesn't reinvent
// the same dozen lines. The `zIndex` prop exists for the nested-
// modal case (ntfy help opens *on top of* the settings modal).

import type { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Override the default backdrop z-index. The base modal sits at
   *  100 (set in CSS); a stacked modal opened from inside another
   *  needs to be higher so the click-outside-to-close picks the
   *  inner one first. */
  zIndex?: number;
};

export function Modal({ title, onClose, children, zIndex }: Props) {
  return (
    <div
      className="modal-backdrop"
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="ghost icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
