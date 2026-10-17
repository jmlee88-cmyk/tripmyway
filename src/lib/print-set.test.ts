import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMIZATION,
  FRAME_PRICES,
  PRINT_FINISHES,
  PRINT_SIZES,
  formatPrice,
  getPrintSize,
} from "@/config/products";
import { applyPanelPatch, ensurePanels } from "./print-set";
import { itemLineItemProperties, validatePanels } from "./cart";
import type { CartItem } from "@/types/product";

const base = { ...DEFAULT_CUSTOMIZATION, styleId: "vintage", printSize: "12x18" as const };

describe("print sets", () => {
  it("adds seeded panels that share the first panel's style, size and layout", () => {
    const set = ensurePanels([base], 3);
    expect(set).toHaveLength(3);
    expect(set[0]).toEqual(base);
    for (const p of set) {
      expect(p.styleId).toBe("vintage");
      expect(p.printSize).toBe("12x18");
    }
    expect(set[1]!.location?.id).not.toBe(base.location?.id);
    expect(set[1]!.subtitle).toBeTruthy();
  });

  it("keeps existing panels when growing again", () => {
    const set = ensurePanels([base], 3);
    const edited = applyPanelPatch(set, 2, { title: "THREE" });
    expect(ensurePanels(edited, 3)[2]!.title).toBe("THREE");
  });

  it("applies shared fields to every panel and own fields to the active panel only", () => {
    const set = ensurePanels([base], 3);
    const next = applyPanelPatch(set, 1, {
      styleId: "midnight",
      title: "TWO",
      zoomLevel: "neighborhood",
    });
    expect(next.map((p) => p.styleId)).toEqual(["midnight", "midnight", "midnight"]);
    expect(next.map((p) => p.title)).toEqual([set[0]!.title, "TWO", set[2]!.title]);
    expect(next[0]!.zoomLevel).toBe(set[0]!.zoomLevel);
    expect(next[1]!.zoomLevel).toBe("neighborhood");
  });

  it("prices finishes per size, paper unchanged, and shares the finish across a set", () => {
    expect(formatPrice("24x36", 1)).toBe(129);
    expect(formatPrice("24x36", 1, "paper")).toBe(129);
    expect(formatPrice("32x48", 1)).toBe(179);
    expect(formatPrice("12x18", 3, "metal")).toBe(149 * 3);
    for (const f of PRINT_FINISHES)
      for (const s of PRINT_SIZES) expect(formatPrice(s.id, 1, f.id)).toBeGreaterThan(0);
    const set = applyPanelPatch(ensurePanels([base], 3), 2, { finish: "canvas" });
    expect(set.map((p) => p.finish)).toEqual(["canvas", "canvas", "canvas"]);
    const framed = applyPanelPatch(set, 1, { frame: "natural" });
    expect(framed.map((p) => p.frame)).toEqual(["natural", "natural", "natural"]);
  });

  it("adds the frame price per panel, only for frame colours the finish offers", () => {
    expect(formatPrice("24x36", 1, "paper", "black")).toBe(129 + FRAME_PRICES.paper["24x36"]);
    expect(formatPrice("12x18", 3, "metal", "white")).toBe((149 + FRAME_PRICES.metal["12x18"]) * 3);
    expect(formatPrice("12x18", 1, "metal", "gold")).toBe(149);
    expect(formatPrice("12x18", 1, "metal", "none")).toBe(149);
  });

  it("prices a set as one print of the size per panel", () => {
    expect(formatPrice("18x24", 3)).toBe(getPrintSize("18x24").price * 3);
  });

  it("prefixes validation errors with the panel", () => {
    const set = applyPanelPatch(ensurePanels([base], 3), 2, { title: " " });
    expect(validatePanels(set)).toEqual(["Panel 3: Add a title for your print."]);
    expect(validatePanels([{ ...base, title: "" }])).toEqual(["Add a title for your print."]);
  });

  it("flattens a set into Shopify line-item properties", () => {
    const panels = ensurePanels([base], 3);
    const item: CartItem = {
      id: "x",
      name: "",
      customization: panels[0]!,
      panels,
      price: 0,
      quantity: 1,
      addedAt: 0,
    };
    const props = itemLineItemProperties(item);
    expect(props["Format"]).toBe("Set of 3");
    expect(props["Size"]).toBe("12 × 18");
    expect(props["Panel 3 Title"]).toBe(panels[2]!.title);
    expect(props["Panel 1 Style"]).toBeUndefined();
  });
});
