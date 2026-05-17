import { AddonRow } from "../components/AddonRow";
import { ConnectionPicker } from "../components/ConnectionPicker";
import { NicPicker } from "../components/NicPicker";
import { useAddonState } from "../hooks/useAddonState";
import { useCaptureSession } from "../hooks/useCaptureSession";
import { useConnections } from "../hooks/useConnections";
import { t } from "../i18n/pt-br";

export function MainWindow() {
  const {
    interfaces,
    selectedIp,
    setSelectedIp,
    status,
    stats,
    error,
    start,
    stop,
  } = useCaptureSession();
  const isRecording = status === "recording";
  const { connections, selected, selectOne, followAll } =
    useConnections(isRecording);
  const {
    manifests,
    enabled,
    locked,
    toggle,
    setOne,
    lockAll,
    unlockAll,
    allLocked,
  } = useAddonState();

  const statusKey = isRecording ? "recording" : "idle";
  const statsLine = t.capture.statsTemplate
    .replace("{seen}", stats.packets_seen.toLocaleString("pt-BR"))
    .replace("{matched}", stats.matched.toLocaleString("pt-BR"));

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appName}</h1>
        <span className={`status-pill status-${statusKey}`}>
          {t.status[statusKey]}
        </span>
      </header>
      <main className="app-main">
        <section className="card">
          <h2>{t.capture.network}</h2>
          <div className="capture-row">
            <NicPicker
              interfaces={interfaces}
              selectedIp={selectedIp}
              onSelect={setSelectedIp}
              disabled={isRecording}
            />
            {!isRecording ? (
              <button
                className="primary"
                onClick={start}
                disabled={!selectedIp}
              >
                {t.capture.start}
              </button>
            ) : (
              <button className="danger" onClick={stop}>
                {t.capture.stop}
              </button>
            )}
          </div>
          {isRecording && <p className="muted capture-stats">{statsLine}</p>}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t.connections.title}</h2>
            {selected && (
              <button className="ghost" onClick={followAll}>
                {t.connections.followAll}
              </button>
            )}
          </div>
          {isRecording ? (
            <ConnectionPicker
              connections={connections}
              selected={selected}
              onSelect={selectOne}
              emptyMessage={t.connections.empty}
            />
          ) : (
            <p className="muted">{t.connections.inactive}</p>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>{t.addons.title}</h2>
            <button
              className="ghost"
              onClick={allLocked ? unlockAll : lockAll}
              disabled={enabled.size === 0}
            >
              {allLocked ? t.addons.unlockAll : t.addons.lockAll}
            </button>
          </div>
          <ul className="addon-list">
            {manifests.map((a) => (
              <AddonRow
                key={a.id}
                manifest={a}
                enabled={enabled.has(a.id)}
                locked={locked.get(a.id) ?? false}
                onToggle={() => toggle(a)}
                onLockToggle={(v) => setOne(a.id, v)}
              />
            ))}
          </ul>
        </section>

        {error && <div className="error-banner">{error}</div>}
      </main>
    </div>
  );
}
