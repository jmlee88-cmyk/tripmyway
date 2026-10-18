import { describe, expect, it } from "vitest";
import type { TripPhoto } from "@/types/trip";
import { TRIP } from "@/config/trip";
import {
  clampCrop,
  cropSquare,
  firstSizeTooBig,
  fitPhotoToSize,
  maxZoomFor,
  photoNeedPx,
  photoProblems,
  photoTooSmall,
} from "./photos";

const photo = (w: number, h: number, crop?: TripPhoto["crop"]): TripPhoto => ({
  key: "k",
  url: "u",
  widthPx: w,
  heightPx: h,
  ...(crop ? { crop } : {}),
});

describe("trip photo rules", () => {
  it("needs more pixels for bigger prints, at the configured ppi", () => {
    expect(photoNeedPx("8x10")).toBeLessThan(photoNeedPx("32x48"));
    // 11.1% of 32 in ≈ 3.55 in × 150 ppi.
    expect(photoNeedPx("32x48")).toBe(Math.ceil(0.111 * 32 * TRIP.photo.minPpi));
  });

  it("refuses photos too small for the size, and says which size is the first too big", () => {
    const p = photo(600, 400); // 400 px across
    expect(photoTooSmall(p, "8x10")).toBe(false);
    expect(photoTooSmall(p, "32x48")).toBe(true);
    expect(firstSizeTooBig(p)?.id).toBe("32x48");
    expect(firstSizeTooBig(photo(4000, 3000))).toBeNull();
    expect(photoProblems([{ label: "Rome", photo: p }, { label: "Nara" }], "32x48")).toEqual([
      "Rome",
    ]);
  });

  it("limits zoom so the circle stays sharp", () => {
    const p = photo(3000, 2250);
    expect(maxZoomFor(p, "8x10")).toBe(TRIP.photo.maxZoom);
    const z = maxZoomFor(p, "32x48");
    expect(2250 / z).toBeGreaterThanOrEqual(photoNeedPx("32x48") - 0.001);
    expect(clampCrop(p, { x: 0.5, y: 0.5, zoom: 99 }, "32x48").zoom).toBeCloseTo(z);
    expect(
      fitPhotoToSize({ ...p, crop: { x: 0.5, y: 0.5, zoom: 99 } }, "32x48").crop!.zoom,
    ).toBeCloseTo(z);
  });

  it("keeps the shown square inside the photo", () => {
    const p = photo(3000, 2000);
    const c = clampCrop(p, { x: 0, y: 1, zoom: 1 });
    // A 2000 px square in a 3000 × 2000 photo: centre x from 1/3 to 2/3, y fixed at 1/2.
    expect(c.x).toBeCloseTo(1 / 3);
    expect(c.y).toBeCloseTo(0.5);
    expect(clampCrop(p, { x: Number.NaN, y: 0.5, zoom: 0 })).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  });

  it("maps the crop to pixels, also on a resized copy", () => {
    const p = photo(3000, 2000, { x: 0.25, y: 0.5, zoom: 2 });
    expect(cropSquare(p)).toEqual({ cx: 750, cy: 1000, side: 1000 });
    expect(cropSquare(p, 1500, 1000)).toEqual({ cx: 375, cy: 500, side: 500 });
    expect(cropSquare(photo(3000, 2000))).toEqual({ cx: 1500, cy: 1000, side: 2000 });
  });
});
