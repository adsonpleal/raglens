// Game-window rect watcher.
//
// Polls the *foreground* window on a background thread and, when it is
// a Ragnarok client window, emits a `game-window-rect-changed` event
// whenever its rectangle moves or resizes. Overlay windows that have
// "lock to game window" enabled subscribe to this and translate
// themselves by the same delta, so the overlay layout follows the game
// window around the screen.
//
// Why foreground-tracking instead of resolving the selected client's
// window by PID: latamRO's packet protection spoofs
// GetWindowThreadProcessId for the game window (it reports PID 0), and
// the process that owns the network socket owns no window at all. So
// there is no reliable PID→window link. Overlays are already only
// visible while their client is focused, so "the game window the user
// is interacting with" is by definition the foreground window — we key
// on that. Each window is tagged with its HWND (`token`) so consumers
// re-baseline rather than jump when focus moves between two clients
// (multi-client: both windows share the title "Ragnarok").
//
// Read-only Win32 (GetForegroundWindow / GetWindowRect / GetWindowText)
// — never touches the game, in keeping with the sniff-only contract.
// Mirrors the shape of `foreground.rs`: one poll thread, a `running`
// flag, started in setup and stopped on exit.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// Adaptive poll cadence: while the game window is actively moving we
// poll fast for a smooth follow; once it's been still for a moment we
// drop back to the idle rate so the watcher costs ~nothing at rest.
const FAST_INTERVAL: Duration = Duration::from_millis(16); // ~60 Hz while dragging
const SLOW_INTERVAL: Duration = Duration::from_millis(100); // idle / at rest
/// Stay in fast mode for this long after the last detected change, so a
/// continuous drag never dips back to the slow rate between samples.
const FAST_LINGER: Duration = Duration::from_millis(500);

#[derive(Default)]
pub struct WindowRectWatcherState {
    running: Arc<AtomicBool>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct GameWindowRect {
    /// Identity of the foreground game window (its HWND as an integer).
    /// Consumers re-baseline when this changes instead of applying a
    /// delta computed against a different window.
    pub token: u64,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl WindowRectWatcherState {
    pub fn start(&self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // already running
        }
        let running = self.running.clone();
        std::thread::spawn(move || {
            run_poll_loop(app, running);
        });
    }

    /// Signal the polling thread to exit on its next tick. Called from
    /// the `RunEvent::Exit` handler in lib.rs alongside the foreground
    /// watcher so the thread stops emitting into a tearing-down bus.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

#[cfg(windows)]
fn run_poll_loop(app: AppHandle, running: Arc<AtomicBool>) {
    use std::time::Instant;

    let mut last: Option<GameWindowRect> = None;
    // Seed in the past so we start at the idle rate.
    let mut last_change = Instant::now() - FAST_LINGER;

    while running.load(Ordering::Relaxed) {
        let now = Instant::now();
        if let Some(rect) = foreground_game_rect() {
            if last != Some(rect) {
                let _ = app.emit("game-window-rect-changed", rect);
                last = Some(rect);
                last_change = now;
            }
        }
        let fast = now.duration_since(last_change) < FAST_LINGER;
        std::thread::sleep(if fast { FAST_INTERVAL } else { SLOW_INTERVAL });
    }
}

/// The foreground window's rect, but only if it's a Ragnarok client
/// window. `None` when nothing is focused or the focused window isn't a
/// game window (our own overlays, other apps).
#[cfg(windows)]
fn foreground_game_rect() -> Option<GameWindowRect> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() || !is_game_window(hwnd) {
        return None;
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return None;
    }
    Some(GameWindowRect {
        token: hwnd.0 as u64,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
    })
}

/// Heuristic: a Ragnarok client window has the title or window class
/// "Ragnarok". Matching is case-insensitive and substring-on-title so
/// servers that append a name still match; none of our own windows
/// (Raglens / Ragmarket / addon overlays) contain "ragnarok".
#[cfg(windows)]
fn is_game_window(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetWindowTextW};

    let mut title = [0u16; 96];
    let n = unsafe { GetWindowTextW(hwnd, &mut title) };
    let title = String::from_utf16_lossy(&title[..n.max(0) as usize]);
    if title.to_ascii_lowercase().contains("ragnarok") {
        return true;
    }
    let mut class = [0u16; 96];
    let n = unsafe { GetClassNameW(hwnd, &mut class) };
    let class = String::from_utf16_lossy(&class[..n.max(0) as usize]);
    class.eq_ignore_ascii_case("ragnarok")
}

#[cfg(not(windows))]
fn run_poll_loop(_app: AppHandle, _running: Arc<AtomicBool>) {}
