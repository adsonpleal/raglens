// ZC_NOTIFY_EXP — the delta-style "you gained N base/job XP" event.
// Fires every time a kill (or quest reward, or bonus) credits XP to
// the character. We emit one `packet:exp-gain` per packet with the
// owning client's PID attached so per-PID overlays can filter without
// re-walking the connection table.
//
// Layout: 18 bytes
//   off  0-1   u16  opcode (0x0acc)
//   off  2-5   u32  account id (little-endian)
//   off  6-13  i64  exp gained (little-endian — int64 because high-
//                   level chars can earn >2³¹ XP per kill in some
//                   pre-renewal multipliers)
//   off 14-15  u16  type: 1 = base, 2 = job
//   off 16-17  u16  quest: 0 = normal kill, 1 = quest reward

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x0acc;

#[derive(Serialize, Clone, Debug)]
pub struct ExpGain {
    pub pid: Option<u32>,
    pub aid: u32,
    pub delta: i64,
    pub kind: ExpKind,
    pub from_quest: bool,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum ExpKind {
    Base,
    Job,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 18 {
        return;
    }
    let aid = u32::from_le_bytes([payload[2], payload[3], payload[4], payload[5]]);
    let delta = i64::from_le_bytes([
        payload[6], payload[7], payload[8], payload[9], payload[10], payload[11], payload[12],
        payload[13],
    ]);
    let type_id = u16::from_le_bytes([payload[14], payload[15]]);
    let quest = u16::from_le_bytes([payload[16], payload[17]]);

    let kind = match type_id {
        1 => ExpKind::Base,
        2 => ExpKind::Job,
        _ => return, // ignore other type ids — they aren't EXP
    };

    let pid = app.state::<ConnectionsState>().pid_for(ft);
    let _ = app.emit(
        "packet:exp-gain",
        ExpGain {
            pid,
            aid,
            delta,
            kind,
            from_quest: quest != 0,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(aid: u32, delta: i64, type_id: u16, quest: u16) -> Vec<u8> {
        let mut p = vec![0u8; 18];
        p[0] = 0xcc;
        p[1] = 0x0a;
        p[2..6].copy_from_slice(&aid.to_le_bytes());
        p[6..14].copy_from_slice(&delta.to_le_bytes());
        p[14..16].copy_from_slice(&type_id.to_le_bytes());
        p[16..18].copy_from_slice(&quest.to_le_bytes());
        p
    }

    #[test]
    fn parses_base_exp_gain() {
        // Matches the captured packet:
        //   cc0a a4bb0f00 b001000000000000 0100 0000
        //   AID 1031076, +432 base, normal kill.
        let p = build(1031076, 432, 1, 0);
        assert_eq!(p[14], 0x01);
        let aid = u32::from_le_bytes([p[2], p[3], p[4], p[5]]);
        let delta = i64::from_le_bytes([p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13]]);
        assert_eq!(aid, 1031076);
        assert_eq!(delta, 432);
    }

    #[test]
    fn parses_job_exp_gain() {
        // cc0a a4bb0f00 2701000000000000 0200 0000  → +295 job
        let p = build(1031076, 295, 2, 0);
        let delta = i64::from_le_bytes([p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13]]);
        let type_id = u16::from_le_bytes([p[14], p[15]]);
        assert_eq!(delta, 295);
        assert_eq!(type_id, 2);
    }
}
