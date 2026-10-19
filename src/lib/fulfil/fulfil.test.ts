import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARTBEAT } from "@/config/artbeat";
import { SAMPLE_TRIPS } from "@/config/trip-samples";
import type { TripDesign } from "@/types/trip";
import { compactTrip } from "@/lib/trip-cart";
import { readShopifyOrder, verifyShopifyWebhook } from "./shopify";
import { buildArtbeatOrder, planPrints, readArtbeatResponse } from "./artbeat";

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
    expect(prints[1]!.fileName).toBe("1001-901-1of2.jpg");
    const body = buildArtbeatOrder(o, prints, (p) => `https://files.test/${p.fileName}`);
    expect(body.externalOrderId).toBe("7001");
    expect(body.lines[2]).toEqual({
      externalLineId: "901-2",
      productCode: "CANVAS_BLKFLOAT_TEST",
      quantity: 2,
      imageUrl: "https://files.test/1001-901-2of2.jpg",
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
