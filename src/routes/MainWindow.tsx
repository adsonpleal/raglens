import { useState } from "react";
import { AddonRow } from "../components/AddonRow";
import { AddonSettingsModal } from "../components/AddonSettingsModal";
import { ClientPicker } from "../components/ClientPicker";
import { NicPicker } from "../components/NicPicker";
import { UpdateBanner } from "../components/UpdateBanner";
import { useAddonShortcuts } from "../hooks/useAddonShortcuts";
import { useAddonState } from "../hooks/useAddonState";
import { useCaptureSession } from "../hooks/useCaptureSession";
import { useClients } from "../hooks/useClients";
import { useLatestRelease } from "../hooks/useLatestRelease";
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
  const { clients, selectedPid, selectOne, followAll } =
    useClients(isRecording);
  const {
    manifests,
    enabled,
    locked,
    alwaysVisible,
    shortcuts,
    toggle,
    setOneLocked,
    setOneAlwaysVisible,
    setOneShortcut,
    lockAll,
    unlockAll,
    allLocked,
  } = useAddonState();

  // Register process-wide keyboard shortcuts for every enabled
  // addon that has one configured. The hook handles registering /
  // unregistering as the map changes.
  useAddonShortcuts(shortcuts);

  const { available: updateAvailable, dismiss: dismissUpdate } =
    useLatestRelease();

  const [settingsAddonId, setSettingsAddonId] = useState<string | null>(null);

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
        {updateAvailable && (
          <UpdateBanner
            release={updateAvailable}
            onDismiss={dismissUpdate}
          />
        )}
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
            <h2>{t.clients.title}</h2>
            {selectedPid !== null && (
              <button className="ghost" onClick={followAll}>
                {t.clients.followAll}
              </button>
            )}
          </div>
          {isRecording ? (
            <ClientPicker
              clients={clients}
              selectedPid={selectedPid}
              onSelect={selectOne}
              emptyMessage={t.clients.empty}
            />
          ) : (
            <p className="muted">{t.clients.inactive}</p>
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
                alwaysVisible={alwaysVisible.get(a.id) ?? false}
                onToggle={() => toggle(a)}
                onLockToggle={(v) => setOneLocked(a.id, v)}
                onAlwaysVisibleToggle={(v) => setOneAlwaysVisible(a.id, v)}
                onConfigure={() => setSettingsAddonId(a.id)}
              />
            ))}
          </ul>
        </section>

        {error && <div className="error-banner">{error}</div>}
      </main>

      <AddonSettingsModal
        addonId={settingsAddonId}
        currentShortcut={
          settingsAddonId ? shortcuts.get(settingsAddonId) : undefined
        }
        onSaveShortcut={setOneShortcut}
        onClose={() => setSettingsAddonId(null)}
      />
    </div>
  );
}
