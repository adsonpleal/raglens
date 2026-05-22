// Per-PID inventory cache, kept in sync with the live capture stream.
//
// The pet-feeder overlay needs to show how many units of the active
// pet's food item are in the player's inventory, and that number has
// to react to feeds (item disappears) and pickups/buys (item appears).
//
// Hydration: the `decoders::inventory` decoder seeds this from the
// char-select dump. The V6 stream is `0x0B08 START / 0x0B09 NORMAL /
// 0x0B0B END` per container, but on latamRO the main bag's END is
// regularly lost: the dispatcher walks one TCP segment at a time and
// BAILs when the equip list (0x0B0A) spans the boundary, taking the
// trailing END with it. The only 0x0B0B that reaches us is for the
// follow-up CART container (invType=1) — useless for the main bag.
//
// So we commit each 0x0B09 directly into the live snapshot instead of
// buffering until END. START is still meaningful — it tells us the
// server is restarting the dump, so we clear what we had. The 0x0B09
// records then accumulate live; the food chip re-queries on every
// snapshot event so it sees each chunk land.
//
// We track slots — not aggregated counts — because the 0x01a3 feed
// wire only tells us the food id (no slot). We pick a slot of that
// item and decrement it; that lets `consume_one_of` return the new
// total without re-walking the wire.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

#[derive(Default, Serialize, Clone, Debug)]
pub struct InventorySlot {
    pub item_id: u32,
    pub amount: u32,
}

#[derive(Default)]
pub struct InventoryStore {
    /// PID → slot index → slot. Slot index is the wire form (server
    /// `slot + 2`); we keep it raw since we don't expose slots to
    /// the UI and never look one up by in-game position.
    slots: Mutex<HashMap<u32, HashMap<u16, InventorySlot>>>,
}

impl InventoryStore {
    /// Clear the live snapshot for `pid`. Called when 0x0B08 START
    /// arrives — the server is about to re-emit the inventory, and
    /// stale slots from a previous dump (or a botched mid-dump that
    /// never finished) must not linger past the boundary.
    pub fn begin_snapshot(&self, pid: u32) {
        let mut map = self.slots.lock().unwrap();
        map.insert(pid, HashMap::new());
    }

    /// Add items to the live snapshot. Called on each 0x0B09 NORMAL
    /// packet — commits immediately rather than waiting for END
    /// (which often never reaches us on latamRO). Insert overwrites
    /// any prior slot at the same index; the server re-sends the
    /// full state per dump, so a slot's contents are authoritative
    /// from the latest NORMAL that mentioned it.
    pub fn extend_snapshot(&self, pid: u32, items: Vec<(u16, InventorySlot)>) {
        let mut map = self.slots.lock().unwrap();
        let entry = map.entry(pid).or_default();
        for (slot, item) in items {
            entry.insert(slot, item);
        }
    }

    /// Consume one unit of `item_id` from whichever slot has it.
    /// Called from the pet feed-ack decoder, which knows the item id
    /// but not the slot (the 0x01a3 wire format only carries the id).
    /// Returns the new total count after the consumption, or `None`
    /// if we have no inventory cached for this PID (overlay started
    /// mid-session and missed the char-select dump).
    pub fn consume_one_of(&self, pid: u32, item_id: u32) -> Option<u32> {
        let mut map = self.slots.lock().unwrap();
        let pid_slots = map.get_mut(&pid)?;
        // Find any slot of this item with a positive amount.
        let consumed_slot = pid_slots
            .iter()
            .find(|(_, s)| s.item_id == item_id && s.amount > 0)
            .map(|(idx, _)| *idx);
        let slot_idx = consumed_slot?;
        let entry = pid_slots.get_mut(&slot_idx).unwrap();
        if entry.amount > 1 {
            entry.amount -= 1;
        } else {
            pid_slots.remove(&slot_idx);
        }
        let total: u32 = pid_slots
            .values()
            .filter(|s| s.item_id == item_id)
            .map(|s| s.amount)
            .sum();
        Some(total)
    }

    /// Total quantity of a given item across every slot. The food
    /// chip shows this for the active pet's designated food id.
    pub fn count_of(&self, pid: u32, item_id: u32) -> u32 {
        let map = self.slots.lock().unwrap();
        let Some(pid_slots) = map.get(&pid) else {
            return 0;
        };
        pid_slots
            .values()
            .filter(|s| s.item_id == item_id)
            .map(|s| s.amount)
            .sum()
    }

    pub fn clear(&self, pid: u32) {
        self.slots.lock().unwrap().remove(&pid);
    }
}

/// Tauri command: return the current count of `item_id` for `pid`.
/// Returns 0 when the PID has no cached inventory (overlay mounted
/// before the char-select dump landed) — the frontend treats this
/// the same as "unknown" and re-queries on the next snapshot event.
#[tauri::command]
pub fn get_food_count(pid: u32, item_id: u32, store: State<InventoryStore>) -> u32 {
    store.count_of(pid, item_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slot(item_id: u32, amount: u32) -> InventorySlot {
        InventorySlot { item_id, amount }
    }

    #[test]
    fn begin_then_extend_replaces_previous_snapshot() {
        let store = InventoryStore::default();
        store.begin_snapshot(1);
        store.extend_snapshot(1, vec![(0, slot(531, 5)), (1, slot(537, 3))]);
        assert_eq!(store.count_of(1, 531), 5);

        // Char-select round trip — START clears, then new NORMALs add.
        store.begin_snapshot(1);
        store.extend_snapshot(1, vec![(0, slot(531, 12))]);
        assert_eq!(store.count_of(1, 531), 12);
        assert_eq!(store.count_of(1, 537), 0);
    }

    #[test]
    fn extend_across_multiple_normals_accumulates() {
        // A dump that spans two 0x0B09 packets — both their items
        // must end up in the live snapshot after the second commit.
        let store = InventoryStore::default();
        store.begin_snapshot(1);
        store.extend_snapshot(1, vec![(0, slot(531, 5))]);
        store.extend_snapshot(1, vec![(1, slot(537, 3))]);
        assert_eq!(store.count_of(1, 531), 5);
        assert_eq!(store.count_of(1, 537), 3);
    }

    #[test]
    fn extend_without_begin_still_works() {
        // BAIL-recovery edge case: a 0x0B09 dispatches without our
        // 0x0B08 having fired first. We add the items anyway — the
        // alternative (silently dropping) is strictly worse for the
        // food chip, and a stray match in random bytes still has to
        // pass record-level validation in the decoder.
        let store = InventoryStore::default();
        store.extend_snapshot(1, vec![(0, slot(531, 5))]);
        assert_eq!(store.count_of(1, 531), 5);
    }

    #[test]
    fn count_sums_across_slots() {
        let store = InventoryStore::default();
        store.extend_snapshot(
            1,
            vec![(0, slot(531, 5)), (3, slot(531, 7)), (4, slot(537, 9))],
        );
        assert_eq!(store.count_of(1, 531), 12);
        assert_eq!(store.count_of(1, 537), 9);
    }

    #[test]
    fn consume_one_of_decrements_and_returns_total() {
        let store = InventoryStore::default();
        store.extend_snapshot(1, vec![(0, slot(531, 5)), (3, slot(531, 2))]);
        assert_eq!(store.consume_one_of(1, 531), Some(6));
        assert_eq!(store.count_of(1, 531), 6);
    }

    #[test]
    fn consume_one_of_drops_slot_at_zero() {
        let store = InventoryStore::default();
        store.extend_snapshot(1, vec![(0, slot(531, 1))]);
        assert_eq!(store.consume_one_of(1, 531), Some(0));
        assert_eq!(store.count_of(1, 531), 0);
    }

    #[test]
    fn consume_one_of_unknown_pid_is_none() {
        let store = InventoryStore::default();
        // No snapshot for this PID — caller can't tell if "0" means
        // "out of food" vs "we don't know"; we surface that with None.
        assert_eq!(store.consume_one_of(99, 531), None);
    }

    #[test]
    fn consume_one_of_missing_item_is_none() {
        let store = InventoryStore::default();
        store.extend_snapshot(1, vec![(0, slot(537, 5))]);
        // PID is known but item 531 isn't in the snapshot.
        assert_eq!(store.consume_one_of(1, 531), None);
    }

    #[test]
    fn clear_only_target_pid() {
        let store = InventoryStore::default();
        store.extend_snapshot(1, vec![(0, slot(531, 5))]);
        store.extend_snapshot(2, vec![(0, slot(531, 9))]);
        store.clear(1);
        assert_eq!(store.count_of(1, 531), 0);
        assert_eq!(store.count_of(2, 531), 9);
    }
}
