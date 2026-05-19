import { describe, expect, it } from "vitest";
import { hungerStage, isOptimalFeed } from "./format";

describe("hungerStage", () => {
  it("maps the five canonical ranges", () => {
    expect(hungerStage(0)).toBe("faminto");
    expect(hungerStage(10)).toBe("faminto");
    expect(hungerStage(11)).toBe("fome");
    expect(hungerStage(25)).toBe("fome");
    expect(hungerStage(26)).toBe("nenhuma");
    expect(hungerStage(75)).toBe("nenhuma");
    expect(hungerStage(76)).toBe("satisfeito");
    expect(hungerStage(90)).toBe("satisfeito");
    expect(hungerStage(91)).toBe("cheio");
    expect(hungerStage(100)).toBe("cheio");
  });

  it("clamps out-of-range values", () => {
    expect(hungerStage(-5)).toBe("faminto");
    expect(hungerStage(250)).toBe("cheio");
  });

  it("rounds fractional values to the nearest integer", () => {
    expect(hungerStage(25.4)).toBe("fome");
    expect(hungerStage(25.6)).toBe("nenhuma");
  });
});

describe("isOptimalFeed", () => {
  it("only the Nenhuma range (26-75) is optimal", () => {
    expect(isOptimalFeed(25)).toBe(false);
    expect(isOptimalFeed(26)).toBe(true);
    expect(isOptimalFeed(50)).toBe(true);
    expect(isOptimalFeed(75)).toBe(true);
    expect(isOptimalFeed(76)).toBe(false);
  });
});
