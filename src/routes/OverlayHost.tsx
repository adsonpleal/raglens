import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { XpMeter } from "../addons/xp-meter/XpMeter";
import { getAddon } from "../addons/registry";
import { useSelectedPid } from "../hooks/useSelectedPid";
import { onClientUpdated, onForegroundChanged } from "../lib/events";
import { getForegroundPid, listClients, raglensPid } from "../lib/invoke";
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

  // Track the selected client's full info (name, AID) so the overlay
  // can render its title once ZC_ACK_REQNAME_TITLE has fired.
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

  // Foreground-driven visibility. Show when:
  //  - no client selected (placeholder is on screen so the user can act on it),
  //  - the selected Ragexe is foreground, OR
  //  - raglens itself is foreground (configuration / dragging the overlay).
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    const w = getCurrentWebviewWindow();

    (async () => {
      const ownPid = await raglensPid();
      const apply = async (fg: number | null) => {
        if (cancelled) return;
        const visible =
          selectedPid === null ||
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
  }, [selectedPid]);

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
        {selectedPid === null ? (
          <p className="overlay-placeholder muted">
            Selecione um cliente em Raglens para começar.
          </p>
        ) : (
          <Component pid={selectedPid} client={client} />
        )}
      </div>
    </div>
  );
}
