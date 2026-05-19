// Headless service hook for the disconnect-notify addon.
//
// Mounted once near the root of MainWindow so the subscription
// lives for the lifetime of the app session — there is no overlay
// window to host it. Reads the current config through the shared
// useAddonConfig (so the user's settings-modal edits take effect
// without a restart) and fires the notification dispatcher for
// every `client-disconnect` event the Rust side emits.
//
// The Rust side has already done suppression (intentional logout)
// and dedupe (BAN-then-RST), so this layer just routes by config
// and forwards.

import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import { onClientDisconnect } from "../../lib/events";
import { getEnabledAddons } from "../../lib/store";
import {
  disconnectNotifyDefaultConfig,
  type DisconnectNotifyConfig,
} from "./config";
import { dispatchDisconnectNotification } from "./notifications";

const ADDON_ID = "disconnect-notify";

export function useDisconnectService(): void {
  const config = useAddonConfig<DisconnectNotifyConfig>(
    ADDON_ID,
    disconnectNotifyDefaultConfig,
  );
  // Keep a ref to the latest config so the long-lived listener reads
  // the current value at fire time — without this, the closure would
  // see whichever config snapshot existed when the listener was
  // registered.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    onClientDisconnect(async (evt) => {
      if (cancelled) return;
      // Bail when the user has the addon disabled in the addons list.
      // The listener stays alive (cheap), but emits no notification.
      // Disconnect events are rare, so re-reading the enabled set on
      // each fire is fine — no need to cache or subscribe to changes.
      const enabled = await getEnabledAddons();
      if (cancelled || !enabled.includes(ADDON_ID)) return;
      await dispatchDisconnectNotification(evt, configRef.current);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
