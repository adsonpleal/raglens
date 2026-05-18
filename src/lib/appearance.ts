export type AppearancePreset =
  | "transparent"
  | "dark"
  | "light"
  | "darkBlue"
  | "darkGreen";

export type OverlayAppearance = {
  preset: AppearancePreset;
  opacity: number; // 0..100; ignored when preset === "transparent"
};

export const DEFAULT_APPEARANCE: OverlayAppearance = {
  preset: "transparent",
  opacity: 75,
};

type Palette = {
  rgb: [number, number, number] | null;
  fg: string;
  fgMuted: string;
  border: string;
  // Color of the 8-direction outline drawn around each glyph. Used on
  // dark presets to keep white text legible over busy game backgrounds;
  // dropped on the light preset to mimic the clean Ragnarok HUD look.
  outline: string;
};

const SOLID_BORDER = "rgba(255, 255, 255, 0.08)";

const PALETTES: Record<AppearancePreset, Palette> = {
  transparent: { rgb: null, fg: "#ffffff", fgMuted: "#d8d8d8", border: "transparent", outline: "#000" },
  dark: { rgb: [15, 15, 20], fg: "#ffffff", fgMuted: "#d8d8d8", border: SOLID_BORDER, outline: "#000" },
  light: { rgb: [225, 232, 240], fg: "#111111", fgMuted: "#3a3a3a", border: SOLID_BORDER, outline: "transparent" },
  darkBlue: { rgb: [12, 20, 40], fg: "#ffffff", fgMuted: "#cdd9ee", border: SOLID_BORDER, outline: "#000" },
  darkGreen: { rgb: [16, 32, 20], fg: "#ffffff", fgMuted: "#c8e0c8", border: SOLID_BORDER, outline: "#000" },
};

export type AppearanceCssVars = {
  "--overlay-bg": string;
  "--overlay-fg": string;
  "--overlay-fg-muted": string;
  "--overlay-border": string;
  "--overlay-outline": string;
};

export function appearanceCssVars(a: OverlayAppearance): AppearanceCssVars {
  const p = PALETTES[a.preset] ?? PALETTES.transparent;
  const alpha = Math.max(0, Math.min(100, a.opacity)) / 100;
  const bg =
    p.rgb === null
      ? "transparent"
      : `rgba(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}, ${alpha})`;
  return {
    "--overlay-bg": bg,
    "--overlay-fg": p.fg,
    "--overlay-fg-muted": p.fgMuted,
    "--overlay-border": p.border,
    "--overlay-outline": p.outline,
  };
}

export const PRESET_ORDER: AppearancePreset[] = [
  "transparent",
  "dark",
  "light",
  "darkBlue",
  "darkGreen",
];
