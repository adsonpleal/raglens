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

export function getForegroundPid(): Promise<number | null> {
  return invoke("get_foreground_pid");
}

export function raglensPid(): Promise<number> {
  return invoke("raglens_pid");
}
