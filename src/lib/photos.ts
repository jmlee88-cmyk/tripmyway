import type { PrintSizeId } from "@/types/product";
import type { TripPhoto } from "@/types/trip";
import { PRINT_SIZES, getPrintSize } from "@/config/products";
import { TRIP } from "@/config/trip";
import { firstSizeTooBig, photoNeedPx, photoTooSmall } from "@/lib/trip/photos";

/**
 * CUSTOMER PHOTO UPLOAD (browser). Each photo is prepared before it leaves the
 * device: iPhone HEIC is converted, the photo is turned upright, resized to at
 * most TRIP.photo.maxLongPx on the long side and re-encoded as JPEG. Redrawing
 * it drops every piece of hidden data (EXIF), including the GPS location.
 * It's then stored by the server (src/server/photos.ts) under its SHA-256.
 */

export class PhotoError extends Error {}

const looksHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

async function decode(file: File): Promise<ImageBitmap> {
  if (!looksHeic(file)) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* maybe a HEIC with a misleading name; checked below */
    }
  }
  const { heicTo, isHeic } = await import("heic-to");
  if (looksHeic(file) || (await isHeic(file).catch(() => false))) {
    try {
      return await heicTo({ blob: file, type: "bitmap" });
    } catch {
      /* Safari reads HEIC natively */
      return createImageBitmap(file).catch(() => {
        throw new PhotoError("We couldn't read this HEIC photo. Please try a JPEG instead.");
      });
    }
  }
  throw new PhotoError("We can't read this file. Please choose a JPEG, PNG or HEIC photo.");
}

function encode(img: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Your browser couldn't prepare this photo.");
  ctx.fillStyle = "#fff"; // transparent PNGs print on white
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new PhotoError("Your browser couldn't prepare this photo."))),
      "image/jpeg",
      TRIP.photo.jpegQuality,
    ),
  );
}

async function sha256Hex(blob: Blob) {
  const d = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Message for a photo too small for the chosen size, naming what would work. */
export function tooSmallMessage(
  photo: Pick<TripPhoto, "widthPx" | "heightPx">,
  sizeId: PrintSizeId,
) {
  const size = getPrintSize(sizeId);
  const px = Math.min(photo.widthPx, photo.heightPx);
  const tooBig = firstSizeTooBig(photo);
  const fits = tooBig ? smallerSizeLabel(tooBig.id) : null;
  return (
    `This photo is ${px} px across; ${/^(8|18)\b/.test(size.label) ? "an" : "a"} ${size.label} print needs at least ${photoNeedPx(sizeId)} px ` +
    `to print sharply. ${fits ? `Choose a print up to ${fits}, or a larger photo.` : "Please choose a larger photo."}`
  );
}

function smallerSizeLabel(firstTooBig: PrintSizeId) {
  // The size just below the first one that's too big.
  const i = PRINT_SIZES.findIndex((s) => s.id === firstTooBig);
  return i > 0 ? PRINT_SIZES[i - 1]!.label : null;
}

/**
 * Prepare and upload a photo for a print of `sizeId`. Refuses (throws
 * PhotoError) a photo too small for that size, before uploading anything.
 */
export async function uploadTripPhoto(file: File, sizeId: PrintSizeId): Promise<TripPhoto> {
  const img = await decode(file);
  let blob: Blob;
  try {
    const scale = Math.min(1, TRIP.photo.maxLongPx / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    if (photoTooSmall({ widthPx: width, heightPx: height }, sizeId))
      throw new PhotoError(tooSmallMessage({ widthPx: width, heightPx: height }, sizeId));
    blob = await encode(img, width, height);
  } finally {
    img.close?.();
  }
  const key = await sha256Hex(blob);
  const res = await fetch(`/api/photos/${key}`, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: blob,
  });
  const body = (await res.json().catch(() => ({}))) as Partial<TripPhoto> & { error?: string };
  if (!res.ok || !body.url || !body.widthPx || !body.heightPx)
    throw new PhotoError(body.error ?? "We couldn't upload this photo. Please try again.");
  return { key, url: body.url, widthPx: body.widthPx, heightPx: body.heightPx };
}
