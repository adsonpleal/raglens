import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { XpMeter } from "../addons/xp-meter/XpMeter";
import { getAddon } from "../addons/registry";
import { onForegroundChanged, onClientUpdated } from "../lib/events";
import { getForegroundPid, listClients, raglensPid } from "../lib/invoke";
import type { ClientInfo } from "../lib/types";
import "../styles/overlay.css";

type Props = {
  addonId: string;
  pid: number;
};

const ADDON_COMPONENTS: Record<
  string,
  React.FC<{ pid: number; client: ClientInfo | null }>
> = {
  "xp-meter": XpMeter,
};

export function OverlayHost({ addonId, pid }: Props) {
  const manifest = getAddon(addonId);
  const Component = ADDON_COMPONENTS[addonId];
  const [client, setClient] = useState<ClientInfo | null>(null);

  // Track which client we represent so the overlay header can show
  // the character name once ZC_ACK_REQNAME_TITLE has fired.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const refresh = async () => {
      try {
        const all = await listClients();
        if (cancelled) return;
        setClient(all.find((c) => c.pid === pid) ?? null);
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
  }, [pid]);

  // Foreground-driven visibility. Show when:
  //  - the bound Ragexe is the foreground process, OR
  //  - raglens itself is foreground (so config panels stay reachable
  //    and the overlay doesn't vanish while the user drags it).
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    const w = getCurrentWebviewWindow();

    (async () => {
      const ownPid = await raglensPid();
      const apply = async (fg: number | null) => {
        if (cancelled) return;
        // Default-visible if the OS hasn't reported a foreground PID
        // yet — better than hiding while we wait for the first event.
        const visible = fg === null || fg === pid || fg === ownPid;
        try {
          if (visible) await w.show();
          else await w.hide();
        } catch (e) {
          console.error(`[overlay] show/hide failed (pid=${pid}):`, e);
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
  }, [pid]);

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
        <Component pid={pid} client={client} />
      </div>
    </div>
  );
}
