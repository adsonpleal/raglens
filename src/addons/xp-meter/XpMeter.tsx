import { useEffect, useMemo, useState } from "react";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import type { ClientInfo } from "../../lib/types";
import { xpMeterDefaultConfig, xpMeterRowLabels } from "./config";
import {
  etaToNextLevelMs,
  formatDuration,
  formatNumber,
  formatPercent,
  xpPerMinuteAdaptive,
} from "./format";

// Stable mean — XP/min is averaged over a fixed 5-minute trailing
// window (with adaptive denominator if we haven't been running 5
// min yet). The settings-modal selector is purely a display
// multiplier on top of this.
const RATE_WINDOW_MS = 5 * 60_000;
import { useXpEvents } from "./useXpEvents";
import "./xp-meter.css";

type Props = {
  pid: number;
  client: ClientInfo | null;
};

// `client` is accepted for API compatibility with OverlayHost but
// unused — the XP meter no longer renders the character name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function XpMeter({ pid, client: _client }: Props) {
  const { samples, totals, hasEverReceived } = useXpEvents(pid);
  const config = useAddonConfig("xp-meter", xpMeterDefaultConfig);
  const labels = useMemo(() => xpMeterRowLabels(config.windowMs), [config.windowMs]);

  // Re-render every second so the rolling-window calcs stay fresh
  // even when no new packet has arrived.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    // Underlying rate is averaged over the fixed 5-minute trailing
    // window — that's the value with stable statistical meaning. If
    // we don't have 5 min of recordings yet, xpPerMinuteAdaptive
    // estimates with whatever's available. The settings-modal
    // selector is purely a display multiplier on this rate. ETA is
    // independent of the multiplier — "minutes until level" doesn't
    // change just because we phrased the rate differently.
    const basePerMin = xpPerMinuteAdaptive(samples, "base", now, RATE_WINDOW_MS);
    const jobPerMin = xpPerMinuteAdaptive(samples, "job", now, RATE_WINDOW_MS);
    const multiplier = config.windowMs / 60_000;

    const baseProjection = basePerMin * multiplier;
    const jobProjection = jobPerMin * multiplier;

    const baseRemaining =
      totals.base != null && totals.nextBase != null
        ? Math.max(0, totals.nextBase - totals.base)
        : null;
    const jobRemaining =
      totals.job != null && totals.nextJob != null
        ? Math.max(0, totals.nextJob - totals.job)
        : null;

    const basePercent =
      totals.nextBase && totals.nextBase > 0
        ? (baseProjection / totals.nextBase) * 100
        : NaN;
    const jobPercent =
      totals.nextJob && totals.nextJob > 0
        ? (jobProjection / totals.nextJob) * 100
        : NaN;

    const baseEta =
      baseRemaining !== null
        ? etaToNextLevelMs(basePerMin, baseRemaining)
        : Number.POSITIVE_INFINITY;
    const jobEta =
      jobRemaining !== null
        ? etaToNextLevelMs(jobPerMin, jobRemaining)
        : Number.POSITIVE_INFINITY;

    return {
      baseProjection,
      jobProjection,
      basePercent,
      jobPercent,
      baseEta,
      jobEta,
    };
  }, [samples, totals, now, config.windowMs]);

  // The configured rows always render — they're what dictates the
  // overlay's natural content size. When we haven't seen a packet
  // yet they go `visibility: hidden` (still occupy space) and the
  // waiting placeholder is drawn on top as an absolutely-positioned
  // overlay. This way the user-chosen rows drive the window size,
  // not the waiting state, so disconnect/reconnect doesn't make
  // the apparent overlay height jump around.
  return (
    <div className="xp-meter">
      <dl
        className="xp-meter__rows"
        style={{ visibility: hasEverReceived ? "visible" : "hidden" }}
      >
        {config.showBaseRate && (
          <Row label={labels.showBaseRate} value={formatNumber(stats.baseProjection)} />
        )}
        {config.showJobRate && (
          <Row label={labels.showJobRate} value={formatNumber(stats.jobProjection)} />
        )}
        {config.showBasePercent && (
          <Row
            label={labels.showBasePercent}
            value={formatPercent(stats.basePercent)}
          />
        )}
        {config.showJobPercent && (
          <Row
            label={labels.showJobPercent}
            value={formatPercent(stats.jobPercent)}
          />
        )}
        {config.showBaseEta && (
          <Row label={labels.showBaseEta} value={formatDuration(stats.baseEta)} />
        )}
        {config.showJobEta && (
          <Row label={labels.showJobEta} value={formatDuration(stats.jobEta)} />
        )}
      </dl>
      {!hasEverReceived && (
        <div className="xp-meter__waiting">Aguardando pacotes…</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
