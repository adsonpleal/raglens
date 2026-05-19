// Opcode dispatcher.
//
// The capture loop hands us **one TCP segment at a time**, but a single
// segment routinely carries several back-to-back Ragnarok packets —
// e.g. `0x0acb` (job-exp total) immediately followed by `0x0acc`
// (job-exp gain) followed by `0x0add` (party HP). We have to walk the
// segment, reading one Ragnarok packet at a time, dispatching each.
//
// Each opcode has a length:
//   - Known fixed-length opcodes are looked up in `fixed_packet_length`.
//   - For everything else, we read the conventional length field at
//     offset 2-3 (u16 LE). If that yields a sane value (≥4 and ≤
//     remaining bytes), we trust it; otherwise we stop walking this
//     segment so we don't desync the stream and emit garbage events.
//
// Caveat: we still do NOT reassemble across TCP segment boundaries.
// A Ragnarok packet that splits across two segments will be dropped
// by the bounds check. None of the small fixed-length opcodes we
// care about (0x0acc, 0x0acb, 0x0283, 0x0a30) hit that case in
// practice — they fit comfortably inside one segment.

use crate::connections::{emit_client_detected, ConnectionsState, FourTuple};
use crate::decoders;
use crate::logger::OpcodeLogger;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Direction {
    ToClient,
    ToServer,
}

pub fn dispatch_packet(
    app: &AppHandle,
    ft: &FourTuple,
    direction: Direction,
    payload: &[u8],
    connections: &ConnectionsState,
    logger: &mut Option<OpcodeLogger>,
) {
    if let Some(new) = connections.observe(ft) {
        // observe() set last_seen on insert — no extra touch needed.
        emit_client_detected(app, new);
    } else {
        // Existing 4-tuple: refresh last_seen so the disconnect
        // watchdog doesn't time out a connection that's still active.
        connections.touch(ft);
    }

    let followed = connections.is_followed(ft);

    let mut offset = 0;
    while offset + 2 <= payload.len() {
        let remaining = &payload[offset..];
        let opcode = u16::from_le_bytes([remaining[0], remaining[1]]);

        let len = match packet_length(opcode, remaining) {
            Some(l) if l <= remaining.len() => l,
            _ => {
                // Unknown length and the offset-2 fallback didn't yield
                // anything sensible. Bailing on this segment is safer
                // than guessing and feeding decoders garbage payloads.
                // Surface a BAIL line in the logger (if enabled) so we
                // can identify which opcode is blocking us.
                if followed {
                    if let Some(l) = logger.as_mut() {
                        let _ = l.log_bail(ft, direction, opcode, remaining);
                    }
                }
                eprintln!(
                    "[dispatch] stopping segment walk at offset {offset}: unknown length for opcode 0x{opcode:04x} (remaining={} bytes)",
                    remaining.len()
                );
                return;
            }
        };

        let pkt = &remaining[..len];

        // Logger filter is per-segment-source: a single TCP segment is
        // always from one client. is_followed() answers that once for
        // the whole walk above.
        if followed {
            if let Some(l) = logger.as_mut() {
                let _ = l.log(ft, direction, opcode, pkt);
            }
        }

        if let Some(decoder) = decoders::lookup(opcode) {
            decoder(app, ft, direction, pkt);
        }

        offset += len;
    }
}

/// Returns the length in bytes of the Ragnarok packet starting at the
/// beginning of `remaining`, or `None` if we can't safely determine it.
fn packet_length(opcode: u16, remaining: &[u8]) -> Option<usize> {
    if let Some(fixed) = fixed_packet_length(opcode) {
        return Some(fixed);
    }
    variable_packet_length(remaining)
}

/// Lookup table for opcodes whose length is fixed by the protocol
/// (not encoded in the packet itself). Mostly drawn from rAthena's
/// packet_db; populated as we observe each opcode in the wild.
fn fixed_packet_length(opcode: u16) -> Option<usize> {
    Some(match opcode {
        0x007f => 6,   // ZC_NOTIFY_TIME (server tick)
        0x0080 => 7,   // ZC_NOTIFY_VANISH
        0x0081 => 3,   // ZC_NOTIFY_BAN (server kick / refuse with reason)
        0x0087 => 12,  // ZC_NOTIFY_PLAYERMOVE
        0x0088 => 10,  // ZC_STOPMOVE
        0x0091 => 22,  // ZC_NPCACK_MAPMOVE
        0x0095 => 30,  // ZC_ACK_REQNAME (entity GID + 24-byte name)
        0x009c => 9,   // ZC_CHANGE_DIRECTION
        0x00a1 => 6,   // ZC_ITEM_DISAPPEAR
        0x00b0 => 8,   // ZC_PAR_CHANGE (i32 PARAMCHANGE)
        0x00b1 => 8,   // ZC_LONGPAR_CHANGE (legacy)
        0x00b3 => 3,   // ZC_RESTART_ACK (back-to-char-select / quit ack)
        0x00bd => 44,  // ZC_STATUS
        0x00c0 => 7,   // ZC_EMOTION
        0x0196 => 9,   // ZC_STATUS_CHANGE
        0x01a1 => 3,   // CZ_COMMAND_PET (pet menu choice C->S)
        0x01a2 => 37,  // ZC_PROPERTY_PET (name + renameflag + level + hungry + intimacy + accessory + type)
        0x01a3 => 5,   // ZC_FEED_PET (success + foodID)
        0x01a4 => 11,  // ZC_CHANGESTATE_PET (type + GID + value)
        0x01a5 => 26,  // CZ_RENAME_PET (C->S new name 24b)
        0x01a9 => 6,   // CZ_USE_ITEM_ON_PET (C->S send pet emotion / feed signature)
        0x01aa => 10,  // ZC_PET_ACT / pet_emotion (GID + effectId)
        0x01c8 => 18,  // ZC_USE_ITEM_ACK
        0x01d6 => 4,   // ZC_NPCACK_ENABLE
        0x01d7 => 11,  // ZC_SPRITE_CHANGE2
        0x0283 => 6,   // ZC_AID
        0x02eb => 13,  // ZC_ACCEPT_ENTER2
        0x043f => 25,  // ZC_MSG_STATE_CHANGE
        0x07fb => 25,  // ZC_USE_SKILL2
        0x099b => 8,   // ZC_MAPPROPERTY_R2
        0x0984 => 6,   // ZC_MSG_SKILL
        0x0a30 => 102, // ZC_ACK_REQNAME_TITLE
        0x0acb => 12,  // ZC_LONGPAR_CHANGE (i64)
        0x0acc => 18,  // ZC_NOTIFY_EXP
        0x0b1b => 2,   // ZC_INVENTORY_END
        _ => return None,
    })
}

/// Read the conventional u16 LE length field at offset 2-3. Bounds-
/// check the result so a fixed-length opcode that happens to land
/// here doesn't push us into the weeds.
fn variable_packet_length(remaining: &[u8]) -> Option<usize> {
    if remaining.len() < 4 {
        return None;
    }
    let len = u16::from_le_bytes([remaining[2], remaining[3]]) as usize;
    // Minimum sensible length is 4 (opcode + length header); maximum
    // is what we actually have. Garbage values (0, 1, 2, 3, or > remaining)
    // mean this opcode probably isn't a length-prefixed variable.
    if (4..=remaining.len()).contains(&len) {
        Some(len)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_lengths_resolve() {
        assert_eq!(fixed_packet_length(0x0acc), Some(18));
        assert_eq!(fixed_packet_length(0x0acb), Some(12));
        assert_eq!(fixed_packet_length(0x0283), Some(6));
        assert_eq!(fixed_packet_length(0x0a30), Some(102));
        assert_eq!(fixed_packet_length(0x00b0), Some(8));
        assert_eq!(fixed_packet_length(0x0081), Some(3));
    }

    #[test]
    fn unknown_opcode_returns_none_without_length_field() {
        assert!(fixed_packet_length(0xdead).is_none());
    }

    #[test]
    fn variable_length_reads_offset_2() {
        // opcode irrelevant; payload says length = 24
        let buf = [0xff, 0xff, 24, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(variable_packet_length(&buf), Some(24));
    }

    #[test]
    fn variable_length_rejects_garbage() {
        // length field claims 9999 but buffer is 10 bytes — refuse
        let buf = [0, 0, 0x0f, 0x27, 0, 0, 0, 0, 0, 0];
        assert!(variable_packet_length(&buf).is_none());
    }

    #[test]
    fn variable_length_rejects_too_short() {
        // length 2 < minimum 4
        let buf = [0, 0, 2, 0, 0, 0];
        assert!(variable_packet_length(&buf).is_none());
    }

    #[test]
    fn walks_concatenated_exp_burst() {
        // Synthetic version of the captured segment:
        //   0x0acc(+210 base) | 0x0acb(job total) | 0x0acc(+142 job)
        // Total: 18+12+18 = 48 bytes.
        let segment: Vec<u8> = [
            // ZC_NOTIFY_EXP +210 base
            0xcc, 0x0a, 0xa4, 0xbb, 0x0f, 0x00, 0xd2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x00, 0x00,
            // ZC_LONGPAR_CHANGE type=2 SP_JOBEXP value=0x37f9
            0xcb, 0x0a, 0x02, 0x00, 0xf9, 0x37, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            // ZC_NOTIFY_EXP +142 job
            0xcc, 0x0a, 0xa4, 0xbb, 0x0f, 0x00, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x02, 0x00, 0x00, 0x00,
        ].to_vec();
        let mut offset = 0;
        let mut seen: Vec<u16> = Vec::new();
        while offset + 2 <= segment.len() {
            let r = &segment[offset..];
            let op = u16::from_le_bytes([r[0], r[1]]);
            let len = packet_length(op, r).expect("known opcode");
            seen.push(op);
            offset += len;
        }
        assert_eq!(seen, vec![0x0acc, 0x0acb, 0x0acc]);
        assert_eq!(offset, segment.len());
    }
}
