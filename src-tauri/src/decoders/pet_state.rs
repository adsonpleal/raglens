// Pet hunger / intimacy state, derived from two opcodes:
//
// `0x01a4` ZC_CHANGESTATE_PET — small (11-byte) tick packet emitted
// whenever a single stat on the pet changes. Format:
//   off  0-1   u16  opcode
//   off    2   u8   type  (0x01=intimacy, 0x02=hunger, 0x03=accessory,
//                          0x04=sprite, 0x06=removed-from-field)
//   off  3-6   u32  pet GID (little-endian)
//   off  7-10  u32  value (little-endian) — meaning depends on `type`
//
// `0x01a2` ZC_PROPERTY_PET — full (37-byte) state snapshot, server
// sends in response to the pet info menu (CZ_COMMAND_PET choice 0).
// Format:
//   off  0-1    u16   opcode
//   off  2-25   24 b  name (latin-1, null-padded; may carry `\x1c`
//                    color-code escape sequences in private servers)
//   off    26   u8    renameflag (0 = not renamed, 1 = renamed)
//   off 27-28   u16   level
//   off 29-30   u16   hunger (0..=100)
//   off 31-32   u16   intimacy (0..=1000)
//   off 33-34   u16   accessory id
//   off 35-36   u16   pet type / sprite id
//
// Both decoders emit `packet:pet-state` with partial fields populated;
// the frontend hook (`usePetState`) merges them into a rolling snapshot.

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use crate::pet_state_store::PetStateStore;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE_INFO: u16 = 0x01a2;
pub const OPCODE_CHANGE: u16 = 0x01a4;

const CHANGE_TYPE_INTIMACY: u8 = 0x01;
const CHANGE_TYPE_HUNGER: u8 = 0x02;

#[derive(Serialize, Clone, Debug, Default)]
pub struct PetState {
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hunger: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intimacy: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Pet sprite id (rAthena's pet_db key). Identifies the pet
    /// *type* — Poring / Drops / Lunatic / etc. — so the frontend
    /// can look up the matching observed hunger-decay rate, which
    /// rAthena documents as per-pet via `HungryDelay` (default 60s
    /// but varies; latamRO appears customised to ~20s for some
    /// types). Only set by the full-info packet (0x01a2); the
    /// state-change tick (0x01a4) doesn't include it.
    #[serde(skip_serializing_if = "Option::is_none", rename = "petType")]
    pub pet_type: Option<u16>,
}

pub fn decode_info(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 37 {
        return;
    }
    // Byte 26 is renameflag: 1 = player set a custom name (bytes 2..26
    // are the displayed name), 0 = default name lookup-by-pet-type
    // client-side (bytes are legacy garbage and unsafe to surface).
    let renamed = payload[26] != 0;
    let name = renamed.then(|| read_name(&payload[2..26]));
    let level = u16::from_le_bytes([payload[27], payload[28]]);
    let hunger = u16::from_le_bytes([payload[29], payload[30]]);
    let intimacy = u16::from_le_bytes([payload[31], payload[32]]);
    // bytes 33-34 are accessory id (skipped); 35-36 is the pet
    // type/sprite — same key as rAthena's pet_db, used by the
    // overlay to look up the right hunger-decay rate.
    let pet_type = u16::from_le_bytes([payload[35], payload[36]]);

    let pid = app.state::<ConnectionsState>().pid_for(ft);
    if let Some(p) = pid {
        app.state::<PetStateStore>().update(
            p,
            Some(hunger),
            Some(intimacy),
            Some(level),
            name.clone(),
            Some(pet_type),
        );
    }
    let _ = app.emit(
        "packet:pet-state",
        PetState {
            pid,
            hunger: Some(hunger),
            intimacy: Some(intimacy),
            level: Some(level),
            name,
            pet_type: Some(pet_type),
        },
    );
}

pub fn decode_change(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 11 {
        return;
    }
    let type_id = payload[2];
    let value = u32::from_le_bytes([payload[7], payload[8], payload[9], payload[10]]);

    let pid = app.state::<ConnectionsState>().pid_for(ft);
    let mut state = PetState {
        pid,
        ..Default::default()
    };
    match type_id {
        CHANGE_TYPE_HUNGER => state.hunger = Some(value.min(u16::MAX as u32) as u16),
        CHANGE_TYPE_INTIMACY => state.intimacy = Some(value.min(u16::MAX as u32) as u16),
        _ => return, // accessory / sprite / removed — not interesting yet
    }
    if let Some(p) = pid {
        app.state::<PetStateStore>()
            .update(p, state.hunger, state.intimacy, None, None, None);
    }
    let _ = app.emit("packet:pet-state", state);
}

/// Strip null padding and the `\x1c<digit>...\x1c` color-code escape
/// sequence some private servers wrap names in. Latin-1 bytes that
/// aren't ASCII map straight into the corresponding Unicode code
/// points (latin-1 ↔ U+0000..U+00FF), so we do that without pulling a
/// full encoding crate.
fn read_name(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == 0 {
            break;
        }
        // `\x1c` brackets a color code: `\x1c<color>...\x1c<text>` or
        // just markers around the visible text. Drop the marker bytes
        // — the next-byte color id is also non-printable so it'll be
        // skipped by the same rule when it shows up as control char.
        if b == 0x1c {
            i += 1;
            continue;
        }
        out.push(b as char);
        i += 1;
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn change_type_hunger_picks_value_byte() {
        // a4 01 02 b6190100 49000000  → type=hunger, gid=0x000119b6, value=73
        let payload = [
            0xa4, 0x01, 0x02, 0xb6, 0x19, 0x01, 0x00, 0x49, 0x00, 0x00, 0x00,
        ];
        // Just check the parse math; decode_change needs an AppHandle.
        let type_id = payload[2];
        let value = u32::from_le_bytes([payload[7], payload[8], payload[9], payload[10]]);
        assert_eq!(type_id, CHANGE_TYPE_HUNGER);
        assert_eq!(value, 73);
    }

    #[test]
    fn change_type_intimacy_picks_value_word() {
        // a4 01 01 b6190100 e8030000  → type=intimacy, value=1000
        let payload = [
            0xa4, 0x01, 0x01, 0xb6, 0x19, 0x01, 0x00, 0xe8, 0x03, 0x00, 0x00,
        ];
        let type_id = payload[2];
        let value = u32::from_le_bytes([payload[7], payload[8], payload[9], payload[10]]);
        assert_eq!(type_id, CHANGE_TYPE_INTIMACY);
        assert_eq!(value, 1000);
    }

    #[test]
    fn info_pulls_hunger_and_intimacy() {
        // From the live capture: hunger=76 (0x4c), intimacy=1000 (0x3e8)
        let payload = hex::decode(
            "a2011c306f77421c0000000000000000000000000000000000000001004c00e80300005e09",
        )
        .unwrap();
        assert_eq!(payload.len(), 37);
        let hunger = u16::from_le_bytes([payload[29], payload[30]]);
        let intimacy = u16::from_le_bytes([payload[31], payload[32]]);
        let level = u16::from_le_bytes([payload[27], payload[28]]);
        let renameflag = payload[26];
        assert_eq!(hunger, 76);
        assert_eq!(intimacy, 1000);
        assert_eq!(level, 1);
        assert_eq!(renameflag, 0); // default-named pet from this capture
    }

    #[test]
    fn renamed_pet_name_decodes() {
        // Synthetic 0x01a2 with renameflag=1 and name="Bolota"
        // (the user-renamed case observed via 0x01a5 + 0x0095 around
        // 20:54:01 in the recon log).
        let mut payload = vec![0u8; 37];
        payload[0..2].copy_from_slice(&[0xa2, 0x01]);
        let name = b"Bolota";
        payload[2..2 + name.len()].copy_from_slice(name);
        payload[26] = 1; // renameflag
        payload[27..29].copy_from_slice(&1u16.to_le_bytes());
        payload[29..31].copy_from_slice(&50u16.to_le_bytes());
        payload[31..33].copy_from_slice(&500u16.to_le_bytes());

        let renamed = payload[26] != 0;
        let resolved = renamed.then(|| read_name(&payload[2..26]));
        assert_eq!(resolved.as_deref(), Some("Bolota"));
    }

    #[test]
    fn read_name_strips_color_markers_and_nulls() {
        // `\x1c30owB\x1c` + nulls → "0owB"
        let mut bytes = [0u8; 24];
        bytes[..6].copy_from_slice(&[0x1c, b'0', b'o', b'w', b'B', 0x1c]);
        let name = read_name(&bytes);
        assert_eq!(name, "0owB");
    }

    #[test]
    fn read_name_decodes_latin1() {
        // "Beb\xeaP" — latin-1 ê at byte 3
        let bytes = [b'B', b'e', b'b', 0xea, b'P', 0, 0, 0];
        let name = read_name(&bytes);
        assert_eq!(name, "BebêP");
    }
}
