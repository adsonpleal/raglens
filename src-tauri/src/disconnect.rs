// Unexpected-disconnect detection.
//
// Three sources fan into one Tauri event (`"client-disconnect"`):
//   1. TCP RST observed on a game-port 4-tuple → `on_tcp_rst`.
//   2. Silent timeout (no packets seen for > THRESHOLD while the
//      owning process is still alive) → `watchdog_tick` running on
//      its own thread alongside the WinDivert recv loop.
//   3. ZC_NOTIFY_BAN (0x0081) decoder → `decoders::ban::decode`
//      builds the payload directly and calls `emit()`.
//
// `emit()` is the single chokepoint: it consults two suppression
// maps before letting the event through, so callers don't need to.
//
//   - `RecentRestarts` (5s window): set by `restart::decode` on a
//     successful ZC_RESTART_ACK so the FIN/RST that follow the
//     intentional return-to-char-select don't fire a notification.
//   - `RecentEmits` (10s window): set by `emit()` itself so the
//     common BAN-then-RST sequence (server kicks, then closes the
//     socket) shows up as one notification, not two.
//
// FIN handling lives in capture.rs — graceful FIN just calls
// `ConnectionsState::forget(ft)` so the watchdog stops tracking
// the dead tuple. No event is emitted on FIN.

use crate::connections::{unix_ms, ConnectionsState, FourTuple};
use crate::process;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

/// How long after a successful ZC_RESTART_ACK we still treat a RST /
/// FIN / timeout on that PID as part of the intentional logout.
const RESTART_SUPPRESSION: std::time::Duration = std::time::Duration::from_secs(5);

/// How long after emitting one disconnect for a PID we'll suppress
/// further emits for the same PID. Catches the BAN-then-RST sequence
/// where one logical kick produces two underlying signals.
const EMIT_DEDUPE_WINDOW: std::time::Duration = std::time::Duration::from_secs(10);

/// Silence threshold: a 4-tuple unseen for this long is considered
/// timed out (provided its process is still alive).
const WATCHDOG_THRESHOLD: std::time::Duration = std::time::Duration::from_secs(30);

/// Watchdog polling cadence. Chosen so an unhandled timeout takes at
/// most THRESHOLD + TICK to surface.
const WATCHDOG_TICK: std::time::Duration = std::time::Duration::from_secs(5);

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DisconnectKind {
    Rst,
    Timeout,
    Ban,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClientDisconnect {
    pub pid: Option<u32>,
    pub aid: Option<u32>,
    pub kind: DisconnectKind,
    /// pt-BR human-readable reason. Populated for `Ban`; `None` for
    /// `Rst` / `Timeout` since the wire gives us nothing to label
    /// them with.
    pub reason: Option<String>,
    /// Raw reason byte from ZC_NOTIFY_BAN. `None` for non-ban kinds.
    pub reason_code: Option<u8>,
    pub unix_ms: u64,
}

impl ClientDisconnect {
    pub fn rst(pid: Option<u32>, aid: Option<u32>) -> Self {
        Self {
            pid,
            aid,
            kind: DisconnectKind::Rst,
            reason: None,
            reason_code: None,
            unix_ms: unix_ms(),
        }
    }

    pub fn timeout(pid: Option<u32>, aid: Option<u32>) -> Self {
        Self {
            pid,
            aid,
            kind: DisconnectKind::Timeout,
            reason: None,
            reason_code: None,
            unix_ms: unix_ms(),
        }
    }

    pub fn ban(pid: Option<u32>, aid: Option<u32>, reason_code: u8, reason: String) -> Self {
        Self {
            pid,
            aid,
            kind: DisconnectKind::Ban,
            reason: Some(reason),
            reason_code: Some(reason_code),
            unix_ms: unix_ms(),
        }
    }
}

/// PID → instant at which restart.rs last marked a successful
/// intentional disconnect. Inserted by `mark_restart`, read by
/// `is_recently_restarted` inside `emit()`.
#[derive(Default)]
pub struct RecentRestarts(Mutex<HashMap<u32, Instant>>);

impl RecentRestarts {
    pub fn mark(&self, pid: u32) {
        self.0.lock().unwrap().insert(pid, Instant::now());
    }

    fn is_recent(&self, pid: u32, window: std::time::Duration) -> bool {
        let map = self.0.lock().unwrap();
        match map.get(&pid) {
            Some(when) => when.elapsed() <= window,
            None => false,
        }
    }

    /// Drop entries older than `max_age` so the map doesn't grow
    /// unbounded over long sessions with many PIDs.
    fn evict_stale(&self, max_age: std::time::Duration) {
        self.0
            .lock()
            .unwrap()
            .retain(|_, when| when.elapsed() < max_age);
    }
}

/// PID → instant of the last emitted `client-disconnect` event.
/// Lives behind `emit()` so each caller doesn't have to re-derive
/// the dedupe window.
#[derive(Default)]
pub struct RecentEmits(Mutex<HashMap<u32, Instant>>);

impl RecentEmits {
    fn record(&self, pid: u32) {
        self.0.lock().unwrap().insert(pid, Instant::now());
    }

    fn is_recent(&self, pid: u32, window: std::time::Duration) -> bool {
        let map = self.0.lock().unwrap();
        match map.get(&pid) {
            Some(when) => when.elapsed() <= window,
            None => false,
        }
    }

    fn evict_stale(&self, max_age: std::time::Duration) {
        self.0
            .lock()
            .unwrap()
            .retain(|_, when| when.elapsed() < max_age);
    }
}

/// Emit `client-disconnect` unless one of the suppression maps
/// vetoes it. Returns true if the event was actually sent — used by
/// tests and tracing; production callers can ignore the return.
pub fn emit(app: &AppHandle, payload: ClientDisconnect) -> bool {
    if let Some(pid) = payload.pid {
        let recent_restarts = app.state::<RecentRestarts>();
        if recent_restarts.is_recent(pid, RESTART_SUPPRESSION) {
            eprintln!(
                "[disconnect] suppressed {:?} for pid {} — within {}s of ZC_RESTART_ACK",
                payload.kind,
                pid,
                RESTART_SUPPRESSION.as_secs()
            );
            return false;
        }
        let recent_emits = app.state::<RecentEmits>();
        if recent_emits.is_recent(pid, EMIT_DEDUPE_WINDOW) {
            eprintln!(
                "[disconnect] deduped {:?} for pid {} — already emitted within {}s",
                payload.kind,
                pid,
                EMIT_DEDUPE_WINDOW.as_secs()
            );
            return false;
        }
        recent_emits.record(pid);
    }
    let _ = app.emit("client-disconnect", payload);
    true
}

/// Called from the capture loop's control-segment branch when WinDivert
/// hands us a TCP packet carrying RST on one of the matched game
/// ports. Builds a payload, lets `emit()` apply suppression, and
/// drops the tuple either way (a RST always closes the socket).
pub fn on_tcp_rst(app: &AppHandle, ft: &FourTuple, connections: &ConnectionsState) {
    let pid = connections.pid_for(ft);
    let aid = connections.aid_for(ft);
    connections.forget(ft);
    emit(app, ClientDisconnect::rst(pid, aid));
}

/// One tick of the watchdog. Snapshots stale tuples, distinguishes
/// "process gone" (user closed the client → silent forget) from
/// "process alive" (real network/server hang → emit Timeout), and
/// removes the tuple in both cases so we don't fire on it twice.
/// Also reaps the suppression maps so their PID keyspace stays bounded.
pub fn watchdog_tick(app: &AppHandle, connections: &ConnectionsState) {
    let stale = connections.iter_stale(WATCHDOG_THRESHOLD.as_millis() as u64);
    // One process_info() syscall per distinct PID across this tick.
    // Multi-connection-per-Ragexe is the common case (each map change
    // spawns a fresh TCP socket), so caching matters when several
    // tuples expire in the same tick.
    let mut liveness: HashMap<u32, bool> = HashMap::new();
    for s in stale {
        let process_alive = match s.pid {
            Some(pid) => *liveness
                .entry(pid)
                .or_insert_with(|| process::process_info(pid).name.is_some()),
            // PID never resolved — we can't tell if the client is
            // alive or not. Bias toward "user closed it" and forget
            // silently rather than spam a notification on every
            // capture session that didn't fully bind.
            None => false,
        };
        if process_alive {
            emit(app, ClientDisconnect::timeout(s.pid, s.aid));
        }
        connections.forget(&s.four_tuple);
    }

    // Cap the suppression-map size. Anything older than its window
    // is functionally dead; reaping it here keeps the keyspace bounded
    // across long sessions with churning PIDs.
    app.state::<RecentRestarts>().evict_stale(RESTART_SUPPRESSION);
    app.state::<RecentEmits>().evict_stale(EMIT_DEDUPE_WINDOW);
}

/// Spawn the watchdog thread. Shares the WinDivert `running` flag so
/// `capture::shutdown_capture` stops it for free.
pub fn spawn_watchdog(app: AppHandle, running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        // Short sleep slices so we exit promptly on shutdown rather
        // than burning the full WATCHDOG_TICK on every wake-up.
        let slice = std::time::Duration::from_millis(500);
        let slices_per_tick =
            (WATCHDOG_TICK.as_millis() / slice.as_millis()) as u64;
        while running.load(Ordering::SeqCst) {
            for _ in 0..slices_per_tick {
                if !running.load(Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(slice);
            }
            let conns = app.state::<ConnectionsState>();
            watchdog_tick(&app, &conns);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_restarts_marks_inside_window() {
        let m = RecentRestarts::default();
        m.mark(42);
        assert!(m.is_recent(42, std::time::Duration::from_secs(5)));
    }

    #[test]
    fn recent_restarts_misses_unmarked_pid() {
        let m = RecentRestarts::default();
        m.mark(42);
        assert!(!m.is_recent(99, std::time::Duration::from_secs(5)));
    }

    #[test]
    fn recent_restarts_out_of_window_does_not_match() {
        let m = RecentRestarts::default();
        m.mark(42);
        // Zero-duration window means anything older than "right now"
        // doesn't match. Cheap proxy for "5s in the past".
        std::thread::sleep(std::time::Duration::from_millis(2));
        assert!(!m.is_recent(42, std::time::Duration::from_millis(1)));
    }

    #[test]
    fn recent_emits_dedupes_same_pid() {
        let m = RecentEmits::default();
        m.record(7);
        assert!(m.is_recent(7, std::time::Duration::from_secs(10)));
    }
}
