import type { Customization, MapStyleConfig, PosterLayout } from "@/types/product";

/**
 * Poster geometry shared by the on-screen preview (PosterPreview) and the print
 * renderer (src/print). Every length is in "cqw": percent of the poster's
 * width, so the composition is identical at any size — a 300px thumbnail, the
 * editor preview, or a 24×36in print. Change the design here, not in either
 * renderer, or the print will drift from what the customer approved.
 */
export const LAYOUT = {
  /** Map window inset from the poster's left, right and top edges. */
  mapInset: 6,
  /** Height of the text band at the bottom of the poster (below the map). */
  textBandHeight: 30,
  /** Horizontal padding of the text band (matches mapInset). */
  textInset: 6,

  title: { size: 6.4, lineHeight: 1.1 },
  /** Gap between title and subtitle when there is no rule. */
  plainGap: 2.4,
  /** Short accent rule between title and subtitle (bordered styles). */
  rule: { width: 10, thickness: 0.12, marginTop: 2.6, marginBottom: 2.2, opacity: 0.7 },
  subtitle: { size: 2.3, tracking: 0.3, lineHeight: 1.3 },
  footer: { size: 1.7, tracking: 0.22, lineHeight: 1.3, marginTop: 1.8, opacity: 0.8 },
  /** Separator between the date and the coordinates on the footer line. */
  footerSeparator: " · ",

  /** Required OpenStreetMap / OpenMapTiles credit, in the bottom margin. */
  attribution: {
    text: "Map data © OpenStreetMap contributors · openstreetmap.org/copyright · © OpenMapTiles",
    size: 0.62,
    tracking: 0.08,
    /** Distance from the poster's bottom edge to the text baseline. */
    baselineFromBottom: 2.4,
    opacity: 0.55,
  },

  border: {
    hairline: { inset: 3.6, width: 0.15, opacity: 0.5 },
    double: {
      outer: { inset: 3.4, width: 0.35, opacity: 0.75 },
      inner: { inset: 4.4, width: 0.12, opacity: 0.6 },
    },
  },

  grid: { spacing: 11, width: 0.2, opacity: 0.12 },

  marker: {
    /** Ring-and-dot marker, centred on the location. viewBox 40×40. */
    dot: { width: 6, viewBox: 40 },
    /** Teardrop pin with its tip on the location. viewBox 30×48. */
    pin: { width: 4.6, viewBoxWidth: 30, viewBoxHeight: 48 },
  },
} as const;

export const PIN_PATH =
  "M15 1.5c7.5 0 13.5 6 13.5 13.4C28.5 25 15 46.5 15 46.5S1.5 25 1.5 14.9C1.5 7.5 7.5 1.5 15 1.5z";

/** Height of the poster in cqw for a given print size (width is always 100). */
export function posterHeight(widthIn: number, heightIn: number) {
  return (100 * heightIn) / widthIn;
}

export function posterLayout(c: Pick<Customization, "layout">): PosterLayout {
  return c.layout ?? "framed";
}

/**
 * The map window, in cqw, for a poster of the given height (in cqw). Framed:
 * inset from the top, left and right. Full bleed: flush with those edges.
 * Either way the text band sits below it.
 */
export function mapRect(heightCqw: number, layout: PosterLayout = "framed") {
  const inset = layout === "fullBleed" ? 0 : LAYOUT.mapInset;
  return {
    x: inset,
    y: inset,
    width: 100 - inset * 2,
    height: heightCqw - inset - LAYOUT.textBandHeight,
  };
}

/**
 * The area to draw the map into for print: the map window, extended by the
 * bleed on every side that touches the trim edge, so the map (not the paper
 * colour) runs past the cut. All values in cqw.
 */
export function mapDrawRect(rect: ReturnType<typeof mapRect>, heightCqw: number, bleedCqw: number) {
  const eps = 1e-9;
  const left = rect.x <= eps ? bleedCqw : 0;
  const top = rect.y <= eps ? bleedCqw : 0;
  const right = rect.x + rect.width >= 100 - eps ? bleedCqw : 0;
  const bottom = rect.y + rect.height >= heightCqw - eps ? bleedCqw : 0;
  return {
    x: rect.x - left,
    y: rect.y - top,
    width: rect.width + left + right,
    height: rect.height + top + bottom,
  };
}

/** Frame borders belong to the framed layout; edge-to-edge prints have none. */
export function showsFrame(style: MapStyleConfig, layout: PosterLayout) {
  return layout === "framed" && style.border !== "none";
}

export function applyCase(c: Customization, s: string) {
  return c.textCase === "upper" ? s.toUpperCase() : s;
}

export function footerLine(c: Customization) {
  return [c.date, c.showCoordinates ? c.coordinates : ""]
    .filter(Boolean)
    .join(LAYOUT.footerSeparator);
}

/** Bordered styles separate title and subtitle with a short rule. */
export function hasRule(style: MapStyleConfig) {
  return style.border !== "none" && style.border !== "grid";
}

/** Letter-spacing in em, from a style's CSS tracking value such as "0.38em". */
export function trackingEm(tracking: string) {
  const n = parseFloat(tracking);
  return Number.isFinite(n) ? n : 0;
}

/**
 * TRIP PRINTS (layout B, "photos on the map"). Same units as LAYOUT: cqw,
 * percent of the poster's width. Markers and photos also have limits in
 * inches so they stay readable on an 8×10 and don't balloon on a 32×48.
 */
export const TRIP_LAYOUT = {
  /** Map window inset from the poster's left, right and top edges. */
  mapInset: 5.56,
  /** Title, trip line and attribution below the map. */
  textBandHeight: 33.3,
  /** Stops are fitted this far (fraction of the map window) from its edges, leaving room for photos. */
  fitPadding: 0.14,

  marker: { diameter: 3.85, minIn: 0.28, maxIn: 0.6 },
  photo: {
    /** Outer diameter, white ring included (the ring is drawn inside it). */
    diameter: 11.1,
    ring: 0.7,
    minIn: 0.8,
    /** Smaller steps tried, in turn, when photos don't all fit at full size. */
    shrinkSteps: [1, 0.85, 0.72],
    /** Stop name under the photo. */
    label: { size: 1.55, lineHeight: 1.3, gap: 0.8, charWidth: 0.62 },
  },
  /** Space between a marker's edge and its photo's edge, at the nearest. */
  leaderGap: 1.2,
  /** Kept clear round every photo and name: of the route, markers and other photos. */
  clearance: 1,
} as const;

export function cqwToIn(cqw: number, widthIn: number) {
  return (cqw * widthIn) / 100;
}

/** The trip map window, in cqw, for a poster of the given height (in cqw). */
export function tripMapRect(heightCqw: number) {
  const inset = TRIP_LAYOUT.mapInset;
  return {
    x: inset,
    y: inset,
    width: 100 - inset * 2,
    height: heightCqw - inset - TRIP_LAYOUT.textBandHeight,
  };
}

/** Marker diameter in inches on a print `widthIn` wide. */
export function tripMarkerIn(widthIn: number) {
  const m = TRIP_LAYOUT.marker;
  return Math.min(m.maxIn, Math.max(m.minIn, cqwToIn(m.diameter, widthIn)));
}
