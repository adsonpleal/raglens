// Shared types mirroring the Rust-side serde shapes.

export type NetworkInterface = {
  index: number;
  name: string;
  ipv4: string;
  is_loopback: boolean;
};

export type FourTuple = {
  client_ip: string;
  client_port: number;
  server_ip: string;
  server_port: number;
};

export type ConnectionInfo = {
  four_tuple: FourTuple;
  first_seen_unix_ms: number;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

export type CaptureStatus = "idle" | "recording" | "stopped";

export function fourTupleKey(ft: FourTuple): string {
  return `${ft.client_ip}:${ft.client_port}<->${ft.server_ip}:${ft.server_port}`;
}
