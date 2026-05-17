mod capture;
mod connections;
mod decoders;
mod dispatch;
mod interfaces;
mod logger;
mod packet;

use capture::CaptureState;
use connections::ConnectionsState;
use interfaces::NetworkInterface;
use tauri::{AppHandle, State};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(CaptureState::default())
        .manage(ConnectionsState::default())
        .invoke_handler(tauri::generate_handler![
            list_interfaces,
            start_capture,
            stop_capture,
            connections::list_connections,
            connections::select_connection,
            connections::clear_connection_selection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
