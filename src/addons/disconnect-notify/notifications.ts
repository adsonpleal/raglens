// Notification dispatcher for disconnect events.
//
// All three Rust-side kinds (rst / timeout / ban) collapse into one
// user-facing message: "Desconectado do servidor". The kind
// distinction is still useful internally (suppression and dedupe in
// disconnect.rs depend on it), but the user just needs to know they
// got dropped.
//
// Reuses the pet-feeder's notification primitives directly. If they
// ever move to a shared location, this import is the only thing in
// this addon that needs to change.

import type { ClientDisconnect } from "../../lib/types";
import { sendNtfyPush } from "../pet-feeder/ntfy";
import { sendWindowsNotification } from "../pet-feeder/winNotify";
import type { DisconnectNotifyConfig } from "./config";

const TITLE = "Desconectado do servidor";

function bodyFor(evt: ClientDisconnect): string {
  const base = "A conexão com o servidor foi perdida.";
  if (evt.pid !== null) {
    return `${base}\nCliente PID ${evt.pid}.`;
  }
  return base;
}

export async function dispatchDisconnectNotification(
  evt: ClientDisconnect,
  config: DisconnectNotifyConfig,
): Promise<void> {
  if (!config.pushEnabled && !config.winEnabled) return;

  const body = bodyFor(evt);

  if (config.winEnabled) {
    void sendWindowsNotification(TITLE, body);
  }
  if (config.pushEnabled && config.pushNtfyTopic.trim()) {
    void sendNtfyPush(config.pushNtfyTopic, {
      title: TITLE,
      body,
      priority: "high",
      tags: ["warning"],
    });
  }
}
