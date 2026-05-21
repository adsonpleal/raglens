// Controls-only overlay window. Renders the Prev/Next/Copy toolbar
// and the active-entry label — owns the authoritative `activeIndex`
// state and broadcasts every change via `lt:active-index-changed`
// so the map window's highlighted marker tracks the cursor.
//
// Width is user-resizable; height locks to content via the standard
// OverlayHost ResizeObserver (same pattern as pet-feeder / xp-meter).
// `controlsUiScale` zooms the content and the window auto-widens.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import { onOverlayConfigChanged } from "../../lib/events";
import { getOverlayLocked } from "../../lib/store";
import type { ClientInfo } from "../../lib/types";
import {
  LAST_TELEPORT_CONFIG_KEY,
  lastTeleportDefaultConfig,
} from "./config";
import { emitActiveIndexChanged } from "./shared";
import { useTeleportHistory } from "./useTeleportHistory";
import "./last-teleport-controls.css";

type Props = {
  pid: number;
  client: ClientInfo | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LastTeleportControls({ pid, client: _client }: Props) {
  const config = useAddonConfig(
    LAST_TELEPORT_CONFIG_KEY,
    lastTeleportDefaultConfig,
  );
  const { history } = useTeleportHistory(pid, config.maxHistory);
  // Authoritative cursor — broadcasts to the map window on every
  // change. Reset to 0 on new teleport.
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<
    "idle" | "ok" | "empty" | "failed"
  >("idle");

  // Track lock state. With interactiveWhenLocked, the OS-level
  // cursor passthrough is off, so we apply lock visually via a CSS
  // class — the background absorbs clicks (no drag fires) but the
  // toolbar opts back in via pointer-events.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    getOverlayLocked(LAST_TELEPORT_CONFIG_KEY)
      .then((v) => {
        if (!cancelled) setLocked(v);
      })
      .catch((e) =>
        console.warn("[lt-controls] lock hydrate failed:", e),
      );
    onOverlayConfigChanged((evt) => {
      if (evt.addon_id !== LAST_TELEPORT_CONFIG_KEY || cancelled) return;
      if (typeof evt.locked === "boolean") setLocked(evt.locked);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Reset cursor + tell the map about it whenever a new teleport
  // arrives.
  const latestObservedAt = history.length > 0 ? history[0].observedAt : 0;
  useEffect(() => {
    setActiveIndex(0);
    void emitActiveIndexChanged({ pid, activeIndex: 0 });
  }, [latestObservedAt, pid]);

  const activeEntry = history[activeIndex] ?? null;

  const historyRef = useRef(history);
  historyRef.current = history;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const broadcast = useCallback(
    (next: number) => {
      void emitActiveIndexChanged({ pid, activeIndex: next });
    },
    [pid],
  );

  const goPrev = useCallback(() => {
    const len = historyRef.current.length;
    if (len === 0) return;
    setActiveIndex((i) => {
      const next = Math.min(len - 1, i + 1);
      broadcast(next);
      return next;
    });
  }, [broadcast]);

  const goNext = useCallback(() => {
    if (historyRef.current.length === 0) return;
    setActiveIndex((i) => {
      const next = Math.max(0, i - 1);
      broadcast(next);
      return next;
    });
  }, [broadcast]);

  const copyNavi = useCallback(async () => {
    const entry = historyRef.current[activeIndexRef.current] ?? null;
    if (!entry) {
      setCopyFeedback("empty");
      setTimeout(() => setCopyFeedback("idle"), 1200);
      return;
    }
    const command = `/navi ${entry.map} ${entry.x}/${entry.y}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopyFeedback("ok");
    } catch (e) {
      console.warn("[lt-controls] clipboard write failed:", e);
      setCopyFeedback("failed");
    }
    setTimeout(() => setCopyFeedback("idle"), 1200);
  }, []);

  // Register the three action shortcuts as process-wide globals.
  // Only the controls window registers them — registering from
  // both would collide on the same accelerator.
  useEffect(() => {
    const all: Array<[string, () => void]> = [
      [config.shortcutPrev, goPrev],
      [config.shortcutNext, goNext],
      [config.shortcutCopy, () => void copyNavi()],
    ];
    const desired = all.filter(([accel]) => accel.trim().length > 0);
    const owned: string[] = [];
    let cancelled = false;

    (async () => {
      for (const [accel, handler] of desired) {
        if (cancelled) return;
        try {
          if (await isRegistered(accel)) {
            console.warn(
              `[lt-controls] shortcut ${accel} already registered — skipping`,
            );
            continue;
          }
          await register(accel, (event) => {
            if (event.state !== "Pressed") return;
            handler();
          });
          owned.push(accel);
        } catch (e) {
          console.warn(
            `[lt-controls] failed to register shortcut ${accel}:`,
            e,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const accel of owned) {
        unregister(accel).catch(() => {});
      }
    };
  }, [
    config.shortcutPrev,
    config.shortcutNext,
    config.shortcutCopy,
    goPrev,
    goNext,
    copyNavi,
  ]);

  return (
    <div
      className={`lt-controls${locked ? " lt-controls--locked" : ""}`}
      style={{ zoom: config.controlsUiScale }}
    >
      {/* No `data-no-drag` on the toolbar wrapper itself — the
        *  buttons block drag on their own (they're in
        *  `INTERACTIVE_SELECTOR`), but the toolbar background between
        *  / around them stays draggable. Otherwise the entire
        *  controls window becomes un-draggable whenever the active
        *  label is hidden (e.g. empty history), since the toolbar
        *  is then the only content in the window. */}
      <div className="lt-controls__toolbar">
        <button
          type="button"
          className="lt-controls__btn"
          disabled={history.length <= 1}
          onClick={goPrev}
          title="Anterior (mais antigo)"
          aria-label="Anterior"
        >
          ◀
        </button>
        <button
          type="button"
          className="lt-controls__btn"
          disabled={activeIndex <= 0}
          onClick={goNext}
          title="Próximo (mais recente)"
          aria-label="Próximo"
        >
          ▶
        </button>
        <button
          type="button"
          className="lt-controls__btn lt-controls__btn--copy"
          disabled={!activeEntry}
          onClick={() => void copyNavi()}
          title={
            activeEntry
              ? `Copiar "/navi ${activeEntry.map} ${activeEntry.x}/${activeEntry.y}"`
              : "Sem histórico"
          }
          aria-label="Copiar comando navi"
        >
          {copyLabel(copyFeedback)}
        </button>
      </div>
    </div>
  );
}

function copyLabel(state: "idle" | "ok" | "empty" | "failed"): string {
  switch (state) {
    case "ok":
      return "✓";
    case "empty":
      return "∅";
    case "failed":
      return "✗";
    case "idle":
    default:
      return "📋";
  }
}
