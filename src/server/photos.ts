/**
 * Server-only: customer photos in the R2 bucket "tripmyway-photos" (binding
 * PHOTOS). The browser prepares each photo first (upright, resized, JPEG, no
 * hidden data such as GPS; see src/lib/photos.ts); the server checks it again
 * and stores it under the SHA-256 of its bytes, so the same photo is stored
 * once and nobody can overwrite another customer's photo. The bucket deletes
 * photos 180 days after upload (lifecycle rule set in Cloudflare).
 */
import { PRINT_SIZES } from "@/config/products";
import { TRIP } from "@/config/trip";
import { photoNeedPx } from "@/lib/trip/photos";

interface R2Object {
  customMetadata?: Record<string, string> | undefined;
}
interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  httpEtag: string;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ArrayBuffer,
    opts?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
}

/** Smallest photo accepted at all: enough for the smallest print size. */
export const PHOTO_MIN_PX = Math.min(...PRINT_SIZES.map((s) => photoNeedPx(s.id)));

export function isPhotoKey(key: string) {
  return /^[0-9a-f]{64}$/.test(key);
}

/** Width and height of a baseline or progressive JPEG, or null if it isn't one. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = (b[i + 5]! << 8) | b[i + 6]!;
      const width = (b[i + 7]! << 8) | b[i + 8]!;
      return width && height ? { width, height } : null;
    }
    if (marker === 0xda || len < 2) return null; // image data before any size: not usable
    i += 2 + len;
  }
  return null;
}

async function sha256Hex(bytes: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bucket(): R2Bucket | null {
  const env = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  return (env?.["PHOTOS"] as R2Bucket | undefined) ?? null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** PUT /api/photos/:key — store a prepared JPEG; returns { key, url, widthPx, heightPx }. */
export async function handleUpload(
  request: Request,
  key: string,
  store: R2Bucket | null = bucket(),
): Promise<Response> {
  const origin = request.headers.get("origin");
  const self = new URL(request.url).origin;
  if (origin && origin !== self) return json(403, { error: "Cross-site upload refused." });
  if (!isPhotoKey(key)) return json(400, { error: "Bad photo id." });
  if (!store) return json(503, { error: "Photo storage isn't configured." });
  const url = `${self}/photos/${key}.jpg`;

  const existing = await store.head(`${key}.jpg`);
  const w = Number(existing?.customMetadata?.["width"]);
  const h = Number(existing?.customMetadata?.["height"]);
  if (existing && w && h) return json(200, { key, url, widthPx: w, heightPx: h });

  const max = TRIP.photo.maxUploadBytes;
  if (Number(request.headers.get("content-length") ?? "0") > max)
    return json(413, { error: "That photo is too large to upload." });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > max) return json(413, { error: "That photo is too large to upload." });
  const size = jpegSize(bytes);
  if (!size) return json(415, { error: "Photos must be JPEG." });
  if ((await sha256Hex(bytes)) !== key) return json(400, { error: "Photo id doesn't match." });
  if (Math.max(size.width, size.height) > TRIP.photo.maxLongPx + 1)
    return json(400, { error: "Photo wasn't resized." });
  if (Math.min(size.width, size.height) < PHOTO_MIN_PX)
    return json(422, { error: "That photo is too small to print sharply." });

  await store.put(`${key}.jpg`, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { width: String(size.width), height: String(size.height) },
  });
  return json(201, { key, url, widthPx: size.width, heightPx: size.height });
}

/** GET /photos/:key.jpg — serve a stored photo (immutable, cacheable). */
export async function handleServe(file: string, store: R2Bucket | null = bucket()) {
  const key = file.replace(/\.jpg$/, "");
  if (!isPhotoKey(key)) return new Response("Not found", { status: 404 });
  const obj = store ? await store.get(`${key}.jpg`) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
      "access-control-allow-origin": "*",
    },
  });
}
