import type { Customization, FrameColor, Location, MarkerStyle, PosterLayout, PrintFinish, PrintFormat, PrintSize, PrintSizeId, ZoomLevel } from "@/types/product";
import { DEFAULT_STYLE_ID } from "./map-styles";

/**
 * Sizes. `price` is the paper price; other finishes are priced in
 * FINISH_PRICES. SHOPIFY: each size × finish is a product variant (see
 * src/config/shopify.ts); keep the prices there in step with these.
 */
export const PRINT_SIZES: PrintSize[] = [
  { id: "8x10", label: "8 × 10", widthIn: 8, heightIn: 10, price: 49 },
  { id: "12x18", label: "12 × 18", widthIn: 12, heightIn: 18, price: 69 },
  { id: "18x24", label: "18 × 24", widthIn: 18, heightIn: 24, price: 89 },
  { id: "24x36", label: "24 × 36", widthIn: 24, heightIn: 36, price: 129 },
  { id: "32x48", label: "32 × 48", widthIn: 32, heightIn: 48, price: 179 },
];

export const PRODUCT_NAME = "Personalized Map Print";
export const SET_PRODUCT_NAME = "Personalized Map Set";

/**
 * Finishes. Paper is the original product; the others are additive. The
 * on-screen look of each finish lives in components/poster/FinishSurface.tsx.
 */
export interface FinishOption {
  id: PrintFinish;
  label: string;
  short: string;
  description: string;
}

export const PRINT_FINISHES: FinishOption[] = [
  { id: "paper", label: "Fine art paper", short: "Paper", description: "Museum-grade matte paper with a soft, velvety finish. Ready for your own frame." },
  { id: "canvas", label: "Canvas", short: "Canvas", description: "Gallery-wrapped on a 1.5\" wooden frame, with the map's edges mirrored around the sides. Ready to hang." },
  { id: "metal", label: "Metal", short: "Metal", description: "Printed into a sheet of aluminium for crisp lines and a luminous sheen. Floats off the wall on a hidden mount." },
  { id: "acrylic", label: "Acrylic", short: "Acrylic", description: "Face-mounted behind a thick block of clear acrylic for deep, glossy colour. Hangs on a hidden mount." },
];

export const DEFAULT_FINISH: PrintFinish = "paper";

/** Gallery wrap for canvas print files: 1.5" frame depth + 0.5" folded round the back. */
export const CANVAS_WRAP_IN = 2;

export function getFinish(id: PrintFinish | undefined): FinishOption {
  return PRINT_FINISHES.find((f) => f.id === id) ?? PRINT_FINISHES[0]!;
}

/**
 * FRAMES (optional add-on). The style follows the finish: paper gets a box
 * frame (behind glazing, frame face overlapping the print edge); canvas, metal
 * and acrylic get a float frame (thin face with a shadow gap round the art).
 * Dimensions are ArtBeat's profiles, in inches, and drive the preview.
 */
export interface FrameStyle {
  id: "box" | "float";
  label: string;
  description: string;
  colors: Exclude<FrameColor, "none">[];
  /** Visible face width. */
  faceIn: number;
  /** Shadow gap between frame and art (float frames). */
  gapIn: number;
  /** How far the frame face covers the print's edge (box frames). */
  overlapIn: number;
}

export const FRAME_STYLES: Record<PrintFinish, FrameStyle> = {
  paper: { id: "box", label: "Box frame", description: "A solid ¾″ frame with clear glazing, ready to hang. The frame covers ⅛″ of each edge.", colors: ["white", "black", "natural", "gold", "silver"], faceIn: 0.75, gapIn: 0, overlapIn: 0.125 },
  canvas: { id: "float", label: "Float frame", description: "A slim frame that leaves a shadow gap round the canvas, so it seems to float.", colors: ["white", "black", "natural"], faceIn: 0.375, gapIn: 0.25, overlapIn: 0 },
  metal: { id: "float", label: "Float frame", description: "A slim frame that leaves a shadow gap round the print, so it seems to float.", colors: ["white", "black"], faceIn: 0.25, gapIn: 0.25, overlapIn: 0 },
  acrylic: { id: "float", label: "Float frame", description: "A slim frame that leaves a shadow gap round the print, so it seems to float.", colors: ["white", "black"], faceIn: 0.25, gapIn: 0.25, overlapIn: 0 },
};

export const FRAME_COLOR_LABELS: Record<FrameColor, string> = {
  none: "No frame",
  white: "White",
  black: "Black",
  natural: "Natural wood",
  gold: "Gold",
  silver: "Silver",
};

/** The frame actually on a design: "none" if absent or not offered for its finish. */
export function getFrame(c: Pick<Customization, "finish" | "frame">): FrameColor {
  const f = c.frame ?? "none";
  if (f === "none") return "none";
  return FRAME_STYLES[getFinish(c.finish).id].colors.includes(f) ? f : "none";
}

/** e.g. "Black float frame", or "No frame". */
export function frameLabel(c: Pick<Customization, "finish" | "frame">): string {
  const f = getFrame(c);
  if (f === "none") return FRAME_COLOR_LABELS.none;
  return `${FRAME_COLOR_LABELS[f]} ${FRAME_STYLES[getFinish(c.finish).id].label.toLowerCase()}`;
}

/**
 * PRICING TABLES — edit prices here (and keep Shopify in step; see
 * src/config/shopify.ts). All prices are per print in USD; a set of three is
 * three times the per-print price.
 */

/** Frame add-on per print, by finish (which sets the frame style) and size. PLACEHOLDER PRICES. */
export const FRAME_PRICES: Record<PrintFinish, Record<PrintSizeId, number>> = {
  paper: { "8x10": 45, "12x18": 65, "18x24": 85, "24x36": 115, "32x48": 165 },
  canvas: { "8x10": 45, "12x18": 65, "18x24": 85, "24x36": 115, "32x48": 165 },
  metal: { "8x10": 45, "12x18": 65, "18x24": 85, "24x36": 115, "32x48": 165 },
  acrylic: { "8x10": 45, "12x18": 65, "18x24": 85, "24x36": 115, "32x48": 165 },
};

/** Price of one print per size and finish. Paper matches PRINT_SIZES. */
export const FINISH_PRICES: Record<PrintFinish, Record<PrintSizeId, number>> = {
  paper: { "8x10": 49, "12x18": 69, "18x24": 89, "24x36": 129, "32x48": 179 },
  canvas: { "8x10": 89, "12x18": 119, "18x24": 149, "24x36": 219, "32x48": 299 },
  metal: { "8x10": 109, "12x18": 149, "18x24": 199, "24x36": 289, "32x48": 399 },
  acrylic: { "8x10": 129, "12x18": 179, "18x24": 229, "24x36": 339, "32x48": 469 },
};

export function getPrintSize(id: string): PrintSize {
  return PRINT_SIZES.find((s) => s.id === id) ?? PRINT_SIZES[2]!;
}

export const ZOOM_LEVELS: { id: ZoomLevel; label: string; zoom: number }[] = [
  { id: "neighborhood", label: "Neighborhood", zoom: 14.2 },
  { id: "city", label: "City", zoom: 12.2 },
  { id: "regional", label: "Regional", zoom: 10.3 },
];

export const MARKERS: { id: MarkerStyle; label: string }[] = [
  { id: "none", label: "No marker" },
  { id: "dot", label: "Simple marker" },
  { id: "pin", label: "Elegant pin" },
];

export const LAYOUTS: { id: PosterLayout; label: string }[] = [
  { id: "framed", label: "With margin" },
  { id: "fullBleed", label: "Edge to edge" },
];

export const TITLE_MAX = 40;
export const SUBTITLE_MAX = 60;

export const DEMO_LOCATIONS: Location[] = [
  { id: "demo-pasadena", name: "Pasadena", formattedAddress: "Pasadena, California, United States", latitude: 34.1478, longitude: -118.1445, city: "Pasadena", region: "California", country: "United States" },
  { id: "demo-nyc", name: "New York", formattedAddress: "New York, NY, United States", latitude: 40.7359, longitude: -73.9911, city: "New York", region: "New York", country: "United States" },
  { id: "demo-la", name: "Los Angeles", formattedAddress: "Los Angeles, CA, United States", latitude: 34.0522, longitude: -118.2437, city: "Los Angeles", region: "California", country: "United States" },
  { id: "demo-paris", name: "Paris", formattedAddress: "Paris, Île-de-France, France", latitude: 48.8566, longitude: 2.3522, city: "Paris", region: "Île-de-France", country: "France" },
  { id: "demo-tokyo", name: "Tokyo", formattedAddress: "Tokyo, Japan", latitude: 35.6812, longitude: 139.7671, city: "Tokyo", region: "Tokyo", country: "Japan" },
  { id: "demo-seattle", name: "Seattle", formattedAddress: "Seattle, WA, United States", latitude: 47.6062, longitude: -122.3321, city: "Seattle", region: "Washington", country: "United States" },
];

export function formatCoordinates(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns} · ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

export function defaultSubtitle(loc: Location): string {
  const parts = [loc.city ?? loc.name, loc.region && loc.region !== (loc.city ?? loc.name) ? loc.region : loc.country];
  return parts.filter(Boolean).join(", ").toUpperCase().slice(0, SUBTITLE_MAX);
}

export const DEFAULT_CUSTOMIZATION: Customization = {
  location: DEMO_LOCATIONS[0]!,
  styleId: DEFAULT_STYLE_ID,
  title: "OUR FIRST HOME",
  subtitle: "PASADENA, CALIFORNIA",
  date: "2018",
  coordinates: formatCoordinates(34.1478, -118.1445),
  showCoordinates: true,
  textCase: "upper",
  zoomLevel: "city",
  markerStyle: "none",
  layout: "framed",
  printSize: "18x24",
};

/**
 * Print formats. A set's panels share the fields in SET_SHARED_FIELDS so they
 * hang together as one piece; place, words and map area are per panel.
 * SHOPIFY: a set is one line item priced at `panels` × the size's price.
 */
export const PRINT_FORMATS: { id: PrintFormat; label: string; panels: number; description: string }[] = [
  { id: "single", label: "Single print", panels: 1, description: "One place, one print." },
  { id: "triptych", label: "Set of three", panels: 3, description: "Three places that tell one story, designed to hang side by side." },
];

export function getPrintFormat(id: PrintFormat) {
  return PRINT_FORMATS.find((f) => f.id === id) ?? PRINT_FORMATS[0]!;
}

export const SET_SHARED_FIELDS = ["styleId", "printSize", "finish", "frame", "layout", "textCase", "markerStyle"] as const satisfies readonly (keyof Customization)[];

/** Price of a print or set: every panel is a print of the chosen size and finish, plus any frame. */
export function formatPrice(sizeId: string, panels: number, finish: PrintFinish = DEFAULT_FINISH, frame: FrameColor = "none") {
  const size = getPrintSize(sizeId);
  const f = getFinish(finish).id;
  const framed = getFrame({ finish: f, frame }) !== "none";
  const each = (FINISH_PRICES[f][size.id] ?? size.price) + (framed ? FRAME_PRICES[f][size.id] : 0);
  return each * panels;
}

/** Frame add-on price for one print, for showing "+$X". */
export function framePrice(sizeId: string, finish: PrintFinish = DEFAULT_FINISH) {
  return FRAME_PRICES[getFinish(finish).id][getPrintSize(sizeId).id];
}

/** Starting words and places for panels 2 and 3 when a customer switches to a set. */
export const SET_PANEL_SEEDS: Pick<Customization, "location" | "title" | "date">[] = [
  { location: DEMO_LOCATIONS[3]!, title: "WHERE WE SAID YES", date: "2021" },
  { location: DEMO_LOCATIONS[1]!, title: "WHERE WE ARE NOW", date: "2024" },
];
