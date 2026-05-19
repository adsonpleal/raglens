// Pure helpers — no React, no Tauri. Mapping the raw 0..=100 hunger
// integer onto the five named stages the in-game pet window uses, plus
// the matching CSS modifier so the overlay can colour itself.
//
// Stage boundaries are inclusive on both ends. The "optimal feed"
// window is `Nenhuma` (26-75) — feeding there grants loyalty points,
// outside that range it either wastes food or risks pet flight.

export type HungerStage =
  | "faminto" // 0-10
  | "fome" // 11-25
  | "nenhuma" // 26-75 — optimal feed window
  | "satisfeito" // 76-90
  | "cheio"; // 91-100

/** Inclusive upper bounds for each hunger stage and the absolute
 *  hunger cap. Single source of truth for both the stage classifier
 *  (`hungerStage`) and the countdown threshold logic in the overlay. */
export const HUNGER = {
  MAX: 100,
  /** ≤ this → "faminto" */
  FAMINTO_MAX: 10,
  /** ≤ this → "fome" (danger zone: feed now). */
  DANGER_MAX: 25,
  /** ≤ this → "nenhuma" (optimal feed window). */
  OPTIMAL_MAX: 75,
  /** ≤ this → "satisfeito" */
  SATISFEITO_MAX: 90,
} as const;

export function hungerStage(value: number): HungerStage {
  const v = Math.max(0, Math.min(HUNGER.MAX, Math.round(value)));
  if (v <= HUNGER.FAMINTO_MAX) return "faminto";
  if (v <= HUNGER.DANGER_MAX) return "fome";
  if (v <= HUNGER.OPTIMAL_MAX) return "nenhuma";
  if (v <= HUNGER.SATISFEITO_MAX) return "satisfeito";
  return "cheio";
}

export const HUNGER_STAGE_LABEL: Record<HungerStage, string> = {
  faminto: "Faminto",
  fome: "Fome",
  nenhuma: "Nenhuma",
  satisfeito: "Satisfeito",
  cheio: "Cheio",
};

/** True iff the pet is in the loyalty-granting window. */
export function isOptimalFeed(value: number): boolean {
  return hungerStage(value) === "nenhuma";
}
