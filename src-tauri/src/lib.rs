mod capture;
mod connections;
mod decoders;
mod disconnect;
mod dispatch;
mod foreground;
mod interfaces;
mod inventory_store;
mod logger;
mod map_image_cache;
mod packet;
mod pet_state_store;
mod process;
mod sounds;
mod window_rect;

use capture::CaptureState;
use connections::ConnectionsState;
use foreground::ForegroundWatcherState;
use interfaces::NetworkInterface;
use window_rect::WindowRectWatcherState;
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(CaptureState::default())
        .manage(ConnectionsState::default())
        .manage(ForegroundWatcherState::default())
        .manage(WindowRectWatcherState::default())
        .manage(pet_state_store::PetStateStore::default())
        .manage(inventory_store::InventoryStore::default())
        .manage(disconnect::RecentRestarts::default())
        .manage(disconnect::RecentEmits::default())
        .setup(|app| {
            // Kick the foreground watcher as soon as the app is up. It
            // emits foreground-changed events for the lifetime of the
            // process; per-PID overlays subscribe to those for show/hide.
            let watcher = app.state::<ForegroundWatcherState>();
            watcher.start(app.handle().clone());
            // Track the selected client's window rect so overlays with
            // "lock to game window" enabled can follow it as it moves.
            let rect_watcher = app.state::<WindowRectWatcherState>();
            rect_watcher.start(app.handle().clone());
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
            pet_state_store::get_pet_state,
            inventory_store::get_food_count,
            sounds::import_sound,
            sounds::list_sounds,
            sounds::read_sound,
            map_image_cache::get_map_image_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // Closing the main window exits the app entirely. Without
            // this, overlay windows would keep the process alive
            // (some are hidden by the foreground watcher so the user
            // sees nothing while the app silently runs in the
            // background).
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { .. },
                ..
            } if label == "main" => {
                app_handle.exit(0);
            }
            // Tear down the background threads on app exit. Without
            // this, the capture thread sits blocked in WinDivertRecv
            // and the foreground watcher keeps polling, both firing
            // emits at an event bus that's tearing down underneath
            // them. WinDivertShutdown unblocks recv; the watcher's
            // running flag exits the poll loop on its next tick.
            tauri::RunEvent::Exit => {
                let capture_state = app_handle.state::<capture::CaptureState>();
                capture::shutdown_capture(capture_state.inner());
                app_handle.state::<ForegroundWatcherState>().stop();
                app_handle.state::<WindowRectWatcherState>().stop();
            }
            _ => {}
        });
}
