import { describe, expect, it } from "vitest";
import { isNewer } from "./updates";

describe("isNewer", () => {
  it("treats a higher patch as newer", () => {
    expect(isNewer("v0.1.2", "0.1.1")).toBe(true);
  });

  it("accepts the v prefix on either side", () => {
    expect(isNewer("0.1.2", "v0.1.1")).toBe(true);
    expect(isNewer("v0.1.1", "v0.1.2")).toBe(false);
  });

  it("ranks minor above patch", () => {
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
  });

  it("ranks major above minor", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("returns false for equal versions", () => {
    expect(isNewer("0.1.1", "0.1.1")).toBe(false);
    expect(isNewer("v0.1.1", "0.1.1")).toBe(false);
  });

  it("returns false when the latest is older", () => {
    expect(isNewer("0.1.0", "0.1.1")).toBe(false);
  });

  it("returns false on malformed input rather than throwing", () => {
    expect(isNewer("garbage", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "garbage")).toBe(false);
    expect(isNewer("0.1", "0.1.0")).toBe(false);
    expect(isNewer("", "0.1.0")).toBe(false);
  });
});
