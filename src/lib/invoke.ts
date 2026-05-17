import { invoke } from "@tauri-apps/api/core";
import type { ConnectionInfo, FourTuple, NetworkInterface } from "./types";

export function listInterfaces(): Promise<NetworkInterface[]> {
  return invoke("list_interfaces");
}

export function startCapture(ipv4: string): Promise<void> {
  return invoke("start_capture", { ipv4 });
}

export function stopCapture(): Promise<void> {
  return invoke("stop_capture");
}

export function listConnections(): Promise<ConnectionInfo[]> {
  return invoke("list_connections");
}

export function selectConnection(fourTuple: FourTuple): Promise<void> {
  return invoke("select_connection", { fourTuple });
}

export function clearConnectionSelection(): Promise<void> {
  return invoke("clear_connection_selection");
}
