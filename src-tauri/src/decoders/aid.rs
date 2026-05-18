// ZC_AID — sent once per map-server connection right after zone-in.
// Tells the client which account this connection belongs to. We use
// it to attribute the connection's owning PID to an AID, so the
// client picker can label rows by character once the name decoder
// (0x0a30) fires too.
//
// Layout: 6 bytes
//   off 0-1  u16  opcode (0x0283)
//   off 2-5  u32  account id (little-endian)

use crate::connections::{emit_client_updated, ClientUpdate, ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use tauri::{AppHandle, Manager};

pub const OPCODE: u16 = 0x0283;

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 6 {
        return;
    }
    let aid = u32::from_le_bytes([payload[2], payload[3], payload[4], payload[5]]);
    let state = app.state::<ConnectionsState>();
    if state.bind_aid(ft, aid) {
        // The connection's PID was resolved at observe() time; relay it
        // along so the frontend can update the matching client row.
        let pid = pid_for(&state, ft);
        emit_client_updated(
            app,
            ClientUpdate {
                pid,
                aid: Some(aid),
                name: None,
            },
        );
    }
}

fn pid_for(state: &ConnectionsState, ft: &FourTuple) -> Option<u32> {
    // list_clients aggregates connections, but for a single emit we
    // just need this 4-tuple's PID. Re-resolve from the live TCP table —
    // cheap, and avoids a method on ConnectionsState just for this.
    let bytes: [u8; 4] = {
        let mut parts = ft.client_ip.split('.');
        let a = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let b = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let c = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        let d = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        [a, b, c, d]
    };
    let _ = state; // silence unused warning when re-resolving via process module
    crate::process::pid_for_local_endpoint(bytes, ft.client_port)
}
