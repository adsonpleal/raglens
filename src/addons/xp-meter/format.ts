// Pure XP-rate math, kept separate from the React UI so it's
// straightforward to test in isolation.

export type ExpKind = "base" | "job";

export type ExpSample = {
  timestampMs: number;
  delta: number;
  kind: ExpKind;
};

export const DEFAULT_WINDOW_MS = 60_000;

/** Sum the delta of samples in [nowMs - windowMs, nowMs] for the given kind. */
export function xpInWindow(
  samples: readonly ExpSample[],
  kind: ExpKind,
  nowMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): number {
  const cutoff = nowMs - windowMs;
  let total = 0;
  for (const s of samples) {
    if (s.kind === kind && s.timestampMs > cutoff && s.timestampMs <= nowMs) {
      total += s.delta;
    }
  }
  return total;
}

/** Average XP/minute over the trailing window. */
export function xpPerMinute(
  samples: readonly ExpSample[],
  kind: ExpKind,
  nowMs: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): number {
  const total = xpInWindow(samples, kind, nowMs, windowMs);
  return (total / windowMs) * 60_000;
}

/**
 * Percent of the current level gained per minute.
 * `levelTotalExp` is the XP required to complete the current level.
 */
export function percentPerMinute(
  samples: readonly ExpSample[],
  kind: ExpKind,
  nowMs: number,
  levelTotalExp: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): number {
  if (levelTotalExp <= 0) return 0;
  return (xpPerMinute(samples, kind, nowMs, windowMs) / levelTotalExp) * 100;
}

/**
 * Milliseconds remaining until the next level given the current rate.
 * Returns Infinity if rate is non-positive.
 */
export function etaToNextLevelMs(
  xpPerMin: number,
  remainingExp: number,
): number {
  if (xpPerMin <= 0) return Number.POSITIVE_INFINITY;
  return (remainingExp / xpPerMin) * 60_000;
}

/** Compact `1h 23m 45s` / `5m 12s` / `42s` style. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Number with thousand separators (pt-BR style, dot). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}

/** Percent with 2 decimal places. */
export function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${p.toFixed(2)}%`;
}
