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
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};

/// Bring the main window back from the tray: undo any minimized state,
/// show it (it's hidden, not just minimized, while in the tray), and
/// pull it to the foreground.
fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

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

            // System tray. Minimizing or closing the main window hides
            // it here (see the RunEvent handlers below) rather than
            // quitting — the addon overlays keep running over the game.
            // The tray is the only affordance to restore the window or
            // actually quit ("Sair").
            let show_item =
                MenuItem::with_id(app, "show", "Mostrar Raglens", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Raglens")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click the tray icon to bring the window back.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
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
            // Closing the main window hides it to the system tray
            // instead of quitting, so the addon overlays keep running
            // over the game. Quitting is done via the tray menu's
            // "Sair", which calls app.exit(0) directly.
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                api.prevent_close();
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            // Minimizing also tucks the window into the tray (hiding it
            // drops it from the taskbar). Tauri has no dedicated
            // minimize event, so we react to Resized and gate on the
            // minimized state.
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Resized(_),
                ..
            } if label == "main" => {
                if let Some(win) = app_handle.get_webview_window("main") {
                    if win.is_minimized().unwrap_or(false) {
                        let _ = win.hide();
                    }
                }
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
