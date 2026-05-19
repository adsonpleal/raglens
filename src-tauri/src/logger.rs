// Dev-mode opcode logger.
//
// Enabled by `RAGLENS_LOG_OPCODES=1`. Writes one line per observed
// packet to `%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`.
// File rotates daily (filename includes the date; we reopen when the
// date crosses midnight). Used to identify unknown opcodes against
// in-game fixtures — `Get-Content -Tail 50` after killing a monster
// to spot the XP packet, etc.
//
// On top of the raw hex dump, pet-state opcodes (0x01a2 / 0x01a4 /
// 0x01a3 / 0x01a9) get a follow-up `[pet]` annotation line carrying
// the decoded value, the dt since the previous hunger tick on this
// connection, the inferred drop-rate, and the predicted countdown to
// the next stage threshold. That makes it possible to verify the
// pet-feeder overlay's timer state against the on-the-wire reality
// (timestamp alignment, one-tick offset checks) by tailing the file
// during a session.

use crate::connections::FourTuple;
use crate::dispatch::Direction;
use std::collections::HashMap;
use std::env;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Stage threshold the pet-feeder overlay reacts to: dropping to or
/// below this triggers the optimal-feed ("nenhuma") state. Mirrors
/// `HUNGER.OPTIMAL_MAX` in `src/addons/pet-feeder/format.ts`.
const OPTIMAL_MAX: u16 = 75;
/// Below this is the danger zone ("fome"/"faminto"). Mirrors
/// `HUNGER.DANGER_MAX`.
const DANGER_MAX: u16 = 25;

/// Cap on `pet_tracks` size — prevents unbounded growth as TCP
/// 4-tuples cycle over a long session. When exceeded, entries
/// untouched for `PET_TRACK_STALE` are evicted at next insert.
const PET_TRACKS_SOFT_CAP: usize = 128;
const PET_TRACK_STALE: Duration = Duration::from_secs(30 * 60);

pub struct OpcodeLogger {
    base_dir: PathBuf,
    current_date: String,
    file: Option<File>,
    /// Per-connection pet timing state. We key on FourTuple because
    /// that's the granularity the logger sees — different characters
    /// (different PIDs) get different connections, and a re-connect
    /// on the same PID also gets a new tuple, which is fine: starting
    /// fresh on a new tuple just means the first hunger tick has no
    /// dt to compare against and we log it with `dt=initial`.
    pet_tracks: HashMap<FourTuple, PetTrack>,
}

/// Per-connection state used to annotate pet packets with timing
/// information at log time. All of this is reconstructable Rust-side
/// from observed 0x01a4 hunger ticks; we don't depend on the frontend
/// pushing anything back.
struct PetTrack {
    last_hunger_at: Instant,
    last_hunger_value: u16,
    /// Inferred discrete tick model from the most recent decay:
    /// hunger drops by `drop_per_tick` every `interval_ms`. Carried
    /// forward so subsequent ticks (including post-feed ones) can
    /// show the predicted countdown without re-deriving on every
    /// packet. `None` until we see at least one natural decay.
    interval_ms: Option<u64>,
    drop_per_tick: Option<u16>,
    /// Set after we observe a hunger *increase* (feed). The first
    /// natural decay after this has irregular dt (server reschedules
    /// the hungry timer on feed); we skip updating the tick model
    /// on that one and just consume the flag.
    awaiting_post_fed_tick: bool,
}

impl OpcodeLogger {
    pub fn from_env() -> Option<Self> {
        if env::var("RAGLENS_LOG_OPCODES").ok().as_deref() != Some("1") {
            return None;
        }
        let base = env::var("LOCALAPPDATA").ok().map(PathBuf::from)?;
        let base_dir = base.join("com.adson.raglens").join("logs");
        if let Err(e) = create_dir_all(&base_dir) {
            eprintln!("[logger] failed to create log dir {:?}: {}", base_dir, e);
            return None;
        }
        eprintln!("[logger] opcode logging enabled. Writing to {:?}", base_dir);
        Some(OpcodeLogger {
            base_dir,
            current_date: String::new(),
            file: None,
            pet_tracks: HashMap::new(),
        })
    }

    fn ensure_file(&mut self, date: &str) -> io::Result<()> {
        if self.current_date == date && self.file.is_some() {
            return Ok(());
        }
        let path = self.base_dir.join(format!("opcodes-{date}.log"));
        let file = OpenOptions::new().append(true).create(true).open(path)?;
        self.file = Some(file);
        self.current_date = date.to_string();
        Ok(())
    }

    pub fn log(
        &mut self,
        ft: &FourTuple,
        direction: Direction,
        opcode: u16,
        payload: &[u8],
    ) -> io::Result<()> {
        let (ts, date) = iso_ts();
        self.ensure_file(&date)?;
        let prefix = line_prefix(ft, direction, &ts);
        let line = format!(
            "{prefix} | opcode=0x{:04x} | len={} | {}\n",
            opcode,
            payload.len(),
            hex::encode(payload),
        );
        if let Some(f) = self.file.as_mut() {
            f.write_all(line.as_bytes())?;
        }

        // Pet-state annotation: same `{prefix}` as the hex line so a
        // `grep '\[pet\]'` over the file pulls a self-contained
        // timing record, and the line right above it is the matching
        // raw packet.
        if let Some(annotation) = self.pet_annotation(ft, &prefix, opcode, payload) {
            if let Some(f) = self.file.as_mut() {
                f.write_all(annotation.as_bytes())?;
            }
        }
        Ok(())
    }

    /// Logged when the dispatcher gives up walking a segment because
    /// it hit an opcode whose length it can't determine. Includes a
    /// preview of the un-parsed bytes so a human can spot patterns
    /// (pet names, hunger values, etc.) and pin down the unknown
    /// opcode's length offline. Without this, unknown opcodes are
    /// invisible — they bail the walker silently and any subsequent
    /// packets in the same segment are also lost.
    pub fn log_bail(
        &mut self,
        ft: &FourTuple,
        direction: Direction,
        opcode: u16,
        remaining: &[u8],
    ) -> io::Result<()> {
        let (ts, date) = iso_ts();
        self.ensure_file(&date)?;
        // Cap the preview so a misclassified large segment doesn't
        // bloat the log. 64 bytes is enough to see opcode + a chunk
        // of payload (e.g. a pet name + hunger byte).
        const PREVIEW_MAX: usize = 64;
        let preview_len = remaining.len().min(PREVIEW_MAX);
        let line = format!(
            "{prefix} | BAIL opcode=0x{:04x} | remaining={} | {}\n",
            opcode,
            remaining.len(),
            hex::encode(&remaining[..preview_len]),
            prefix = line_prefix(ft, direction, &ts),
        );
        if let Some(f) = self.file.as_mut() {
            f.write_all(line.as_bytes())?;
        }
        Ok(())
    }

    /// Produces an additional `[pet] ...` log line for opcodes that
    /// drive the pet-feeder overlay. Returns `None` for unrelated
    /// opcodes (no extra line written). The `prefix` is the standard
    /// `{ts} | {dir} | {ft}` already built for the hex line — re-used
    /// here so the two lines align and the prefix shape lives in
    /// exactly one place (`line_prefix`).
    fn pet_annotation(
        &mut self,
        ft: &FourTuple,
        prefix: &str,
        opcode: u16,
        payload: &[u8],
    ) -> Option<String> {
        // The pet-state opcodes the overlay decodes. Anything else
        // bails fast without computing a key for the annotation
        // string, since `log()` is on the per-packet hot path.
        let pet_prefix = match opcode {
            0x01a2 | 0x01a3 | 0x01a4 | 0x01a9 => format!("{prefix} | [pet]"),
            _ => return None,
        };
        match opcode {
            // ZC_PROPERTY_PET — full snapshot. Hunger at off 29-30.
            0x01a2 if payload.len() >= 37 => {
                let hunger = u16::from_le_bytes([payload[29], payload[30]]);
                let intimacy = u16::from_le_bytes([payload[31], payload[32]]);
                let pet_type = u16::from_le_bytes([payload[35], payload[36]]);
                let annotation = self.update_hunger(ft, hunger);
                Some(format!(
                    "{pet_prefix} info hunger={hunger} intimacy={intimacy} pet_type={pet_type}{annotation}\n",
                ))
            }
            // ZC_CHANGESTATE_PET — single-field tick. type@2, value@7-10.
            0x01a4 if payload.len() >= 11 => {
                let type_id = payload[2];
                let value =
                    u32::from_le_bytes([payload[7], payload[8], payload[9], payload[10]]);
                match type_id {
                    0x01 => Some(format!("{pet_prefix} change intimacy={value}\n")),
                    0x02 => {
                        let hunger = value.min(u16::MAX as u32) as u16;
                        let annotation = self.update_hunger(ft, hunger);
                        Some(format!("{pet_prefix} change hunger={hunger}{annotation}\n"))
                    }
                    other => Some(format!(
                        "{pet_prefix} change type=0x{other:02x} value={value}\n"
                    )),
                }
            }
            // ZC_FEED_PET — server's feed ack. Hunger arrives via the
            // 0x01a4 that follows; this packet just confirms success.
            0x01a3 if payload.len() >= 5 => {
                let success = payload[2];
                let food_id = u16::from_le_bytes([payload[3], payload[4]]);
                Some(format!(
                    "{pet_prefix} feed-ack success={success} food_id={food_id}\n",
                ))
            }
            // CZ_USE_ITEM_ON_PET — client-side feed request. Useful
            // anchor for measuring "feed click → server ack" latency.
            0x01a9 => Some(format!("{pet_prefix} feed-request\n")),
            _ => None,
        }
    }

    /// Updates the per-connection hunger track and returns an
    /// appended " dt=… drop=… interval=… per_tick=… countdown=…"
    /// suffix to drop into the log line. The `interval` / `per_tick`
    /// represent the discrete tick model the overlay uses for its
    /// countdown — `dropPerTick` points are subtracted every
    /// `intervalMs`, the value sits flat in between. The countdown
    /// is computed with the same ceil-based formula as the overlay:
    ///   ceil((hunger - threshold) / drop_per_tick) ticks of
    ///   `interval_ms`, minus elapsed-since-last-tick.
    /// Empty string on the first hunger seen on a connection
    /// (nothing to compare against yet).
    fn update_hunger(&mut self, ft: &FourTuple, hunger: u16) -> String {
        let now = Instant::now();
        // Cap unbounded growth: TCP 4-tuples cycle fast, but the
        // logger is dev-only so a soft cap + stale eviction is
        // enough. Cheap walk — `pet_tracks` is small by design.
        if self.pet_tracks.len() > PET_TRACKS_SOFT_CAP {
            self.pet_tracks
                .retain(|_, t| now.duration_since(t.last_hunger_at) < PET_TRACK_STALE);
        }

        let threshold: i32 = if hunger > OPTIMAL_MAX {
            OPTIMAL_MAX as i32
        } else {
            DANGER_MAX as i32
        };

        let prev = self.pet_tracks.get(ft).map(|t| Prev {
            dt_ms: now.duration_since(t.last_hunger_at).as_millis() as u64,
            drop: (t.last_hunger_value as i32) - (hunger as i32),
            interval_ms: t.interval_ms,
            drop_per_tick: t.drop_per_tick,
            awaiting: t.awaiting_post_fed_tick,
        });

        // Decide the new tick model. Same rules as the frontend
        // merge(): feeds arm `awaiting_post_fed_tick`, the first
        // natural decay after consumes the flag without updating
        // the model, subsequent natural decays calibrate.
        let mut next_interval = prev.as_ref().and_then(|p| p.interval_ms);
        let mut next_drop = prev.as_ref().and_then(|p| p.drop_per_tick);
        let mut next_awaiting = prev.as_ref().is_some_and(|p| p.awaiting);
        if let Some(p) = &prev {
            if p.drop < 0 {
                next_awaiting = true;
            } else if p.drop > 0 && p.awaiting {
                next_awaiting = false;
            } else if p.drop > 0 && p.dt_ms > 0 {
                next_interval = Some(p.dt_ms);
                next_drop = Some(p.drop as u16);
            }
        }

        self.pet_tracks.insert(
            ft.clone(),
            PetTrack {
                last_hunger_at: now,
                last_hunger_value: hunger,
                interval_ms: next_interval,
                drop_per_tick: next_drop,
                awaiting_post_fed_tick: next_awaiting,
            },
        );

        let mut out = String::new();
        match &prev {
            None => out.push_str(" dt=initial"),
            Some(p) => {
                out.push_str(&format!(" dt={:.3}s drop={}", p.dt_ms as f64 / 1000.0, p.drop));
                if p.drop < 0 && next_awaiting {
                    out.push_str(" post_fed=armed");
                } else if p.awaiting && !next_awaiting {
                    out.push_str(" post_fed=consumed");
                }
            }
        }
        if let (Some(interval), Some(per_tick)) = (next_interval, next_drop) {
            out.push_str(&format!(
                " interval={:.3}s per_tick={per_tick}",
                interval as f64 / 1000.0
            ));
            // Same ceil-based formula as the overlay. We just observed
            // a tick (now == last_hunger_at) so a full `interval`
            // remains before the next — matches what the overlay sees
            // right after receiving the packet.
            let pts_to_cross = (hunger as i32) - threshold;
            if pts_to_cross > 0 && per_tick > 0 {
                let ticks_needed =
                    ((pts_to_cross as f64) / (per_tick as f64)).ceil() as u64;
                if ticks_needed > 0 {
                    let remaining_ms = ticks_needed * interval;
                    out.push_str(&format!(
                        " countdown={:.1}s_to<={threshold}",
                        remaining_ms as f64 / 1000.0
                    ));
                }
            }
        }
        out
    }
}

/// Snapshot of the previous hunger tick for this connection, lifted
/// out of the `pet_tracks` HashMap so the decision logic in
/// `update_hunger` can use named fields instead of tuple indices.
struct Prev {
    dt_ms: u64,
    drop: i32,
    interval_ms: Option<u64>,
    drop_per_tick: Option<u16>,
    awaiting: bool,
}

/// The standard `{ts} | {S->C|C->S} | {client_ip}:{port} <-> {server_ip}:{port}`
/// header every line in the file starts with. Centralised so the
/// hex line, the BAIL line, and the `[pet]` annotation line all
/// stay aligned when fields are added.
fn line_prefix(ft: &FourTuple, direction: Direction, ts: &str) -> String {
    let dir = match direction {
        Direction::ToClient => "S->C",
        Direction::ToServer => "C->S",
    };
    format!(
        "{ts} | {dir} | {}:{} <-> {}:{}",
        ft.client_ip, ft.client_port, ft.server_ip, ft.server_port
    )
}

/// Returns (ISO-8601 UTC timestamp, YYYY-MM-DD date).
///
/// Hand-rolled to avoid pulling chrono just for this. Algorithm from
/// Howard Hinnant's date library (public domain).
fn iso_ts() -> (String, String) {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();
    let days = secs.div_euclid(86400);
    let secs_of_day = secs.rem_euclid(86400) as u64;
    let (y, m, d) = civil_from_days(days);
    let hh = secs_of_day / 3600;
    let mm = (secs_of_day % 3600) / 60;
    let ss = secs_of_day % 60;
    let date = format!("{:04}-{:02}-{:02}", y, m, d);
    let ts = format!(
        "{date}T{:02}:{:02}:{:02}.{:03}Z",
        hh, mm, ss, millis
    );
    (ts, date)
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y0 = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y0 + 1 } else { y0 };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_from_days_known_dates() {
        // 1970-01-01 = day 0
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        // 2000-02-29 (leap day)
        assert_eq!(civil_from_days(11016), (2000, 2, 29));
        // 2024-12-31
        assert_eq!(civil_from_days(20088), (2024, 12, 31));
    }

    fn ft() -> FourTuple {
        FourTuple {
            client_ip: "10.0.0.1".into(),
            client_port: 50000,
            server_ip: "1.2.3.4".into(),
            server_port: 6900,
        }
    }

    fn empty_logger() -> OpcodeLogger {
        OpcodeLogger {
            base_dir: PathBuf::new(),
            current_date: String::new(),
            file: None,
            pet_tracks: HashMap::new(),
        }
    }

    #[test]
    fn first_hunger_observation_has_no_dt() {
        let mut l = empty_logger();
        let s = l.update_hunger(&ft(), 80);
        assert!(s.contains("dt=initial"));
        assert!(!s.contains("interval="));
        assert!(!s.contains("countdown="));
    }

    #[test]
    fn second_decay_calibrates_tick_model_and_predicts_ceil_countdown() {
        let mut l = empty_logger();
        let _ = l.update_hunger(&ft(), 79);
        // Force a known elapsed window so the test isn't time-flaky.
        l.pet_tracks.get_mut(&ft()).unwrap().last_hunger_at =
            Instant::now() - std::time::Duration::from_secs(60);
        // latamRO cadence: 3 pts / 60s. 79 → 76.
        let s = l.update_hunger(&ft(), 76);
        assert!(s.contains("drop=3"));
        assert!(s.contains("interval=60"));
        assert!(s.contains("per_tick=3"));
        // From 76, threshold 75: ceil(1/3) = 1 tick = 60s.
        assert!(
            s.contains("countdown=60"),
            "expected ceil-based 60s countdown, got: {s}"
        );
    }

    #[test]
    fn high_hunger_uses_ceil_of_tick_count() {
        let mut l = empty_logger();
        let _ = l.update_hunger(&ft(), 79);
        l.pet_tracks.get_mut(&ft()).unwrap().last_hunger_at =
            Instant::now() - std::time::Duration::from_secs(60);
        let _ = l.update_hunger(&ft(), 76);
        // Simulate a feed bringing hunger to 100, then the next two
        // natural ticks. First post-feed tick is skipped (irregular
        // dt), second calibrates.
        let s_feed = l.update_hunger(&ft(), 100);
        assert!(s_feed.contains("drop=-24"));
        assert!(s_feed.contains("post_fed=armed"));
        // Model carried forward from before the feed, so the feed
        // packet itself emits a countdown for hunger=100:
        // ceil(25/3) = 9 ticks * 60s = 540s.
        assert!(
            s_feed.contains("countdown=540"),
            "expected 540s from hunger=100 over 60s/3pt cadence, got: {s_feed}"
        );
    }

    #[test]
    fn first_post_fed_decay_does_not_update_model() {
        let mut l = empty_logger();
        // Calibrate at 60s / 3pts.
        let _ = l.update_hunger(&ft(), 79);
        l.pet_tracks.get_mut(&ft()).unwrap().last_hunger_at =
            Instant::now() - std::time::Duration::from_secs(60);
        let _ = l.update_hunger(&ft(), 76);
        // Feed: hunger jumps to 100.
        let _ = l.update_hunger(&ft(), 100);
        // First post-feed decay arrives irregularly fast (48s).
        l.pet_tracks.get_mut(&ft()).unwrap().last_hunger_at =
            Instant::now() - std::time::Duration::from_secs(48);
        let s = l.update_hunger(&ft(), 97);
        assert!(s.contains("post_fed=consumed"));
        // Model is the *pre-feed* one (60s / 3 pts), NOT the
        // irregular 48s the post-feed tick would suggest.
        assert!(
            s.contains("interval=60"),
            "model should not have been updated by post-feed tick, got: {s}"
        );
    }
}
