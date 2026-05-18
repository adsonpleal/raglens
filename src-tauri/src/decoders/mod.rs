// Opcode decoder registry.
//
// Each entry maps a u16 opcode (the first 2 bytes of a Ragnarok packet,
// little-endian) to a decoder function. Decoders may update the shared
// ConnectionsState (e.g. to bind a connection's AID or learn a
// character name) and/or emit typed `packet:<event-name>` Tauri events
// for addons to consume.
//
// To add a new opcode decoder:
// 1. Create `src-tauri/src/decoders/<name>.rs` exposing
//    `pub const OPCODE: u16 = 0xNNNN;` and
//    `pub fn decode(app: &AppHandle, ft: &FourTuple, dir: Direction, payload: &[u8])`.
// 2. Add a `pub mod <name>;` line below and register the opcode in
//    `lookup`.
// 3. Add fixture tests in the same file under `#[cfg(test)]`.

use crate::connections::FourTuple;
use crate::dispatch::Direction;
use tauri::AppHandle;

pub mod aid;
pub mod char_name;

pub type DecoderFn = fn(&AppHandle, &FourTuple, Direction, &[u8]);

pub fn lookup(opcode: u16) -> Option<DecoderFn> {
    match opcode {
        aid::OPCODE => Some(aid::decode),
        char_name::OPCODE => Some(char_name::decode),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registered_opcodes_resolve() {
        assert!(lookup(0x0283).is_some()); // ZC_AID
        assert!(lookup(0x0a30).is_some()); // ZC_ACK_REQNAME_TITLE
    }

    #[test]
    fn unknown_opcodes_return_none() {
        assert!(lookup(0x0000).is_none());
        assert!(lookup(0xffff).is_none());
        assert!(lookup(0x09fd).is_none()); // not yet decoded
    }
}
