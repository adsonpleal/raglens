# Decoders

Each file here decodes a single Ragnarok packet opcode into a typed
event that addons can subscribe to.

## Adding a decoder

1. Create `<name>.rs` next to this README. Required surface:

   ```rust
   pub const OPCODE: u16 = 0xNNNN;

   pub fn decode(
       app: &tauri::AppHandle,
       ft: &crate::connections::FourTuple,
       dir: crate::dispatch::Direction,
       payload: &[u8],
   ) {
       // parse payload …
       let _ = app.emit("packet:<event-name>", DecodedThing { … });
   }
   ```

2. Add a `pub mod <name>;` declaration in `mod.rs` and register the
   opcode in `lookup`.

3. Add fixture tests in the same file under `#[cfg(test)]`. Build a
   raw payload byte-by-byte and assert the parse output, the same
   shape ragmarket uses for its `0x0836` parser.

## The XP opcode is unknown

The plan was to identify `ZC_NOTIFY_EXP` for latamRO by running the
dev opcode logger (`RAGLENS_LOG_OPCODES=1`) against a live session
and grep'ing the log around the moment of a kill. Until that's done,
this directory has no real decoders and the registry is empty.
