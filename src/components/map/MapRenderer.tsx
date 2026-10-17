import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { Location, MapStyleConfig } from "@/types/product";
import { DESIGN_WIDTH, buildMapStyle, effectiveZoom } from "./build-map-style";
import { DemoMapArt } from "./DemoMapArt";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapRenderer — the single seam between product UI and the geographic engine.
 * Inputs: location, zoom, style. Output: a static, non-interactive map.
 * Currently MapLibre GL over OpenStreetMap vector tiles; replace internals to
 * switch to Mapbox GL or a server-rendered image without touching callers.
 *
 * The map is always laid out on a fixed DESIGN_WIDTH canvas and scaled to fit
 * its container, so every preview (thumbnail, editor, "view larger", and the
 * future print render) shows the same composition at the same tile zoom. That
 * matters because OpenMapTiles only carries side streets from zoom 13 up: a
 * small preview laid out at its own pixel size would fetch low-zoom tiles that
 * contain no residential streets at all. `pixelRatio` keeps the GPU drawing at
 * the container's real resolution, so the scale-down costs nothing and lines
 * stay crisp.
 */
export interface MapRendererProps {
  location: Location;
  zoom: number;
  style: MapStyleConfig;
  className?: string;
  onReady?: () => void;
}

interface Fit {
  scale: number;
  designHeight: number;
}

function measure(el: HTMLElement): Fit {
  const w = Math.max(el.clientWidth, 1);
  const h = Math.max(el.clientHeight, 1);
  const scale = w / DESIGN_WIDTH;
  return { scale, designHeight: h / scale };
}

function devicePixelRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

export function MapRenderer({ location, zoom, style, className, onReady }: MapRendererProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fit, setFit] = useState<Fit | null>(null);
  const latest = useRef({ location, zoom, style });
  latest.current = { location, zoom, style };

  // Track the container size; the map canvas is sized from it.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setFit(measure(el));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = fit !== null;

  // Create once (browser only — maplibre is dynamically imported for SSR safety)
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("maplibre-gl");
        const maplibre = mod.default ?? mod;
        const workerUrl = (await import("maplibre-gl/dist/maplibre-gl-worker.mjs?url")).default;
        maplibre.setWorkerUrl?.(workerUrl);
        if (cancelled || !ref.current || !outerRef.current) return;
        const { location: l, zoom: z, style: s } = latest.current;
        const { scale } = measure(outerRef.current);
        const map = new maplibre.Map({
          container: ref.current,
          style: buildMapStyle(s),
          center: [l.longitude, l.latitude],
          zoom: effectiveZoom(z),
          pixelRatio: scale * devicePixelRatio(),
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
        });
        mapRef.current = map;
        map.on("idle", () => {
          setLoading(false);
          onReady?.();
        });
        map.on("error", (e: any) => {
          const msg = String(e.error?.message ?? "");
          console.warn("[map]", msg);
          // A worker failure is fatal and async (never reaches the catch below):
          // without this the poster renders blank instead of falling back.
          if (/worker/i.test(msg) && !cancelled) setFailed(true);
        });
      } catch (err) {
        console.warn("[map] falling back to demo renderer", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keep the canvas resolution matched to the on-screen size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit) return;
    map.setPixelRatio(fit.scale * devicePixelRatio());
    map.resize();
  }, [fit]);

  useEffect(() => {
    mapRef.current?.setStyle(buildMapStyle(style));
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setLoading(true);
    map.easeTo({
      center: [location.longitude, location.latitude],
      zoom: effectiveZoom(zoom),
      duration: 700,
    });
  }, [location.latitude, location.longitude, zoom]);

  if (failed) return <DemoMapArt config={style} className={className ?? ""} seed={Math.round(Math.abs(location.latitude * 100))} />;

  return (
    <div ref={outerRef} className={className} style={{ position: "relative", overflow: "hidden", background: style.background }}>
      {fit && (
        <div
          ref={ref}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: DESIGN_WIDTH,
            height: fit.designHeight,
            transform: `scale(${fit.scale})`,
            transformOrigin: "0 0",
          }}
        />
      )}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, background: style.background, opacity: loading ? 0.35 : 0, transition: "opacity 400ms ease", pointerEvents: "none" }}
      />
    </div>
  );
}
