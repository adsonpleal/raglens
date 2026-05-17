// Opcode decoder registry.
//
// Each entry maps a u16 opcode (the first 2 bytes of a Ragnarok packet,
// little-endian) to a decoder function. A decoder is responsible for
// parsing its payload and emitting a typed `packet:<event-name>` Tauri
// event with a serde-serialised payload.
//
// To add a new opcode decoder:
// 1. Create `src-tauri/src/decoders/<name>.rs` exposing
//    `pub const OPCODE: u16 = 0xNNNN;` and
//    `pub fn decode(app: &AppHandle, ft: &FourTuple, dir: Direction, payload: &[u8])`.
// 2. Add a `pub mod <name>;` line below and register the opcode in
//    `lookup` below.
// 3. Add fixture tests in the same file under `#[cfg(test)]`.

use crate::connections::FourTuple;
use crate::dispatch::Direction;
use tauri::AppHandle;

pub type DecoderFn = fn(&AppHandle, &FourTuple, Direction, &[u8]);

pub fn lookup(_opcode: u16) -> Option<DecoderFn> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_registry_returns_none() {
        assert!(lookup(0x0acc).is_none());
        assert!(lookup(0x0000).is_none());
        assert!(lookup(0xffff).is_none());
    }
}
