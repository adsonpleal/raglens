// Per-addon display config for the XP meter. Each flag toggles one
// row of the overlay; all default to true. Persists in the store
// under `addon.xp-meter.config`.

export type XpMeterConfig = {
  showBaseRate: boolean;
  showJobRate: boolean;
  showBasePercent: boolean;
  showJobPercent: boolean;
  showBaseEta: boolean;
  showJobEta: boolean;
  /** Rolling window (in ms) used for the XP/min and ETA calcs. */
  windowMs: number;
};

export const xpMeterDefaultConfig: XpMeterConfig = {
  showBaseRate: true,
  showJobRate: true,
  showBasePercent: true,
  showJobPercent: true,
  showBaseEta: true,
  showJobEta: true,
  windowMs: 5 * 60_000,
};

/** Allowed window values for the radio group in the settings modal.
 *  Predefined rather than freeform so a typo can't put the meter
 *  into an unusable state. */
export const xpMeterWindowOptions: ReadonlyArray<{
  label: string;
  value: number;
}> = [
  { label: "1 min", value: 60_000 },
  { label: "5 min", value: 5 * 60_000 },
  { label: "15 min", value: 15 * 60_000 },
  { label: "30 min", value: 30 * 60_000 },
  { label: "1 h", value: 60 * 60_000 },
];

/** Boolean keys in `XpMeterConfig` — i.e. the per-row visibility
 *  flags. Excludes `windowMs` (number). */
export type XpMeterRowKey = Exclude<keyof XpMeterConfig, "windowMs">;

export const xpMeterRowLabels: Record<XpMeterRowKey, string> = {
  showBaseRate: "XP base/min",
  showJobRate: "XP job/min",
  showBasePercent: "% base/min",
  showJobPercent: "% job/min",
  showBaseEta: "ETA base",
  showJobEta: "ETA job",
};
