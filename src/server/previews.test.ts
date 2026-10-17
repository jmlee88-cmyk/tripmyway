import { describe, expect, it, beforeEach } from "vitest";
import { handleServe, handleUpload, isPreviewKey } from "./previews";

const KEY = "a".repeat(64);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeBucket() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async head(k: string) {
      return store.has(k) ? {} : null;
    },
    async get(k: string) {
      const v = store.get(k);
      return v ? { body: new Response(v as BodyInit).body!, httpEtag: '"e"' } : null;
    },
    async put(k: string, v: ArrayBuffer) {
      store.set(k, new Uint8Array(v));
    },
  };
}

const put = (body: BodyInit, origin = "https://site.test") =>
  new Request(`https://site.test/api/previews/${KEY}`, {
    method: "PUT",
    headers: { origin },
    body,
  });

describe("map preview storage", () => {
  let bucket: ReturnType<typeof fakeBucket>;
  beforeEach(() => {
    bucket = fakeBucket();
    (globalThis as { __env__?: unknown }).__env__ = { PREVIEWS: bucket };
  });

  it("only accepts 64-hex keys", () => {
    expect(isPreviewKey(KEY)).toBe(true);
    expect(isPreviewKey("../x")).toBe(false);
  });

  it("stores a PNG and serves it back", async () => {
    const res = await handleUpload(put(PNG), KEY);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { url: string }).url).toBe(
      `https://site.test/previews/${KEY}.png`,
    );
    const got = await handleServe(`${KEY}.png`);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);
  });

  it("refuses non-PNG data and cross-site uploads", async () => {
    expect((await handleUpload(put("hello"), KEY)).status).toBe(415);
    expect((await handleUpload(put(PNG, "https://evil.test"), KEY)).status).toBe(403);
  });

  it("returns 404 for unknown previews", async () => {
    expect((await handleServe(`${"b".repeat(64)}.png`)).status).toBe(404);
  });
});
