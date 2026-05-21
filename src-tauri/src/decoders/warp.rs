// ZC_NPCACK_MAPMOVE — player warped to a new map / coordinates.
// latamRO fires this for every teleport (Fly Wing, warp portal,
// Kafra, /memo recall, NPC warpers, etc.) — confirmed via opcode
// log capture on 2026-05-19. Layout:
//   off  0-1   u16  opcode (0x0091)
//   off  2-17  16b  map filename (NUL-padded, e.g. "prontera.gat")
//   off 18-19  u16  x (cell coord, little-endian)
//   off 20-21  u16  y (cell coord, little-endian)
//
// Emits `packet:teleport-location` with the player's PID + the
// destination cell. The `last-teleport` addon's hook builds the
// rolling history from there.

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x0091;

#[derive(Serialize, Clone, Debug)]
pub(crate) struct TeleportLocation {
    pub pid: Option<u32>,
    pub map: String,
    pub x: u16,
    pub y: u16,
}

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

/// Read a NUL-padded map filename and strip the `.gat` extension that
/// some map-change packets include (the `/navi` chat command expects
/// the bare map name). Shared with `server_move.rs` — both 0x0091 and
/// 0x0092 encode the map name the same way.
pub(super) fn read_map_name(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    let raw = std::str::from_utf8(&bytes[..end]).unwrap_or("").to_string();
    raw.strip_suffix(".gat").map(str::to_string).unwrap_or(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_map_name_strips_extension_and_nulls() {
        let mut bytes = [0u8; 16];
        let name = b"prontera.gat";
        bytes[..name.len()].copy_from_slice(name);
        assert_eq!(read_map_name(&bytes), "prontera");
    }

    #[test]
    fn read_map_name_without_extension() {
        let mut bytes = [0u8; 16];
        let name = b"izlude";
        bytes[..name.len()].copy_from_slice(name);
        assert_eq!(read_map_name(&bytes), "izlude");
    }

    #[test]
    fn decode_captured_latamro_payload() {
        // Real captured packet (latamRO, 2026-05-19): warp to
        // prontera 136/74. Hex dump from the opcode log:
        //   910070726f6e746572612e6761740000000088004a00
        let payload = hex::decode(
            "910070726f6e746572612e6761740000000088004a00",
        )
        .unwrap();
        assert_eq!(payload.len(), 22);
        let opcode = u16::from_le_bytes([payload[0], payload[1]]);
        let map = read_map_name(&payload[2..18]);
        let x = u16::from_le_bytes([payload[18], payload[19]]);
        let y = u16::from_le_bytes([payload[20], payload[21]]);
        assert_eq!(opcode, OPCODE);
        assert_eq!(map, "prontera");
        assert_eq!(x, 136);
        assert_eq!(y, 74);
    }
}
