// Inventory dump on char-select.
//
//   0x0B08  ZC_INVENTORY_START                 u16 op, u16 len, u8 invType, name(Z*)
//   0x0B09  ZC_INVENTORY_ITEMLIST_NORMAL_V6    u16 op, u16 len, u8 invType, N × 34-byte records
//   0x0B0B  ZC_INVENTORY_END                   4 bytes: u16 op, u8 invType, u8 flag
//
// On latamRO the V6 stream often spans multiple TCP segments and the
// dispatcher BAILs when the equip list (0x0B0A) doesn't fit in its
// current segment — taking the trailing main-bag END with it. The
// only 0x0B0B that survives is the follow-up for the CART container
// (invType=1), useless for the main bag. So we don't wait for END:
// each 0x0B09 NORMAL of invType=0 commits live and emits a snapshot
// event for the frontend to re-query.
//
// We still need 0x0B08 — it tells us the server is restarting the
// dump (e.g., player went to char-select and came back), and we have
// to clear the live slots before the new NORMALs arrive so a smaller
// new inventory doesn't visually merge with the previous character's
// items.
//
// We skip equip records (0x0B0A / 0x0B39) — food items are never
// equipment. Adding them later is straightforward.
//
// Packet layouts come from ragmarket's `src/services/inventoryParser.ts`.
// NORMALITEM_INFO record (34 bytes):
//
//   off  0    u16  index           (raw wire form, server `slot + 2`)
//   off  2    u32  itemID
//   off  6    u8   type            (ignored — food chip only sums by id)
//   off  7    i16  count           (stackable amount; ≤ 0 = invalid → skip)
//   off  9    u32  wearState       (0 for stackable usables)
//   off 13    4×u32 cards          (ignored for stackable usables)
//   off 29    i32  hireExpireDate
//   off 33    u8   flag            (bit0 = identified, ignored)

use crate::connections::{ConnectionsState, FourTuple};
use crate::dispatch::Direction;
use crate::inventory_store::{InventorySlot, InventoryStore};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const OPCODE_START: u16 = 0x0B08;
pub const OPCODE_NORMAL: u16 = 0x0B09;

const INV_TYPE_MAIN: u8 = 0;
const NORMAL_RECORD_SIZE: usize = 34;

#[derive(Serialize, Clone, Debug)]
pub struct InventorySnapshot {
    pub pid: Option<u32>,
}

pub fn decode_start(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    // [op(2) len(2) invType(1) name(Z*)] — name is up to NAME_LENGTH=24
    // and may be empty for the player's own bag. We don't need it.
    if payload.len() < 5 || payload[4] != INV_TYPE_MAIN {
        return;
    }
    let Some(pid) = app.state::<ConnectionsState>().pid_for(ft) else {
        return;
    };
    app.state::<InventoryStore>().begin_snapshot(pid);
}

pub fn decode_normal(app: &AppHandle, ft: &FourTuple, _dir: Direction, payload: &[u8]) {
    if payload.len() < 5 || payload[4] != INV_TYPE_MAIN {
        return;
    }
    let len = u16::from_le_bytes([payload[2], payload[3]]) as usize;
    if len > payload.len() {
        return;
    }
    let body = &payload[5..len];
    if body.len() % NORMAL_RECORD_SIZE != 0 {
        // Length / record-size mismatch — a private server with a
        // tweaked record size, or a spurious opcode match on random
        // payload bytes. Either way we'd corrupt downstream parsing
        // by trying to read past the end of a record.
        return;
    }
    let Some(pid) = app.state::<ConnectionsState>().pid_for(ft) else {
        return;
    };
    let mut items = Vec::with_capacity(body.len() / NORMAL_RECORD_SIZE);
    for chunk in body.chunks_exact(NORMAL_RECORD_SIZE) {
        let index = u16::from_le_bytes([chunk[0], chunk[1]]);
        let item_id = u32::from_le_bytes([chunk[2], chunk[3], chunk[4], chunk[5]]);
        let amount = i16::from_le_bytes([chunk[7], chunk[8]]);
        if amount <= 0 || item_id == 0 {
            continue; // empty slot or junk record
        }
        items.push((
            index,
            InventorySlot {
                item_id,
                amount: amount as u32,
            },
        ));
    }
    app.state::<InventoryStore>().extend_snapshot(pid, items);
    // Emit per NORMAL so the frontend re-queries after each chunk —
    // the dump's last chunk has no special marker we can use.
    let _ = app.emit(
        "packet:inventory-snapshot",
        InventorySnapshot { pid: Some(pid) },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_record_parses_stackable_amount() {
        // Slot 5 contains 12× Apple_Juice (item 531).
        let mut rec = [0u8; NORMAL_RECORD_SIZE];
        rec[0..2].copy_from_slice(&5u16.to_le_bytes());
        rec[2..6].copy_from_slice(&531u32.to_le_bytes());
        rec[6] = 0; // type ignored
        rec[7..9].copy_from_slice(&12i16.to_le_bytes());
        let index = u16::from_le_bytes([rec[0], rec[1]]);
        let item_id = u32::from_le_bytes([rec[2], rec[3], rec[4], rec[5]]);
        let amount = i16::from_le_bytes([rec[7], rec[8]]);
        assert_eq!(index, 5);
        assert_eq!(item_id, 531);
        assert_eq!(amount, 12);
    }

    #[test]
    fn normal_packet_skips_empty_slots_and_junk() {
        // Two records back-to-back: one valid (id 531 × 5), one with
        // item_id=0 (an empty slot the server padded into the list).
        let mut body = [0u8; NORMAL_RECORD_SIZE * 2];
        // record 0: valid
        body[0..2].copy_from_slice(&3u16.to_le_bytes());
        body[2..6].copy_from_slice(&531u32.to_le_bytes());
        body[7..9].copy_from_slice(&5i16.to_le_bytes());
        // record 1: junk (all zeros) — should be skipped
        let mut parsed = 0;
        for chunk in body.chunks_exact(NORMAL_RECORD_SIZE) {
            let item_id = u32::from_le_bytes([chunk[2], chunk[3], chunk[4], chunk[5]]);
            let amount = i16::from_le_bytes([chunk[7], chunk[8]]);
            if amount > 0 && item_id != 0 {
                parsed += 1;
            }
        }
        assert_eq!(parsed, 1);
    }
}
