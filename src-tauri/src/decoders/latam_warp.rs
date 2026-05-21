// latamRO map-change packets — confirmed via opcode log capture on
// 2026-05-20. The standard rAthena 0x0091/0x0092 don't fire on this
// server; latamRO sends 64-byte packets at custom opcodes that
// embed both the map name and the new zone server's hostname.
//
// Two variants share this module because they're structurally
// related and decoded the same way modulo a 4-byte AID prefix:
//
//   0x0ac7  — in-game map change (portal walks, Fly Wing, /memo, etc.)
//             Layout: opcode(2) + map[16] + x(2) + y(2) + ip(4)
//                     + port(2) + hostname[N]
//
//   0x0ac5  — initial map load after character selection.
//             Layout: opcode(2) + AID(4) + map[16] + x(2) + y(2)
//                     + ip(4) + port(2) + hostname[N]
//             x/y are 0 here; the actual spawn position arrives in
//             a later 0x02eb ZC_ACCEPT_ENTER2. We still emit so the
//             addon switches to the spawned map's image immediately
//             — player_position events (0x0087) refresh the marker
//             coords as soon as the player moves.
//
// Both emit the same `packet:teleport-location` event the existing
// 0x0091/0x0092 decoders emit; the React hook treats all of them
// identically — same conceptual signal "player is now on map X at
// (x, y)".

use crate::connections::{ConnectionsState, FourTuple};
use crate::decoders::warp::{read_map_name, TeleportLocation};
use crate::dispatch::Direction;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE_MOVE: u16 = 0x0ac7;
pub const OPCODE_INIT: u16 = 0x0ac5;

/// In-game map change. Map field starts at offset 2 (no prefix).
pub fn decode_move(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 22 {
        return;
    }
    let map = read_map_name(&payload[2..18]);
    let x = u16::from_le_bytes([payload[18], payload[19]]);
    let y = u16::from_le_bytes([payload[20], payload[21]]);
    emit(app, ft, map, x, y);
}

/// Initial map load on character select. AID prefix at 2-5 shifts
/// the map field to offset 6.
pub fn decode_init(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 26 {
        return;
    }
    let map = read_map_name(&payload[6..22]);
    let x = u16::from_le_bytes([payload[22], payload[23]]);
    let y = u16::from_le_bytes([payload[24], payload[25]]);
    emit(app, ft, map, x, y);
}

fn emit(app: &AppHandle, ft: &FourTuple, map: String, x: u16, y: u16) {
    if map.is_empty() {
        return;
    }
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
    fn decodes_captured_0x0ac7_alberta() {
        // Real captured payload (2026-05-20, portal walk to alberta):
        // c70a616c62657274612e67617400000000001300e9000000000002566c742d77...
        let payload = hex::decode(
            "c70a616c62657274612e67617400000000001300e9000000000002566c742d776f726c642d312e676e6a6f796c6174616d2e636f6d3a32323031380000000000",
        )
        .unwrap();
        assert_eq!(payload.len(), 64);
        let opcode = u16::from_le_bytes([payload[0], payload[1]]);
        let map = read_map_name(&payload[2..18]);
        let x = u16::from_le_bytes([payload[18], payload[19]]);
        let y = u16::from_le_bytes([payload[20], payload[21]]);
        assert_eq!(opcode, OPCODE_MOVE);
        assert_eq!(map, "alberta");
        assert_eq!(x, 19);
        assert_eq!(y, 233);
    }

    #[test]
    fn decodes_captured_0x0ac7_pay_fild03() {
        // Real captured payload (portal walk to pay_fild03):
        // c70a7061795f66696c6430332e676174000084013f0000000000f9556c74...
        let payload = hex::decode(
            "c70a7061795f66696c6430332e676174000084013f0000000000f9556c742d776f726c642d312e676e6a6f796c6174616d2e636f6d3a32323030390000000000",
        )
        .unwrap();
        assert_eq!(payload.len(), 64);
        let map = read_map_name(&payload[2..18]);
        let x = u16::from_le_bytes([payload[18], payload[19]]);
        let y = u16::from_le_bytes([payload[20], payload[21]]);
        assert_eq!(map, "pay_fild03");
        assert_eq!(x, 388);
        assert_eq!(y, 63);
    }

    #[test]
    fn decodes_captured_0x0ac5_charsel_alberta() {
        // Real captured payload (char-select burst, landed on alberta):
        // c50aed1f0c00616c62657274612e67617400000000000000000002566c74...
        let payload = hex::decode(
            "c50aed1f0c00616c62657274612e67617400000000000000000002566c742d776f726c642d312e676e6a6f796c6174616d2e636f6d3a32323031380000000000",
        )
        .unwrap();
        assert_eq!(payload.len(), 64);
        let opcode = u16::from_le_bytes([payload[0], payload[1]]);
        let map = read_map_name(&payload[6..22]);
        let x = u16::from_le_bytes([payload[22], payload[23]]);
        let y = u16::from_le_bytes([payload[24], payload[25]]);
        assert_eq!(opcode, OPCODE_INIT);
        assert_eq!(map, "alberta");
        // x/y always 0 on char-select; the real spawn position arrives
        // later via 0x02eb ZC_ACCEPT_ENTER2 (and refreshed by 0x0087
        // walking-step packets once the player moves).
        assert_eq!(x, 0);
        assert_eq!(y, 0);
    }
}
