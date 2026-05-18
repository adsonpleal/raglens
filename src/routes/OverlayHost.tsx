import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { XpMeter } from "../addons/xp-meter/XpMeter";
import { getAddon } from "../addons/registry";
import { useDraggableWindow } from "../hooks/useDraggableWindow";
import { useSelectedPid } from "../hooks/useSelectedPid";
import {
  onClientUpdated,
  onForegroundChanged,
  onOverlayConfigChanged,
} from "../lib/events";
import { getForegroundPid, listClients, raglensPid } from "../lib/invoke";
import { getOverlayAlwaysVisible } from "../lib/store";
import type { ClientInfo } from "../lib/types";
import "../styles/overlay.css";

type Props = {
  addonId: string;
};

const ADDON_COMPONENTS: Record<
  string,
  React.FC<{ pid: number; client: ClientInfo | null }>
> = {
  "xp-meter": XpMeter,
};

export function OverlayHost({ addonId }: Props) {
  const manifest = getAddon(addonId);
  const Component = ADDON_COMPONENTS[addonId];
  const selectedPid = useSelectedPid();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [alwaysVisible, setAlwaysVisible] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Drag the window from JS so Windows Aero Snap never sees a real
  // OS-driven drag and never offers to snap the overlay to a screen
  // edge.
  useDraggableWindow(shellRef);

  // Clear the webview's own background paint so `background:
  // transparent` on html/body actually shows through to whatever's
  // behind the overlay. `transparent: true` on the window only enables
  // per-pixel alpha at the OS level; WebView2 will still paint an
  // opaque default-coloured background unless we explicitly null it
  // out at runtime.
  useEffect(() => {
    getCurrentWebview()
      .setBackgroundColor(null)
      .catch((e) => console.warn("[overlay] clear webview bg failed:", e));
  }, []);

  // Hydrate the per-addon alwaysVisible flag from the store on mount,
  // then keep it in sync with `overlay-config-changed` events emitted
  // by the main window when the user flips the toggle.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    getOverlayAlwaysVisible(addonId)
      .then((v) => {
        if (!cancelled) setAlwaysVisible(v);
      })
      .catch((e) =>
        console.warn(`[overlay] getOverlayAlwaysVisible(${addonId}) failed:`, e),
      );

    onOverlayConfigChanged((evt) => {
      if (evt.addon_id !== addonId) return;
      if (!cancelled) setAlwaysVisible(evt.always_visible);
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

  // Visibility:
  //  - No client selected → hidden. Without a selection the overlay
  //    has nothing to show, so it stays off-screen until the user
  //    picks one in Raglens.
  //  - Client selected + alwaysVisible → shown unconditionally.
  //  - Client selected + auto-foco → shown when that Ragexe is
  //    foreground, OR raglens itself is foreground (so dragging /
  //    configuring the overlay keeps it visible).
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    const w = getCurrentWebviewWindow();

    (async () => {
      const ownPid = await raglensPid();
      const apply = async (fg: number | null) => {
        if (cancelled) return;
        if (selectedPid === null) {
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
  }, [selectedPid, alwaysVisible]);

  if (!manifest || !Component) {
    return (
      <div className="overlay-shell" ref={shellRef}>
        <div className="overlay-body">Addon não encontrado: {addonId}</div>
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
      <div className="overlay-body">
        <Component pid={selectedPid} client={client} />
      </div>
    </div>
  );
}
