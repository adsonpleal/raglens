// Drags the current Tauri window from JS pointer events instead of
// Tauri's built-in `data-tauri-drag-region` / `startDragging`. The
// native path delegates to the OS window-drag, which on Windows means
// Aero Snap will offer to maximize / half-tile the overlay whenever
// it touches a screen edge. We don't want that for a transparent
// floating overlay — so we move it ourselves and the OS never sees a
// drag operation.
//
// Pointer capture means the drag survives the cursor leaving the
// window mid-motion; without it, fast drags would orphan.

import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";

const INTERACTIVE_SELECTOR =
  "button, input, select, textarea, a, [contenteditable], [data-no-drag]";

/** Make `element` (and its non-interactive descendants) drag the
 *  current Tauri webview window when the user presses-and-moves. */
export function useDraggableWindow(
  ref: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startScreenX = 0;
    let startScreenY = 0;
    let activePointer: number | null = null;

    const w = getCurrentWebviewWindow();

    const onPointerDown = async (e: PointerEvent) => {
      if (e.button !== 0) return; // primary only
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      try {
        const pos = await w.outerPosition();
        const scale = await w.scaleFactor();
        startX = pos.x / scale;
        startY = pos.y / scale;
      } catch (err) {
        console.warn("[drag] read position failed:", err);
        return;
      }

      startScreenX = e.screenX;
      startScreenY = e.screenY;
      dragging = true;
      activePointer = e.pointerId;
      root.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activePointer) return;
      const dx = e.screenX - startScreenX;
      const dy = e.screenY - startScreenY;
      // Fire-and-forget: setPosition is async but each call is fast
      // (a single Win32 SetWindowPos). Queuing them sequentially via
      // await would lag the cursor.
      void w.setPosition(new LogicalPosition(startX + dx, startY + dy));
    };

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      try {
        root.releasePointerCapture(e.pointerId);
      } catch {
        // Already released — fine.
      }
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endDrag);
      root.removeEventListener("pointercancel", endDrag);
    };
  }, [ref]);
}
