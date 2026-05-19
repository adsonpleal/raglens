// Shared formatting helpers for overlay text. Kept here so every
// addon shows durations / counts the same way and a tweak (locale,
// width-stable padding) lands in one place.

/** Compact `1h 23m 45s` / `5m 02s` / `42s` style countdown.
 *  Seconds are zero-padded to keep the visible width stable as the
 *  countdown ticks through single-digit values (matters for overlay
 *  text that the user is watching shrink). Returns `"—"` for
 *  Infinity / NaN / negative inputs so callers can pass raw rate
 *  results without pre-guarding. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const sPad = s.toString().padStart(2, "0");
  if (h > 0) return `${h}h ${m}m ${sPad}s`;
  if (m > 0) return `${m}m ${sPad}s`;
  return `${s}s`;
}
