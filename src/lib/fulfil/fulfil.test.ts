import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARTBEAT } from "@/config/artbeat";
import { SAMPLE_TRIPS } from "@/config/trip-samples";
import type { TripDesign } from "@/types/trip";
import { compactTrip } from "@/lib/trip-cart";
import { readShopifyOrder, verifyShopifyWebhook } from "./shopify";
import { buildArtbeatOrder, planPrints, readArtbeatResponse } from "./artbeat";
import { addressText, renderOrdersPage, tabOf } from "../../../fulfil/src/orders-page";
import type { OrderRecord } from "../../../fulfil/src/records";

const trip = (id: string, extra: Partial<TripDesign> = {}) => ({
  ...SAMPLE_TRIPS.find((t) => t.id === id)!.design,
  ...extra,
});
const designProp = (t: TripDesign) => JSON.stringify({ v: 2, trip: compactTrip(t) });

const address = {
  first_name: "Ada",
  last_name: "Lovelace",
  address1: "1 Main St",
  address2: "",
  city: "Fullerton",
  province_code: "CA",
  zip: "92831",
  country_code: "US",
  phone: "+1 555 0100",
};
const shopifyOrder = (lines: { design?: string; quantity?: number }[]) => ({
  id: 7001,
  name: "#1001",
  email: "ada@example.com",
  test: true,
  created_at: "2026-10-19T10:00:00-07:00",
  total_price: "89.00",
  shipping_address: address,
  billing_address: null,
  line_items: lines.map((l, i) => ({
    id: 900 + i,
    title: "Trip Map Print",
    quantity: l.quantity ?? 1,
    sku: "TMW-SINGLE-PAPER-18x24",
    price: "89.00",
    properties: [
      { name: "Trip", value: "Italy 2026" },
      ...(l.design ? [{ name: "_design", value: l.design }] : []),
      { name: "_preview", value: "https://tripmyway.test/previews/abc.png" },
    ],
  })),
});

const codes = ARTBEAT.productCodes as Record<string, Record<string, string>>;
let saved: string;
beforeEach(() => {
  saved = JSON.stringify(codes);
  codes["paper"]!["none"] = "PAPER_TEST";
  codes["canvas"]!["black"] = "CANVAS_BLKFLOAT_TEST";
});
afterEach(() => {
  const back = JSON.parse(saved) as typeof codes;
  for (const k of Object.keys(back)) codes[k] = back[k]!;
});

describe("Shopify webhooks", () => {
  it("accepts Shopify's signature and refuses anything else", async () => {
    const body = new TextEncoder().encode('{"id":1}');
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("shh"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = btoa(
      String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, body))),
    );
    expect(await verifyShopifyWebhook(body, sig, "shh")).toBe(true);
    expect(await verifyShopifyWebhook(body, sig, "other")).toBe(false);
    expect(await verifyShopifyWebhook(new TextEncoder().encode('{"id":2}'), sig, "shh")).toBe(
      false,
    );
    expect(await verifyShopifyWebhook(body, null, "shh")).toBe(false);
    expect(await verifyShopifyWebhook(body, "not base64!!", "shh")).toBe(false);
  });

  it("reads the order: addresses (billing falls back to shipping), lines and their design", () => {
    const o = readShopifyOrder(
      shopifyOrder([{ design: designProp(trip("italy")), quantity: 2 }, {}]),
    );
    expect(o.id).toBe("7001");
    expect(o.name).toBe("#1001");
    expect(o.test).toBe(true);
    expect(o.shipTo).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      provinceCode: "CA",
      countryCode: "US",
    });
    expect(o.billTo).toEqual(o.shipTo);
    expect(o.lines[0]!.quantity).toBe(2);
    expect(o.lines[0]!.design).toContain('"v":2');
    expect(o.lines[1]!.design).toBeUndefined();
    expect(o.lines[0]!.preview).toBe("https://tripmyway.test/previews/abc.png");
    expect(o.email).toBe("ada@example.com");
  });
});

describe("ArtBeat orders", () => {
  it("sends one line per print, with size and file, and never a price", () => {
    const o = readShopifyOrder(
      shopifyOrder([
        { design: designProp(trip("italy")) },
        { design: designProp(trip("pacific", { finish: "canvas", frame: "black" })), quantity: 2 },
      ]),
    );
    const { prints, problems } = planPrints(o);
    expect(problems).toEqual([]);
    expect(prints.map((p) => [p.productCode, p.part, p.parts, p.quantity])).toEqual([
      ["PAPER_TEST", 1, 1, 1],
      ["CANVAS_BLKFLOAT_TEST", 1, 2, 2],
      ["CANVAS_BLKFLOAT_TEST", 2, 2, 2],
    ]);
    expect(prints[1]!.fileName).toBe("1001-901-1of2-front.jpg");
    const body = buildArtbeatOrder(o, prints, (p) => `https://files.test/${p.fileName}`);
    expect(body.externalOrderId).toBe("7001");
    expect(body.lines[2]).toEqual({
      externalLineId: "901-2",
      productCode: "CANVAS_BLKFLOAT_TEST",
      quantity: 2,
      imageUrl: "https://files.test/1001-901-2of2-front.jpg",
      size: { width: 18, height: 24, unit: "in" },
    });
    expect(JSON.stringify(body)).not.toMatch(/price|total|subtotal|tax/i);
  });

  it("stops (rather than guesses) when a product code is missing or the design isn't a trip", () => {
    const o = readShopifyOrder(
      shopifyOrder([
        { design: designProp(trip("italy", { finish: "metal", frame: "white" })) },
        { design: JSON.stringify({ v: 1, panels: [] }) },
      ]),
    );
    const { prints, problems } = planPrints(o);
    expect(prints).toEqual([]);
    expect(problems.join(" ")).toMatch(/No ArtBeat product code for metal with a white frame/);
    expect(problems.join(" ")).toMatch(/single-place design/);
  });

  it("reads ArtBeat's answers: accepted, rejected with reasons, or try again", () => {
    expect(
      readArtbeatResponse(201, { id: "a1", status: "accepted", hubOrderCreated: false }),
    ).toEqual({
      kind: "accepted",
      id: "a1",
      hubOrderCreated: false,
    });
    expect(
      readArtbeatResponse(422, {
        status: "rejected",
        errors: [{ line: "shipTo", reason: "shipTo is missing zip" }],
      }),
    ).toEqual({ kind: "rejected", errors: ["shipTo: shipTo is missing zip"] });
    expect(readArtbeatResponse(401, { message: "API key is not valid" }).kind).toBe("rejected");
    expect(readArtbeatResponse(503, {}).kind).toBe("retry");
  });
});

describe("Manual ordering", () => {
  const order = () =>
    readShopifyOrder(
      shopifyOrder([
        { design: designProp(trip("italy", { finish: "metal", frame: "white" })) },
        { design: designProp(trip("pacific", { finish: "canvas", frame: "black" })), quantity: 2 },
        { design: JSON.stringify({ v: 1, panels: [] }) },
      ]),
    );

  it("makes files without ArtBeat product codes, with what to choose on ArtBeat", () => {
    const { prints, problems } = planPrints(order(), { requireProductCodes: false });
    expect(prints.map((p) => [p.finish, p.part, p.parts, p.quantity])).toEqual([
      ["metal", 1, 1, 1],
      ["canvas", 1, 2, 2],
      ["canvas", 2, 2, 2],
    ]);
    expect(prints[0]).toMatchObject({
      productCode: "",
      tripName: "Italy 2026",
      sizeLabel: "18 × 24″",
      finishLabel: "Metal",
      frameLabel: "White float frame",
    });
    // The single-place line can't be automated; it's flagged, the rest go ahead.
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/single-place design.*\/studio\/print/);
  });

  it("front only by default; with edge adds bleed, or the mirrored wrap on canvas", () => {
    const front = planPrints(order(), { requireProductCodes: false }).prints;
    expect(front.every((p) => p.edge === "front" && p.bleedIn === 0 && p.mirrorWrapIn === 0)).toBe(
      true,
    );
    expect(front[0]!.fileName).toMatch(/-front\.jpg$/);
    const edge = planPrints(order(), { requireProductCodes: false, edge: "edge" }).prints;
    expect([edge[0]!.bleedIn, edge[0]!.mirrorWrapIn]).toEqual([ARTBEAT.bleedIn, 0]);
    expect([edge[1]!.bleedIn, edge[1]!.mirrorWrapIn]).toEqual([0, ARTBEAT.canvas.wrapIn]);
    expect(edge[1]!.fileName).toMatch(/-edge\.jpg$/);
  });

  const record = (state: OrderRecord["state"], extra: Partial<OrderRecord> = {}): OrderRecord => {
    const o = order();
    const { prints } = planPrints(o, { requireProductCodes: false });
    return {
      order: o,
      state,
      receivedAt: "2026-10-19T17:00:00Z",
      updatedAt: "2026-10-19T17:05:00Z",
      fileToken: "tok",
      edge: "front",
      files: prints.map((p) => ({
        name: p.fileName,
        url: `https://fulfil.test/files/tok/${p.fileName}`,
        width: 5400,
        height: 7200,
        part: p.part,
        parts: p.parts,
        quantity: p.quantity,
        tripName: p.tripName,
        sizeLabel: p.sizeLabel,
        finishLabel: p.finishLabel,
        frameLabel: p.frameLabel,
        edge: p.edge,
        fileWidthIn: 18,
        fileHeightIn: 24,
      })),
      problems: [],
      attempts: 1,
      log: ["2026-10-19T17:05:00Z print files ready"],
      ...extra,
    };
  };
  const page = (records: OrderRecord[], tab: "todo" | "done" | "attention" | "all" = "todo") =>
    renderOrdersPage({
      records,
      tab,
      mode: "manual",
      artbeatEnv: "dev",
      defaultEdge: "front",
      shopifyAdminUrl: "https://admin.shopify.com/store/tripmyway-test",
      timeZone: "America/Los_Angeles",
    });

  it("shows a ready order with instructions, downloads, specs, address and Mark as ordered", () => {
    const html = page([
      record("ready to order"),
      record("ordered by hand", { manual: { at: "2026-10-20T01:00:00Z", artbeatOrder: "AB-1" } }),
    ]);
    expect(html).toContain("How to place an order on ArtBeat");
    expect(html).toMatch(/<details class="how" id="how" open>/);
    expect(html).toContain(
      'href="https://fulfil.test/files/tok/1001-900-1of1-front.jpg?download=1"',
    );
    expect(html).toContain("Print 2 of 2");
    expect(html).toContain("Black float frame");
    expect(html).toContain("5,400 × 7,200 px");
    expect(html).toContain('action="/orders/ordered"');
    expect(html).toContain("https://admin.shopify.com/store/tripmyway-test/orders/7001");
    expect(html).toContain("https://tripmyway.test/previews/abc.png");
    // The To order tab lists only what still needs ordering.
    expect(html).not.toContain("ArtBeat order <b>AB-1</b>");
    expect(html).toMatch(/To order<span class="count">1</);
    expect(
      page(
        [
          record("ordered by hand", {
            manual: { at: "2026-10-20T01:00:00Z", artbeatOrder: "AB-1" },
          }),
        ],
        "done",
      ),
    ).toContain("ArtBeat order <b>AB-1</b>");
  });

  it("copies a clean address and escapes what customers typed", () => {
    const r = record("ready to order");
    r.order.shipTo!.address2 = 'Apt "4" <b>';
    expect(addressText(r.order.shipTo!)).toBe(
      'Ada Lovelace\n1 Main St\nApt "4" <b>\nFullerton, CA 92831\nUS\n+1 555 0100',
    );
    const html = page([r]);
    expect(html).not.toContain('Apt "4" <b>');
    expect(html).toContain("Apt &quot;4&quot; &lt;b&gt;");
  });

  it("sorts states into tabs and refreshes while files are being made", () => {
    expect(tabOf("ready to order")).toBe("todo");
    expect(tabOf("making files")).toBe("todo");
    expect(tabOf("ordered by hand")).toBe("done");
    expect(tabOf("needs attention")).toBe("attention");
    expect(page([record("making files", { files: [] })])).toContain('http-equiv="refresh"');
    expect(page([record("ready to order")])).not.toContain('http-equiv="refresh"');
  });
});
