import { useEffect, useMemo, useState } from "react";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import type { ClientInfo } from "../../lib/types";
import { xpMeterDefaultConfig, xpMeterRowLabels } from "./config";
import {
  etaToNextLevelMs,
  formatDuration,
  formatNumber,
  formatPercent,
  xpInWindow,
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
    // Values displayed match the label: "XP base/5min" = XP gained in
    // the last 5 min. ETA still computes against the per-minute rate
    // implied by that window, since "time until level" is a duration
    // independent of how we phrase the rate.
    const baseInWindow = xpInWindow(samples, "base", now, config.windowMs);
    const jobInWindow = xpInWindow(samples, "job", now, config.windowMs);

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
        ? (baseInWindow / totals.nextBase) * 100
        : NaN;
    const jobPercent =
      totals.nextJob && totals.nextJob > 0
        ? (jobInWindow / totals.nextJob) * 100
        : NaN;

    const basePerMin = (baseInWindow / config.windowMs) * 60_000;
    const jobPerMin = (jobInWindow / config.windowMs) * 60_000;

    const baseEta =
      baseRemaining !== null
        ? etaToNextLevelMs(basePerMin, baseRemaining)
        : Number.POSITIVE_INFINITY;
    const jobEta =
      jobRemaining !== null
        ? etaToNextLevelMs(jobPerMin, jobRemaining)
        : Number.POSITIVE_INFINITY;

    return {
      baseInWindow,
      jobInWindow,
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
          <Row label={labels.showBaseRate} value={formatNumber(stats.baseInWindow)} />
        )}
        {config.showJobRate && (
          <Row label={labels.showJobRate} value={formatNumber(stats.jobInWindow)} />
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
