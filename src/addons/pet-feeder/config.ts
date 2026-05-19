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

  uiScale: 1,
};

export const SOUND_NONE = "none";
export const SOUND_DEFAULT_CHIME = "default-chime";
export const SOUND_DEFAULT_BUZZ = "default-buzz";

export const BUILT_IN_SOUNDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: SOUND_NONE, label: "Nenhum" },
  { id: SOUND_DEFAULT_CHIME, label: "Sino (padrão)" },
  { id: SOUND_DEFAULT_BUZZ, label: "Buzina (padrão)" },
];
