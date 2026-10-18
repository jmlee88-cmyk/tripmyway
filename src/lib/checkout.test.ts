import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMIZATION,
  PRINT_FINISHES,
  PRINT_FORMATS,
  PRINT_SIZES,
} from "@/config/products";
import { SHOPIFY } from "@/config/shopify";
import type { CartItem } from "@/types/product";
import { ensurePanels } from "./print-set";
import { createCheckout, toCheckoutLine } from "./checkout";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: "i",
  name: "",
  customization: { ...DEFAULT_CUSTOMIZATION, printSize: "12x18" },
  price: 69,
  quantity: 2,
  addedAt: 0,
  ...over,
});

describe("Shopify checkout lines", () => {
  it("maps a single print to its size variant with readable and hidden details", () => {
    const line = toCheckoutLine(item());
    expect(line.merchandiseId).toBe(SHOPIFY.variants.single.paper["12x18"]);
    expect(line.quantity).toBe(2);
    const keys = line.attributes.map((a) => a.key);
    expect(keys).toContain("Title");
    expect(keys).toContain("_Latitude");
    expect(keys).not.toContain("Latitude");
    const design = JSON.parse(line.attributes.find((a) => a.key === "_design")!.value);
    expect(design.panels).toHaveLength(1);
    expect(design.panels[0].location.latitude).toBe(DEFAULT_CUSTOMIZATION.location!.latitude);
  });

  it("maps a set of two to the diptych variant", () => {
    const panels = ensurePanels([{ ...DEFAULT_CUSTOMIZATION, printSize: "18x24" }], 2);
    const line = toCheckoutLine(item({ customization: panels[0]!, panels }));
    expect(line.merchandiseId).toBe(SHOPIFY.variants.diptych.paper["18x24"]);
  });

  it("points at the TripMyWay store, never Atlas & Ink", () => {
    expect(SHOPIFY.storeDomain).toBe("tripmyway-bf2kmucg.myshopify.com");
    const ids = JSON.stringify([SHOPIFY.variants, SHOPIFY.framedVariants]);
    expect(ids).not.toContain("TODO");
    expect(new Set(ids.match(/ProductVariant\/\d+/g)).size).toBe(120);
  });

  it("maps a set to the set variant with every panel", () => {
    const panels = ensurePanels([{ ...DEFAULT_CUSTOMIZATION, printSize: "24x36" }], 3);
    const line = toCheckoutLine(item({ customization: panels[0]!, panels }));
    expect(line.merchandiseId).toBe(SHOPIFY.variants.triptych.paper["24x36"]);
    const keys = line.attributes.map((a) => a.key);
    expect(keys).toContain("Panel 3 Title");
    expect(keys).toContain("_Panel 2 Latitude");
    expect(keys).toContain("_Panel 2 Coordinates");
    expect(keys).toContain("_Size");
    expect(keys).toContain("Style");
    expect(JSON.parse(line.attributes.find((a) => a.key === "_design")!.value).panels).toHaveLength(
      3,
    );
  });

  it("picks the variant for the finish and size, and shows the finish on the order", () => {
    const line = toCheckoutLine(
      item({ customization: { ...DEFAULT_CUSTOMIZATION, printSize: "32x48", finish: "acrylic" } }),
    );
    expect(line.merchandiseId).toBe(SHOPIFY.variants.single.acrylic["32x48"]);
    expect(line.attributes).toContainEqual({ key: "Finish", value: "Acrylic" });
  });

  it("treats designs saved before finishes existed as paper", () => {
    const { finish: _omit, ...old } = { ...DEFAULT_CUSTOMIZATION, printSize: "8x10" as const };
    const line = toCheckoutLine(item({ customization: old }));
    expect(line.merchandiseId).toBe(SHOPIFY.variants.single.paper["8x10"]);
    expect(line.attributes).toContainEqual({ key: "Finish", value: "Fine art paper" });
  });

  it("uses the framed variant and names the frame on the order", () => {
    const line = toCheckoutLine(
      item({
        customization: {
          ...DEFAULT_CUSTOMIZATION,
          printSize: "18x24",
          finish: "metal",
          frame: "black",
        },
      }),
    );
    expect(line.merchandiseId).toBe(SHOPIFY.framedVariants.single.metal["18x24"]);
    expect(line.attributes).toContainEqual({ key: "Frame", value: "Black float frame" });
    const paper = toCheckoutLine(
      item({ customization: { ...DEFAULT_CUSTOMIZATION, printSize: "8x10", frame: "gold" } }),
    );
    expect(paper.merchandiseId).toBe(SHOPIFY.framedVariants.single.paper["8x10"]);
    expect(paper.attributes).toContainEqual({ key: "Frame", value: "Gold box frame" });
  });

  it("ignores a frame colour the finish doesn't offer", () => {
    // Gold is a box-frame colour; canvas only has float frames.
    const line = toCheckoutLine(
      item({
        customization: {
          ...DEFAULT_CUSTOMIZATION,
          printSize: "8x10",
          finish: "canvas",
          frame: "gold",
        },
      }),
    );
    expect(line.merchandiseId).toBe(SHOPIFY.variants.single.canvas["8x10"]);
    expect(line.attributes.map((a) => a.key)).not.toContain("Frame");
    expect(line.attributes).toContainEqual({ key: "Layout", value: "With margin" });
  });

  it("has a distinct Shopify variant for every format, finish, size and frame", () => {
    const ids = [SHOPIFY.variants, SHOPIFY.framedVariants].flatMap((v) =>
      Object.values(v).flatMap((f) => Object.values(f).flatMap((s) => Object.values(s))),
    );
    expect(ids).toHaveLength(2 * PRINT_FORMATS.length * PRINT_FINISHES.length * PRINT_SIZES.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses to start without a storefront token", async () => {
    if (SHOPIFY.storefrontToken) return;
    await expect(createCheckout([item()])).rejects.toThrow(/isn't connected/);
  });
});

describe("clearing the cart after purchase", () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage ??= {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;

  const respond = (body: unknown) =>
    (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

  it("keeps the cart while the Shopify cart still exists", async () => {
    if (!SHOPIFY.storefrontToken) return;
    const { reconcileCheckout } = await import("./checkout");
    localStorage.setItem(
      "tripmyway-checkout-v1",
      JSON.stringify({ cartId: "c", itemIds: ["a"], at: Date.now() }),
    );
    expect(await reconcileCheckout(respond({ data: { cart: { id: "c" } } }))).toBe(false);
    expect(localStorage.getItem("tripmyway-checkout-v1")).not.toBeNull();
  });

  it("clears bought items when Shopify has deleted the cart", async () => {
    if (!SHOPIFY.storefrontToken) return;
    const { reconcileCheckout } = await import("./checkout");
    localStorage.setItem(
      "tripmyway-checkout-v1",
      JSON.stringify({ cartId: "c", itemIds: ["a"], at: Date.now() }),
    );
    expect(await reconcileCheckout(respond({ data: { cart: null } }))).toBe(true);
    expect(localStorage.getItem("tripmyway-checkout-v1")).toBeNull();
  });

  it("does nothing on an API error", async () => {
    if (!SHOPIFY.storefrontToken) return;
    const { reconcileCheckout } = await import("./checkout");
    localStorage.setItem(
      "tripmyway-checkout-v1",
      JSON.stringify({ cartId: "c", itemIds: ["a"], at: Date.now() }),
    );
    expect(await reconcileCheckout(respond({ errors: [{ message: "x" }] }))).toBe(false);
    expect(localStorage.getItem("tripmyway-checkout-v1")).not.toBeNull();
  });
});
