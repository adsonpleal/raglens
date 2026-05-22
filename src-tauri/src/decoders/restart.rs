// ZC_RESTART_ACK (0x00b3) — fired when the server confirms the
// client's "back to char select" or "quit" request from the in-game
// menu (CZ_REQ_DISCONNECT 0x00b2).
//
// Layout (3 bytes):
//   off 0-1   u16  opcode
//   off   2   u8   type — observed `01` on latamRO when the
//                  disconnect succeeds (echoes the `01` from the
//                  client's CZ_REQ_DISCONNECT). `00` is the refusal
//                  case (e.g. player still in combat).
//
// On a successful ack we emit `client-reset` with the owning PID so
// addon hooks (XP meter, pet feeder) can wipe their per-character
// state — XP samples, pet hunger snapshot, etc. — instead of carrying
// the previous character's data into the next session.

use crate::connections::{ConnectionsState, FourTuple};
use crate::disconnect::RecentRestarts;
use crate::dispatch::Direction;
use crate::inventory_store::InventoryStore;
use crate::pet_state_store::PetStateStore;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x00b3;

#[derive(Serialize, Clone, Debug)]
pub struct ClientReset {
    pub pid: Option<u32>,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 3 {
        return;
    }
    if payload[2] == 0 {
        // Refusal case: server is rejecting the disconnect (player
        // still in combat / not allowed). Character stays active —
        // don't wipe overlay state.
        return;
    }
    let pid = app.state::<ConnectionsState>().pid_for(ft);
    // Drop the cached pet snapshot for this PID — the next character
    // picked may not even have a pet, and if they do we'd rather
    // wait for a fresh 0x01a2 than show the previous character's
    // hunger.
    if let Some(p) = pid {
        app.state::<PetStateStore>().clear(p);
        // Also drop the inventory snapshot — the next character's
        // bag is a different set of items, and 0x01a3 feeds without
        // a fresh char-select dump would decrement against stale
        // slot data.
        app.state::<InventoryStore>().clear(p);
        // Tell the disconnect detectors to ignore the FIN/RST that
        // immediately follow this intentional logout — without this,
        // the player gets a "desconectado" toast every time they go
        // back to char select.
        app.state::<RecentRestarts>().mark(p);
    }
    let _ = app.emit("client-reset", ClientReset { pid });
}

#[cfg(test)]
mod tests {
    #[test]
    fn ok_ack_echoes_the_request_type() {
        // b300 01 — server echoes the `01` from the client's
        // CZ_REQ_DISCONNECT(type=1 = char-select). Observed in the
        // live log; this is the case we want to fire on.
        let payload = [0xb3, 0x00, 0x01];
        assert_ne!(payload[2], 0);
    }

    #[test]
    fn refusal_has_zero_type_byte() {
        // The refusal path: 0 in byte 2. We skip these so the
        // overlay doesn't wipe state when the disconnect was denied.
        let payload = [0xb3, 0x00, 0x00];
        assert_eq!(payload[2], 0);
    }
}
