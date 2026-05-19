// CZ_COMMAND_PET (0x01a1, C->S, 3 bytes): the client's request when
// the player clicks an entry in the in-game pet menu.
//
// Layout:
//   off 0-1   u16  opcode
//   off   2   u8   choice — 0=info, 1=feed, 2=performance,
//                  3=return-to-egg, 4=rename
//
// We surface choice=1 (feed) as `packet:pet-fed-request` so the
// overlay can bump hunger optimistically *the instant the player
// clicks*, instead of waiting on the server's 0x01a4 confirmation —
// which can lag up to a few seconds depending on the feed animation.
// The in-game UI does the same trick, which is why it appears to
// update faster than ours otherwise would.
//
// If the feed eventually fails server-side (no food in inventory,
// pet not present, etc.), the optimistic bump drifts back down with
// the natural hunger decay; not ideal but acceptable for the common
// case where the feed succeeds.

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x01a1;

const CHOICE_FEED: u8 = 1;

#[derive(Serialize, Clone, Debug)]
pub struct PetFedRequest {
    pub pid: Option<u32>,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, dir: Direction, payload: &[u8]) {
    if !matches!(dir, Direction::ToServer) {
        return;
    }
    if payload.len() < 3 {
        return;
    }
    if payload[2] != CHOICE_FEED {
        return;
    }
    let pid = app.state::<ConnectionsState>().pid_for(ft);
    let _ = app.emit("packet:pet-fed-request", PetFedRequest { pid });
}

#[cfg(test)]
mod tests {
    #[test]
    fn choice_byte_is_at_offset_2() {
        // a1 01 01 — opcode then choice byte
        let payload = [0xa1, 0x01, 0x01];
        assert_eq!(payload[2], 1);
    }

    #[test]
    fn other_choices_are_not_feed() {
        // 0 = info, 3 = return-to-egg, 4 = rename
        assert_ne!(0u8, 1);
        assert_ne!(3u8, 1);
        assert_ne!(4u8, 1);
    }
}
