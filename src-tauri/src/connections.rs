// Connection tracking + per-connection filter.
//
// latamRO allows multi-cliente, so a single capture session can observe
// several Ragnarok client ↔ map-server flows interleaved. We canonicalize
// each observed 4-tuple (collapsing the two directions into one) and let
// the user pick which one to "follow" — packets from non-followed
// connections are dropped before dispatch.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Deserialize, Clone, Hash, PartialEq, Eq, Debug)]
pub struct FourTuple {
    pub client_ip: String,
    pub client_port: u16,
    pub server_ip: String,
    pub server_port: u16,
}

#[derive(Serialize, Clone, Debug)]
pub struct ConnectionInfo {
    pub four_tuple: FourTuple,
    pub first_seen_unix_ms: u64,
}

#[derive(Default)]
pub struct ConnectionsState {
    pub observed: Arc<Mutex<HashMap<FourTuple, u64>>>,
    pub selected: Arc<Mutex<Option<FourTuple>>>,
}

impl ConnectionsState {
    pub fn reset(&self) {
        self.observed.lock().unwrap().clear();
        *self.selected.lock().unwrap() = None;
    }

    pub fn observe(&self, ft: &FourTuple) -> bool {
        let mut map = self.observed.lock().unwrap();
        if map.contains_key(ft) {
            return false;
        }
        map.insert(ft.clone(), unix_ms());
        true
    }

    pub fn snapshot(&self) -> Vec<ConnectionInfo> {
        let map = self.observed.lock().unwrap();
        let mut out: Vec<ConnectionInfo> = map
            .iter()
            .map(|(ft, &ts)| ConnectionInfo {
                four_tuple: ft.clone(),
                first_seen_unix_ms: ts,
            })
            .collect();
        out.sort_by_key(|c| c.first_seen_unix_ms);
        out
    }

    /// Returns true when the tuple should be dispatched. With no selection,
    /// every observed tuple is followed.
    pub fn is_selected(&self, ft: &FourTuple) -> bool {
        match self.selected.lock().unwrap().as_ref() {
            Some(sel) => sel == ft,
            None => true,
        }
    }
}

pub fn emit_connection_detected(app: &AppHandle, ft: &FourTuple) {
    let _ = app.emit(
        "connection-detected",
        ConnectionInfo {
            four_tuple: ft.clone(),
            first_seen_unix_ms: unix_ms(),
        },
    );
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_connections(state: State<ConnectionsState>) -> Vec<ConnectionInfo> {
    state.snapshot()
}

#[tauri::command]
pub fn select_connection(
    four_tuple: FourTuple,
    state: State<ConnectionsState>,
) -> Result<(), String> {
    *state.selected.lock().unwrap() = Some(four_tuple);
    Ok(())
}

#[tauri::command]
pub fn clear_connection_selection(state: State<ConnectionsState>) -> Result<(), String> {
    *state.selected.lock().unwrap() = None;
    Ok(())
}
