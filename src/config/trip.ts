/**
 * Rules for fitting a trip onto prints. Data only; the engine is src/lib/trip.
 *
 * Zooms here are FRAMING zooms, the same scale as ZOOM_LEVELS in
 * config/products.ts (defined for a 520px-wide map; "City" is 12.2,
 * "Regional" 10.3). For scale: framing zoom 3.5 shows roughly 3,000 km across, 4 about 2,000 km,
 * 5 about 1,000 km, 6 about 500 km.
 */
export const TRIP = {
  maxStops: 7,
  /** Most prints one trip may be split into (2 = diptych, 3 = triptych). */
  maxPanels: 3,

  /**
   * The furthest a trip map may zoom out before it stops looking like a
   * detailed map. Below this the trip is split. 3.5 ≈ 3,000 km across: a
   * coast-to-coast US trip splits, Denver → San Francisco fits.
   * PLACEHOLDER: tune against real renders of each style.
   */
  minFramingZoom: 3.5,
  /** Per-style override of minFramingZoom, by MapStyle id. */
  minFramingZoomByStyle: {} as Record<string, number>,
  /** The closest a trip map zooms in (a single stop, or stops in one town). */
  maxFramingZoom: 12.2,

  /** Two stop markers must be at least this many marker diameters apart. */
  minStopSeparation: 1.25,

  /**
   * Most of a map that may be open water before the trip is split at its
   * longest leg (e.g. Los Angeles → Tokyo). Needs a water estimate from the
   * map tiles; see `waterShare` in src/lib/trip/plan.ts.
   */
  maxWaterShare: 0.6,

  /** Customer photos (upload: src/lib/photos.ts; rules: src/lib/trip/photos.ts). */
  photo: {
    /** Fewest pixels per printed inch across a photo's circle; below it the photo is refused. */
    minPpi: 150,
    /** Photos are stored with their long side at most this many pixels (far above print needs). */
    maxLongPx: 3000,
    jpegQuality: 0.9,
    /** Largest upload the server accepts, after the browser has resized it. */
    maxUploadBytes: 8_000_000,
    /** Furthest a customer may zoom into a photo when choosing what shows in the circle. */
    maxZoom: 4,
  },
} as const;

export function minFramingZoomFor(styleId: string): number {
  return TRIP.minFramingZoomByStyle[styleId] ?? TRIP.minFramingZoom;
}
