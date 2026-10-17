import { TILE_SIZE, project } from "@/print/tiles";

/**
 * Geography helpers for trip maps. Positions use the print renderer's own
 * Web-Mercator projection (src/print/tiles.ts) so fits match the printed map.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/**
 * Longitudes shifted (by ±360) so the points sit together on the shorter side
 * of the globe. A Los Angeles → Tokyo trip spans the Pacific (≈106°), not the
 * Atlantic (≈254°). Results may fall outside −180…180; the renderer wraps tiles.
 */
export function unwrapLongitudes(lngs: number[]): number[] {
  if (lngs.length < 2) return [...lngs];
  const norm = lngs.map((l) =>
    l >= -180 && l <= 180 ? l : ((((l + 180) % 360) + 360) % 360) - 180,
  );
  const sorted = [...norm].sort((a, b) => a - b);
  // The widest empty arc between neighbouring points; the map goes the other way.
  let gap = sorted[0]! + 360 - sorted[sorted.length - 1]!;
  let start = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i]! - sorted[i - 1]!;
    if (g > gap) {
      gap = g;
      start = sorted[i]!;
    }
  }
  return norm.map((l) => (l < start ? l + 360 : l));
}

/** World pixels at zoom 0 (a 512px world). */
export function toWorld0(lng: number, lat: number) {
  const p = project(lng, lat, 0);
  // project() maps −180…180 into 0…512; keep unwrapped longitudes continuous.
  return { x: ((lng + 180) / 360) * TILE_SIZE, y: p.y };
}

export function fromWorld0(x: number, y: number): LngLat {
  const lng = (x / TILE_SIZE) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / TILE_SIZE;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lng: ((((lng + 180) % 360) + 360) % 360) - 180, lat };
}

/** Great-circle distance in km. */
export function haversineKm(a: LngLat, b: LngLat) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
