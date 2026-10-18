import { describe, expect, it } from "vitest";
import { TRIP } from "@/config/trip";
import { PHOTO_MIN_PX, handleServe, handleUpload, jpegSize } from "./photos";

/** A minimal JPEG header with the given size (enough for the size check). */
function jpeg(width: number, height: number, sof = 0xc0) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const frame = [
    0xff,
    sof,
    0x00,
    0x11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...frame, 0xff, 0xd9]);
}
async function sha(b: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function memoryBucket() {
  const m = new Map<string, { bytes: ArrayBuffer; meta?: Record<string, string> | undefined }>();
  return {
    m,
    async head(k: string) {
      const o = m.get(k);
      return o ? { customMetadata: o.meta } : null;
    },
    async get(k: string) {
      const o = m.get(k);
      return o
        ? { body: new Response(o.bytes).body!, httpEtag: '"e"', customMetadata: o.meta }
        : null;
    },
    async put(k: string, bytes: ArrayBuffer, opts?: { customMetadata?: Record<string, string> }) {
      m.set(k, { bytes, meta: opts?.customMetadata });
    },
  };
}
const put = (key: string, body: Uint8Array, origin = "https://t.test") =>
  new Request(`https://t.test/api/photos/${key}`, {
    method: "PUT",
    headers: { origin, "content-type": "image/jpeg" },
    body: body as Uint8Array<ArrayBuffer>,
  });

describe("photo storage", () => {
  it("reads JPEG sizes, baseline and progressive", () => {
    expect(jpegSize(jpeg(3000, 2250))).toEqual({ width: 3000, height: 2250 });
    expect(jpegSize(jpeg(800, 1200, 0xc2))).toEqual({ width: 800, height: 1200 });
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("stores a prepared photo under its SHA-256 and serves it back", async () => {
    const b = memoryBucket();
    const bytes = jpeg(3000, 2250);
    const key = await sha(bytes);
    const res = await handleUpload(put(key, bytes), key, b);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      key,
      url: `https://t.test/photos/${key}.jpg`,
      widthPx: 3000,
      heightPx: 2250,
    });
    expect(b.m.get(`${key}.jpg`)?.meta).toEqual({ width: "3000", height: "2250" });
    // Uploading the same photo again is harmless.
    expect((await handleUpload(put(key, bytes), key, b)).status).toBe(200);
    const served = await handleServe(`${key}.jpg`, b);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect((await handleServe("../secret", b)).status).toBe(404);
  });

  it("refuses wrong ids, other sites, non-JPEGs, unresized and too-small photos", async () => {
    const b = memoryBucket();
    const ok = jpeg(3000, 2250);
    const key = await sha(ok);
    expect((await handleUpload(put("nope", ok), "nope", b)).status).toBe(400);
    expect((await handleUpload(put(key, ok, "https://evil.test"), key, b)).status).toBe(403);
    const other = jpeg(2000, 1500);
    expect((await handleUpload(put(key, other), key, b)).status).toBe(400); // id ≠ content
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await handleUpload(put(await sha(png), png), await sha(png), b)).status).toBe(415);
    const huge = jpeg(TRIP.photo.maxLongPx * 2, 2000);
    expect((await handleUpload(put(await sha(huge), huge), await sha(huge), b)).status).toBe(400);
    const tiny = jpeg(PHOTO_MIN_PX - 1, PHOTO_MIN_PX - 1);
    expect((await handleUpload(put(await sha(tiny), tiny), await sha(tiny), b)).status).toBe(422);
    expect(b.m.size).toBe(0);
    expect((await handleUpload(put(key, ok), key, null)).status).toBe(503);
  });
});
