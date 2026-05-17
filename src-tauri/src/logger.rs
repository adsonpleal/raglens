// Dev-mode opcode logger.
//
// Enabled by `RAGLENS_LOG_OPCODES=1`. Writes one line per observed
// packet to `%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`.
// File rotates daily (filename includes the date; we reopen when the
// date crosses midnight). Used to identify unknown opcodes against
// in-game fixtures — `Get-Content -Tail 50` after killing a monster
// to spot the XP packet, etc.

use crate::connections::FourTuple;
use crate::dispatch::Direction;
use std::env;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct OpcodeLogger {
    base_dir: PathBuf,
    current_date: String,
    file: Option<File>,
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
        let dir = match direction {
            Direction::ToClient => "S->C",
            Direction::ToServer => "C->S",
        };
        let line = format!(
            "{ts} | {dir} | {}:{} <-> {}:{} | opcode=0x{:04x} | len={} | {}\n",
            ft.client_ip,
            ft.client_port,
            ft.server_ip,
            ft.server_port,
            opcode,
            payload.len(),
            hex::encode(payload),
        );
        if let Some(f) = self.file.as_mut() {
            f.write_all(line.as_bytes())?;
        }
        Ok(())
    }
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
}
