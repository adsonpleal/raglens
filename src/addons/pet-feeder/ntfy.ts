// ntfy.sh push notification helper.
//
// ntfy is a single-HTTP-POST pub/sub: anyone subscribed to a topic
// on the official ntfy mobile app receives the messages we publish.
// There's no auth, no API key — the topic name itself is the secret.
// The user picks one in settings, types it into the app, and they're
// done.
//
// We publish via the JSON API (`POST https://ntfy.sh/`, JSON body
// carrying topic + title + message + tags) rather than the simpler
// "POST to /<topic> with body" form. Two reasons: (1) ntfy's server
// runs a binary-detection heuristic on raw POST bodies and treats
// anything with multi-byte UTF-8 (an em-dash, an accent, an emoji)
// as a file attachment, defeating an inline pt-BR notification;
// (2) JSON publish carries the title in a JSON string field so we
// don't need RFC 2047 encoding to slip non-ASCII through the
// Latin-1-only HTTP-header path.
//
// Tauri's webview has `csp: null` in tauri.conf.json so the fetch
// works without any plugin. Sends are fire-and-forget — a failed
// POST shouldn't crash the overlay, so we log and move on.

const NTFY_BASE = "https://ntfy.sh";

export type NtfyPriority = "default" | "high" | "max";

export type NtfyMessage = {
  title: string;
  body: string;
  priority?: NtfyPriority;
  tags?: string[];
};

// ntfy's JSON priority field is numeric 1..5; we expose only the
// three values the addon uses.
const PRIORITY_VALUE: Record<NtfyPriority, number> = {
  default: 3,
  high: 4,
  max: 5,
};

/** POSTs a single notification to the topic. Resolves to `true` on a
 *  2xx response and `false` otherwise (network failure, non-2xx,
 *  empty topic). Errors are logged but never thrown, so the
 *  alert-on-transition callers can stay fire-and-forget by just
 *  `void`-ing the call; the test-notification button awaits the
 *  boolean to render success / failure feedback. */
export async function sendNtfyPush(
  topic: string,
  msg: NtfyMessage,
): Promise<boolean> {
  const t = topic.trim();
  if (!t) return false; // empty topic = nothing to send; treat as no-op
  try {
    const body = JSON.stringify({
      topic: t,
      title: msg.title,
      message: msg.body,
      priority: PRIORITY_VALUE[msg.priority ?? "default"],
      tags: msg.tags ?? [],
    });
    const res = await fetch(`${NTFY_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Cap each send at 8s so the "Testar" button can't hang on
      // a stuck ntfy.sh, and the alert-on-transition path doesn't
      // leak pending Promises if the service is unreachable.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(
        `[ntfy] push to topic "${t}" failed:`,
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[ntfy] push to topic "${topic}" threw:`, e);
    return false;
  }
}
