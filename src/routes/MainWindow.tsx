import { t } from "../i18n/pt-br";

export function MainWindow() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appName}</h1>
        <span className="status-pill status-idle">{t.status.idle}</span>
      </header>
      <main className="app-main">
        <p className="app-placeholder">{t.placeholder}</p>
      </main>
    </div>
  );
}
