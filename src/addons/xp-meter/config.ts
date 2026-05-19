// Per-addon display config for the XP meter. Each flag toggles one
// row of the overlay; all default to true. Persists in the store
// under `addon.xp-meter.config`.

export type XpMeterConfig = {
  /** Toggles the small "Experiência" label above the rows. Matches
   *  the pet-feeder's "Mascote" header behaviour. */
  showHeader: boolean;
  showBaseRate: boolean;
  showJobRate: boolean;
  showBasePercent: boolean;
  showJobPercent: boolean;
  showBaseEta: boolean;
  showJobEta: boolean;
  /** Rolling window (in ms) used for the XP/min and ETA calcs. */
  windowMs: number;
  /** Overall UI scale (1 = 100%). Applied via CSS `zoom` on the
   *  overlay root so font, padding and gaps scale together and the
   *  overlay's auto-height lock picks up the new content size. */
  uiScale: number;
};

export const xpMeterDefaultConfig: XpMeterConfig = {
  showHeader: true,
  showBaseRate: true,
  showJobRate: true,
  showBasePercent: true,
  showJobPercent: true,
  showBaseEta: true,
  showJobEta: true,
  windowMs: 5 * 60_000,
  uiScale: 1,
};

/** Allowed window values for the radio group in the settings modal.
 *  Predefined rather than freeform so a typo can't put the meter
 *  into an unusable state. */
export const xpMeterWindowOptions: ReadonlyArray<{
  label: string;
  value: number;
}> = [
  { label: "1 min", value: 60_000 },
  { label: "3 min", value: 3 * 60_000 },
  { label: "5 min", value: 5 * 60_000 },
  { label: "15 min", value: 15 * 60_000 },
  { label: "30 min", value: 30 * 60_000 },
  { label: "1 h", value: 60 * 60_000 },
];

/** Boolean keys in `XpMeterConfig` for the per-row visibility flags.
 *  Excludes the numeric fields and `showHeader` (which controls the
 *  header label, not a data row, and lives outside the row-labels
 *  map). */
export type XpMeterRowKey = Exclude<
  keyof XpMeterConfig,
  "windowMs" | "uiScale" | "showHeader"
>;

/** Compact suffix used in row labels — e.g. "5min" or "1h". The
 *  XP/% rows append this to communicate "value is summed over the
 *  selected window", whereas ETAs are absolute durations and don't
 *  carry the suffix. */
export function xpMeterWindowSuffix(windowMs: number): string {
  if (windowMs % (60 * 60_000) === 0) {
    const hours = windowMs / (60 * 60_000);
    return `${hours}h`;
  }
  return `${windowMs / 60_000}min`;
}

export function xpMeterRowLabels(
  windowMs: number,
): Record<XpMeterRowKey, string> {
  const s = xpMeterWindowSuffix(windowMs);
  return {
    showBaseRate: `XP base/${s}`,
    showJobRate: `XP job/${s}`,
    showBasePercent: `% base/${s}`,
    showJobPercent: `% job/${s}`,
    showBaseEta: "Próximo base",
    showJobEta: "Próximo job",
  };
}
