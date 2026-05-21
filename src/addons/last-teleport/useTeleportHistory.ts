// Rolling history of *where the player CAME FROM* before each
// teleport — the whole point of the addon. We keep a `currentRef`
// holding the player's actual standing position (map + cell coords)
// and update it from two packet streams:
//
//   - `packet:teleport-location` (0x0091 ZC_NPCACK_MAPMOVE) — sets
//     map + cell on every warp. Pushes the old current onto history
//     before overwriting, so the history entry is "where I was just
//     before this warp."
//   - `packet:player-position` (0x0087 ZC_NOTIFY_PLAYERMOVE) —
//     updates cell only (no map) on every walking step. Crucial:
//     without it, currentRef would stay frozen at the destination
//     of the last warp, so if you walked anywhere afterwards the
//     "from" of the next warp would be the OLD warp destination,
//     not where you actually stood.
//
// The destination of the latest warp is treated as the player's
// current location and is NOT shown as a marker — the player can
// already see themselves on the in-game minimap; the markers are
// for the places they LEFT, which is where dropped items / live
// MVPs / cards are.
//
// First-warp-of-the-session edge case: we have no prior current to
// push, so history stays empty for that one warp. Subsequent warps
// populate normally.
//
// Persists for the lifetime of the overlay component — char-select /
// quit wipes it via `client-reset`.

import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onClientReset,
  onPlayerPosition,
  onTeleportLocation,
} from "../../lib/events";

export type TeleportEntry = {
  map: string;
  x: number;
  y: number;
  /** Wall-clock when the packet was observed. Not currently surfaced
   *  in the UI but kept so future versions can show "há 2 min". */
  observedAt: number;
};

/** Observed max cell coords per map. Used by the marker placement
 *  to normalise positions without needing a hardcoded entry for
 *  every map in the game. */
export type ObservedBounds = { maxX: number; maxY: number };

export type TeleportHistoryResult = {
  /** Past locations the player has left, most recent first. */
  history: TeleportEntry[];
  /** Player's CURRENT standing position — updated by every walking
   *  step (0x0087) and every warp (0x0091). Surfaced so the map
   *  overlay can draw a "you are here" marker on demand (e.g.
   *  while the user is dragging the overlay to align it). */
  current: TeleportEntry | null;
  /** Largest (x, y) cell coords we've ever observed on each map —
   *  the player walked there or warped there, so the map is at
   *  least that big. Grows monotonically as the player explores;
   *  feeds the marker placement's dimension estimate for maps not
   *  in the hardcoded table. */
  mapBounds: Record<string, ObservedBounds>;
};

export function useTeleportHistory(
  pid: number,
  maxHistory: number,
): TeleportHistoryResult {
  const [history, setHistory] = useState<TeleportEntry[]>([]);
  // The player's current location — set by the most recent warp
  // packet, refreshed by every walking step. NOT in history (the
  // player is here right now). When a new warp arrives, the value
  // at the moment of the warp gets pushed to history as the place
  // they're leaving. We keep both a ref (for the push logic to
  // read the latest value synchronously from inside event
  // handlers, with no stale-closure risk) and a state (so React
  // re-renders consumers that read it).
  const currentRef = useRef<TeleportEntry | null>(null);
  const [current, setCurrent] = useState<TeleportEntry | null>(null);
  const updateCurrent = (next: TeleportEntry | null) => {
    currentRef.current = next;
    setCurrent(next);
  };

  // Per-map observed max cell coords. Setter only fires (and only
  // re-renders consumers) when the new sample actually exceeds the
  // current max on at least one axis — most packets don't push
  // the bound, especially once the player has roamed a map for a
  // while.
  const [mapBounds, setMapBounds] = useState<
    Record<string, ObservedBounds>
  >({});
  const growBounds = (map: string, x: number, y: number) => {
    setMapBounds((prev) => {
      const cur = prev[map];
      if (cur && cur.maxX >= x && cur.maxY >= y) return prev;
      return {
        ...prev,
        [map]: {
          maxX: Math.max(cur?.maxX ?? 0, x),
          maxY: Math.max(cur?.maxY ?? 0, y),
        },
      };
    });
  };

  // Clear when the bound PID swaps. The previous character's
  // teleport trail isn't meaningful for the next one.
  useEffect(() => {
    updateCurrent(null);
    setHistory([]);
  }, [pid]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    onTeleportLocation((update) => {
      if (update.pid !== pid) return;
      const dest: TeleportEntry = {
        map: update.map,
        x: update.x,
        y: update.y,
        observedAt: Date.now(),
      };
      const previous = currentRef.current;
      updateCurrent(dest);
      growBounds(dest.map, dest.x, dest.y);
      // Nothing to record on the very first warp of the session —
      // we only learn the player's location *after* a warp packet
      // fires, so the first one's "from" is unknown.
      if (!previous) return;
      // Map change wipes the history: a teleport marker rendered at
      // cell (X, Y) only makes sense on the map where it was sampled
      // — overlaying it on the new map's minimap puts it on the
      // wrong street, and visually carrying yesterday's prontera
      // dots into today's alberta isn't useful.
      if (previous.map !== dest.map) {
        setHistory([]);
        return;
      }
      // Deduplicate against an identical previous position — some
      // teleports keep the player on the same cell (re-warp to
      // current), and a stationary player whose last position
      // matches the new dst is also a no-op for history.
      if (
        previous.x === dest.x &&
        previous.y === dest.y
      ) {
        return;
      }
      setHistory((prev) => [previous, ...prev].slice(0, maxHistory));
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    // Update the player's current cell on every walking step.
    // 0x0087 doesn't carry the map (in-map movement), so we keep
    // whatever map the last warp set and only refresh x/y.
    onPlayerPosition((update) => {
      if (update.pid !== pid) return;
      const cur = currentRef.current;
      if (!cur) {
        // We haven't seen a warp yet for this pid — without a map
        // anchor an x/y is useless. Drop until the first warp
        // tells us which map we're on.
        return;
      }
      updateCurrent({
        map: cur.map,
        x: update.x,
        y: update.y,
        observedAt: Date.now(),
      });
      growBounds(cur.map, update.x, update.y);
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    onClientReset((evt) => {
      if (evt.pid !== pid) return;
      updateCurrent(null);
      setHistory([]);
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pid, maxHistory]);

  // If `maxHistory` shrank while we held more entries (user lowered
  // the setting), drop the overflow on the next render.
  useEffect(() => {
    setHistory((prev) =>
      prev.length > maxHistory ? prev.slice(0, maxHistory) : prev,
    );
  }, [maxHistory]);

  return { history, current, mapBounds };
}
