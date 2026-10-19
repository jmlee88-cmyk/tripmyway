/**
 * tripmyway-fulfil — sends paid Shopify orders to ArtBeat, automatically.
 *
 *   Shopify "order paid" webhook → POST /shopify/orders-paid
 *     checks Shopify's signature, keeps the order (R2), queues it, answers 200.
 *   Queue consumer (one order at a time, retried on failure)
 *     for each print: the converter container draws the trip and returns a
 *     JPEG at print resolution → stored in R2 → served at /files/<token>/…
 *     then the order goes to ArtBeat's partner API, one line per print.
 *   GET /status?token=…  recent orders and what happened; resend button.
 *
 * ArtBeat charges from our vendor tier and pushes fulfilment and tracking
 * back to Shopify itself. Prices are never sent.
 *
 * Secrets (Cloudflare → Workers → tripmyway-fulfil → Settings): ARTBEAT_API_KEY,
 * SHOPIFY_WEBHOOK_SECRET, STATUS_TOKEN. Variables: ARTBEAT_ENV ("dev" | "live"),
 * PUBLIC_URL, SUBMIT_TEST_ORDERS.
 */
import { Container, getContainer } from "@cloudflare/containers";
import { ARTBEAT } from "@/config/artbeat";
import { readShopifyOrder, verifyShopifyWebhook, type ShopifyOrder } from "@/lib/fulfil/shopify";
import {
  buildArtbeatOrder,
  planPrints,
  readArtbeatResponse,
  type PrintJob,
} from "@/lib/fulfil/artbeat";

export class PrintConverter extends Container {
  override defaultPort = 8080;
  override sleepAfter = "5m";
  override enableInternet = true; // map tiles and customer photos
}

interface Env {
  ORDERS: Queue<{ orderId: string }>;
  PRINTFILES: R2Bucket;
  CONVERTER: DurableObjectNamespace<PrintConverter>;
  ARTBEAT_API_KEY?: string;
  SHOPIFY_WEBHOOK_SECRET?: string;
  STATUS_TOKEN?: string;
  ARTBEAT_ENV?: string;
  PUBLIC_URL?: string;
  SUBMIT_TEST_ORDERS?: string;
}

type State =
  | "queued"
  | "making files"
  | "accepted"
  | "rejected"
  | "needs attention"
  | "skipped";

interface OrderRecord {
  order: ShopifyOrder;
  state: State;
  receivedAt: string;
  updatedAt: string;
  /** Random part of the file links, so they can't be guessed. */
  fileToken: string;
  files: { name: string; url: string; width?: number; height?: number }[];
  artbeat?: { id: string; hubOrderCreated: boolean; env: string; at: string };
  problems: string[];
  attempts: number;
  log: string[];
}

const orderKey = (id: string) => `orders/${id}.json`;
const now = () => new Date().toISOString();

async function readRecord(env: Env, id: string): Promise<OrderRecord | null> {
  const o = await env.PRINTFILES.get(orderKey(id));
  return o ? ((await o.json()) as OrderRecord) : null;
}

async function saveRecord(env: Env, r: OrderRecord, note?: string) {
  r.updatedAt = now();
  if (note) r.log = [...r.log, `${r.updatedAt} ${note}`].slice(-30);
  await env.PRINTFILES.put(orderKey(r.order.id), JSON.stringify(r), {
    httpMetadata: { contentType: "application/json" },
  });
}

const apiBase = (env: Env) => (env.ARTBEAT_ENV === "live" ? ARTBEAT.apiBase.live : ARTBEAT.apiBase.dev);

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ── Webhook ──────────────────────────────────────────────────────────────
async function onOrderPaid(request: Request, env: Env): Promise<Response> {
  const raw = await request.arrayBuffer();
  const ok = await verifyShopifyWebhook(
    new Uint8Array(raw),
    request.headers.get("x-shopify-hmac-sha256"),
    env.SHOPIFY_WEBHOOK_SECRET ?? "",
  );
  if (!ok) return new Response("Bad signature", { status: 401 });
  const order = readShopifyOrder(JSON.parse(new TextDecoder().decode(raw)));
  if (!order.id) return new Response("No order id", { status: 400 });
  if (!order.lines.some((l) => l.design)) return new Response("No TripMyWay prints", { status: 200 });

  // Shopify retries webhooks; an order already in hand isn't queued twice.
  const existing = await readRecord(env, order.id);
  if (existing && existing.state !== "needs attention") return new Response("Already received");

  const record: OrderRecord = existing ?? {
    order,
    state: "queued",
    receivedAt: now(),
    updatedAt: now(),
    fileToken: crypto.randomUUID(),
    files: [],
    problems: [],
    attempts: 0,
    log: [],
  };
  record.state = "queued";
  await saveRecord(env, record, `received ${order.name}${order.test ? " (test order)" : ""}`);
  await env.ORDERS.send({ orderId: order.id });
  return new Response("Queued");
}

// ── Print files ──────────────────────────────────────────────────────────
async function makeFile(env: Env, record: OrderRecord, p: PrintJob) {
  const key = `files/${record.fileToken}/${p.fileName}`;
  const base = (env.PUBLIC_URL ?? "").replace(/\/$/, "");
  const url = `${base}/${key}`;
  const have = await env.PRINTFILES.head(key);
  if (have) return { name: p.fileName, url };

  const converter = getContainer(env.CONVERTER, "converter");
  const res = await converter.fetch("http://converter/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      design: p.design,
      page: p.part,
      dpi: ARTBEAT.file.dpi,
      format: ARTBEAT.file.format,
      quality: ARTBEAT.file.jpegQuality,
      mirrorWrapIn: p.finish === "canvas" && ARTBEAT.canvas.mirrorInFile ? ARTBEAT.canvas.wrapIn : 0,
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`Converter failed for ${p.fileName}: ${res.status} ${err.slice(0, 200)}`);
  }
  // Stream straight into R2 (a 32 × 48 file is tens of MB; never held in memory).
  const length = Number(res.headers.get("content-length"));
  const { readable, writable } = new FixedLengthStream(length);
  const pumping = res.body.pipeTo(writable);
  await env.PRINTFILES.put(key, readable, {
    httpMetadata: { contentType: res.headers.get("content-type") ?? "image/jpeg" },
  });
  await pumping;
  return {
    name: p.fileName,
    url,
    width: Number(res.headers.get("x-width")) || undefined,
    height: Number(res.headers.get("x-height")) || undefined,
  } as OrderRecord["files"][number];
}

// ── One order ────────────────────────────────────────────────────────────
class RetryLater extends Error {}

async function processOrder(env: Env, orderId: string) {
  const record = await readRecord(env, orderId);
  if (!record || record.state === "accepted" || record.state === "skipped") return;
  record.attempts++;

  if (env.ARTBEAT_ENV === "live" && record.order.test && env.SUBMIT_TEST_ORDERS !== "true") {
    record.state = "skipped";
    await saveRecord(env, record, "Shopify test order: not sent to live ArtBeat");
    return;
  }
  const { prints, problems } = planPrints(record.order);
  if (problems.length || !record.order.shipTo) {
    record.state = "needs attention";
    record.problems = [...problems, ...(record.order.shipTo ? [] : ["No shipping address."])];
    await saveRecord(env, record, "can't be sent automatically");
    return;
  }

  record.state = "making files";
  await saveRecord(env, record, `making ${prints.length} print file(s)`);
  const files: OrderRecord["files"] = [];
  for (const p of prints) files.push(await makeFile(env, record, p));
  record.files = files;

  const body = buildArtbeatOrder(record.order, prints, (p) => files.find((f) => f.name === p.fileName)!.url);
  let res: Response;
  try {
    res = await fetch(`${apiBase(env)}/api/partner/orders`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.ARTBEAT_API_KEY ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new RetryLater(`ArtBeat unreachable: ${e instanceof Error ? e.message : e}`);
  }
  const json = await res.json().catch(() => ({}));
  const outcome = readArtbeatResponse(res.status, json);
  if (outcome.kind === "retry") throw new RetryLater(outcome.reason);
  if (outcome.kind === "accepted") {
    record.state = "accepted";
    record.problems = [];
    record.artbeat = {
      id: outcome.id,
      hubOrderCreated: outcome.hubOrderCreated,
      env: env.ARTBEAT_ENV ?? "dev",
      at: now(),
    };
    await saveRecord(env, record, `ArtBeat accepted (${outcome.id})`);
  } else {
    record.state = "rejected";
    record.problems = outcome.errors;
    await saveRecord(env, record, `ArtBeat rejected: ${outcome.errors.join("; ")}`);
  }
}

// ── Status page ──────────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function statusPage(env: Env, token: string): Promise<Response> {
  const list = await env.PRINTFILES.list({ prefix: "orders/", limit: 1000 });
  const latest = list.objects.sort((a, b) => +b.uploaded - +a.uploaded).slice(0, 40);
  const records = (
    await Promise.all(latest.map(async (o) => (await env.PRINTFILES.get(o.key))?.json<OrderRecord>()))
  ).filter(Boolean) as OrderRecord[];
  const rows = records
    .map((r) => {
      const problems = r.problems.length
        ? `<ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
        : "";
      const files = r.files.map((f) => `<a href="${esc(f.url)}">${esc(f.name)}</a>`).join("<br>");
      const resend =
        r.state === "accepted" || r.state === "skipped"
          ? ""
          : `<form method="post" action="/status/resend"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="id" value="${esc(r.order.id)}"><button>Send again</button></form>`;
      return `<tr><td><b>${esc(r.order.name)}</b>${r.order.test ? " <i>test</i>" : ""}<br><small>${esc(r.receivedAt)}</small></td><td class="s-${esc(r.state.replace(/ /g, "-"))}">${esc(r.state)}${r.artbeat ? `<br><small>ArtBeat ${esc(r.artbeat.env)} ${esc(r.artbeat.id)}${r.artbeat.hubOrderCreated ? "" : " (not in production yet)"}</small>` : ""}${problems}</td><td>${files}</td><td><small>${r.log.slice(-4).map(esc).join("<br>")}</small></td><td>${resend}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Orders to ArtBeat</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#1b2a41}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dbe1e3;padding:8px;vertical-align:top;text-align:left}.s-accepted{color:#17643a}.s-rejected,.s-needs-attention{color:#b42318}small{color:#556173}button{border-radius:99px;border:2px solid #1b2a41;background:#fff;padding:4px 12px;font-weight:600}</style>
<h1>Orders to ArtBeat <small>(${esc(env.ARTBEAT_ENV ?? "dev")})</small></h1><table><tr><th>Order</th><th>Status</th><th>Print files</th><th>Latest</th><th></th></tr>${rows || '<tr><td colspan="5">No orders yet.</td></tr>'}</table>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/shopify/orders-paid") return onOrderPaid(request, env);

    if (request.method === "GET" && url.pathname.startsWith("/files/")) {
      const obj = await env.PRINTFILES.get(decodeURIComponent(url.pathname.slice(1)));
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
          "content-length": String(obj.size),
          "cache-control": "private, max-age=3600",
        },
      });
    }

    if (url.pathname === "/status" || url.pathname === "/status/resend") {
      const form = request.method === "POST" ? await request.formData() : null;
      const token = String(form?.get("token") ?? url.searchParams.get("token") ?? "");
      if (!env.STATUS_TOKEN || !sameSecret(token, env.STATUS_TOKEN))
        return new Response("Not found", { status: 404 });
      if (url.pathname === "/status/resend" && form) {
        const id = String(form.get("id") ?? "");
        const r = await readRecord(env, id);
        if (r && r.state !== "accepted") {
          r.state = "queued";
          r.attempts = 0;
          await saveRecord(env, r, "sent again by hand");
          await env.ORDERS.send({ orderId: id });
        }
        return Response.redirect(`${url.origin}/status?token=${encodeURIComponent(token)}`, 303);
      }
      return statusPage(env, token);
    }

    if (url.pathname === "/health") return new Response("ok");
    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<{ orderId: string }>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processOrder(env, msg.body.orderId);
        msg.ack();
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        const r = await readRecord(env, msg.body.orderId);
        const last = msg.attempts >= 6;
        if (r) {
          if (last) {
            r.state = "needs attention";
            r.problems = [reason];
          }
          await saveRecord(env, r, `${last ? "gave up" : "will retry"}: ${reason}`);
        }
        if (last) msg.ack();
        else msg.retry({ delaySeconds: Math.min(1800, 60 * 2 ** (msg.attempts - 1)) });
      }
    }
  },
} satisfies ExportedHandler<Env, { orderId: string }>;
