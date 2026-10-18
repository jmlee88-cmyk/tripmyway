import type { PrintSizeId } from "@/types/product";
import type { PhotoCrop, TripPhoto } from "@/types/trip";
import { PRINT_SIZES, getPrintSize } from "@/config/products";
import { TRIP } from "@/config/trip";
import { TRIP_LAYOUT, cqwToIn } from "@/components/poster/poster-layout";

/**
 * PHOTO RULES, shared by the editor, the upload, the print renderer and the
 * cart. Deterministic: a photo is sharp enough when the part shown in its
 * circle has at least TRIP.photo.minPpi pixels per printed inch.
 */

const CENTRED: PhotoCrop = { x: 0.5, y: 0.5, zoom: 1 };

/** Printed diameter of a full-size photo circle, in inches. */
export function photoCircleIn(sizeId: PrintSizeId): number {
  return cqwToIn(TRIP_LAYOUT.photo.diameter, getPrintSize(sizeId).widthIn);
}

/** Pixels the part shown in the circle needs at this print size. */
export function photoNeedPx(sizeId: PrintSizeId): number {
  return Math.ceil(photoCircleIn(sizeId) * TRIP.photo.minPpi);
}

const shortSide = (p: Pick<TripPhoto, "widthPx" | "heightPx">) => Math.min(p.widthPx, p.heightPx);

/** True when even the whole photo (not zoomed) is too small for this size. */
export function photoTooSmall(photo: Pick<TripPhoto, "widthPx" | "heightPx">, sizeId: PrintSizeId) {
  return shortSide(photo) < photoNeedPx(sizeId);
}

/** Smallest print size a photo is too small for, or null when it suits every size. */
export function firstSizeTooBig(photo: Pick<TripPhoto, "widthPx" | "heightPx">) {
  return PRINT_SIZES.find((s) => photoTooSmall(photo, s.id)) ?? null;
}

/** Furthest the customer may zoom in at this size (≥ 1 unless the photo is too small). */
export function maxZoomFor(photo: TripPhoto, sizeId: PrintSizeId): number {
  return Math.max(1, Math.min(TRIP.photo.maxZoom, shortSide(photo) / photoNeedPx(sizeId)));
}

/** A crop kept inside the photo, zoomed no further than the size allows. */
export function clampCrop(photo: TripPhoto, crop: PhotoCrop | undefined, sizeId?: PrintSizeId) {
  const c = crop ?? CENTRED;
  const top = sizeId ? maxZoomFor(photo, sizeId) : TRIP.photo.maxZoom;
  const zoom = Math.min(top, Math.max(1, Number.isFinite(c.zoom) ? c.zoom : 1));
  const side = shortSide(photo) / zoom;
  const fx = side / 2 / photo.widthPx;
  const fy = side / 2 / photo.heightPx;
  const within = (v: number, lo: number) =>
    Math.min(1 - lo, Math.max(lo, Number.isFinite(v) ? v : 0.5));
  return { x: within(c.x, fx), y: within(c.y, fy), zoom };
}

/** The photo with its crop made valid for this size (zoom reduced if needed). */
export function fitPhotoToSize(photo: TripPhoto, sizeId: PrintSizeId): TripPhoto {
  return { ...photo, crop: clampCrop(photo, photo.crop, sizeId) };
}

/**
 * The square of the photo shown in its circle: centre and side in pixels of an
 * image `width` × `height` (the stored photo, or a resized copy of it).
 */
export function cropSquare(photo: TripPhoto, width = photo.widthPx, height = photo.heightPx) {
  const c = clampCrop(photo, photo.crop);
  const side = (shortSide(photo) / c.zoom) * (width / photo.widthPx);
  return { cx: c.x * width, cy: c.y * height, side };
}

/** Stops whose photos are too small for the size (the cart refuses these). */
export function photoProblems(stops: { label: string; photo?: TripPhoto }[], sizeId: PrintSizeId) {
  return stops.filter((s) => s.photo && photoTooSmall(s.photo, sizeId)).map((s) => s.label);
}
