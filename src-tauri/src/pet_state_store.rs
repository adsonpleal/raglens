// Latest-known pet snapshot per owning PID. The decoder pushes every
// observed `packet:pet-state` update through here so that an overlay
// mounting after the snapshot already arrived (raglens started
// mid-game, addon toggled off→on, user switched selected client) can
// hydrate immediately via the `get_pet_state` command — instead of
// waiting on the next 0x01a4 tick (~30-60s away) for the first read.
//
// The cache is dropped per-PID on `client-reset` (back to char
// select / quit) so the next character can't read stale state from
// the previous one.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

#[derive(Default, Serialize, Clone, Debug)]
pub struct CachedPetState {
    pub hunger: Option<u16>,
    pub intimacy: Option<u16>,
    pub level: Option<u16>,
    pub name: Option<String>,
    /// Pet sprite id (rAthena pet_db key). Sticks around per-PID so
    /// the overlay can re-key its observed-hunger-rate cache when
    /// the current pet changes.
    #[serde(rename = "petType")]
    pub pet_type: Option<u16>,
}

#[derive(Default)]
pub struct PetStateStore {
    snapshots: Mutex<HashMap<u32, CachedPetState>>,
}

impl PetStateStore {
    /// Merge a partial update into the cached snapshot for the given
    /// PID. Each opcode delivers a different subset of fields (0x01a2
    /// = all four; 0x01a4 = one of hunger/intimacy at a time), so we
    /// last-write-wins each field rather than replacing wholesale.
    pub fn update(
        &self,
        pid: u32,
        hunger: Option<u16>,
        intimacy: Option<u16>,
        level: Option<u16>,
        name: Option<String>,
        pet_type: Option<u16>,
    ) {
        let mut map = self.snapshots.lock().unwrap();
        let snap = map.entry(pid).or_default();
        if hunger.is_some() {
            snap.hunger = hunger;
        }
        if intimacy.is_some() {
            snap.intimacy = intimacy;
        }
        if level.is_some() {
            snap.level = level;
        }
        if name.is_some() {
            snap.name = name;
        }
        if pet_type.is_some() {
            snap.pet_type = pet_type;
        }
    }

    pub fn get(&self, pid: u32) -> Option<CachedPetState> {
        self.snapshots.lock().unwrap().get(&pid).cloned()
    }

    pub fn clear(&self, pid: u32) {
        self.snapshots.lock().unwrap().remove(&pid);
    }
}

#[tauri::command]
pub fn get_pet_state(
    pid: u32,
    store: State<PetStateStore>,
) -> Option<CachedPetState> {
    store.get(pid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_merges_partial_fields() {
        let store = PetStateStore::default();
        store.update(
            15916,
            Some(76),
            Some(1000),
            Some(1),
            Some("Bolota".into()),
            Some(0x095e),
        );
        let snap = store.get(15916).unwrap();
        assert_eq!(snap.hunger, Some(76));
        assert_eq!(snap.intimacy, Some(1000));
        assert_eq!(snap.level, Some(1));
        assert_eq!(snap.name.as_deref(), Some("Bolota"));
        assert_eq!(snap.pet_type, Some(0x095e));

        // 0x01a4 tick delivers hunger only — others preserved.
        store.update(15916, Some(75), None, None, None, None);
        let snap = store.get(15916).unwrap();
        assert_eq!(snap.hunger, Some(75));
        assert_eq!(snap.intimacy, Some(1000));
        assert_eq!(snap.name.as_deref(), Some("Bolota"));
        assert_eq!(snap.pet_type, Some(0x095e));
    }

    #[test]
    fn clear_drops_only_target_pid() {
        let store = PetStateStore::default();
        store.update(1, Some(50), None, None, None, None);
        store.update(2, Some(80), None, None, None, None);
        store.clear(1);
        assert!(store.get(1).is_none());
        assert!(store.get(2).is_some());
    }
}
