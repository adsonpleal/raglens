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
};

export const xpMeterDefaultConfig: XpMeterConfig = {
  showBaseRate: true,
  showJobRate: true,
  showBasePercent: true,
  showJobPercent: true,
  showBaseEta: true,
  showJobEta: true,
};

export const xpMeterRowLabels: Record<keyof XpMeterConfig, string> = {
  showBaseRate: "XP base/min",
  showJobRate: "XP job/min",
  showBasePercent: "% base/min",
  showJobPercent: "% job/min",
  showBaseEta: "ETA base",
  showJobEta: "ETA job",
};
