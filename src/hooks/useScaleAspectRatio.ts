// When an addon's UI-scale slider changes, the content scales via
// CSS `zoom` and the OverlayHost's height-lock picks up the new
// content height automatically — but the window width stays at
// whatever the user manually sized it to. The visible result is a
// squashed aspect ratio: the same content gets taller but no wider.
//
// This hook restores the proportion: multiply the current window
// width by the same ratio the user just applied to scale, so a 1.0×
// → 1.5× change widens the window by 50% in lockstep with the height
// growth. First render is a no-op (no previous scale to compare to).

import { useEffect, useRef } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function useScaleAspectRatio(scale: number): void {
  const prevScaleRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevScaleRef.current;
    prevScaleRef.current = scale;

    if (prev === null) {
      // Initial mount — just remember the scale, don't resize. The
      // window already has the user's last-saved bounds at this
      // scale; touching it would fight the persisted geometry.
      return;
    }
    if (prev === scale || prev <= 0 || scale <= 0) return;

    const ratio = scale / prev;
    void (async () => {
      try {
        const w = getCurrentWebviewWindow();
        const outer = await w.outerSize();
        const sf = await w.scaleFactor();
        const curW = Math.round(outer.width / sf);
        const curH = Math.round(outer.height / sf);
        const newWidth = Math.max(80, Math.round(curW * ratio));
        // Height stays as-is; OverlayHost's height-lock will fire on
        // its own when the content reflows post-zoom.
        await w.setSize(new LogicalSize(newWidth, curH));
      } catch (e) {
        console.warn("[overlay] scale-aspect setSize failed:", e);
      }
    })();
  }, [scale]);
}
