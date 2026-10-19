/**
 * Shopify side of fulfilment: check that a webhook really came from Shopify,
 * and read the parts of an order ArtBeat needs. Runs in the fulfil Worker.
 */

/** Shopify signs each webhook: base64 HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyShopifyWebhook(
  rawBody: ArrayBuffer | Uint8Array,
  hmacHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!hmacHeader || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, rawBody as Uint8Array<ArrayBuffer>),
  );
  let given: Uint8Array;
  try {
    given = Uint8Array.from(atob(hmacHeader.trim()), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  if (given.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig[i]! ^ given[i]!;
  return diff === 0;
}

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  provinceCode: string;
  zip: string;
  countryCode: string;
  phone?: string;
}

export interface OrderLine {
  lineItemId: string;
  title: string;
  quantity: number;
  sku: string;
  /** The `_design` line property (JSON), when the line is one of our prints. */
  design?: string;
}

export interface ShopifyOrder {
  id: string;
  /** e.g. "#1001" */
  name: string;
  test: boolean;
  createdAt: string;
  shipTo: Address | null;
  billTo: Address | null;
  lines: OrderLine[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function address(a: unknown, fallbackPhone: string): Address | null {
  if (!a || typeof a !== "object") return null;
  const r = a as Raw;
  let first = str(r["first_name"]);
  let last = str(r["last_name"]);
  // Some checkouts only fill "name"; split it so ArtBeat gets both parts.
  if (!last && str(r["name"])) {
    const parts = str(r["name"]).split(/\s+/);
    last = parts.length > 1 ? parts.pop()! : parts[0]!;
    first = first || parts.join(" ");
  }
  const company = str(r["company"]);
  const address2 = str(r["address2"]);
  const phone = str(r["phone"]) || fallbackPhone;
  return {
    firstName: first,
    lastName: last,
    ...(company ? { company } : {}),
    address1: str(r["address1"]),
    ...(address2 ? { address2 } : {}),
    city: str(r["city"]),
    // Countries without provinces leave this empty; ArtBeat then rejects with a clear reason.
    provinceCode: str(r["province_code"]),
    zip: str(r["zip"]),
    countryCode: (str(r["country_code"]) || "US").toUpperCase(),
    ...(phone ? { phone } : {}),
  };
}

/** The order as the fulfil Worker keeps it (small: no prices, no customer history). */
export function readShopifyOrder(payload: unknown): ShopifyOrder {
  const o = (payload ?? {}) as Raw;
  const phone = str(o["phone"]);
  const shipTo = address(o["shipping_address"], phone);
  const billTo = address(o["billing_address"], phone) ?? shipTo;
  const lines = (Array.isArray(o["line_items"]) ? (o["line_items"] as Raw[]) : []).map((li) => {
    const props = Array.isArray(li["properties"]) ? (li["properties"] as Raw[]) : [];
    const design = props.find((p) => str(p["name"]) === "_design");
    return {
      lineItemId: str(li["id"]),
      title: str(li["title"]),
      quantity: Math.max(1, Number(li["quantity"]) || 1),
      sku: str(li["sku"]),
      ...(design ? { design: str(design["value"]) } : {}),
    };
  });
  return {
    id: str(o["id"]),
    name: str(o["name"]) || `#${str(o["order_number"])}`,
    test: o["test"] === true,
    createdAt: str(o["created_at"]),
    shipTo,
    billTo,
    lines,
  };
}
