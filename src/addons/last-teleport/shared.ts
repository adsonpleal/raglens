// Shared types + cross-window event helpers for the two last-teleport
// addons (map + controls). The controls window is the authoritative
// owner of `activeIndex`; the map window listens to broadcasts here
// so its highlighted marker tracks whatever the controls' cursor is
// on.

import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/** PID is included so each Ragexe instance gets its own cursor —
 *  switching the selected client in the main window shouldn't make
 *  one character's history cursor leak into another's view. */
export type ActiveIndexChanged = {
  pid: number;
  activeIndex: number;
};

const ACTIVE_INDEX_EVENT = "lt:active-index-changed";

export function emitActiveIndexChanged(
  payload: ActiveIndexChanged,
): Promise<void> {
  return emit(ACTIVE_INDEX_EVENT, payload);
}

export function onActiveIndexChanged(
  handler: (event: ActiveIndexChanged) => void,
): Promise<UnlistenFn> {
  return listen<ActiveIndexChanged>(ACTIVE_INDEX_EVENT, (e) =>
    handler(e.payload),
  );
}
