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

/** Fired when the server acknowledges a "back to char select" or
 *  "quit" action for the owning PID. Hooks reset their per-character
 *  state on this so the next session doesn't inherit the previous
 *  character's samples / pet snapshot. */
export type ClientReset = {
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

/** Partial pet state update from `packet:pet-state`. Fields are
 *  optional because the two source opcodes carry different subsets:
 *  `0x01a4` (state-change tick) → one of hunger/intimacy at a time;
 *  `0x01a2` (full info snapshot) → all four plus `petType`. The hook
 *  merges successive updates into the current view. */
export type PetStateUpdate = {
  pid: number | null;
  hunger?: number;
  intimacy?: number;
  level?: number;
  name?: string;
  /** Pet sprite id (rAthena pet_db key). Carried only by the
   *  0x01a2 snapshot; used to key per-pet-type hunger-decay rate
   *  caching since rAthena's `HungryDelay` varies per pet. */
  petType?: number;
};

/** Fired when the player clicks "Alimentar" in the in-game pet menu.
 *  The overlay uses this to apply an optimistic hunger bump on the
 *  same tick the click happens — the server's 0x01a4 confirmation
 *  arrives anywhere from a few hundred ms to ~3s later. */
export type PetFedRequest = {
  pid: number | null;
};

/** Fired by the inventory decoder on each 0x0B09 NORMAL chunk of the
 *  char-select dump. The frontend reacts by re-querying `getFoodCount`
 *  for whatever item id the active pet eats. We don't ship the full
 *  inventory in the payload — the overlay only needs one number, and
 *  the backend already has the snapshot to answer follow-up reads.
 *  Multiple events fire during a single dump (one per NORMAL chunk)
 *  because the V6 stream's END is unreliable on latamRO. */
export type InventorySnapshot = {
  pid: number | null;
};

/** Fired by the pet feed-ack decoder (0x01a3) on a successful feed.
 *  Carries the new total count of the consumed item id, so the chip
 *  updates without a follow-up backend query. */
export type InventoryDelta = {
  pid: number | null;
  /** Item id the server says was consumed. Matches what the bundled
   *  pet_food_db maps for the active pet, in the normal case. */
  item_id: number;
  /** New total across all slots after the consumption. `null` when
   *  the backend had no snapshot to decrement (overlay started mid-
   *  session and missed the char-select dump) — the consumer should
   *  keep its current foodCount instead of flashing "0". */
  remaining: number | null;
};

/** Fired by the warp decoder (0x0091 ZC_NPCACK_MAPMOVE) for each
 *  observed teleport / map-change. The `last-teleport` addon's
 *  hook uses it together with `PlayerPositionUpdate` to know
 *  where the player actually was when each warp fired.
 *  Coordinates are cell coords (the same units `/navi map X/Y`
 *  accepts). */
export type TeleportLocationUpdate = {
  pid: number | null;
  map: string;
  x: number;
  y: number;
};

/** Fired by the player-move decoder (0x0087 ZC_NOTIFY_PLAYERMOVE)
 *  on every step the player takes inside a map. Carries the
 *  destination cell of the move (where they're going next) — the
 *  `last-teleport` hook treats it as the player's current standing
 *  position so the next warp's "from" is accurate. No map field:
 *  in-map movement doesn't change maps; the map is whatever the
 *  last warp set. */
export type PlayerPositionUpdate = {
  pid: number | null;
  x: number;
  y: number;
};

export type CaptureStats = {
  packets_seen: number;
  matched: number;
};

export type CaptureStatus = "idle" | "recording" | "stopped";

/** Source of a `client-disconnect` event. `rst` = TCP socket killed
 *  (server-side or local), `timeout` = no packets for the watchdog
 *  window while the client process is still alive, `ban` = decoded
 *  ZC_NOTIFY_BAN (0x0081) packet with a reason code. */
export type DisconnectKind = "rst" | "timeout" | "ban";

/** Mirrors the Rust `ClientDisconnect` payload emitted on
 *  `client-disconnect`. Fires once per logical event — `disconnect.rs`
 *  suppresses intentional return-to-char-select via the
 *  RESTART_ACK/RecentRestarts handshake and dedupes BAN-then-RST
 *  inside its emit window. */
export type ClientDisconnect = {
  pid: number | null;
  aid: number | null;
  kind: DisconnectKind;
  /** pt-BR reason string for `ban`; null for `rst` and `timeout`. */
  reason: string | null;
  /** Raw reason byte from ZC_NOTIFY_BAN; null for non-ban kinds. */
  reason_code: number | null;
  unix_ms: number;
};
