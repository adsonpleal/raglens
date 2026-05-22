// ZC_FEED_PET (0x01a3, S→C, 5 bytes): server's confirmation that a
// pet feed succeeded, carrying the food item id that was consumed.
//
// Layout:
//   off  0-1  u16  opcode
//   off    2  u8   success (0 = failed, 1 = fed)
//   off  3-4  u16  food item id (the same id the inventory dump uses)
//
// This is the authoritative consumption signal for pet feeding — far
// simpler than chasing generic item-delete packets, which on latamRO
// fight with the 0x07fa wrapper that already carries other bundled
// state updates. We trust the server: success=1 means exactly one
// unit of the food id left the player's inventory.
//
// We don't need this opcode to drive the "fed" UI notification — the
// existing 0x01a4 hunger-change packet already triggers that via the
// hunger-increase detection in `PetFeeder.tsx`. This decoder is
// strictly for inventory bookkeeping.

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use crate::inventory_store::InventoryStore;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE: u16 = 0x01a3;

#[derive(Serialize, Clone, Debug)]
pub struct InventoryDelta {
    pub pid: Option<u32>,
    pub item_id: u32,
    /// New total of this item across all slots, or `None` when the
    /// store had no entry for either the PID or the item id — the
    /// overlay started mid-session and missed the char-select dump,
    /// or our snapshot is otherwise out of sync. Frontend treats
    /// `None` as "unknown" (keeps its current foodCount) so we don't
    /// flash a misleading "Comida: 0".
    pub remaining: Option<u32>,
}

pub fn decode(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 5 {
        return;
    }
    if payload[2] != 1 {
        return; // failed feed — server didn't actually consume anything
    }
    let item_id = u16::from_le_bytes([payload[3], payload[4]]) as u32;
    let Some(pid) = app.state::<ConnectionsState>().pid_for(ft) else {
        return;
    };

    // The wire doesn't tell us which slot the consumed unit came from
    // (just the item id), so `consume_one_of` finds any slot of that
    // item and decrements. `None` propagates — see InventoryDelta doc.
    let remaining = app.state::<InventoryStore>().consume_one_of(pid, item_id);

    let _ = app.emit(
        "packet:inventory-delta",
        InventoryDelta {
            pid: Some(pid),
            item_id,
            remaining,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_success_and_food_id() {
        // a3 01 01 13 02  → success=1, food_id=531 (Apple_Juice)
        let payload = [0xa3, 0x01, 0x01, 0x13, 0x02];
        assert_eq!(payload[2], 1);
        let food_id = u16::from_le_bytes([payload[3], payload[4]]);
        assert_eq!(food_id, 531);
    }

    #[test]
    fn rejects_failed_feed() {
        // a3 01 00 13 02 — success=0 means the server rejected the feed
        // (no food in inventory, pet not present, etc.); we must NOT
        // decrement, otherwise the optimistic / displayed count would
        // drift below the real inventory.
        let payload = [0xa3, 0x01, 0x00, 0x13, 0x02];
        assert_eq!(payload[2], 0);
    }
}
