// Merges `packet:pet-state` updates into a single snapshot scoped to
// the overlay's bound PID. The dispatcher emits two flavors:
//   - 0x01a2 (full info, fired when the pet info window opens): all
//     fields populated, including the pet sprite id.
//   - 0x01a4 (state-change tick, fired on hunger/intimacy ticks and
//     after feeding): one of hunger/intimacy at a time.
// We just last-write-wins each field, so a tick that only updates
// hunger leaves the previously-snapshotted intimacy/level/name alone.
//
// We also learn the discrete tick model — `{intervalMs, dropPerTick}`
// — from successive decreasing hunger samples. The rAthena hungry
// timer fires every HungryDelay seconds and decrements hunger by a
// configurable amount (latamRO observed: 3 pts per 60s for pet 2398);
// modelling it as a continuous rate would underestimate countdowns
// because hunger sits at a value for the full interval then jumps,
// it doesn't drift smoothly across thresholds. Feeds (the value
// *increases*) don't update the model, and the *first natural decay
// tick after a feed* is also skipped because rAthena reschedules the
// hungry timer on feed and the first post-feed dt is irregular
// (~48s instead of 60s in one captured cycle). The model is persisted
// per pet sprite id because rAthena's `HungryDelay` and decrement
// vary by pet — re-keying on pet-type change avoids carrying a
// Poring's cadence into a Lunatic's countdown.

import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onClientReset,
  onInventoryDelta,
  onInventorySnapshot,
  onPetFedRequest,
  onPetState,
} from "../../lib/events";
import { getFoodCount, getPetState } from "../../lib/invoke";
import {
  getLearnedPetFoods,
  getPetHungerTicks,
  setLearnedPetFood,
  setPetHungerTick,
  type PetTickModel,
} from "../../lib/store";
import type { PetStateUpdate } from "../../lib/types";
import { HUNGER } from "./format";
import petFoodDbJson from "./pet_food_db.json";

// Bundled mapping from rathena pet_db.yml (pet sprite id → food id +
// name). Regenerated via `scripts/build-pet-food-db.mjs`; the JSON
// sits next to this file so Vite ships it inline at build time.
// `as Record<...>` is the canonical narrowing pattern for JSON imports
// under `resolveJsonModule`.
const PET_FOOD_DB = petFoodDbJson as Record<
  string,
  { food_item_id: number; food_name: string }
>;

/** Bundled rathena data first, then anything we've learned at
 *  runtime from observed 0x01a3 feeds (latamRO custom pets that
 *  rathena master doesn't ship). Bundled wins on collision — we
 *  trust the static table over a single observed feed in case the
 *  user accidentally fed a non-default item via dragging. */
function lookupFoodId(
  petType: number | null | undefined,
  learned: Record<string, number>,
): number | null {
  if (petType == null) return null;
  const key = String(petType);
  const bundled = PET_FOOD_DB[key];
  if (bundled) return bundled.food_item_id;
  return learned[key] ?? null;
}

// Default hunger bump applied when the player clicks "Alimentar" in
// the in-game menu, before the server's 0x01a4 lands. Most RO foods
// add ~20 — we slightly undershoot so we don't fake values above the
// true post-feed hunger. The real 0x01a4 will overwrite it anyway.
const OPTIMISTIC_FEED_BUMP = 20;

// Coalesce the burst of `packet:inventory-snapshot` emits that fires
// once per 0x0B09 NORMAL chunk during a multi-segment char-select
// dump. Without this, the frontend issues one `get_food_count` IPC
// per chunk and only the last result lands on screen — the others
// are wasted round trips. A short tail (~150 ms past the last event)
// is long enough for all NORMALs of a single dump to land first.
const SNAPSHOT_REFETCH_DEBOUNCE_MS = 150;

export type PetSnapshot = {
  hunger: number | null;
  intimacy: number | null;
  level: number | null;
  name: string | null;
  petType: number | null;
  /** Item id of the food the current pet eats, derived from petType
   *  via the bundled pet_food_db. `null` when petType is unknown OR
   *  the pet isn't in our table (latamRO custom pets). The chip
   *  renders "Comida: —" in that case. */
  foodItemId: number | null;
  /** Live total of `foodItemId` across the player's inventory slots,
   *  served by the backend `InventoryStore` and updated on inventory
   *  snapshot / delta events. `null` = we don't have an answer yet
   *  (no snapshot observed since session start, or foodItemId is
   *  null so we never asked). */
  foodCount: number | null;
  /** Wall-clock when we last received an authoritative hunger value
   *  from the server (or an optimistic feed bump). Intimacy ticks and
   *  full-info snapshots that don't carry a *new* hunger value do NOT
   *  advance this — otherwise the visible countdown would jump back up
   *  on every intimacy tick (we subtract elapsed-since-this from the
   *  prediction) and the model calc would see a shrunken dt the next
   *  time hunger does drop, mis-calibrating the tick interval. */
  lastHungerMs: number | null;
  /** Discrete tick model for the *current* pet type: server fires a
   *  hungry tick every `intervalMs`, decrementing by `dropPerTick`.
   *  Switches when petType changes (different pet active). */
  tickModel: PetTickModel | null;
  /** True while the current `hunger` is a client-side optimistic
   *  estimate (set by the feed-request handler) that hasn't yet been
   *  confirmed by the server's 0x01a4. The countdown shows
   *  "Calculando…" during this window so we don't display a timer
   *  that's based on an overshoot, and the model calc skips this
   *  transition so a stale guess can't corrupt the persisted model. */
  isOptimistic: boolean;
  /** Set when we observe a hunger *increase* (a feed — either our
   *  optimistic bump or any out-of-band feed like dragging food onto
   *  the pet). The first natural decay tick after this has irregular
   *  dt (rAthena reschedules the hungry timer on feed, so the first
   *  post-feed dt is shorter than the established `intervalMs`).
   *  We skip the model update on that one tick to keep the persisted
   *  model representative of the true steady-state cadence. */
  awaitingPostFedTick: boolean;
};

const EMPTY: PetSnapshot = {
  hunger: null,
  intimacy: null,
  level: null,
  name: null,
  petType: null,
  foodItemId: null,
  foodCount: null,
  lastHungerMs: null,
  tickModel: null,
  isOptimistic: false,
  awaitingPostFedTick: false,
};

export function usePetState(pid: number): PetSnapshot {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(EMPTY);
  // Refs (not state) so `merge()` and event callbacks can read the
  // freshest values without forcing re-subscription on every change.
  // Both kept in sync with the snapshot below.
  const learnedFoodsRef = useRef<Record<string, number>>({});
  const foodItemIdRef = useRef<number | null>(null);
  foodItemIdRef.current = snapshot.foodItemId;

  // Refetch `targetItemId`'s count and patch the snapshot. Guarded by
  // foodItemId equality so a stale callback can't overwrite a value
  // that's since changed (pet swap mid-flight).
  const refetchFoodCount = (targetItemId: number) => {
    void getFoodCount(pid, targetItemId)
      .then((n) => {
        setSnapshot((cur) =>
          cur.foodItemId === targetItemId ? { ...cur, foodCount: n } : cur,
        );
      })
      .catch((e) => console.warn("[pet] foodCount fetch failed:", e));
  };

  useEffect(() => {
    setSnapshot(EMPTY);
  }, [pid]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: UnlistenFn[] = [];

    // Hydrate from the backend cache before the first event arrives.
    // If the player entered the map before the overlay was up, the
    // 0x01a2 snapshot has already fired — but the backend has been
    // accumulating it. Pull it in so we don't sit on "Aguardando…"
    // for a full hunger tick. Once we know the pet type, look up its
    // saved tick model and food-id mapping.
    void (async () => {
      try {
        const [cached, ticks, learned] = await Promise.all([
          getPetState(pid),
          getPetHungerTicks(),
          getLearnedPetFoods(),
        ]);
        if (cancelled) return;
        learnedFoodsRef.current = learned;
        if (!cached) {
          // Even without a cached pet, patch any already-set petType
          // (from a racy 0x01a2) so the learned table starts driving
          // foodItemId immediately.
          setSnapshot((prev) => {
            if (prev.petType === null || prev.foodItemId !== null) return prev;
            return { ...prev, foodItemId: lookupFoodId(prev.petType, learned) };
          });
          return;
        }
        const modelFromDisk = cached.petType
          ? ticks[String(cached.petType)] ?? null
          : null;
        setSnapshot((prev) => {
          const petType = prev.petType ?? cached.petType;
          return {
            hunger: prev.hunger ?? cached.hunger,
            intimacy: prev.intimacy ?? cached.intimacy,
            level: prev.level ?? cached.level,
            name: prev.name ?? cached.name,
            petType,
            foodItemId: prev.foodItemId ?? lookupFoodId(petType, learned),
            foodCount: prev.foodCount,
            // If we have a cached hunger but no real tick yet, anchor
            // elapsed-time to "now" so the countdown ticks down from
            // hydration rather than jumping. The next real 0x01a4 will
            // overwrite this with the true server-tick timestamp.
            lastHungerMs:
              prev.lastHungerMs ??
              (cached.hunger !== null ? Date.now() : null),
            tickModel: prev.tickModel ?? validTick(modelFromDisk),
            isOptimistic: prev.isOptimistic,
            awaitingPostFedTick: prev.awaitingPostFedTick,
          };
        });
      } catch (e) {
        console.warn("[pet] hydrate failed:", e);
      }
    })();

    onPetState((update: PetStateUpdate) => {
      if (update.pid !== pid) return;
      setSnapshot((prev) => merge(prev, update, learnedFoodsRef.current));
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    // Wipe the snapshot when the player goes back to char select /
    // quits — the next character's pet state shouldn't inherit this
    // one's hunger / intimacy / name.
    onClientReset((evt) => {
      if (evt.pid !== pid) return;
      setSnapshot(EMPTY);
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    // Optimistic bump on feed click — the server's confirmation
    // (0x01a4 type=2) follows within a few seconds and overwrites
    // this with the authoritative value. Only applies once we have
    // a baseline hunger. We mark the snapshot optimistic so the
    // timer doesn't show a countdown based on a possibly-overshot
    // value, and arm `awaitingPostFedTick` so the next natural
    // decay tick (which has irregular dt — server reschedules the
    // hungry timer on feed) doesn't poison the saved tick model.
    onPetFedRequest((evt) => {
      if (evt.pid !== pid) return;
      setSnapshot((prev) => {
        if (prev.hunger === null) return prev;
        return {
          ...prev,
          hunger: Math.min(HUNGER.MAX, prev.hunger + OPTIMISTIC_FEED_BUMP),
          lastHungerMs: Date.now(),
          isOptimistic: true,
          awaitingPostFedTick: true,
        };
      });
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    // Char-select dump: latamRO's V6 stream fires one
    // packet:inventory-snapshot per 0x0B09 NORMAL chunk. Debounce so
    // the burst coalesces into a single getFoodCount round trip after
    // the dump settles.
    let snapshotTimer: number | null = null;
    onInventorySnapshot((evt) => {
      if (evt.pid !== pid) return;
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null;
        const targetItemId = foodItemIdRef.current;
        if (targetItemId !== null) refetchFoodCount(targetItemId);
      }, SNAPSHOT_REFETCH_DEBOUNCE_MS);
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    // 0x01a3 feed-ack: the server tells us which food id was consumed
    // and the new remaining total. This is also where we learn the
    // pet→food mapping for latamRO custom pets that the bundled
    // pet_db misses — `evt.item_id` is authoritative.
    onInventoryDelta((evt) => {
      if (evt.pid !== pid) return;
      setSnapshot((prev) => {
        const isLearning =
          prev.petType !== null &&
          prev.foodItemId === null &&
          !PET_FOOD_DB[String(prev.petType)];
        if (isLearning) {
          const petType = prev.petType!;
          const foodItemId = evt.item_id;
          learnedFoodsRef.current = {
            ...learnedFoodsRef.current,
            [String(petType)]: foodItemId,
          };
          void setLearnedPetFood(petType, foodItemId).catch((e) =>
            console.warn("[pet] persist learned food failed:", e),
          );
          return {
            ...prev,
            foodItemId,
            foodCount: evt.remaining ?? prev.foodCount,
          };
        }
        return prev.foodItemId === evt.item_id
          ? { ...prev, foodCount: evt.remaining ?? prev.foodCount }
          : prev;
      });
    }).then((u) => {
      if (cancelled) u();
      else unsubs.push(u);
    });

    return () => {
      cancelled = true;
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      unsubs.forEach((u) => u());
    };
  }, [pid]);

  // Initial / pet-swap fetch — runs whenever foodItemId transitions
  // to a new non-null value.
  useEffect(() => {
    if (snapshot.foodItemId === null) return;
    refetchFoodCount(snapshot.foodItemId);
  }, [pid, snapshot.foodItemId]);

  // When the pet type changes (e.g. user swapped pets mid-session),
  // load the saved tick model for the new type. Skip when the model
  // is already set — hydration already loaded it, and `merge()`
  // resets `tickModel` to null on a real pet swap, so this only
  // hits the disk-cached store on the first arrival or after a swap
  // with no live model carried over.
  useEffect(() => {
    if (snapshot.petType === null) return;
    if (snapshot.tickModel !== null) return;
    let cancelled = false;
    getPetHungerTicks()
      .then((ticks) => {
        if (cancelled) return;
        const saved = validTick(ticks[String(snapshot.petType)] ?? null);
        if (saved) {
          setSnapshot((prev) =>
            prev.petType === snapshot.petType
              ? { ...prev, tickModel: saved }
              : prev,
          );
        }
      })
      .catch((e) => console.warn("[pet] tick lookup failed:", e));
    return () => {
      cancelled = true;
    };
  }, [snapshot.petType, snapshot.tickModel]);

  return snapshot;
}

function validTick(model: PetTickModel | null): PetTickModel | null {
  if (!model) return null;
  if (model.intervalMs > 0 && model.dropPerTick > 0) return model;
  return null;
}

function merge(
  prev: PetSnapshot,
  update: PetStateUpdate,
  learned: Record<string, number>,
): PetSnapshot {
  const now = Date.now();

  // Pet-type change is a hard reset for timing state. The new pet
  // has its own cadence — don't carry the previous pet's tick model
  // into the countdown, and don't run a drop/dt calc against the
  // previous pet's hunger value (that would write a swap delta into
  // the *previous* pet's persisted model, corrupting it). The saved
  // model for the new type is loaded asynchronously by the petType
  // effect; until then the countdown reads "Calculando…".
  const swappedPet =
    update.petType !== undefined &&
    prev.petType !== null &&
    update.petType !== prev.petType;
  if (swappedPet) {
    const nextPetType = update.petType ?? prev.petType;
    return {
      hunger: update.hunger ?? null,
      intimacy: update.intimacy ?? null,
      level: update.level ?? null,
      name: update.name ?? null,
      petType: nextPetType,
      // New pet → new food. Reset both, the foodItemId effect will
      // re-fetch the count for the new food id (or leave foodCount
      // null if the new pet isn't in our table — neither bundled
      // nor learned).
      foodItemId: lookupFoodId(nextPetType, learned),
      foodCount: null,
      lastHungerMs: update.hunger !== undefined ? now : null,
      tickModel: null,
      isOptimistic: false,
      awaitingPostFedTick: false,
    };
  }

  let nextTickModel = prev.tickModel;
  let nextAwaiting = prev.awaitingPostFedTick;

  if (
    update.hunger !== undefined &&
    prev.hunger !== null &&
    prev.lastHungerMs !== null
  ) {
    const drop = prev.hunger - update.hunger;
    if (drop < 0) {
      // Hunger increased — either the server confirming our
      // optimistic bump, or an out-of-band feed (food drag, etc.)
      // we didn't predict. Either way, the next natural decay tick
      // will have irregular dt — arm the skip flag.
      nextAwaiting = true;
    } else if (drop > 0 && prev.awaitingPostFedTick) {
      // First natural decay after a feed. The dt here doesn't
      // represent the true steady-state cadence — skip the model
      // update and consume the flag so the *second* post-feed tick
      // (which is regular) does calibrate.
      nextAwaiting = false;
    } else if (drop > 0 && !prev.isOptimistic) {
      const dt = now - prev.lastHungerMs;
      if (dt > 0) {
        nextTickModel = { intervalMs: dt, dropPerTick: drop };
        // Persist *for this pet type* so the next session doesn't
        // re-discover the cadence from scratch. Fire-and-forget; the
        // raglens.json write is small and infrequent (~1 per hungry
        // tick). Skip if we don't know the type yet — guessing the
        // wrong type's key would contaminate the per-pet cache.
        if (prev.petType !== null) {
          void setPetHungerTick(prev.petType, nextTickModel);
        }
      }
    }
  }
  // Any server packet clears the optimistic flag if it carried a
  // hunger value — we now have the authoritative number.
  const stillOptimistic =
    update.hunger !== undefined ? false : prev.isOptimistic;
  const mergedPetType = update.petType ?? prev.petType;
  return {
    hunger: update.hunger ?? prev.hunger,
    intimacy: update.intimacy ?? prev.intimacy,
    level: update.level ?? prev.level,
    name: update.name ?? prev.name,
    petType: mergedPetType,
    // Recompute on every merge so a first-time petType arrival
    // (was null, now known) gets the food id wired immediately.
    // Not in the swap branch (which has its own reset) — that
    // path already handled foodItemId explicitly above.
    foodItemId: lookupFoodId(mergedPetType, learned),
    foodCount: prev.foodCount,
    // Only advance the hunger anchor when this packet actually
    // carried a hunger value. Intimacy ticks and info snapshots
    // without a hunger field leave it untouched.
    lastHungerMs: update.hunger !== undefined ? now : prev.lastHungerMs,
    tickModel: nextTickModel,
    isOptimistic: stillOptimistic,
    awaitingPostFedTick: nextAwaiting,
  };
}
