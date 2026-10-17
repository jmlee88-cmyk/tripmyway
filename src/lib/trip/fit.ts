import type { PrintSize } from "@/types/product";
import { DESIGN_WIDTH, effectiveZoom } from "@/components/map/build-map-style";
import {
  TRIP_LAYOUT,
  cqwToIn,
  posterHeight,
  tripMapRect,
  tripMarkerIn,
} from "@/components/poster/poster-layout";
import { TRIP, minFramingZoomFor } from "@/config/trip";
import { type LngLat, fromWorld0, toWorld0, unwrapLongitudes } from "./geo";

/**
 * FIT: frame a set of stops on one trip map and say whether it works. The
 * test is plain geometry (accuracy principle), never an AI judgement:
 *  - "too-spread-out": the map would zoom out past the style's minimum;
 *  - "too-close": two stop markers would collide at this print size;
 *  - "too-much-water": the map would be mostly open sea (needs `waterShare`).
 */
export type FitProblem = "too-spread-out" | "too-close" | "too-much-water";

export interface PanelFit {
  /** Map centre (−180…180). */
  center: LngLat;
  /** Framing zoom, the scale of ZOOM_LEVELS. */
  framingZoom: number;
  /** Zoom on the DESIGN_WIDTH canvas, as the renderer uses it. */
  zoom: number;
  fits: boolean;
  problems: FitProblem[];
  /** The map window in inches. */
  mapIn: { w: number; h: number };
  /** Each stop's position in the map window, in inches from its top-left. */
  positionsIn: { x: number; y: number }[];
  /** Closest pair of stops, in inches (Infinity for one stop). */
  minSeparationIn: number;
  markerIn: number;
}

export interface FitOptions {
  /** Share (0–1) of this framing that is open water; from the map tiles. */
  waterShare?: (fit: Omit<PanelFit, "fits" | "problems">) => number | undefined;
  /** Ignore the minimum zoom (overview maps). */
  ignoreMinZoom?: boolean;
}

/** Effective zoom = framing zoom + this. */
const FRAMING_OFFSET = effectiveZoom(0);

/**
 * Frame points in a map window `mapIn` inches across, drawn (like every map)
 * on a DESIGN_WIDTH-wide canvas. Keeps `padding` (fraction of each side) free.
 * Used for trip panels and for the small whole-trip overview.
 */
export function frameInWindow(
  points: LngLat[],
  mapIn: { w: number; h: number },
  padding: number,
  maxZoom = effectiveZoom(TRIP.maxFramingZoom),
) {
  if (points.length === 0) throw new RangeError("A map needs at least one stop.");
  const W = DESIGN_WIDTH;
  const H = (DESIGN_WIDTH * mapIn.h) / mapIn.w;
  const inPerPx = mapIn.w / W;
  const lngs = unwrapLongitudes(points.map((p) => p.lng));
  const world = points.map((p, i) => toWorld0(lngs[i]!, p.lat));
  const xs = world.map((w) => w.x);
  const ys = world.map((w) => w.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const dx = maxX - minX,
    dy = maxY - minY;
  const zx = dx > 0 ? Math.log2((W * (1 - 2 * padding)) / dx) : Infinity;
  const zy = dy > 0 ? Math.log2((H * (1 - 2 * padding)) / dy) : Infinity;
  const zoom = Math.min(zx, zy, maxZoom);
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const scale = 2 ** zoom;
  const positionsIn = world.map((w) => ({
    x: mapIn.w / 2 + (w.x - cx) * scale * inPerPx,
    y: mapIn.h / 2 + (w.y - cy) * scale * inPerPx,
  }));
  return { center: fromWorld0(cx, cy), zoom, framingZoom: zoom - FRAMING_OFFSET, positionsIn };
}

export function fitStops(
  points: LngLat[],
  size: Pick<PrintSize, "widthIn" | "heightIn">,
  styleId: string,
  opts: FitOptions = {},
): PanelFit {
  const rect = tripMapRect(posterHeight(size.widthIn, size.heightIn));
  const mapIn = { w: cqwToIn(rect.width, size.widthIn), h: cqwToIn(rect.height, size.widthIn) };
  const { center, zoom, framingZoom, positionsIn } = frameInWindow(
    points,
    mapIn,
    TRIP_LAYOUT.fitPadding,
  );

  let minSeparationIn = Infinity;
  for (let i = 0; i < positionsIn.length; i++)
    for (let j = i + 1; j < positionsIn.length; j++)
      minSeparationIn = Math.min(
        minSeparationIn,
        Math.hypot(positionsIn[i]!.x - positionsIn[j]!.x, positionsIn[i]!.y - positionsIn[j]!.y),
      );

  const markerIn = tripMarkerIn(size.widthIn);
  const base = { center, framingZoom, zoom, mapIn, positionsIn, minSeparationIn, markerIn };

  const problems: FitProblem[] = [];
  if (!opts.ignoreMinZoom && framingZoom < minFramingZoomFor(styleId) - 1e-9)
    problems.push("too-spread-out");
  if (minSeparationIn < markerIn * TRIP.minStopSeparation) problems.push("too-close");
  const water = opts.waterShare?.(base);
  if (water !== undefined && water > TRIP.maxWaterShare) problems.push("too-much-water");

  return { ...base, fits: problems.length === 0, problems };
}
