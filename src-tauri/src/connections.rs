// Tracks observed TCP 4-tuples and aggregates them into "clients"
// keyed by owning PID.
//
// latamRO multi-cliente means several Ragexe.exe processes can be
// running at once; each process opens a new TCP connection to the
// map-server every time the player changes maps. So 4-tuples die
// quickly, but the owning PID is stable per character session and
// gives us a usable filter key.
//
// Identity discovery layers, all optional, all best-effort:
//   1. PID            → resolved at observe() via Win32 TCP table
//                       (process.rs). Available immediately.
//   2. AID            → bound when the 0x0283 ZC_AID packet fires on
//                       a connection of that PID.
//   3. Character name → bound when 0x0a30 ZC_ACK_REQNAME_TITLE fires
//                       with a matching AID. AID→name is global since
//                       one AID always belongs to one character.
//
// The UI shows whichever of those three is most specific:
//     "Tucano · AID 1031076 · PID 15916"
//   → "AID 1031076 · PID 15916"
//   → "PID 15916 · Ragexe.exe · aberto às 11:31"

use crate::process;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Deserialize, Clone, Hash, PartialEq, Eq, Debug)]
pub struct FourTuple {
    pub client_ip: String,
    pub client_port: u16,
    pub server_ip: String,
    pub server_port: u16,
}

#[derive(Clone, Debug)]
struct ConnectionMeta {
    pid: Option<u32>,
    aid: Option<u32>,
    first_seen_unix_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClientInfo {
    pub pid: Option<u32>,
    pub aid: Option<u32>,
    pub name: Option<String>,
    pub process_name: Option<String>,
    pub process_creation_unix_ms: Option<u64>,
    pub connection_count: usize,
    pub first_seen_unix_ms: u64,
}

#[derive(Default)]
pub struct ConnectionsState {
    connections: Mutex<HashMap<FourTuple, ConnectionMeta>>,
    /// AID → character name. Global because one AID owns one character.
    names: Mutex<HashMap<u32, String>>,
    /// PID currently being followed. None = follow everything.
    selected_pid: Mutex<Option<u32>>,
}

impl ConnectionsState {
    pub fn reset(&self) {
        self.connections.lock().unwrap().clear();
        self.names.lock().unwrap().clear();
        *self.selected_pid.lock().unwrap() = None;
    }

    /// Record a 4-tuple if it's new. Resolves the owning PID once,
    /// at observe time. Returns the meta only for new tuples — callers
    /// use this to gate the `client-detected` event so we don't spam.
    pub fn observe(&self, ft: &FourTuple) -> Option<NewConnection> {
        // Quick pre-check under the lock — bail without spending a
        // syscall on a tuple we've already seen.
        {
            let map = self.connections.lock().unwrap();
            if map.contains_key(ft) {
                return None;
            }
        }

        // PID lookup is a Win32 GetExtendedTcpTable round-trip; doing
        // it while holding the connections mutex would block every
        // other in-flight packet for the same client behind one
        // possibly-slow syscall. Resolve outside the lock.
        let pid = parse_ipv4(&ft.client_ip)
            .and_then(|ip| process::pid_for_local_endpoint(ip, ft.client_port));

        // Re-acquire the lock to insert. Another thread may have
        // beaten us to it for the same FT, in which case we treat
        // this as "not new" — the first observer wins the
        // client-detected event.
        let mut map = self.connections.lock().unwrap();
        if map.contains_key(ft) {
            return None;
        }
        map.insert(
            ft.clone(),
            ConnectionMeta {
                pid,
                aid: None,
                first_seen_unix_ms: unix_ms(),
            },
        );
        Some(NewConnection {
            four_tuple: ft.clone(),
            pid,
        })
    }

    /// Returns the PID resolved for this FT at observe-time, if any.
    /// Decoders use this so the per-PID overlays can filter by the
    /// owning client without re-walking the TCP table for every packet.
    pub fn pid_for(&self, ft: &FourTuple) -> Option<u32> {
        self.connections.lock().unwrap().get(ft).and_then(|m| m.pid)
    }

    /// Returns the AID this FT belongs to, if 0x0283 has been decoded.
    pub fn aid_for(&self, ft: &FourTuple) -> Option<u32> {
        self.connections.lock().unwrap().get(ft).and_then(|m| m.aid)
    }

    /// Bind an AID to the connection's metadata. Returns true if this
    /// is the first time we see an AID for this connection (so the
    /// dispatcher can fire a `client-updated` event).
    pub fn bind_aid(&self, ft: &FourTuple, aid: u32) -> bool {
        let mut map = self.connections.lock().unwrap();
        if let Some(meta) = map.get_mut(ft) {
            if meta.aid != Some(aid) {
                meta.aid = Some(aid);
                return true;
            }
        }
        false
    }

    /// Cache an AID→name mapping. Returns true if the mapping changed.
    pub fn bind_name(&self, aid: u32, name: String) -> bool {
        let mut names = self.names.lock().unwrap();
        if names.get(&aid) == Some(&name) {
            return false;
        }
        names.insert(aid, name);
        true
    }

    /// Filter predicate used by dispatch. With no selection, every
    /// observed tuple passes. With a selected PID, only tuples whose
    /// owning PID matches.
    pub fn is_followed(&self, ft: &FourTuple) -> bool {
        let selected = *self.selected_pid.lock().unwrap();
        let Some(want) = selected else { return true };
        let map = self.connections.lock().unwrap();
        matches!(map.get(ft).and_then(|m| m.pid), Some(pid) if pid == want)
    }

    /// Aggregate the connection table into one entry per owning PID.
    /// Connections with no resolvable PID land under a single
    /// "unknown" bucket (pid = None).
    pub fn list_clients(&self) -> Vec<ClientInfo> {
        let map = self.connections.lock().unwrap();
        let names = self.names.lock().unwrap();
        let mut by_pid: HashMap<Option<u32>, ClientInfo> = HashMap::new();
        for meta in map.values() {
            let entry = by_pid.entry(meta.pid).or_insert(ClientInfo {
                pid: meta.pid,
                aid: None,
                name: None,
                process_name: None,
                process_creation_unix_ms: None,
                connection_count: 0,
                first_seen_unix_ms: meta.first_seen_unix_ms,
            });
            entry.connection_count += 1;
            if entry.first_seen_unix_ms > meta.first_seen_unix_ms {
                entry.first_seen_unix_ms = meta.first_seen_unix_ms;
            }
            if entry.aid.is_none() {
                entry.aid = meta.aid;
            }
        }
        // Drop the locks before reaching out to OpenProcess.
        drop(map);
        let names_clone = names.clone();
        drop(names);

        let mut out: Vec<ClientInfo> = by_pid.into_values().collect();
        for c in &mut out {
            if c.name.is_none() {
                if let Some(aid) = c.aid {
                    c.name = names_clone.get(&aid).cloned();
                }
            }
            if let Some(pid) = c.pid {
                let info = process::process_info(pid);
                c.process_name = info.name;
                c.process_creation_unix_ms = info.creation_unix_ms;
            }
        }
        out.sort_by_key(|c| c.first_seen_unix_ms);
        out
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct NewConnection {
    pub four_tuple: FourTuple,
    pub pid: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClientUpdate {
    pub pid: Option<u32>,
    pub aid: Option<u32>,
    pub name: Option<String>,
}

pub fn emit_client_detected(app: &AppHandle, new: NewConnection) {
    let _ = app.emit("client-detected", new);
}

pub fn emit_client_updated(app: &AppHandle, update: ClientUpdate) {
    let _ = app.emit("client-updated", update);
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_ipv4(s: &str) -> Option<[u8; 4]> {
    let mut parts = s.split('.');
    let a = parts.next()?.parse().ok()?;
    let b = parts.next()?.parse().ok()?;
    let c = parts.next()?.parse().ok()?;
    let d = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some([a, b, c, d])
}

// ---- Tauri commands ----

#[derive(Serialize, Clone, Debug)]
pub struct SelectedClient {
    pub pid: Option<u32>,
}

#[tauri::command]
pub fn list_clients(state: State<ConnectionsState>) -> Vec<ClientInfo> {
    state.list_clients()
}

#[tauri::command]
pub fn get_selected_pid(state: State<ConnectionsState>) -> Option<u32> {
    *state.selected_pid.lock().unwrap()
}

#[tauri::command]
pub fn select_client(
    app: AppHandle,
    pid: u32,
    state: State<ConnectionsState>,
) -> Result<(), String> {
    *state.selected_pid.lock().unwrap() = Some(pid);
    let _ = app.emit("selected-client-changed", SelectedClient { pid: Some(pid) });
    Ok(())
}

#[tauri::command]
pub fn clear_client_selection(
    app: AppHandle,
    state: State<ConnectionsState>,
) -> Result<(), String> {
    *state.selected_pid.lock().unwrap() = None;
    let _ = app.emit("selected-client-changed", SelectedClient { pid: None });
    Ok(())
}
