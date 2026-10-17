import type { CartItem, Customization } from "@/types/product";
import { itemPanels, setItemPreview } from "./cart";

/**
 * MAP PREVIEWS: a small PNG of each cart item, drawn with the print renderer
 * (so it matches the printed piece exactly) and stored on the site
 * (/previews/<sha256>.png). Its URL travels with the Shopify order as
 * `_preview` and is shown on the thank-you / order status pages and in emails.
 * A set becomes one image with its panels side by side.
 */

/** Width of one panel in the preview, in px. */
const PANEL_WIDTH = 420;
const PAD = 28;
const GAP = 18;
const STAGE = "#EFE9DF";

/** Stable id for a design: SHA-256 of the panels (same design → same image). */
export async function previewKey(panels: Customization[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify({ v: 1, panels }));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function renderPanel(c: Customization): Promise<HTMLCanvasElement> {
  const [{ generatePrintFile }, pdfjs, worker] = await Promise.all([
    import("./print"),
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await generatePrintFile(c, { bleedIn: 0, canvasWrap: false });
  const task = pdfjs.getDocument({ data: pdf.bytes.slice() });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PANEL_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // "print" intent renders in one go; the default waits on animation frames,
    // which browsers pause in background tabs.
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport, intent: "print" })
      .promise;
    return canvas;
  } finally {
    void task.destroy();
  }
}

/** Draw the panels side by side on the site's "stage" colour, with a soft shadow. */
export async function renderPreviewPng(panels: Customization[]): Promise<Blob> {
  const rendered = [];
  for (const p of panels) rendered.push(await renderPanel(p));
  const h = Math.max(...rendered.map((c) => c.height));
  const w = rendered.reduce((s, c) => s + c.width, 0) + GAP * (rendered.length - 1);
  const out = document.createElement("canvas");
  out.width = w + PAD * 2;
  out.height = h + PAD * 2;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = STAGE;
  ctx.fillRect(0, 0, out.width, out.height);
  let x = PAD;
  for (const c of rendered) {
    ctx.save();
    ctx.shadowColor = "rgba(30, 26, 22, 0.22)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, PAD, c.width, c.height);
    ctx.restore();
    ctx.drawImage(c, x, PAD);
    x += c.width + GAP;
  }
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Preview encoding failed"))), "image/png"),
  );
}

async function upload(key: string, png: Blob): Promise<string> {
  const res = await fetch(`/api/previews/${key}`, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: png,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? `Preview upload failed (${res.status})`);
  return json.url;
}

const inflight = new Map<string, Promise<string | null>>();

/**
 * Make sure a cart item has a stored preview; returns its URL, or null if it
 * couldn't be made (checkout carries on without one).
 */
export function ensurePreview(item: CartItem): Promise<string | null> {
  if (item.previewUrl) return Promise.resolve(item.previewUrl);
  let job = inflight.get(item.id);
  if (!job) {
    job = (async () => {
      try {
        const panels = itemPanels(item);
        const key = await previewKey(panels);
        const url = await upload(key, await renderPreviewPng(panels));
        setItemPreview(item.id, url);
        return url;
      } catch (e) {
        console.warn("Map preview failed", e);
        return null;
      } finally {
        inflight.delete(item.id);
      }
    })();
    inflight.set(item.id, job);
  }
  return job;
}

/** Previews for every item, giving up after `timeoutMs` so checkout is never stuck. */
export async function ensurePreviews(items: CartItem[], timeoutMs = 20000): Promise<void> {
  await Promise.race([
    Promise.all(items.map(ensurePreview)),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}
