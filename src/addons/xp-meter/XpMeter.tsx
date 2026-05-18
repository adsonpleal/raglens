import { useEffect, useMemo, useState } from "react";
import type { ClientInfo } from "../../lib/types";
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

export function XpMeter({ pid, client }: Props) {
  const { samples, totals, hasEverReceived } = useXpEvents(pid);

  // Re-render every second so the rolling-window calcs stay fresh even
  // when no new packet has arrived. Cheap (a single state tick).
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

  const title = client?.name ?? `Cliente · PID ${pid}`;

  return (
    <div className="xp-meter">
      <div className="xp-meter__title">{title}</div>
      {!hasEverReceived && (
        <div className="xp-meter__waiting">
          Aguardando primeiro pacote de experiência…
        </div>
      )}
      <dl className="xp-meter__rows">
        <Row label="XP base/min" value={formatNumber(stats.baseRate)} />
        <Row label="XP job/min" value={formatNumber(stats.jobRate)} />
        <Row label="% base/min" value={formatPercent(stats.basePercent)} />
        <Row label="% job/min" value={formatPercent(stats.jobPercent)} />
        <Row label="ETA base" value={formatDuration(stats.baseEta)} />
        <Row label="ETA job" value={formatDuration(stats.jobEta)} />
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
