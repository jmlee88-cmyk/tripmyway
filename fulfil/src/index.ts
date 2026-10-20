/**
 * tripmyway-fulfil — paid Shopify orders → print files → ArtBeat.
 *
 *   Shopify "order paid" webhook → POST /shopify/orders-paid
 *     checks Shopify's signature, keeps the order (R2), queues it, answers 200.
 *   Queue consumer (one order at a time, retried on failure)
 *     for each print: the converter container draws the trip and returns a
 *     JPEG at print resolution → stored in R2 → served at /files/<token>/…
 *     FULFIL_MODE "manual": the order waits as "ready to order" on the orders
 *       page, where someone downloads the files and orders on ArtBeat by hand.
 *     FULFIL_MODE "api": the order goes to ArtBeat's partner API, one line per print.
 *   GET /orders  the orders page (access code, remembered for 30 days):
 *     instructions, files, ship-to, "Mark as ordered", remake files front only
 *     or with bleed / canvas edge. /status?token=… still works and signs in.
 *
 * ArtBeat charges from our vendor tier and pushes fulfilment and tracking
 * back to Shopify itself. Prices are never sent.
 *
 * Secrets (Cloudflare → Workers → tripmyway-fulfil → Settings): STATUS_TOKEN
 * (the orders page access code), SHOPIFY_WEBHOOK_SECRET, and for API mode
 * ARTBEAT_API_KEY. Variables: FULFIL_MODE ("manual" | "api"), PRINT_EDGE
 * ("front" | "edge"), ARTBEAT_ENV ("dev" | "live"), PUBLIC_URL,
 * SUBMIT_TEST_ORDERS, SHOPIFY_ADMIN_URL, TIME_ZONE.
 */
import { Container, getContainer } from "@cloudflare/containers";
import { ARTBEAT, type PrintEdge } from "@/config/artbeat";
import { readShopifyOrder, verifyShopifyWebhook } from "@/lib/fulfil/shopify";
import {
  buildArtbeatOrder,
  planPrints,
  readArtbeatResponse,
  type PrintJob,
} from "@/lib/fulfil/artbeat";
import type { OrderRecord } from "./records";
import { renderLoginPage, renderOrdersPage, type Tab } from "./orders-page";

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
  FULFIL_MODE?: string;
  PRINT_EDGE?: string;
  SHOPIFY_ADMIN_URL?: string;
  TIME_ZONE?: string;
}

/** Manual unless FULFIL_MODE is exactly "api". */
const isManual = (env: Env) => env.FULFIL_MODE !== "api";
const asEdge = (v: unknown, fallback: PrintEdge): PrintEdge =>
  v === "front" || v === "edge" ? v : fallback;
const defaultEdge = (env: Env) => asEdge(env.PRINT_EDGE, ARTBEAT.edge);

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

const apiBase = (env: Env) =>
  env.ARTBEAT_ENV === "live" ? ARTBEAT.apiBase.live : ARTBEAT.apiBase.dev;

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
  if (!order.lines.some((l) => l.design))
    return new Response("No TripMyWay prints", { status: 200 });

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
function fileDetails(p: PrintJob) {
  const add = 2 * (p.bleedIn + p.mirrorWrapIn);
  return {
    part: p.part,
    parts: p.parts,
    quantity: p.quantity,
    tripName: p.tripName,
    sizeLabel: p.sizeLabel,
    finishLabel: p.finishLabel,
    frameLabel: p.frameLabel,
    edge: p.edge,
    fileWidthIn: p.size.width + add,
    fileHeightIn: p.size.height + add,
  };
}

async function makeFile(
  env: Env,
  record: OrderRecord,
  p: PrintJob,
): Promise<OrderRecord["files"][number]> {
  const key = `files/${record.fileToken}/${p.fileName}`;
  const base = (env.PUBLIC_URL ?? "").replace(/\/$/, "");
  const url = `${base}/${key}`;
  const have = await env.PRINTFILES.head(key);
  if (have) {
    const before = record.files.find((f) => f.name === p.fileName);
    return {
      name: p.fileName,
      url,
      width: before?.width ?? (Number(have.customMetadata?.["width"]) || undefined),
      height: before?.height ?? (Number(have.customMetadata?.["height"]) || undefined),
      ...fileDetails(p),
    };
  }

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
      bleedIn: p.bleedIn,
      mirrorWrapIn: p.mirrorWrapIn,
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`Converter failed for ${p.fileName}: ${res.status} ${err.slice(0, 200)}`);
  }
  // Stream straight into R2 (a 32 × 48 file is tens of MB; never held in memory).
  const length = Number(res.headers.get("content-length"));
  const width = Number(res.headers.get("x-width")) || undefined;
  const height = Number(res.headers.get("x-height")) || undefined;
  const { readable, writable } = new FixedLengthStream(length);
  const pumping = res.body.pipeTo(writable);
  await env.PRINTFILES.put(key, readable, {
    httpMetadata: { contentType: res.headers.get("content-type") ?? "image/jpeg" },
    customMetadata: { width: String(width ?? ""), height: String(height ?? "") },
  });
  await pumping;
  return { name: p.fileName, url, width, height, ...fileDetails(p) };
}

// ── One order ────────────────────────────────────────────────────────────
class RetryLater extends Error {}

async function processOrder(env: Env, orderId: string) {
  const record = await readRecord(env, orderId);
  if (!record || ["accepted", "skipped", "ordered by hand"].includes(record.state)) return;
  record.attempts++;
  const manual = isManual(env);

  if (
    !manual &&
    env.ARTBEAT_ENV === "live" &&
    record.order.test &&
    env.SUBMIT_TEST_ORDERS !== "true"
  ) {
    record.state = "skipped";
    await saveRecord(env, record, "Shopify test order: not sent to live ArtBeat");
    return;
  }
  const edge = record.edge ?? defaultEdge(env);
  const { prints, problems } = planPrints(record.order, { requireProductCodes: !manual, edge });
  const noAddress = record.order.shipTo ? [] : ["No shipping address on this order."];
  // Automatic sending stops at any problem; by hand, the files are still made
  // for whatever can be made and the problems are shown beside them.
  if (manual ? !prints.length : problems.length || noAddress.length) {
    record.state = "needs attention";
    record.problems = [...problems, ...noAddress];
    await saveRecord(
      env,
      record,
      manual ? "no print files could be made" : "can't be sent automatically",
    );
    return;
  }

  record.state = "making files";
  record.problems = [];
  await saveRecord(
    env,
    record,
    `making ${prints.length} print file(s), ${edge === "front" ? "front only" : "with bleed / canvas edge"}`,
  );
  const files: OrderRecord["files"] = [];
  for (const p of prints) files.push(await makeFile(env, record, p));
  record.files = files;

  if (manual) {
    record.state = "ready to order";
    record.problems = [...problems, ...noAddress];
    await saveRecord(env, record, "print files ready: place the order on ArtBeat");
    return;
  }

  const body = buildArtbeatOrder(
    record.order,
    prints,
    (p) => files.find((f) => f.name === p.fileName)!.url,
  );
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

// ── Orders page ──────────────────────────────────────────────────────────
const COOKIE = "tmw_orders";
const TABS: Tab[] = ["todo", "done", "attention", "all"];

function signedIn(request: Request, env: Env, url: URL, form: FormData | null) {
  if (!env.STATUS_TOKEN) return false;
  const given =
    String(form?.get("token") ?? url.searchParams.get("token") ?? "") ||
    (request.headers.get("cookie") ?? "")
      .split(/;\s*/)
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) ||
    "";
  return sameSecret(decodeURIComponent(given), env.STATUS_TOKEN);
}

const signInCookie = (env: Env) =>
  `${COOKIE}=${encodeURIComponent(env.STATUS_TOKEN ?? "")}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax`;

function goTo(url: URL, path: string, flash?: string, extraHeaders: Record<string, string> = {}) {
  const to = new URL(path, url.origin);
  if (flash) to.searchParams.set("msg", flash);
  return new Response(null, { status: 303, headers: { location: to.toString(), ...extraHeaders } });
}

async function ordersPage(env: Env, url: URL): Promise<Response> {
  const list = await env.PRINTFILES.list({ prefix: "orders/", limit: 1000 });
  const latest = list.objects.sort((a, b) => +b.uploaded - +a.uploaded).slice(0, 150);
  const records = (
    await Promise.all(
      latest.map(async (o) => (await env.PRINTFILES.get(o.key))?.json<OrderRecord>()),
    )
  ).filter(Boolean) as OrderRecord[];
  const tab = TABS.includes(url.searchParams.get("show") as Tab)
    ? (url.searchParams.get("show") as Tab)
    : "todo";
  const html = renderOrdersPage({
    records,
    tab,
    mode: isManual(env) ? "manual" : "api",
    artbeatEnv: env.ARTBEAT_ENV ?? "dev",
    defaultEdge: defaultEdge(env),
    shopifyAdminUrl: env.SHOPIFY_ADMIN_URL?.replace(/\/$/, ""),
    timeZone: env.TIME_ZONE || "America/Los_Angeles",
    flash: url.searchParams.get("msg")?.slice(0, 200) || undefined,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** POST /orders/<action>: the buttons on the orders page. */
async function orderAction(env: Env, url: URL, action: string, form: FormData): Promise<Response> {
  const id = String(form.get("id") ?? "");
  const r = id ? await readRecord(env, id) : null;
  if (!r) return goTo(url, "/orders", "That order wasn't found.");
  const back = `/orders?show=${encodeURIComponent(String(form.get("show") ?? "todo"))}`;
  const name = r.order.name;

  if (action === "ordered" && r.state === "ready to order") {
    const artbeatOrder = String(form.get("artbeat") ?? "")
      .trim()
      .slice(0, 60);
    r.state = "ordered by hand";
    r.manual = { at: now(), ...(artbeatOrder ? { artbeatOrder } : {}) };
    await saveRecord(
      env,
      r,
      `marked as ordered on ArtBeat${artbeatOrder ? ` (${artbeatOrder})` : ""}`,
    );
    return goTo(url, back, `${name} marked as ordered.`);
  }
  if (action === "undo" && r.state === "ordered by hand") {
    r.state = "ready to order";
    delete r.manual;
    await saveRecord(env, r, "moved back to ready to order");
    return goTo(url, back, `${name} is back in To order.`);
  }
  if ((action === "retry" || action === "remake") && r.state !== "accepted") {
    if (action === "remake") r.edge = asEdge(form.get("edge"), r.edge ?? defaultEdge(env));
    if (r.state === "ordered by hand") delete r.manual;
    r.state = "queued";
    r.attempts = 0;
    await saveRecord(
      env,
      r,
      action === "remake"
        ? `files to be made again (${r.edge === "front" ? "front only" : "with bleed / canvas edge"})`
        : "tried again by hand",
    );
    await env.ORDERS.send({ orderId: id });
    return goTo(url, "/orders?show=todo", `Making files for ${name}. This takes a minute or two.`);
  }
  return goTo(url, back);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/shopify/orders-paid")
      return onOrderPaid(request, env);

    if (request.method === "GET" && url.pathname.startsWith("/files/")) {
      const key = decodeURIComponent(url.pathname.slice(1));
      const obj = await env.PRINTFILES.get(key);
      if (!obj)
        return new Response(
          'This file has expired or doesn\'t exist. Use "Make files again" on the orders page.',
          { status: 404 },
        );
      const name = key
        .split("/")
        .pop()!
        .replace(/[^\w.-]/g, "_");
      return new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
          "content-length": String(obj.size),
          "cache-control": "private, max-age=3600",
          ...(url.searchParams.has("download")
            ? { "content-disposition": `attachment; filename="${name}"` }
            : {}),
        },
      });
    }

    // The orders page. /status (the old address) still works, and so does ?token=.
    if (
      url.pathname === "/" ||
      url.pathname.startsWith("/status") ||
      url.pathname.startsWith("/orders")
    ) {
      const form = request.method === "POST" ? await request.formData() : null;
      if (url.pathname === "/orders/login" && form) {
        const code = String(form.get("code") ?? "").trim();
        if (!env.STATUS_TOKEN || !sameSecret(code, env.STATUS_TOKEN))
          return new Response(renderLoginPage("That code isn't right."), {
            status: 401,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        return goTo(url, "/orders", undefined, { "set-cookie": signInCookie(env) });
      }
      if (!signedIn(request, env, url, form))
        return new Response(renderLoginPage(), {
          status: env.STATUS_TOKEN ? 401 : 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      // A link with ?token= signs this browser in and drops the code from the address bar.
      if (
        request.method === "GET" &&
        (url.searchParams.has("token") || !url.pathname.startsWith("/orders"))
      )
        return goTo(url, "/orders", undefined, { "set-cookie": signInCookie(env) });
      if (url.pathname === "/status/resend" && form) return orderAction(env, url, "retry", form);
      const action = url.pathname.match(/^\/orders\/(ordered|undo|retry|remake)$/)?.[1];
      if (action && form) return orderAction(env, url, action, form);
      return ordersPage(env, url);
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
