// ZC_LONGPAR_CHANGE (0x0acb) — int64 PARAMCHANGE.
//
// Carries running totals and thresholds for stats that can exceed 32
// bits. We only care about the EXP-related types:
//
//   type 1  SP_BASEEXP        → new total base exp
//   type 2  SP_JOBEXP         → new total job exp
//   type 22 SP_NEXTBASEEXP    → exp required for the next base level
//   type 23 SP_NEXTJOBEXP     → exp required for the next job level
//
// All four are emitted right after a kill (alongside the 0x0acc gain
// notification) and on map zone-in. The XP meter needs `next` values
// to compute %/min and ETA; the running totals are useful as a
// sanity-check against the summed deltas from 0x0acc.
//
// Layout: 12 bytes
//   off 0-1   u16  opcode (0x0acb)
//   off 2-3   u16  param type
//   off 4-11  i64  value (little-endian)

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x0acb;

#[derive(Serialize, Clone, Debug)]
pub struct ExpTotalUpdate {
    pub pid: Option<u32>,
    pub aid: Option<u32>,
    pub field: ExpField,
    pub value: i64,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum ExpField {
    BaseExp,
    JobExp,
    NextBaseExp,
    NextJobExp,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 12 {
        return;
    }
    let type_id = u16::from_le_bytes([payload[2], payload[3]]);
    let field = match type_id {
        1 => ExpField::BaseExp,
        2 => ExpField::JobExp,
        22 => ExpField::NextBaseExp,
        23 => ExpField::NextJobExp,
        _ => return,
    };
    let value = i64::from_le_bytes([
        payload[4], payload[5], payload[6], payload[7], payload[8], payload[9], payload[10],
        payload[11],
    ]);

    let state = app.state::<ConnectionsState>();
    let pid = state.pid_for(ft);
    let aid = state.aid_for(ft);

    let _ = app.emit(
        "packet:exp-totals",
        ExpTotalUpdate {
            pid,
            aid,
            field,
            value,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(type_id: u16, value: i64) -> Vec<u8> {
        let mut p = vec![0u8; 12];
        p[0] = 0xcb;
        p[1] = 0x0a;
        p[2..4].copy_from_slice(&type_id.to_le_bytes());
        p[4..12].copy_from_slice(&value.to_le_bytes());
        p
    }

    #[test]
    fn parses_base_total() {
        // From the log: cb0a 0100 3503000000000000 → SP_BASEEXP total 821
        let p = build(1, 821);
        let type_id = u16::from_le_bytes([p[2], p[3]]);
        let value = i64::from_le_bytes([p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]]);
        assert_eq!(type_id, 1);
        assert_eq!(value, 821);
    }

    #[test]
    fn parses_next_base_threshold() {
        // cb0a 1600 3036000000000000 → SP_NEXTBASEEXP = 13872
        let p = build(22, 13872);
        let value = i64::from_le_bytes([p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11]]);
        assert_eq!(value, 13872);
    }
}
