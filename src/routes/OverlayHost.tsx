import { useEffect, useRef, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { LastTeleportControls } from "../addons/last-teleport/LastTeleportControls";
import { LastTeleportMap } from "../addons/last-teleport/LastTeleportMap";
import { PetFeeder } from "../addons/pet-feeder/PetFeeder";
import { XpMeter } from "../addons/xp-meter/XpMeter";
import { getAddon } from "../addons/registry";
import { useDraggableWindow } from "../hooks/useDraggableWindow";
import { useOverlayAppearance } from "../hooks/useOverlayAppearance";
import { useSelectedPid } from "../hooks/useSelectedPid";
import {
  onClientUpdated,
  onForegroundChanged,
  onOverlayConfigChanged,
} from "../lib/events";
import { getForegroundPid, listClients, raglensPid } from "../lib/invoke";
import {
  getOverlayAlwaysVisible,
  getOverlayUserHidden,
} from "../lib/store";
import type { OverlayView } from "../lib/store";
import { appearanceCssVars } from "../lib/appearance";
import type { ClientInfo } from "../lib/types";
import "../styles/overlay.css";

type Props = {
  addonId: string;
  view?: OverlayView;
};

const ADDON_COMPONENTS: Record<
  string,
  React.FC<{ pid: number; client: ClientInfo | null }>
> = {
  "xp-meter": XpMeter,
  "pet-feeder": PetFeeder,
  "last-teleport": LastTeleportMap,
};

// Addons that own a second webview. Selected via `?view=secondary`
// in the overlay's URL.
const ADDON_SECONDARY_COMPONENTS: Record<
  string,
  React.FC<{ pid: number; client: ClientInfo | null }>
> = {
  "last-teleport": LastTeleportControls,
};

export function OverlayHost({ addonId, view = "primary" }: Props) {
  const manifest = getAddon(addonId);
  const Component =
    view === "secondary"
      ? ADDON_SECONDARY_COMPONENTS[addonId]
      : ADDON_COMPONENTS[addonId];
  const selectedPid = useSelectedPid();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [alwaysVisible, setAlwaysVisible] = useState(false);
  const [userHidden, setUserHidden] = useState(false);
  const appearance = useOverlayAppearance(addonId);
  const shellRef = useRef<HTMLDivElement>(null);

  // Drag the window from JS so Windows Aero Snap never sees a real
  // OS-driven drag and never offers to snap the overlay to a screen
  // edge.
  useDraggableWindow(shellRef);


  // Hydrate the per-addon config flags from the store on mount,
  // then keep them in sync with `overlay-config-changed` events
  // emitted by the main window when the user flips a toggle (or the
  // global shortcut handler flips userHidden).
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    Promise.all([
      getOverlayAlwaysVisible(addonId),
      getOverlayUserHidden(addonId),
    ])
      .then(([av, uh]) => {
        if (cancelled) return;
        setAlwaysVisible(av);
        setUserHidden(uh);
      })
      .catch((e) => console.warn(`[overlay] hydrate config(${addonId}) failed:`, e));

    onOverlayConfigChanged((evt) => {
      if (evt.addon_id !== addonId || cancelled) return;
      if (typeof evt.always_visible === "boolean") {
        setAlwaysVisible(evt.always_visible);
      }
      if (typeof evt.user_hidden === "boolean") {
        setUserHidden(evt.user_hidden);
      }
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [addonId]);

  // Track the selected client's full info so the overlay can render
  // its title once ZC_ACK_REQNAME_TITLE has fired.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const refresh = async () => {
      if (selectedPid === null) {
        setClient(null);
        return;
      }
      try {
        const all = await listClients();
        if (cancelled) return;
        setClient(all.find((c) => c.pid === selectedPid) ?? null);
      } catch (e) {
        console.warn("[overlay] list_clients failed:", e);
      }
    };

    refresh();
    onClientUpdated(refresh).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [selectedPid]);

  // Lock the window's height (and optionally width) to its content.
  // For most addons the user can still resize horizontally; for
  // addons that opt into `secondaryAutoSize` (last-teleport
  // controls), width is also locked so the window snaps to its
  // content in both dimensions.
  //
  // We use a "drain" loop instead of a single in-flight flag: the
  // ResizeObserver only updates a pending target, and a single
  // drain task runs locks until pending == last-locked. Without
  // this, a rapid sequence — placeholder size → real content size
  // arriving milliseconds later from the hydrate path — could land
  // the second fire while a lock is in flight, drop it, and leave
  // the window stuck at the placeholder size with a webview-side
  // scrollbar over the overflowing content.
  const lockBothDimensions = !!(
    view === "secondary" && manifest?.secondaryAutoSize
  );
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    let cancelled = false;
    let pendingWidth = 0;
    let pendingHeight = 0;
    let lastLockedWidth = 0;
    let lastLockedHeight = 0;
    let draining = false;
    const w = getCurrentWebviewWindow();

    const lock = async (width: number, height: number): Promise<void> => {
      try {
        if (lockBothDimensions) {
          await w.setMinSize(new LogicalSize(width, height));
          await w.setMaxSize(new LogicalSize(width, height));
        } else {
          await w.setMinSize(new LogicalSize(80, height));
          await w.setMaxSize(new LogicalSize(4096, height));
        }
        const outer = await w.outerSize();
        const scale = await w.scaleFactor();
        const curW = Math.round(outer.width / scale);
        const curH = Math.round(outer.height / scale);
        const targetW = lockBothDimensions ? width : curW;
        if (curW !== targetW || curH !== height) {
          await w.setSize(new LogicalSize(targetW, height));
        }
      } catch (e) {
        console.warn("[overlay] size lock failed:", e);
      }
    };

    const drain = async () => {
      if (draining || cancelled) return;
      draining = true;
      // Re-check after each lock — if a new fire updated pending
      // while we were locking, run again with the latest target.
      while (
        !cancelled &&
        pendingHeight > 0 &&
        (pendingHeight !== lastLockedHeight ||
          (lockBothDimensions && pendingWidth !== lastLockedWidth))
      ) {
        const targetW = pendingWidth;
        const targetH = pendingHeight;
        await lock(targetW, targetH);
        lastLockedWidth = targetW;
        lastLockedHeight = targetH;
      }
      draining = false;
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      pendingWidth = Math.ceil(
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width,
      );
      pendingHeight = Math.ceil(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      );
      void drain();
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [addonId, lockBothDimensions]);

  // Visibility:
  //  - userHidden (toggled via global shortcut) → hidden, full stop.
  //  - No client selected → hidden.
  //  - alwaysVisible → shown.
  //  - else → shown when bound Ragexe or raglens is foreground.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    const w = getCurrentWebviewWindow();

    (async () => {
      const ownPid = await raglensPid();
      const apply = async (fg: number | null) => {
        if (cancelled) return;
        if (userHidden || selectedPid === null) {
          try {
            await w.hide();
          } catch (e) {
            console.error("[overlay] hide failed:", e);
          }
          return;
        }
        const visible =
          alwaysVisible ||
          fg === null ||
          fg === selectedPid ||
          fg === ownPid;
        try {
          if (visible) await w.show();
          else await w.hide();
        } catch (e) {
          console.error("[overlay] show/hide failed:", e);
        }
      };

      const initial = await getForegroundPid();
      if (cancelled) return;
      await apply(initial);

      const u = await onForegroundChanged((e) => {
        void apply(e.pid);
      });
      if (cancelled) u();
      else unlisten = u;
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [selectedPid, alwaysVisible, userHidden]);

  const bodyStyle = appearanceCssVars(appearance) as React.CSSProperties;

  if (!manifest || !Component) {
    return (
      <div className="overlay-shell" ref={shellRef}>
        <div className="overlay-body" style={bodyStyle}>
          Addon não encontrado: {addonId}
        </div>
      </div>
    );
  }

  // When selectedPid is null the window itself is hidden, but React
  // still renders this tree — fall through to nothing so we don't
  // build a tree the user will never see.
  if (selectedPid === null) {
    return <div className="overlay-shell" ref={shellRef} />;
  }

  return (
    <div className="overlay-shell" ref={shellRef}>
      <div className="overlay-body" style={bodyStyle}>
        <Component pid={selectedPid} client={client} />
      </div>
    </div>
  );
}
