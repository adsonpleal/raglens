// ZC_NOTIFY_PLAYERMOVE — server ack of the player's own walk
// request. Fires on every step (or path segment) the player takes
// inside a map. We decode the destination cell so the
// `last-teleport` addon can know the player's actual standing
// position when they next warp — without it the addon would only
// know the destination of the previous warp, which goes stale the
// moment the player walks anywhere else.
//
// Layout (12 bytes total):
//   off  0-1    u16  opcode (0x0087)
//   off  2-5    u32  server tick (little-endian, unused here)
//   off  6-11   6b   MoveData — packs (x0,y0) src → (x1,y1) dst
//                    plus two sub-cell offsets. Encoding is the
//                    rAthena WBUFPOS2 layout:
//                      b0       = x0 >> 2
//                      b1       = ((x0 & 3) << 6) | ((y0 >> 4) & 0x3f)
//                      b2       = ((y0 & 0xf) << 4) | ((x1 >> 6) & 0xf)
//                      b3       = ((x1 & 0x3f) << 2) | ((y1 >> 8) & 3)
//                      b4       = y1 & 0xff
//                      b5       = (sx0 << 4) | (sy0 & 0xf)
//
// We only extract dst (x1, y1) — that's "where the player is going
// next", which is close enough to "where they'll be when the next
// warp fires". src and sub-cell offsets are skipped (not needed
// for marker placement on a minimap-scale grid).

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x0087;

#[derive(Serialize, Clone, Debug)]
pub struct PlayerPosition {
    pub pid: Option<u32>,
    pub x: u16,
    pub y: u16,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 12 {
        return;
    }
    let (x, y) = parse_dst(&payload[6..12]);
    let pid = app.state::<ConnectionsState>().pid_for(ft);
    let _ = app.emit("packet:player-position", PlayerPosition { pid, x, y });
}

/// Extract the destination cell (x1, y1) from a 6-byte WBUFPOS2
/// MoveData blob. Pulled out so the unit tests can hit it without
/// an AppHandle.
fn parse_dst(b: &[u8]) -> (u16, u16) {
    debug_assert!(b.len() >= 5);
    let x1 = (((b[2] & 0x0f) as u16) << 6) | ((b[3] >> 2) as u16);
    let y1 = (((b[3] & 0x03) as u16) << 8) | (b[4] as u16);
    (x1, y1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_dst_matches_known_capture() {
        // Real captured packet (latamRO, 2026-05-19):
        //   8700 fd48 7927 | 37 4c 03 68 b9 88
        // Hand-derived dst per WBUFPOS2: x1=218, y1=185 (player
        // walked from 221/192 to 218/185).
        let movedata = [0x37, 0x4c, 0x03, 0x68, 0xb9, 0x88];
        assert_eq!(parse_dst(&movedata), (218, 185));
    }

    #[test]
    fn parse_dst_second_capture() {
        // Real captured: 8700 fe4e 7927 | 36 8b 93 68 bc 88
        // Player at 218/185 walks to 218/188.
        let movedata = [0x36, 0x8b, 0x93, 0x68, 0xbc, 0x88];
        assert_eq!(parse_dst(&movedata), (218, 188));
    }

    #[test]
    fn parse_dst_handles_max_coords() {
        // Synthetic high-coord pack: x1=512, y1=768
        // x1=0x200 → ((b2 & 0xf) << 6) | (b3 >> 2) = 0x200
        //   need (b2 & 0xf)=0x08, (b3 >> 2)=0 → b2=...8, b3=0..3
        // y1=0x300 → ((b3 & 0x3) << 8) | b4 = 0x300
        //   need (b3 & 0x3)=0x03, b4=0 → b3=0x03, b4=0
        let movedata = [0, 0, 0x08, 0x03, 0x00, 0];
        assert_eq!(parse_dst(&movedata), (512, 768));
    }
}
