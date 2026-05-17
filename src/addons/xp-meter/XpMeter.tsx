import { useMemo } from "react";
import {
  DEFAULT_WINDOW_MS,
  etaToNextLevelMs,
  formatDuration,
  formatNumber,
  formatPercent,
  percentPerMinute,
  xpPerMinute,
} from "./format";
import { useXpEvents } from "./useXpEvents";
import "./xp-meter.css";

export function XpMeter() {
  const { samples, latest, hasEverReceived } = useXpEvents();
  const now = Date.now();

  const stats = useMemo(() => {
    const baseRate = xpPerMinute(samples, "base", now, DEFAULT_WINDOW_MS);
    const jobRate = xpPerMinute(samples, "job", now, DEFAULT_WINDOW_MS);
    const baseLevelTotal = latest?.level_total_exp ?? 0;
    const basePercent = percentPerMinute(samples, "base", now, baseLevelTotal);
    // We don't have a job-level total yet — placeholder until a decoder
    // surfaces ZC_LONGPAR_CHANGE / equivalent.
    const eta = etaToNextLevelMs(baseRate, Math.max(0, baseLevelTotal));
    return { baseRate, jobRate, basePercent, eta };
  }, [samples, latest, now]);

  return (
    <div className="xp-meter">
      <div className="xp-meter__title">Medidor de Experiência</div>
      {!hasEverReceived && (
        <div className="xp-meter__waiting">
          Aguardando primeiro pacote de experiência…
        </div>
      )}
      <dl className="xp-meter__rows">
        <Row label="XP base/min" value={formatNumber(stats.baseRate)} />
        <Row label="XP job/min" value={formatNumber(stats.jobRate)} />
        <Row label="%/min" value={formatPercent(stats.basePercent)} />
        <Row label="ETA próximo nível" value={formatDuration(stats.eta)} />
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
