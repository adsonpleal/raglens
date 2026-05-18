import { useEffect, useMemo, useState } from "react";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import type { ClientInfo } from "../../lib/types";
import { xpMeterDefaultConfig, xpMeterRowLabels } from "./config";
import {
  DEFAULT_WINDOW_MS,
  etaToNextLevelMs,
  formatDuration,
  formatNumber,
  formatPercent,
  xpPerMinute,
} from "./format";
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
    // The underlying mean is always computed over a fixed 1-minute
    // window — that's the value with stable statistical meaning. The
    // window picker is purely a display multiplier: "XP base/5min" =
    // (XP/min) * 5, i.e. a projection of what the last minute's pace
    // would yield over 5 minutes. ETA is independent of the
    // multiplier — "minutes until level" doesn't change just because
    // we phrased the rate differently.
    const basePerMin = xpPerMinute(samples, "base", now, DEFAULT_WINDOW_MS);
    const jobPerMin = xpPerMinute(samples, "job", now, DEFAULT_WINDOW_MS);
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

  return (
    <div className="xp-meter">
      {!hasEverReceived && (
        <div className="xp-meter__waiting">
          Aguardando primeiro pacote de experiência…
        </div>
      )}
      <dl className="xp-meter__rows">
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
