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
        // The PID was already resolved (and cached) when this
        // connection was first observed — pulling it from the
        // ConnectionsState avoids a second GetExtendedTcpTable walk
        // per ZC_AID, and is also more reliable since the live TCP
        // table can already be missing a short-lived connection by
        // the time we look.
        emit_client_updated(
            app,
            ClientUpdate {
                pid: state.pid_for(ft),
                aid: Some(aid),
                name: None,
            },
        );
    }
}
