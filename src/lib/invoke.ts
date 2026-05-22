import { invoke } from "@tauri-apps/api/core";
import type { ClientInfo, NetworkInterface } from "./types";

export function listInterfaces(): Promise<NetworkInterface[]> {
  return invoke("list_interfaces");
}

export function startCapture(ipv4: string): Promise<void> {
  return invoke("start_capture", { ipv4 });
}

export function stopCapture(): Promise<void> {
  return invoke("stop_capture");
}

export function listClients(): Promise<ClientInfo[]> {
  return invoke("list_clients");
}

export function selectClient(pid: number): Promise<void> {
  return invoke("select_client", { pid });
}

export function clearClientSelection(): Promise<void> {
  return invoke("clear_client_selection");
}

export function getSelectedPid(): Promise<number | null> {
  return invoke("get_selected_pid");
}

export function getForegroundPid(): Promise<number | null> {
  return invoke("get_foreground_pid");
}

export function raglensPid(): Promise<number> {
  return invoke("raglens_pid");
}

/** Latest pet snapshot the backend has captured for this PID, or null
 *  if nothing observed yet. Used by the pet-feeder hook to hydrate
 *  the overlay immediately when it mounts mid-session, instead of
 *  waiting on the next 0x01a4 tick. */
export type CachedPetState = {
  hunger: number | null;
  intimacy: number | null;
  level: number | null;
  name: string | null;
  petType: number | null;
};

export function getPetState(pid: number): Promise<CachedPetState | null> {
  return invoke("get_pet_state", { pid });
}

/** Live count of `itemId` across the player's inventory slots for
 *  this PID, as last seen by the backend's inventory store. Returns
 *  0 when the backend has no cached snapshot (overlay mounted before
 *  the char-select dump) — the caller should treat that as "unknown"
 *  and re-query on the next `packet:inventory-snapshot` event. */
export function getFoodCount(pid: number, itemId: number): Promise<number> {
  return invoke("get_food_count", { pid, itemId });
}

/** On-disk path to the cached minimap PNG for a map, fetched from
 *  divine-pride.net on first reference. Returns `null` when the
 *  service has no image for that map (the addon then renders a
 *  transparent background and just the markers). */
export function getMapImagePath(mapName: string): Promise<string | null> {
  return invoke("get_map_image_path", { mapName });
}
