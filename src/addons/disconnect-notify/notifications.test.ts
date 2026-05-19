import { describe, expect, it, vi } from "vitest";
import type { ClientDisconnect, DisconnectKind } from "../../lib/types";
import { disconnectNotifyDefaultConfig } from "./config";
import { dispatchDisconnectNotification } from "./notifications";

// The dispatcher reaches into the pet-feeder notification helpers.
// Mock them so we can assert that the right channels are called
// for the right configs without spinning up Tauri.
vi.mock("../pet-feeder/winNotify", () => ({
  sendWindowsNotification: vi.fn(async () => true),
  ensureWinPermission: vi.fn(async () => true),
}));
vi.mock("../pet-feeder/ntfy", () => ({
  sendNtfyPush: vi.fn(async () => true),
}));

import { sendWindowsNotification } from "../pet-feeder/winNotify";
import { sendNtfyPush } from "../pet-feeder/ntfy";

function evt(overrides: Partial<ClientDisconnect> = {}): ClientDisconnect {
  return {
    pid: 1234,
    aid: null,
    kind: "rst",
    reason: null,
    reason_code: null,
    unix_ms: 1_700_000_000_000,
    ...overrides,
  };
}

describe("dispatchDisconnectNotification", () => {
  it("does nothing when both channels are disabled", async () => {
    vi.clearAllMocks();
    await dispatchDisconnectNotification(evt(), disconnectNotifyDefaultConfig);
    expect(sendWindowsNotification).not.toHaveBeenCalled();
    expect(sendNtfyPush).not.toHaveBeenCalled();
  });

  it("fires Windows toast when winEnabled", async () => {
    vi.clearAllMocks();
    await dispatchDisconnectNotification(evt(), {
      ...disconnectNotifyDefaultConfig,
      winEnabled: true,
    });
    expect(sendWindowsNotification).toHaveBeenCalledTimes(1);
    expect(sendNtfyPush).not.toHaveBeenCalled();
  });

  it("fires ntfy push when pushEnabled and topic is non-empty", async () => {
    vi.clearAllMocks();
    await dispatchDisconnectNotification(evt(), {
      ...disconnectNotifyDefaultConfig,
      pushEnabled: true,
      pushNtfyTopic: "raglens-test-topic",
    });
    expect(sendNtfyPush).toHaveBeenCalledTimes(1);
    const [topic, msg] = (sendNtfyPush as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, { title: string; body: string }];
    expect(topic).toBe("raglens-test-topic");
    expect(msg.title).toBe("Desconectado do servidor");
  });

  it("skips push when topic is empty even if pushEnabled", async () => {
    vi.clearAllMocks();
    await dispatchDisconnectNotification(evt(), {
      ...disconnectNotifyDefaultConfig,
      pushEnabled: true,
      pushNtfyTopic: "   ",
    });
    expect(sendNtfyPush).not.toHaveBeenCalled();
  });

  it("uses the same title regardless of kind", async () => {
    const kinds: DisconnectKind[] = ["rst", "timeout", "ban"];
    for (const kind of kinds) {
      vi.clearAllMocks();
      await dispatchDisconnectNotification(evt({ kind }), {
        ...disconnectNotifyDefaultConfig,
        winEnabled: true,
      });
      const [title] = (
        sendWindowsNotification as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0] as [string, string];
      expect(title).toBe("Desconectado do servidor");
    }
  });

  it("includes the PID in the body when known", async () => {
    vi.clearAllMocks();
    await dispatchDisconnectNotification(evt({ pid: 9876 }), {
      ...disconnectNotifyDefaultConfig,
      winEnabled: true,
    });
    const [_title, body] = (
      sendWindowsNotification as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0] as [string, string];
    expect(body).toContain("9876");
  });
});
