/**
 * TripMyWay print file converter (runs in a Cloudflare Container).
 *
 * POST /render  { design, page, dpi, format, quality, bleedIn, mirrorWrapIn }
 *   → draws the trip's print PDF with the site's own renderer (same code as
 *     the preview and the print studio), with bleed if asked, rasterises one
 *     page at `dpi` with pdftoppm, optionally adds a mirrored canvas wrap
 *     (both 0 = the printed face only), and returns the JPEG
 *     or TIFF with its resolution set. Headers: x-width, x-height, x-pages.
 * GET /health   → "ok"
 *
 * ArtBeat takes JPG, PNG or TIF, not PDF, so this is the one step that has to
 * happen outside the Worker: a 32 × 48 print at 300 ppi is ~138 million pixels.
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { TripDesign } from "@/types/trip";
import { renderTripPdf } from "@/print/render-trip-pdf";

const run = promisify(execFile);
const FONTS = process.env["FONT_DIR"] ?? join(process.cwd(), "fonts/print");
const PORT = Number(process.env["PORT"] ?? 8080);

export interface RenderRequest {
  design: TripDesign;
  /** 1-based print (page) of the trip. */
  page: number;
  dpi: number;
  format: "jpg" | "tif";
  quality?: number;
  /** Bleed on every side, drawn by the renderer (0 = none). */
  bleedIn?: number;
  /** Canvas: inches of mirrored edge to add on every side (0 = none). */
  mirrorWrapIn?: number;
}

// The same trip is asked for once per print; keep its PDF for the next page.
const pdfCache = new Map<string, Promise<{ bytes: Uint8Array; pages: number }>>();

function tripPdf(design: TripDesign, bleedIn: number) {
  const key = createHash("sha256")
    .update(JSON.stringify([design, bleedIn]))
    .digest("hex");
  let job = pdfCache.get(key);
  if (!job) {
    job = renderTripPdf(design, {
      bleedIn,
      placeholderPhotos: false,
      loadFont: async (file) => new Uint8Array(await readFile(join(FONTS, file))),
    }).then((r) => ({ bytes: r.bytes, pages: r.pages }));
    pdfCache.set(key, job);
    job.catch(() => pdfCache.delete(key));
    while (pdfCache.size > 4) pdfCache.delete(pdfCache.keys().next().value!);
  }
  return job;
}

/** vips resolution is pixels per millimetre. */
const ppmm = (dpi: number) => (dpi / 25.4).toFixed(4);

export async function renderPrintFile(req: RenderRequest, dir: string) {
  const { bytes, pages } = await tripPdf(
    req.design,
    Math.min(0.5, Math.max(0, Number(req.bleedIn) || 0)),
  );
  if (req.page < 1 || req.page > pages)
    throw new Error(`The trip has ${pages} print(s), not ${req.page}.`);
  const pdf = join(dir, "trip.pdf");
  await writeFile(pdf, bytes);
  // Rasterise to an LZW TIFF first (lossless), then encode once.
  const base = join(dir, "page");
  await run(
    "pdftoppm",
    [
      "-r",
      String(req.dpi),
      "-f",
      String(req.page),
      "-l",
      String(req.page),
      "-singlefile",
      "-tiff",
      "-tiffcompression",
      "lzw",
      "-aa",
      "yes",
      "-aaVector",
      "yes",
      pdf,
      base,
    ],
    { maxBuffer: 1 << 20 },
  );
  let src = `${base}.tif`;
  const out = join(dir, `print.${req.format}`);
  const target =
    req.format === "jpg" ? `${out}[Q=${req.quality ?? 92}]` : `${out}[compression=lzw]`;
  const wrapPx = Math.round((req.mirrorWrapIn ?? 0) * req.dpi);
  if (wrapPx > 0) {
    const { stdout } = await run("vipsheader", ["-f", "width", src]);
    const { stdout: h } = await run("vipsheader", ["-f", "height", src]);
    const w = Number(stdout.trim());
    const hh = Number(h.trim());
    const wrapped = join(dir, "wrapped.v");
    await run("vips", [
      "embed",
      src,
      wrapped,
      String(wrapPx),
      String(wrapPx),
      String(w + 2 * wrapPx),
      String(hh + 2 * wrapPx),
      "--extend",
      "mirror",
    ]);
    src = wrapped;
  }
  await run("vips", ["copy", src, target, "--xres", ppmm(req.dpi), "--yres", ppmm(req.dpi)]);
  const width = Number((await run("vipsheader", ["-f", "width", out])).stdout.trim());
  const height = Number((await run("vipsheader", ["-f", "height", out])).stdout.trim());
  return { path: out, width, height, pages };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new Error("Request too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404).end();
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "print-"));
  const cleanup = () => void rm(dir, { recursive: true, force: true });
  try {
    const body = JSON.parse(await readBody(req)) as RenderRequest;
    if (!body?.design?.stops?.length) throw new Error("No trip design");
    const dpi = Math.min(600, Math.max(72, Number(body.dpi) || 300));
    const format = body.format === "tif" ? "tif" : "jpg";
    const t0 = Date.now();
    const file = await renderPrintFile({ ...body, dpi, format }, dir);
    const size = (await stat(file.path)).size;
    console.log(
      `rendered page ${body.page}/${file.pages} ${file.width}x${file.height} ${size}B in ${Date.now() - t0}ms`,
    );
    res.writeHead(200, {
      "content-type": format === "jpg" ? "image/jpeg" : "image/tiff",
      "content-length": String(size),
      "x-width": String(file.width),
      "x-height": String(file.height),
      "x-pages": String(file.pages),
    });
    const stream = createReadStream(file.path);
    stream.pipe(res);
    stream.on("close", cleanup);
  } catch (e) {
    cleanup();
    console.error(e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

if (process.env["NODE_ENV"] !== "test") {
  server.listen(PORT, () => console.log(`print converter listening on ${PORT}`));
}
