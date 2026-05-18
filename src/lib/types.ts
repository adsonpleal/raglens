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

/** One Ragnarok client (Ragexe.exe instance) identified by owning PID.
 *  Aggregated from N connections that share the same PID. */
export type ClientInfo = {
  pid: number | null;
  aid: number | null;
  name: string | null;
  process_name: string | null;
  process_creation_unix_ms: number | null;
  connection_count: number;
  first_seen_unix_ms: number;
};

/** Emitted when a new TCP 4-tuple is observed. Carries the resolved
 *  owning PID (if any) so the frontend can know which client picked
 *  up another connection. */
export type ClientDetected = {
  four_tuple: FourTuple;
  pid: number | null;
};

/** Emitted when a client's identity (AID / name) becomes known via
 *  decoded ZC_AID or ZC_ACK_REQNAME_TITLE packets. Either field may be
 *  populated; both being null means no change worth surfacing. */
export type ClientUpdate = {
  pid: number | null;
  aid: number | null;
  name: string | null;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

export type CaptureStatus = "idle" | "recording" | "stopped";
