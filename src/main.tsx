import React from "react";
import ReactDOM from "react-dom/client";
import { MainWindow } from "./routes/MainWindow";
import { OverlayHost } from "./routes/OverlayHost";
import "./styles/main.css";

const params = new URLSearchParams(window.location.search);
const w = params.get("w");
const addonId = params.get("addon");
const pidStr = params.get("pid");
const pid = pidStr ? parseInt(pidStr, 10) : NaN;

function Root() {
  if (w === "overlay" && addonId && Number.isFinite(pid)) {
    return <OverlayHost addonId={addonId} pid={pid} />;
  }
  return <MainWindow />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
