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

import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onClientReset,
  onPetFedRequest,
  onPetState,
} from "../../lib/events";
import { getPetState } from "../../lib/invoke";
import {
  getPetHungerTicks,
  setPetHungerTick,
  type PetTickModel,
} from "../../lib/store";
import type { PetStateUpdate } from "../../lib/types";
import { HUNGER } from "./format";

// Default hunger bump applied when the player clicks "Alimentar" in
// the in-game menu, before the server's 0x01a4 lands. Most RO foods
// add ~20 — we slightly undershoot so we don't fake values above the
// true post-feed hunger. The real 0x01a4 will overwrite it anyway.
const OPTIMISTIC_FEED_BUMP = 20;

export type PetSnapshot = {
  hunger: number | null;
  intimacy: number | null;
  level: number | null;
  name: string | null;
  petType: number | null;
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
  lastHungerMs: null,
  tickModel: null,
  isOptimistic: false,
  awaitingPostFedTick: false,
};

export function usePetState(pid: number): PetSnapshot {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(EMPTY);

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
    // saved tick model.
    void (async () => {
      try {
        const [cached, ticks] = await Promise.all([
          getPetState(pid),
          getPetHungerTicks(),
        ]);
        if (cancelled || !cached) return;
        const modelFromDisk = cached.petType
          ? ticks[String(cached.petType)] ?? null
          : null;
        setSnapshot((prev) => ({
          hunger: prev.hunger ?? cached.hunger,
          intimacy: prev.intimacy ?? cached.intimacy,
          level: prev.level ?? cached.level,
          name: prev.name ?? cached.name,
          petType: prev.petType ?? cached.petType,
          // If we have a cached hunger but no real tick yet, anchor
          // elapsed-time to "now" so the countdown ticks down from
          // hydration rather than jumping. The next real 0x01a4 will
          // overwrite this with the true server-tick timestamp.
          lastHungerMs:
            prev.lastHungerMs ?? (cached.hunger !== null ? Date.now() : null),
          tickModel: prev.tickModel ?? validTick(modelFromDisk),
          isOptimistic: prev.isOptimistic,
          awaitingPostFedTick: prev.awaitingPostFedTick,
        }));
      } catch (e) {
        console.warn("[pet] hydrate failed:", e);
      }
    })();

    onPetState((update: PetStateUpdate) => {
      if (update.pid !== pid) return;
      setSnapshot((prev) => merge(prev, update));
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

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pid]);

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

function merge(prev: PetSnapshot, update: PetStateUpdate): PetSnapshot {
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
    return {
      hunger: update.hunger ?? null,
      intimacy: update.intimacy ?? null,
      level: update.level ?? null,
      name: update.name ?? null,
      petType: update.petType ?? prev.petType,
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
  return {
    hunger: update.hunger ?? prev.hunger,
    intimacy: update.intimacy ?? prev.intimacy,
    level: update.level ?? prev.level,
    name: update.name ?? prev.name,
    petType: update.petType ?? prev.petType,
    // Only advance the hunger anchor when this packet actually
    // carried a hunger value. Intimacy ticks and info snapshots
    // without a hunger field leave it untouched.
    lastHungerMs: update.hunger !== undefined ? now : prev.lastHungerMs,
    tickModel: nextTickModel,
    isOptimistic: stillOptimistic,
    awaitingPostFedTick: nextAwaiting,
  };
}
