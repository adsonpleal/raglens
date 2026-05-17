import { describe, expect, it } from "vitest";
import {
  etaToNextLevelMs,
  formatDuration,
  formatNumber,
  formatPercent,
  percentPerMinute,
  xpInWindow,
  xpPerMinute,
  type ExpSample,
} from "./format";

const base = (ts: number, delta: number): ExpSample => ({
  timestampMs: ts,
  delta,
  kind: "base",
});
const job = (ts: number, delta: number): ExpSample => ({
  timestampMs: ts,
  delta,
  kind: "job",
});

describe("xpInWindow", () => {
  it("returns 0 when there are no samples", () => {
    expect(xpInWindow([], "base", 60_000, 60_000)).toBe(0);
  });

  it("sums samples inside the window for the requested kind", () => {
    const samples = [base(10_000, 100), base(50_000, 200), job(40_000, 999)];
    expect(xpInWindow(samples, "base", 60_000, 60_000)).toBe(300);
    expect(xpInWindow(samples, "job", 60_000, 60_000)).toBe(999);
  });

  it("excludes samples at or before the cutoff", () => {
    // cutoff is 30_000 (exclusive). A sample exactly at 30_000 is OUT.
    const samples = [base(30_000, 100), base(30_001, 200)];
    expect(xpInWindow(samples, "base", 60_000, 30_000)).toBe(200);
  });
});

describe("xpPerMinute", () => {
  it("returns 0 when there are no samples", () => {
    expect(xpPerMinute([], "base", 0, 60_000)).toBe(0);
  });

  it("scales to a per-minute rate from a shorter window", () => {
    // 500 XP gained in a 30s window => 1000 XP/min
    const samples = [base(60_000, 500)];
    expect(xpPerMinute(samples, "base", 60_000, 30_000)).toBe(1000);
  });

  it("ignores samples of the other kind", () => {
    const samples = [base(10_000, 1000), job(10_000, 9999)];
    expect(xpPerMinute(samples, "base", 60_000, 60_000)).toBe(1000);
  });
});

describe("percentPerMinute", () => {
  it("returns 0 when level total is non-positive", () => {
    expect(percentPerMinute([], "base", 0, 0)).toBe(0);
    expect(percentPerMinute([], "base", 0, -1)).toBe(0);
  });

  it("computes percent of level per minute", () => {
    // 5000 XP/min on a 100_000 XP level => 5%/min
    const samples = [base(60_000, 5000)];
    expect(percentPerMinute(samples, "base", 60_000, 100_000)).toBe(5);
  });
});

describe("etaToNextLevelMs", () => {
  it("returns Infinity when rate is zero or negative", () => {
    expect(etaToNextLevelMs(0, 1000)).toBe(Infinity);
    expect(etaToNextLevelMs(-1, 1000)).toBe(Infinity);
  });

  it("returns ms remaining for a positive rate", () => {
    // 60 XP/min, 60 XP remaining => 60_000 ms
    expect(etaToNextLevelMs(60, 60)).toBe(60_000);
  });
});

describe("formatDuration", () => {
  it("renders the placeholder for non-finite durations", () => {
    expect(formatDuration(Infinity)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
  });

  it("includes hours/minutes/seconds based on magnitude", () => {
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(5 * 60_000 + 12_000)).toBe("5m 12s");
    expect(formatDuration(3600_000 + 23 * 60_000 + 45_000)).toBe("1h 23m 45s");
  });
});

describe("formatNumber & formatPercent", () => {
  it("formats numbers with pt-BR thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });

  it("renders placeholder for non-finite values", () => {
    expect(formatNumber(Infinity)).toBe("—");
    expect(formatPercent(NaN)).toBe("—");
  });

  it("renders percent with two decimals", () => {
    expect(formatPercent(5)).toBe("5.00%");
    expect(formatPercent(0.125)).toBe("0.13%");
  });
});
