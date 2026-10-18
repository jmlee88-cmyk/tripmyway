// Core data model. Kept framework-agnostic so it can move into a Shopify theme.

export interface Location {
  id: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  /** Geocoder's kind of place, e.g. "city", "town", "attraction" (for ranking matches). */
  placeType?: string;
  /** ISO 3166-1 alpha-2, upper case (e.g. "ES"), when the geocoder gives one. */
  countryCode?: string;
}

export type ZoomLevel = "neighborhood" | "city" | "regional";
export type MarkerStyle = "none" | "dot" | "pin";
/** framed: map inside a paper margin. fullBleed: map runs to the top, left and right edges. */
export type PosterLayout = "framed" | "fullBleed";
export type PrintSizeId = "8x10" | "12x18" | "18x24" | "24x36" | "32x48";
/** What the design is printed on. Designs saved before finishes existed are paper. */
export type PrintFinish = "paper" | "canvas" | "metal" | "acrylic";
/** Optional frame colour. The frame style follows the finish (see FRAME_STYLES). */
export type FrameColor = "none" | "white" | "black" | "natural" | "gold" | "silver";
export type TextCase = "upper" | "title";
/** single: one print. diptych / triptych: a set of two / three prints designed to hang together. */
export type PrintFormat = "single" | "diptych" | "triptych";

export interface MapStyleConfig {
  background: string;
  water: string;
  park: string;
  landcover: string;
  building: string;
  primaryRoad: string;
  secondaryRoad: string;
  minorRoad: string;
  rail: string;
  label: string;
  subLabel: string;
  accent: string;
  /** Inner frame / border treatment on the printed sheet */
  border: "none" | "hairline" | "double" | "grid";
  titleFont: string;
  bodyFont: string;
  titleWeight: number;
  titleTracking: string;
}

export interface MapStyle {
  id: string;
  number: string;
  name: string;
  description: string;
  details: string[];
  configuration: MapStyleConfig;
}

export interface Customization {
  location: Location | null;
  styleId: string;
  title: string;
  subtitle: string;
  date: string;
  coordinates: string;
  showCoordinates: boolean;
  textCase: TextCase;
  zoomLevel: ZoomLevel;
  markerStyle: MarkerStyle;
  /** Optional for designs saved before layouts existed (treated as "framed"). */
  layout?: PosterLayout;
  printSize: PrintSizeId;
  /** Optional for designs saved before finishes existed (treated as "paper"). */
  finish?: PrintFinish;
  /** Optional frame; absent or "none" means unframed. */
  frame?: FrameColor;
}

export interface PrintSize {
  id: PrintSizeId;
  label: string;
  widthIn: number;
  heightIn: number;
  price: number;
}

export interface CartItem {
  id: string;
  name: string;
  /** The design — for a set, its first panel (so older code paths keep working). */
  customization: Customization;
  /** Every panel of a set, in hanging order. Absent for a single print. */
  panels?: Customization[];
  /** Stored preview image of the design (set: all panels), once rendered. */
  previewUrl?: string;
  price: number;
  quantity: number;
  addedAt: number;
}
