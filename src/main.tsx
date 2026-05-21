import React from "react";
import ReactDOM from "react-dom/client";
import { MainWindow } from "./routes/MainWindow";
import { OverlayHost } from "./routes/OverlayHost";
import "./styles/main.css";

const params = new URLSearchParams(window.location.search);
const w = params.get("w");
const addonId = params.get("addon");
// Addons that own a second window declare it via
// manifest.secondaryEntryRoute. The framework spawns both webviews
// with the same `addon` param but different `view` — `primary`
// (default) or `secondary`. OverlayHost dispatches to the matching
// component based on this.
const view = params.get("view") === "secondary" ? "secondary" : "primary";

function Root() {
  if (w === "overlay" && addonId) {
    return <OverlayHost addonId={addonId} view={view} />;
  }
  return <MainWindow />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
