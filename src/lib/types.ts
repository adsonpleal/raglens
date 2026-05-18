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

export type ClientDetected = {
  four_tuple: FourTuple;
  pid: number | null;
};

export type ClientUpdate = {
  pid: number | null;
  aid: number | null;
  name: string | null;
};

export type ForegroundChanged = {
  pid: number | null;
};

export type SelectedClient = {
  pid: number | null;
};

export type ExpKind = "base" | "job";

export type ExpGain = {
  pid: number | null;
  aid: number;
  delta: number;
  kind: ExpKind;
  from_quest: boolean;
};

export type ExpField =
  | "base-exp"
  | "job-exp"
  | "next-base-exp"
  | "next-job-exp";

export type ExpTotalUpdate = {
  pid: number | null;
  aid: number | null;
  field: ExpField;
  value: number;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

export type CaptureStatus = "idle" | "recording" | "stopped";
