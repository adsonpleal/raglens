// Per-addon config for the pet feeder. Persists under
// `addon.pet-feeder.config` via the shared store helpers.
//
// Sound ids: `"none"` silences the slot; `"default-chime"` and
// `"default-buzz"` are synthesised via Web Audio (no file shipped —
// generated on demand, zero copyright concern). Anything else is the
// filename of a user-imported file stored under
// `%APPDATA%\com.adson.raglens\sounds\` and read back via the
// `read_sound` Tauri command.

export type PetFeederConfig = {
  showHeader: boolean;
  showName: boolean;
  showHunger: boolean;
  showLevel: boolean;
  showIntimacy: boolean;
  showTimer: boolean;

  optimalAlert: boolean; // visual blink when entering Nenhuma (26-75)
  dangerAlert: boolean; // visual shake when at/below Fome (<=25)

  soundEnabled: boolean;
  optimalSound: string;
  optimalSoundLoop: boolean;
  dangerSound: string;
  dangerSoundLoop: boolean;
  volume: number; // 0..100

  /** Master toggle for ntfy.sh push notifications. When off, none of
   *  the per-event push flags fire. Topic name is the only
   *  "credential" — anyone who knows it can read or write the same
   *  channel, so the user picks something hard to guess. */
  pushEnabled: boolean;
  pushNtfyTopic: string;
  /** Master toggle for native Windows toast notifications. Same
   *  off-disables-all semantics as `pushEnabled`. */
  winEnabled: boolean;

  // Per-event × per-channel matrix. The UI renders this as a 3×2
  // grid in the settings modal so the user can mute one channel
  // without losing the other (e.g. silent desktop while AFK but
  // push on the phone).
  pushOptimal: boolean;
  pushDanger: boolean;
  pushFed: boolean;
  winOptimal: boolean;
  winDanger: boolean;
  winFed: boolean;

  uiScale: number; // 0.5..2.0
};

export const petFeederDefaultConfig: PetFeederConfig = {
  showHeader: true,
  showName: true,
  showHunger: true,
  showLevel: false,
  showIntimacy: true,
  showTimer: true,

  optimalAlert: true,
  dangerAlert: true,

  soundEnabled: true,
  optimalSound: "default-chime",
  optimalSoundLoop: false,
  dangerSound: "default-buzz",
  dangerSoundLoop: true,
  volume: 70,

  pushEnabled: false,
  pushNtfyTopic: "",
  winEnabled: false,

  pushOptimal: true,
  pushDanger: true,
  pushFed: false,
  winOptimal: true,
  winDanger: true,
  winFed: false,

  uiScale: 1,
};

/** Logical notification events. Two channels (push, Windows) each
 *  with their own enable bool, surfaced together in the settings
 *  table. */
export type PetNotificationEvent = "optimal" | "danger" | "fed";

export const PET_NOTIFICATION_EVENTS: ReadonlyArray<{
  id: PetNotificationEvent;
  label: string;
  pushKey: keyof PetFeederConfig;
  winKey: keyof PetFeederConfig;
}> = [
  {
    id: "optimal",
    label: "Entrou na faixa ideal",
    pushKey: "pushOptimal",
    winKey: "winOptimal",
  },
  {
    id: "danger",
    label: "Entrou na zona de perigo",
    pushKey: "pushDanger",
    winKey: "winDanger",
  },
  {
    id: "fed",
    label: "Alimentado (lealdade ganha)",
    pushKey: "pushFed",
    winKey: "winFed",
  },
];

export const SOUND_NONE = "none";
export const SOUND_DEFAULT_CHIME = "default-chime";
export const SOUND_DEFAULT_BUZZ = "default-buzz";

export const BUILT_IN_SOUNDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: SOUND_NONE, label: "Nenhum" },
  { id: SOUND_DEFAULT_CHIME, label: "Sino (padrão)" },
  { id: SOUND_DEFAULT_BUZZ, label: "Buzina (padrão)" },
];
