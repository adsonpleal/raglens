// Map-only overlay window. Renders the per-map minimap PNG
// (fetched + cached on-demand from divine-pride.net by the Rust
// `map_image_cache` module) and draws the teleport history as SVG
// markers on top. The window's aspect tracks the loaded image's
// natural dimensions (which are 1:1 with the cell grid for the
// `/raw` variant), so cell coords map directly to image pixels —
// no inset or letterbox math needed.
//
// Owns no mutable cursor state of its own — listens to
// `lt:active-index-changed` from the controls window to decide
// which marker to highlight.

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAddonConfig } from "../../hooks/useAddonConfig";
import { getMapImagePath } from "../../lib/invoke";
import type { ClientInfo } from "../../lib/types";
import {
  LAST_TELEPORT_CONFIG_KEY,
  lastTeleportDefaultConfig,
  type MarkerShape,
} from "./config";
import { effectiveMapDimensions } from "./map-dimensions";
import type { ObservedBounds } from "./useTeleportHistory";
import { onActiveIndexChanged } from "./shared";
import { useTeleportHistory, type TeleportEntry } from "./useTeleportHistory";
import "./last-teleport-map.css";

// Window's longer axis in logical pixels at scale 1.0. Calibrated
// against the latamRO in-game minimap (Glast Heim, ~205 physical
// px wide at 2× DPI). Adjust if recalibrating for a different
// client/display.
const BASE_PX = 128;

type Props = {
  pid: number;
  client: ClientInfo | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LastTeleportMap({ pid, client: _client }: Props) {
  const config = useAddonConfig(
    LAST_TELEPORT_CONFIG_KEY,
    lastTeleportDefaultConfig,
  );
  const { history, current, mapBounds } = useTeleportHistory(
    pid,
    config.maxHistory,
  );
  // Reset to 0 (most recent) on every new teleport — same rule the
  // controls window uses, so the two windows stay in sync without
  // a handshake.
  const [activeIndex, setActiveIndex] = useState(0);
  const latestObservedAt = history.length > 0 ? history[0].observedAt : 0;
  useEffect(() => {
    setActiveIndex(0);
  }, [latestObservedAt]);

  // Prev/Next/shortcut presses on the controls window broadcast the
  // new index here so the highlighted marker tracks across windows.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    onActiveIndexChanged((evt) => {
      if (evt.pid !== pid || cancelled) return;
      setActiveIndex(evt.activeIndex);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [pid]);

  // Fetch + cache the minimap PNG for the current map. The Rust
  // command returns the on-disk path; `convertFileSrc` turns it
  // into an `asset://` URL the webview can load. Clearing
  // `imageUrl` synchronously on map change avoids a stale `<img>`
  // hanging on to the previous map's URL when the browser doesn't
  // see the src as new.
  const currentMap = current?.map ?? null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageNatural, setImageNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);
  useEffect(() => {
    setImageUrl(null);
    setImageNatural(null);
    if (!currentMap) return;
    let cancelled = false;
    getMapImagePath(currentMap)
      .then((path) => {
        if (cancelled) return;
        setImageUrl(path ? convertFileSrc(path) : null);
      })
      .catch(() => {
        if (cancelled) return;
        setImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentMap]);

  const markersToDraw = history.slice(
    0,
    Math.min(config.markersShown, history.length),
  );

  const markerScale = config.mapUiScale > 0 ? config.mapUiScale : 1;
  // Window dims = base × markerScale, with the shorter axis derived
  // from aspect. Aspect comes from the loaded PNG's pixel dimensions;
  // the cell-grid table is the fallback used only until the image
  // decodes (otherwise the window briefly flashes in the wrong shape).
  const targetSize = (() => {
    const base = Math.round(BASE_PX * markerScale);
    if (!currentMap) return { w: base, h: base };
    const aspect = imageNatural
      ? imageNatural.w / imageNatural.h
      : aspectFromCellGrid(currentMap, mapBounds[currentMap]);
    if (aspect >= 1) {
      return { w: base, h: Math.max(40, Math.round(base / aspect)) };
    }
    return { w: Math.max(40, Math.round(base * aspect)), h: base };
  })();
  const rootStyle = {
    "--lt-marker-scale": String(markerScale),
    "--lt-map-opacity": String(
      Math.max(0, Math.min(100, config.mapOpacity)) / 100,
    ),
  } as React.CSSProperties;

  // Drag-resize is disabled (manifest `resizable: false`), so this
  // effect is the ONLY path that changes the window's dimensions.
  useEffect(() => {
    void (async () => {
      try {
        const w = getCurrentWebviewWindow();
        await w.setSize(new LogicalSize(targetSize.w, targetSize.h));
      } catch (e) {
        console.warn("[lt-map] setSize failed:", e);
      }
    })();
  }, [targetSize.w, targetSize.h]);

  return (
    <div className="lt-map" style={rootStyle}>
      {imageUrl && (
        // `key` forces React to unmount the old <img> and mount a
        // fresh one when the map changes. Patching the same DOM
        // node's src has been unreliable — the visible image got
        // stuck on the previous map even after the new fetch
        // completed.
        <img
          key={currentMap ?? "none"}
          className="lt-map__image"
          src={imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setImageNatural({
                w: img.naturalWidth,
                h: img.naturalHeight,
              });
            }
          }}
        />
      )}

      {config.showOverlay && (
        <svg
          className="lt-map__markers"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {markersToDraw.map((entry, idx) => (
            <Marker
              key={`${entry.observedAt}-${idx}`}
              entry={entry}
              isActive={idx === activeIndex}
              shape={config.markerShape}
              size={config.markerSize * markerScale}
              ageRank={idx}
              total={markersToDraw.length}
              observed={mapBounds[entry.map]}
            />
          ))}
          {current && (
            <PlayerSquare
              entry={current}
              size={config.markerSize * markerScale}
              observed={mapBounds[current.map]}
            />
          )}
        </svg>
      )}
    </div>
  );
}

function aspectFromCellGrid(
  map: string,
  observed: ObservedBounds | undefined,
): number {
  const dims = effectiveMapDimensions(map, observed);
  return dims.width / dims.height;
}

type MarkerProps = {
  entry: TeleportEntry;
  isActive: boolean;
  shape: MarkerShape;
  size: number;
  ageRank: number;
  total: number;
  observed: ObservedBounds | undefined;
};

function Marker({
  entry,
  isActive,
  shape,
  size,
  ageRank,
  total,
  observed,
}: MarkerProps) {
  // Cell coords → SVG viewBox percentages. Ragnarok's (0, 0) is
  // bottom-left and the viewBox is y-down, so y is flipped. `/raw`
  // images are 1:1 with the cell grid, so percentages map directly
  // to image pixels.
  const { cx, cy } = cellToPct(entry, observed);
  const fade = total <= 1 ? 1 : 1 - (ageRank / total) * 0.5;
  const opacity = isActive ? 1 : fade;
  const className = `lt-map__marker${isActive ? " lt-map__marker--active" : ""}`;
  // viewBox is 0..100, so marker size is a fraction of the window's
  // longer axis. `BASE_PX` is the reference: at size=10 on a default
  // window, the marker is ~10/128 ≈ 8% wide.
  const r = (size / BASE_PX) * 50;

  if (shape === "dot") {
    // Single circle; CSS `paint-order: stroke fill` gives a black
    // halo (stroke painted first, colored fill on top).
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isActive ? r * 1.4 : r}
        className={`${className} lt-map__marker-fill`}
        strokeWidth={Math.max(1, r * 0.6)}
        opacity={opacity}
      />
    );
  }
  // Cross is line-based and `paint-order` can't help a stroke-only
  // shape, so render both arms twice: thick black outline first,
  // thin colored fill on top.
  const arm = (isActive ? r * 1.6 : r) * 1.1;
  const fillW = isActive ? 2 : 1.2;
  const arms = [
    { x1: cx - arm, y1: cy, x2: cx + arm, y2: cy },
    { x1: cx, y1: cy - arm, x2: cx, y2: cy + arm },
  ];
  return (
    <g className={className} opacity={opacity}>
      {arms.map((a, i) => (
        <line
          key={`o${i}`}
          {...a}
          strokeWidth={fillW + 1.6}
          className="lt-map__marker-outline"
        />
      ))}
      {arms.map((a, i) => (
        <line
          key={`f${i}`}
          {...a}
          strokeWidth={fillW}
          className="lt-map__marker-fill"
        />
      ))}
    </g>
  );
}

function PlayerSquare({
  entry,
  size,
  observed,
}: {
  entry: TeleportEntry;
  size: number;
  observed: ObservedBounds | undefined;
}) {
  const { cx, cy } = cellToPct(entry, observed);
  const half = (size / BASE_PX) * 50;
  return (
    <rect
      x={cx - half}
      y={cy - half}
      width={half * 2}
      height={half * 2}
      className="lt-map__player-square"
    />
  );
}

function cellToPct(
  entry: TeleportEntry,
  observed: ObservedBounds | undefined,
): { cx: number; cy: number } {
  const dims = effectiveMapDimensions(entry.map, observed);
  return {
    cx: clampPct((entry.x / dims.width) * 100),
    cy: clampPct(100 - (entry.y / dims.height) * 100),
  };
}

function clampPct(v: number): number {
  if (Number.isNaN(v)) return 50;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}
