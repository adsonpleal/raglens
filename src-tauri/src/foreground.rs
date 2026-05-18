// Foreground-window PID watcher.
//
// Polls `GetForegroundWindow` + `GetWindowThreadProcessId` on a background
// thread and emits a `foreground-changed` event whenever the foreground
// PID changes. The frontend uses that to show/hide per-PID overlays
// — e.g. Tucano's XP meter is visible only when Tucano's Ragexe is the
// focused window.
//
// We don't use SetWinEventHook for two reasons: (1) it requires a
// dedicated UI message-pump thread which doesn't compose well with the
// rest of our Rust setup, and (2) a 150ms poll is plenty for "alt-tab
// between clients" UX and uses no measurable CPU.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Default)]
pub struct ForegroundWatcherState {
    running: Arc<AtomicBool>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ForegroundChanged {
    pub pid: Option<u32>,
}

impl ForegroundWatcherState {
    pub fn start(&self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // already running
        }
        let running = self.running.clone();
        std::thread::spawn(move || {
            run_poll_loop(app, running);
        });
    }
}

fn run_poll_loop(app: AppHandle, running: Arc<AtomicBool>) {
    let mut last: Option<u32> = None;
    while running.load(Ordering::Relaxed) {
        let current = current_foreground_pid();
        if current != last {
            let _ = app.emit("foreground-changed", ForegroundChanged { pid: current });
            last = current;
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(windows)]
fn current_foreground_pid() -> Option<u32> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    let mut pid: u32 = 0;
    let _tid = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        None
    } else {
        Some(pid)
    }
}

#[cfg(not(windows))]
fn current_foreground_pid() -> Option<u32> {
    None
}

/// One-shot query — used by command handlers that want to seed the
/// frontend before the first poll-driven event arrives.
#[tauri::command]
pub fn get_foreground_pid() -> Option<u32> {
    current_foreground_pid()
}
