import type { PrintSize } from "@/types/product";
import { TRIP } from "@/config/trip";
import { type FitOptions, type PanelFit, fitStops } from "./fit";
import { type LngLat, haversineKm } from "./geo";

/**
 * PLAN: one print for the whole trip if it fits; otherwise the fewest panels
 * (up to TRIP.maxPanels), each a consecutive leg of the trip, that all fit.
 * Deterministic: the agent may explain a plan, never invent one.
 *
 * Among workable splits of the same size it prefers panels at similar scales
 * (no lone close-up beside country-wide maps), then cutting at the longest
 * legs (where the trip jumps: an ocean, a flight), then the most even zooms.
 */
export interface PlannedPanel {
  /** Stops start…end−1 of the trip. */
  start: number;
  end: number;
  fit: PanelFit;
}

export interface TripBreak {
  /** Index of the last stop before the break. */
  after: number;
  /** Great-circle distance of the leg that crosses the break. */
  km: number;
}

export interface TripPlan {
  panels: PlannedPanel[];
  /** False when even TRIP.maxPanels panels can't all fit: the best attempt is returned. */
  fits: boolean;
  breaks: TripBreak[];
  /** Whole-route overview map: present whenever there is more than one panel or the trip doesn't fit. */
  overview: PanelFit | null;
}

/** Every way to cut `n` stops into `k` consecutive, non-empty legs (as cut positions). */
export function consecutiveSplits(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (from: number, left: number, acc: number[]) => {
    if (left === 0) {
      out.push(acc);
      return;
    }
    for (let c = from; c <= n - left; c++) walk(c + 1, left - 1, [...acc, c]);
  };
  if (k >= 1 && k <= n) walk(1, k - 1, []);
  return out;
}

interface Candidate {
  panels: PlannedPanel[];
  failing: number;
  cutKm: number;
  zoomSpread: number;
}

export function planTrip(
  points: LngLat[],
  size: Pick<PrintSize, "widthIn" | "heightIn">,
  styleId: string,
  opts: FitOptions = {},
): TripPlan {
  if (points.length === 0) throw new RangeError("A trip needs at least one stop.");
  if (points.length > TRIP.maxStops)
    throw new RangeError(`A trip can have at most ${TRIP.maxStops} stops.`);

  const legKm = points.slice(1).map((p, i) => haversineKm(points[i]!, p));
  const maxPanels = Math.min(TRIP.maxPanels, points.length);

  let best: Candidate | null = null;
  for (let k = 1; k <= maxPanels; k++) {
    let bestOfK: Candidate | null = null;
    for (const cuts of consecutiveSplits(points.length, k)) {
      const bounds = [0, ...cuts, points.length];
      const panels = bounds.slice(1).map((end, i) => {
        const start = bounds[i]!;
        return { start, end, fit: fitStops(points.slice(start, end), size, styleId, opts) };
      });
      const zooms = panels.map((p) => p.fit.framingZoom);
      const c: Candidate = {
        panels,
        failing: panels.filter((p) => !p.fit.fits).length,
        cutKm: cuts.reduce((s, cut) => s + legKm[cut - 1]!, 0),
        zoomSpread: Math.max(...zooms) - Math.min(...zooms),
      };
      if (!bestOfK || better(c, bestOfK)) bestOfK = c;
    }
    if (bestOfK && bestOfK.failing === 0) {
      best = bestOfK;
      break;
    }
    // Nothing of this size fits: remember the attempt with the fewest failing panels.
    if (bestOfK && (!best || bestOfK.failing < best.failing)) best = bestOfK;
  }

  const chosen = best!;
  const fits = chosen.failing === 0;
  const breaks = chosen.panels
    .slice(1)
    .map((p) => ({ after: p.start - 1, km: legKm[p.start - 1]! }));
  const overview =
    chosen.panels.length > 1 || !fits
      ? fitStops(points, size, styleId, { ignoreMinZoom: true })
      : null;
  return { panels: chosen.panels, fits, breaks, overview };
}

/** Zoom differences within one step count as "similar scale" (one step ≈ 2.8× in scale). */
const ZOOM_STEP = 1.5;

function better(a: Candidate, b: Candidate) {
  if (a.failing !== b.failing) return a.failing < b.failing;
  const sa = Math.floor(a.zoomSpread / ZOOM_STEP),
    sb = Math.floor(b.zoomSpread / ZOOM_STEP);
  if (sa !== sb) return sa < sb;
  if (Math.abs(a.cutKm - b.cutKm) > 1) return a.cutKm > b.cutKm;
  return a.zoomSpread < b.zoomSpread;
}

/**
 * The plan at each print size, smallest first, so the site (and the agent) can
 * offer "fits on one print from 12 × 18 up" before suggesting a split.
 */
export function plansBySize<S extends Pick<PrintSize, "id" | "widthIn" | "heightIn">>(
  points: LngLat[],
  sizes: readonly S[],
  styleId: string,
  opts: FitOptions = {},
): { size: S; plan: TripPlan }[] {
  return [...sizes]
    .sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn)
    .map((size) => ({ size, plan: planTrip(points, size, styleId, opts) }));
}
