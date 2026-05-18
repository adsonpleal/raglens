import { useEffect, useMemo, useState } from "react";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import type { ClientInfo } from "../../lib/types";
import { xpMeterDefaultConfig } from "./config";
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

// `client` is still accepted for API compatibility with OverlayHost,
// but the XP meter no longer renders the character name — the user
// already knows which client they selected.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function XpMeter({ pid, client: _client }: Props) {
  const { samples, totals, hasEverReceived } = useXpEvents(pid);
  const config = useAddonConfig("xp-meter", xpMeterDefaultConfig);

  // Re-render every second so the rolling-window calcs stay fresh
  // even when no new packet has arrived.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const baseRate = xpPerMinute(samples, "base", now, DEFAULT_WINDOW_MS);
    const jobRate = xpPerMinute(samples, "job", now, DEFAULT_WINDOW_MS);
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
        ? (baseRate / totals.nextBase) * 100
        : NaN;
    const jobPercent =
      totals.nextJob && totals.nextJob > 0
        ? (jobRate / totals.nextJob) * 100
        : NaN;
    const baseEta =
      baseRemaining !== null
        ? etaToNextLevelMs(baseRate, baseRemaining)
        : Number.POSITIVE_INFINITY;
    const jobEta =
      jobRemaining !== null
        ? etaToNextLevelMs(jobRate, jobRemaining)
        : Number.POSITIVE_INFINITY;
    return { baseRate, jobRate, basePercent, jobPercent, baseEta, jobEta };
  }, [samples, totals, now]);

  return (
    <div className="xp-meter">
      {!hasEverReceived && (
        <div className="xp-meter__waiting">
          Aguardando primeiro pacote de experiência…
        </div>
      )}
      <dl className="xp-meter__rows">
        {config.showBaseRate && (
          <Row label="XP base/min" value={formatNumber(stats.baseRate)} />
        )}
        {config.showJobRate && (
          <Row label="XP job/min" value={formatNumber(stats.jobRate)} />
        )}
        {config.showBasePercent && (
          <Row label="% base/min" value={formatPercent(stats.basePercent)} />
        )}
        {config.showJobPercent && (
          <Row label="% job/min" value={formatPercent(stats.jobPercent)} />
        )}
        {config.showBaseEta && (
          <Row label="ETA base" value={formatDuration(stats.baseEta)} />
        )}
        {config.showJobEta && (
          <Row label="ETA job" value={formatDuration(stats.jobEta)} />
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
