// ZC_NPCACK_SERVERMOVE — player is being moved to a different zone
// server. Some map transitions (mostly older town/dungeon gateways)
// trigger this instead of the in-server 0x0091. Layout:
//   off  0-1   u16  opcode (0x0092)
//   off  2-17  16b  map filename (NUL-padded, e.g. "prontera.gat")
//   off 18-19  u16  x (cell coord, little-endian)
//   off 20-21  u16  y (cell coord, little-endian)
//   off 22-25  u32  new zone-server IP   (we ignore — Raglens is
//   off 26-27  u16  new zone-server port  read-only / sniff-only)
//
// Emits the same `packet:teleport-location` event as `warp.rs` (0x0091).
// The frontend hook listens for one event and treats both opcodes
// identically — they're the same conceptual signal (player landed on
// a new map at these coords).

use crate::connections::{ConnectionsState, FourTuple};
use crate::decoders::warp::{read_map_name, TeleportLocation};
use crate::dispatch::Direction;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x0092;

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 22 {
        return;
    }
    let map = read_map_name(&payload[2..18]);
    let x = u16::from_le_bytes([payload[18], payload[19]]);
    let y = u16::from_le_bytes([payload[20], payload[21]]);

    let pid = app.state::<ConnectionsState>().pid_for(ft);
    let _ = app.emit(
        "packet:teleport-location",
        TeleportLocation { pid, map, x, y },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_map_xy_at_same_offsets_as_warp() {
        // Synthetic payload — 0x0092 prefix, "izlude.gat" at 2..18,
        // x=99, y=150, plus 6 bytes of ip+port that we ignore.
        let mut payload = vec![0x92, 0x00];
        let mut name = b"izlude.gat".to_vec();
        name.resize(16, 0);
        payload.extend(name);
        payload.extend(99u16.to_le_bytes());
        payload.extend(150u16.to_le_bytes());
        payload.extend(0u32.to_le_bytes()); // ip
        payload.extend(0u16.to_le_bytes()); // port
        assert_eq!(payload.len(), 28);

        let opcode = u16::from_le_bytes([payload[0], payload[1]]);
        let map = read_map_name(&payload[2..18]);
        let x = u16::from_le_bytes([payload[18], payload[19]]);
        let y = u16::from_le_bytes([payload[20], payload[21]]);
        assert_eq!(opcode, OPCODE);
        assert_eq!(map, "izlude");
        assert_eq!(x, 99);
        assert_eq!(y, 150);
    }
}
