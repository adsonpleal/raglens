mod capture;
mod connections;
mod decoders;
mod dispatch;
mod foreground;
mod interfaces;
mod logger;
mod packet;
mod process;
mod transparency;

use capture::CaptureState;
use connections::ConnectionsState;
use foreground::ForegroundWatcherState;
use interfaces::NetworkInterface;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn list_interfaces() -> Result<Vec<NetworkInterface>, String> {
    interfaces::list_interfaces().map_err(|e| e.to_string())
}

#[tauri::command]
fn start_capture(
    app: AppHandle,
    state: State<CaptureState>,
    connections: State<ConnectionsState>,
    ipv4: String,
) -> Result<(), String> {
    capture::start_capture(app, state, connections, ipv4)
}

#[tauri::command]
fn stop_capture(state: State<CaptureState>) -> Result<(), String> {
    capture::stop_capture(state)
}

#[tauri::command]
fn raglens_pid() -> u32 {
    std::process::id()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(CaptureState::default())
        .manage(ConnectionsState::default())
        .manage(ForegroundWatcherState::default())
        .setup(|app| {
            // Kick the foreground watcher as soon as the app is up. It
            // emits foreground-changed events for the lifetime of the
            // process; per-PID overlays subscribe to those for show/hide.
            let watcher = app.state::<ForegroundWatcherState>();
            watcher.start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_interfaces,
            start_capture,
            stop_capture,
            connections::list_clients,
            connections::select_client,
            connections::clear_client_selection,
            connections::get_selected_pid,
            foreground::get_foreground_pid,
            raglens_pid,
            transparency::enable_overlay_transparency,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
