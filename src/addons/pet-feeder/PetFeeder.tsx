import { useEffect, useRef, useState } from "react";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import { useScaleAspectRatio } from "../../hooks/useScaleAspectRatio";
import { formatDuration } from "../../lib/format";
import type { PetTickModel } from "../../lib/store";
import type { ClientInfo } from "../../lib/types";
import {
  HUNGER,
  HUNGER_STAGE_LABEL,
  hungerStage,
  type HungerStage,
} from "./format";
import {
  PET_NOTIFICATION_EVENTS,
  petFeederDefaultConfig,
  type PetFeederConfig,
  type PetNotificationEvent,
} from "./config";
import { sendNtfyPush, type NtfyMessage } from "./ntfy";
import { playSound, type SoundHandle } from "./sounds";
import { usePetState } from "./usePetState";
import { sendWindowsNotification } from "./winNotify";
import "./pet-feeder.css";

type Props = {
  pid: number;
  client: ClientInfo | null;
};

// Hunger decay rate is per pet-sprite (rAthena's HungryDelay varies
// per pet type and latamRO customises it further). We never guess —
// the countdown shows "Calculando…" until we either observe a drop
// in this session OR hydrate a saved rate for this pet type from
// raglens.json. After that, subsequent sessions of the same pet
// start the countdown accurate from frame zero.

// How long the "fed" notification waits before firing. A feed
// produces up to three hunger / intimacy updates in quick succession
// (optimistic bump, server-confirmed hunger, server intimacy packet);
// holding briefly lets them coalesce so the toast reflects the final
// post-feed loyalty instead of firing once with the old value and
// again with the new.
const FED_NOTIFICATION_DEBOUNCE_MS = 800;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PetFeeder({ pid, client: _client }: Props) {
  const config = useAddonConfig("pet-feeder", petFeederDefaultConfig);
  const {
    hunger,
    intimacy,
    level,
    name,
    petType,
    tickModel,
    lastHungerMs,
    isOptimistic,
  } = usePetState(pid);
  useScaleAspectRatio(config.uiScale);
  const prevStageRef = useRef<HungerStage | null>(null);
  // Previous hunger value, used to detect the "fed" event: any
  // server-confirmed *or* optimistic increase means the user just
  // fed the pet. Keying on hunger (not intimacy) means feeds at max
  // loyalty still fire — the server skips the intimacy packet when
  // there's nothing to add.
  const prevHungerRef = useRef<number | null>(null);
  // Always-fresh intimacy, read by the debounced "fed" notification
  // so the toast carries the post-feed loyalty even when the intimacy
  // packet arrives after the optimistic hunger bump.
  const intimacyRef = useRef<number | null>(null);
  intimacyRef.current = intimacy;
  const fedTimerRef = useRef<number | null>(null);
  const clearFedTimer = () => {
    if (fedTimerRef.current !== null) {
      window.clearTimeout(fedTimerRef.current);
      fedTimerRef.current = null;
    }
  };
  // Active looping alert sounds — kept so we can stop them on stage
  // exit, on unmount, or when the user mutes the addon.
  const optimalLoopRef = useRef<SoundHandle | null>(null);
  const dangerLoopRef = useRef<SoundHandle | null>(null);

  // Reset the per-pet tracking refs on swap so the previous pet's
  // values don't bleed into the new pet's first observations.
  useEffect(() => {
    prevStageRef.current = null;
    prevHungerRef.current = null;
    clearFedTimer();
  }, [petType]);

  // Re-render every second so the countdown stays accurate even when
  // no new packet has arrived.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Stop any active loops if the component unmounts (overlay closed
  // or addon disabled).
  useEffect(() => {
    return () => {
      optimalLoopRef.current?.stop();
      optimalLoopRef.current = null;
      dangerLoopRef.current?.stop();
      dangerLoopRef.current = null;
      clearFedTimer();
    };
  }, []);

  const stage: HungerStage | null =
    hunger === null ? null : hungerStage(hunger);

  // Stop any active looping sound the moment the user disables the
  // sound master. Separated from the transition effect below so that
  // muting doesn't accidentally bail out of notification dispatch.
  useEffect(() => {
    if (!config.soundEnabled) {
      optimalLoopRef.current?.stop();
      optimalLoopRef.current = null;
      dangerLoopRef.current?.stop();
      dangerLoopRef.current = null;
    }
  }, [config.soundEnabled]);

  // Stage transitions drive both the audible alert and the
  // optimal/danger notifications. Notifications fire even when sound
  // is muted — the user might want a silent desktop overlay but
  // still get a phone or Windows toast when stepping away.
  useEffect(() => {
    if (stage === null) return;
    const prev = prevStageRef.current;
    prevStageRef.current = stage;
    if (prev === stage) return;

    const wasDanger = prev === "fome" || prev === "faminto";
    const isDanger = stage === "fome" || stage === "faminto";

    if (config.soundEnabled) {
      // Leaving an alert state stops its loop (if it was looping).
      if (prev === "nenhuma" && stage !== "nenhuma") {
        optimalLoopRef.current?.stop();
        optimalLoopRef.current = null;
      }
      if (wasDanger && !isDanger) {
        dangerLoopRef.current?.stop();
        dangerLoopRef.current = null;
      }
      // Entering an alert state starts the sound (looping or one-shot).
      if (stage === "nenhuma" && config.optimalAlert) {
        void playSound(
          config.optimalSound,
          config.volume,
          config.optimalSoundLoop,
        ).then((handle) => {
          if (config.optimalSoundLoop) optimalLoopRef.current = handle;
        });
      } else if (isDanger && !wasDanger && config.dangerAlert) {
        void playSound(
          config.dangerSound,
          config.volume,
          config.dangerSoundLoop,
        ).then((handle) => {
          if (config.dangerSoundLoop) dangerLoopRef.current = handle;
        });
      }
    }

    if (stage === "nenhuma") {
      dispatchPetNotification("optimal", config);
    } else if (isDanger && !wasDanger) {
      dispatchPetNotification("danger", config);
    }
  }, [
    stage,
    config.soundEnabled,
    config.optimalAlert,
    config.dangerAlert,
    config.optimalSound,
    config.optimalSoundLoop,
    config.dangerSound,
    config.dangerSoundLoop,
    config.volume,
    config.pushEnabled,
    config.pushNtfyTopic,
    config.winEnabled,
    config.pushOptimal,
    config.pushDanger,
    config.winOptimal,
    config.winDanger,
  ]);

  // Pet-fed detection: any *increase* in hunger means the user just
  // fed. The optimistic bump and the server's hunger confirmation
  // each register as an increase, and the intimacy packet arrives on
  // its own — so we debounce the notification to coalesce them into a
  // single fire that uses the freshest intimacy (read via ref).
  useEffect(() => {
    if (hunger === null) return;
    const prev = prevHungerRef.current;
    prevHungerRef.current = hunger;
    if (prev === null || hunger <= prev) return;
    clearFedTimer();
    fedTimerRef.current = window.setTimeout(() => {
      fedTimerRef.current = null;
      dispatchPetNotification("fed", config, {
        newIntimacy: intimacyRef.current ?? 0,
      });
    }, FED_NOTIFICATION_DEBOUNCE_MS);
  }, [
    hunger,
    config.pushEnabled,
    config.pushNtfyTopic,
    config.winEnabled,
    config.pushFed,
    config.winFed,
  ]);

  if (hunger === null || stage === null) {
    // The server only pushes pet state on change (every ~30-60s
    // hunger tick) or when the player opens the pet info menu. The
    // wait usually resolves on its own within a tick.
    return (
      <div
        className="pet-feeder pet-feeder--waiting"
        style={{ zoom: config.uiScale }}
      >
        {config.showHeader && <div className="overlay-header">Mascote</div>}
        <span>Aguardando dados do mascote…</span>
      </div>
    );
  }

  // Milliseconds since the last server-confirmed *hunger* value —
  // subtracted from the countdown each render (we re-render every 1s
  // via setTick) so the "Até ideal" / "Até perigo" timer ticks down
  // smoothly between 0x01a4 hunger ticks instead of sitting frozen.
  // Intentionally not anchored to the last *any* pet packet —
  // intimacy ticks would otherwise reset this and the visible timer
  // would jump back up.
  const elapsedMs =
    lastHungerMs !== null ? Math.max(0, Date.now() - lastHungerMs) : 0;
  // While the hunger value is our post-feed optimistic guess (server
  // hasn't confirmed yet), suppress the countdown — the bump can
  // overshoot the actual feed amount, so the computed time would
  // briefly read too high and then snap back when the real packet
  // arrives. Treat optimistic-window as "Calculando…".
  const effectiveModel = isOptimistic ? null : tickModel;
  const countdown = computeCountdown(hunger, effectiveModel, elapsedMs);
  const isDanger = stage === "fome" || stage === "faminto";
  const isOptimal = stage === "nenhuma";

  return (
    <div
      className={`pet-feeder pet-feeder--${stage} ${
        isOptimal && config.optimalAlert ? "pet-feeder--alert" : ""
      } ${isDanger && config.dangerAlert ? "pet-feeder--danger" : ""}`}
      style={{ zoom: config.uiScale }}
    >
      {config.showHeader && <div className="overlay-header">Mascote</div>}

      {config.showName && name && (
        <div className="pet-feeder__row pet-feeder__name">{name}</div>
      )}

      {config.showHunger && (
        <div className="pet-feeder__row pet-feeder__row--primary">
          <span className="pet-feeder__stage">{HUNGER_STAGE_LABEL[stage]}</span>
          <span className="pet-feeder__value">{hunger}</span>
        </div>
      )}

      {config.showTimer && (
        <div className="pet-feeder__row pet-feeder__timer">
          <span className="pet-feeder__timer-label">{countdown.label}</span>
          <span
            className={`pet-feeder__timer-value ${
              countdown.calculating ? "pet-feeder__timer-value--calc" : ""
            }`}
          >
            {countdown.value}
          </span>
        </div>
      )}

      {(config.showLevel || config.showIntimacy) && (
        <div className="pet-feeder__row pet-feeder__meta">
          {config.showLevel && level !== null && (
            <span className="pet-feeder__chip">Lv {level}</span>
          )}
          {config.showIntimacy && intimacy !== null && (
            <span className="pet-feeder__chip">♥ {intimacy}</span>
          )}
        </div>
      )}
    </div>
  );
}

type FedContext = { newIntimacy: number };

type EventDef = { push: NtfyMessage; win: { title: string; body: string } };

/** Builds the per-event message payloads. Kept as a function (not a
 *  static map) so the "fed" body can interpolate the new intimacy
 *  and the delta. Same strings flow to both channels — the user
 *  doesn't need to know which one delivered the alert. */
function buildEventMessages(
  event: PetNotificationEvent,
  ctx?: FedContext,
): EventDef {
  switch (event) {
    case "optimal":
      return {
        push: {
          title: "Mascote pronto pra alimentar",
          body: "Fome entrou na faixa ideal (Nenhuma). Alimente pra ganhar lealdade.",
          priority: "default",
          tags: ["green_heart"],
        },
        win: {
          title: "Mascote pronto pra alimentar",
          body: "Fome entrou na faixa ideal (Nenhuma). Alimente pra ganhar lealdade.",
        },
      };
    case "danger":
      return {
        push: {
          title: "Mascote em perigo!",
          body: "Fome do mascote caiu pra zona de perigo — alimente agora pra evitar que ele fuja.",
          priority: "high",
          tags: ["warning"],
        },
        win: {
          title: "Mascote em perigo!",
          body: "Fome do mascote caiu pra zona de perigo — alimente agora pra evitar que ele fuja.",
        },
      };
    case "fed": {
      const intimacy = ctx?.newIntimacy ?? 0;
      const body = `Nova lealdade: ${intimacy}.`;
      return {
        push: {
          title: "Mascote alimentado",
          body,
          priority: "default",
          tags: ["heart"],
        },
        win: { title: "Mascote alimentado", body },
      };
    }
  }
}

function dispatchPetNotification(
  event: PetNotificationEvent,
  config: PetFeederConfig,
  ctx?: FedContext,
): void {
  const def = PET_NOTIFICATION_EVENTS.find((e) => e.id === event);
  if (!def) return;
  const msgs = buildEventMessages(event, ctx);
  const pushFire =
    config.pushEnabled &&
    config[def.pushKey] === true &&
    config.pushNtfyTopic.trim() !== "";
  const winFire = config.winEnabled && config[def.winKey] === true;
  if (import.meta.env.DEV) {
    console.info(
      `[pet-feeder] event=${event} push=${pushFire} win=${winFire}`,
      {
        pushEnabled: config.pushEnabled,
        winEnabled: config.winEnabled,
        pushEventFlag: config[def.pushKey],
        winEventFlag: config[def.winKey],
        topic: config.pushNtfyTopic,
        ctx,
      },
    );
  }
  if (pushFire) void sendNtfyPush(config.pushNtfyTopic, msgs.push);
  if (winFire) void sendWindowsNotification(msgs.win.title, msgs.win.body);
}

type Countdown = { label: string; value: string; calculating: boolean };

function computeCountdown(
  hunger: number,
  model: PetTickModel | null,
  elapsedMs: number,
): Countdown {
  // Danger zone has a fixed CTA — no countdown maths needed.
  if (hunger <= HUNGER.DANGER_MAX) {
    return {
      label: "Zona perigosa",
      value: "Alimente agora!",
      calculating: false,
    };
  }

  const aboveOptimal = hunger > HUNGER.OPTIMAL_MAX;
  const label = aboveOptimal ? "Até ideal" : "Até perigo";
  const threshold = aboveOptimal ? HUNGER.OPTIMAL_MAX : HUNGER.DANGER_MAX;

  // No observed tick model yet (first encounter with this pet type
  // AND nothing cached on disk). Don't guess — surface the
  // calibration state. After the next 0x01a4 drop we'll have a real
  // model and the countdown takes over.
  if (model === null || model.intervalMs <= 0 || model.dropPerTick <= 0) {
    return { label, value: "Calculando…", calculating: true };
  }

  // Discrete-tick countdown. The server decrements hunger by
  // `dropPerTick` every `intervalMs` — it does NOT drift smoothly.
  // So the time until hunger reaches the threshold is the number of
  // *whole* ticks needed (rounded up), times the interval, minus
  // however long it's been since the last tick.
  //
  // Example (latamRO pet 2398, observed cadence 3 pts per 60s):
  //   hunger=76, threshold=75: ceil(1/3)=1 tick → next tick (~60s
  //   from now) drops hunger to 73, crossing the threshold. That
  //   single 60-second wait is what the user actually experiences,
  //   not the 20s a continuous-rate model would predict.
  const pointsToCross = hunger - threshold;
  const ticksNeeded = Math.max(0, Math.ceil(pointsToCross / model.dropPerTick));
  if (ticksNeeded === 0) {
    return { label, value: "—", calculating: false };
  }
  const timeToNextTickMs = Math.max(0, model.intervalMs - elapsedMs);
  const remainingMs =
    timeToNextTickMs + (ticksNeeded - 1) * model.intervalMs;
  return { label, value: formatDuration(remainingMs), calculating: false };
}
