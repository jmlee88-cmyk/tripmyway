/**
 * Server-only: map preview images in the R2 bucket "tripmyway-previews"
 * (binding PREVIEWS). Each preview is a PNG keyed by the SHA-256 of its
 * design, so the same design is stored once and re-uploads are harmless.
 */

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<unknown | null>;
  put(
    key: string,
    value: ArrayBuffer,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

export const PREVIEW_MAX_BYTES = 1_500_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPreviewKey(key: string) {
  return /^[0-9a-f]{64}$/.test(key);
}

export function isPng(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function bucket(): R2Bucket | null {
  const env = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  return (env?.["PREVIEWS"] as R2Bucket | undefined) ?? null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** PUT /api/previews/:key — store a preview PNG; returns its public URL. */
export async function handleUpload(request: Request, key: string): Promise<Response> {
  const origin = request.headers.get("origin");
  const self = new URL(request.url).origin;
  if (origin && origin !== self) return json(403, { error: "Cross-site upload refused." });
  if (!isPreviewKey(key)) return json(400, { error: "Bad preview id." });
  const store = bucket();
  if (!store) return json(503, { error: "Preview storage isn't configured." });
  const url = `${self}/previews/${key}.png`;
  if (await store.head(`${key}.png`)) return json(200, { url });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > PREVIEW_MAX_BYTES) return json(413, { error: "Preview too large." });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > PREVIEW_MAX_BYTES) return json(413, { error: "Preview too large." });
  if (!isPng(bytes)) return json(415, { error: "Previews must be PNG." });
  await store.put(`${key}.png`, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType: "image/png" },
  });
  return json(201, { url });
}

/** GET /previews/:key.png — serve a stored preview (immutable, cacheable). */
export async function handleServe(file: string): Promise<Response> {
  const key = file.replace(/\.png$/, "");
  if (!isPreviewKey(key)) return new Response("Not found", { status: 404 });
  const store = bucket();
  const obj = store ? await store.get(`${key}.png`) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
      "access-control-allow-origin": "*",
    },
  });
}
