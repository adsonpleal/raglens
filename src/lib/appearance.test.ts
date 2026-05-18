import { describe, expect, it } from "vitest";
import { appearanceCssVars, type AppearancePreset } from "./appearance";

describe("appearanceCssVars", () => {
  it("returns transparent bg for the transparent preset regardless of opacity", () => {
    expect(appearanceCssVars({ preset: "transparent", opacity: 100 })["--overlay-bg"])
      .toBe("transparent");
    expect(appearanceCssVars({ preset: "transparent", opacity: 0 })["--overlay-bg"])
      .toBe("transparent");
    expect(appearanceCssVars({ preset: "transparent", opacity: 50 })["--overlay-bg"])
      .toBe("transparent");
  });

  it("emits rgba for solid presets with the given opacity", () => {
    expect(appearanceCssVars({ preset: "dark", opacity: 100 })["--overlay-bg"])
      .toBe("rgba(15, 15, 20, 1)");
    expect(appearanceCssVars({ preset: "dark", opacity: 50 })["--overlay-bg"])
      .toBe("rgba(15, 15, 20, 0.5)");
    expect(appearanceCssVars({ preset: "dark", opacity: 0 })["--overlay-bg"])
      .toBe("rgba(15, 15, 20, 0)");
  });

  it("flips text colors for the light preset and drops the outline", () => {
    const vars = appearanceCssVars({ preset: "light", opacity: 90 });
    expect(vars["--overlay-fg"]).toBe("#111111");
    expect(vars["--overlay-fg-muted"]).toBe("#3a3a3a");
    expect(vars["--overlay-bg"]).toBe("rgba(225, 232, 240, 0.9)");
    expect(vars["--overlay-outline"]).toBe("transparent");
  });

  it("keeps light-on-dark text + black outline for darkBlue / darkGreen presets", () => {
    expect(appearanceCssVars({ preset: "darkBlue", opacity: 100 })["--overlay-fg"])
      .toBe("#ffffff");
    expect(appearanceCssVars({ preset: "darkBlue", opacity: 100 })["--overlay-outline"])
      .toBe("#000");
    expect(appearanceCssVars({ preset: "darkGreen", opacity: 100 })["--overlay-fg"])
      .toBe("#ffffff");
  });

  it("clamps out-of-range opacity to 0..100", () => {
    expect(appearanceCssVars({ preset: "dark", opacity: -10 })["--overlay-bg"])
      .toBe("rgba(15, 15, 20, 0)");
    expect(appearanceCssVars({ preset: "dark", opacity: 150 })["--overlay-bg"])
      .toBe("rgba(15, 15, 20, 1)");
  });

  it("falls back to the transparent palette for an unknown preset", () => {
    const vars = appearanceCssVars({
      preset: "bogus" as AppearancePreset,
      opacity: 50,
    });
    expect(vars["--overlay-bg"]).toBe("transparent");
    expect(vars["--overlay-fg"]).toBe("#ffffff");
  });

  it("drops the border for the transparent preset, keeps it for solid presets", () => {
    expect(appearanceCssVars({ preset: "transparent", opacity: 75 })["--overlay-border"])
      .toBe("transparent");
    expect(appearanceCssVars({ preset: "dark", opacity: 75 })["--overlay-border"])
      .toBe("rgba(255, 255, 255, 0.08)");
  });
});
