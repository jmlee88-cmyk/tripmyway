import type { FrameColor, Location, PrintFinish, PrintSizeId } from "./product";

/**
 * TRIP PRINTS. A trip is an ordered list of stops printed as one map (or, when
 * the trip is too spread out, as 2–3 panels; see src/lib/trip/plan.ts).
 * Kept separate from `Customization` so single-location prints are untouched.
 */

/** A customer photo stored at print resolution (R2); referenced, never embedded. */
export interface TripPhoto {
  /** Storage key, e.g. the SHA-256 of the file. */
  key: string;
  url: string;
  widthPx: number;
  heightPx: number;
  /** What shows in the circle. Missing = centred, not zoomed. */
  crop?: PhotoCrop;
}

/**
 * The part of a photo shown in its circle: a square centred at (x, y), as
 * fractions of the photo's width and height, whose side is the photo's short
 * side divided by `zoom` (1 = as large as fits).
 */
export interface PhotoCrop {
  x: number;
  y: number;
  zoom: number;
}

export interface TripStop {
  id: string;
  location: Location;
  /** Name printed beside the stop, e.g. "Lake Como". */
  label: string;
  /** Free text, e.g. "Jun 5". */
  date?: string;
  photo?: TripPhoto;
  caption?: string;
}

export interface TripDesign {
  /** In travel order. 1 to TRIP.maxStops. */
  stops: TripStop[];
  styleId: string;
  title: string;
  /** Trip line under the title; defaults to "From → To · N stops · dates". */
  subtitle?: string;
  printSize: PrintSizeId;
  finish?: PrintFinish;
  frame?: FrameColor;
}
