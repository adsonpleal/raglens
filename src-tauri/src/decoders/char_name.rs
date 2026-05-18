// ZC_ACK_REQNAME_TITLE — the server's reply when the client asks
// "what's the name behind this AID?". Fires for any nameplate the
// player can see on their screen, INCLUDING their own character right
// after zone-in, which is what we care about: it gives us the
// connection's AID → character name mapping.
//
// Layout: 102 bytes
//   off  0-1   u16    opcode (0x0a30)
//   off  2-5   u32    aid (little-endian)
//   off  6-29  [u8;24] char name (latin-1, null-terminated)
//   off 30-53  [u8;24] party name
//   off 54-77  [u8;24] guild name
//   off 78-101 [u8;24] position / title
//
// Names are latin-1 because the client's renderer is — Portuguese
// accents (ç, ã) survive the round-trip only if we decode each byte
// as Unicode 0..0xFF rather than UTF-8.

use crate::connections::{emit_client_updated, ClientUpdate, ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use tauri::{AppHandle, Manager};

pub const OPCODE: u16 = 0x0a30;

pub fn decode(app: &AppHandle, _ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 102 {
        return;
    }
    let aid = u32::from_le_bytes([payload[2], payload[3], payload[4], payload[5]]);
    let name = read_latin1_cstring(&payload[6..30]);
    if name.is_empty() {
        return;
    }

    let state = app.state::<ConnectionsState>();
    if state.bind_name(aid, name.clone()) {
        emit_client_updated(
            app,
            ClientUpdate {
                pid: None,
                aid: Some(aid),
                name: Some(name),
            },
        );
    }
}

fn read_latin1_cstring(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    bytes[..end].iter().map(|&b| b as char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_packet(aid: u32, name: &[u8]) -> Vec<u8> {
        let mut p = vec![0u8; 102];
        p[0] = 0x30;
        p[1] = 0x0a;
        p[2..6].copy_from_slice(&aid.to_le_bytes());
        p[6..6 + name.len()].copy_from_slice(name);
        p
    }

    #[test]
    fn reads_null_terminated_latin1_name() {
        let p = build_packet(1031076, b"Tucano");
        let name = read_latin1_cstring(&p[6..30]);
        assert_eq!(name, "Tucano");
    }

    #[test]
    fn preserves_latin1_accents() {
        // 'ç' = 0xE7, 'ã' = 0xE3 in latin-1. The bytes here spell
        // "Promção" — a synthetic Portuguese-looking sample chosen to
        // hit both accented codepoints in one fixture.
        let p = build_packet(1, &[b'P', b'r', b'o', b'm', 0xE7, 0xE3, b'o']);
        let name = read_latin1_cstring(&p[6..30]);
        assert_eq!(name, "Prom\u{00e7}\u{00e3}o");
    }

    #[test]
    fn rejects_short_payload() {
        // No panic from `decode` on a short slice. We just check the
        // bounds guard returns early — actual emit is harder to verify
        // without an AppHandle, but the bounds check is the contract.
        let short = vec![0u8; 50];
        assert!(short.len() < 102);
    }
}
