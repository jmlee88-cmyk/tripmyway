import type { PrintFinish, PrintFormat, PrintSizeId } from "@/types/product";

/**
 * Shopify (checkout only). TripMyWay has its OWN store, separate from Atlas & Ink:
 * tripmyway-bf2kmucg.myshopify.com, headless storefront "Tripmyway Headless".
 * The site keeps its own cart; at checkout it creates
 * a Shopify cart through the Storefront API and sends the customer to
 * Shopify's checkout. Prices are Shopify's, per variant below.
 *
 * The Storefront access token is PUBLIC by design (it can only read products
 * and create carts) and is safe in the browser. Never put the Admin API token
 * here. Both values can be overridden at build time with
 * VITE_SHOPIFY_STORE_DOMAIN / VITE_SHOPIFY_STOREFRONT_TOKEN.
 */
export const SHOPIFY = {
  storeDomain:
    (import.meta.env["VITE_SHOPIFY_STORE_DOMAIN"] as string | undefined) ??
    "tripmyway-bf2kmucg.myshopify.com",
  // Public Storefront API token from the TripMyWay store's "Tripmyway Headless" channel.
  storefrontToken:
    (import.meta.env["VITE_SHOPIFY_STOREFRONT_TOKEN"] as string | undefined) ??
    "a8d90d8cb3bea2b7f49153dd2893da29",
  apiVersion: "2026-07",
  /**
   * Product variant per format, finish and size (products "Trip Map Print",
   * "Trip Map Diptych (Set of Two)" and "Trip Map Triptych (Set of Three)",
   * options Size × Finish × Frame; set prices are 2× / 3× the single print). Paper variants are the
   * originals; prices in Shopify match FINISH_PRICES in config/products.ts.
   */
  variants: {
    single: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663732183110",
        "12x18": "gid://shopify/ProductVariant/50663732248646",
        "18x24": "gid://shopify/ProductVariant/50663732314182",
        "24x36": "gid://shopify/ProductVariant/50663732379718",
        "32x48": "gid://shopify/ProductVariant/50663732445254",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663732510790",
        "12x18": "gid://shopify/ProductVariant/50663732576326",
        "18x24": "gid://shopify/ProductVariant/50663732641862",
        "24x36": "gid://shopify/ProductVariant/50663732707398",
        "32x48": "gid://shopify/ProductVariant/50663732772934",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663732838470",
        "12x18": "gid://shopify/ProductVariant/50663732904006",
        "18x24": "gid://shopify/ProductVariant/50663732969542",
        "24x36": "gid://shopify/ProductVariant/50663733035078",
        "32x48": "gid://shopify/ProductVariant/50663733100614",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663733166150",
        "12x18": "gid://shopify/ProductVariant/50663733231686",
        "18x24": "gid://shopify/ProductVariant/50663733297222",
        "24x36": "gid://shopify/ProductVariant/50663733362758",
        "32x48": "gid://shopify/ProductVariant/50663733428294",
      },
    },
    diptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663733723206",
        "12x18": "gid://shopify/ProductVariant/50663733788742",
        "18x24": "gid://shopify/ProductVariant/50663733854278",
        "24x36": "gid://shopify/ProductVariant/50663733919814",
        "32x48": "gid://shopify/ProductVariant/50663733985350",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663734050886",
        "12x18": "gid://shopify/ProductVariant/50663734116422",
        "18x24": "gid://shopify/ProductVariant/50663734181958",
        "24x36": "gid://shopify/ProductVariant/50663734247494",
        "32x48": "gid://shopify/ProductVariant/50663734313030",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663734378566",
        "12x18": "gid://shopify/ProductVariant/50663734444102",
        "18x24": "gid://shopify/ProductVariant/50663734509638",
        "24x36": "gid://shopify/ProductVariant/50663734575174",
        "32x48": "gid://shopify/ProductVariant/50663734640710",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663734706246",
        "12x18": "gid://shopify/ProductVariant/50663734771782",
        "18x24": "gid://shopify/ProductVariant/50663734837318",
        "24x36": "gid://shopify/ProductVariant/50663734902854",
        "32x48": "gid://shopify/ProductVariant/50663734968390",
      },
    },
    triptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663735296070",
        "12x18": "gid://shopify/ProductVariant/50663735361606",
        "18x24": "gid://shopify/ProductVariant/50663735427142",
        "24x36": "gid://shopify/ProductVariant/50663735492678",
        "32x48": "gid://shopify/ProductVariant/50663735558214",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663735623750",
        "12x18": "gid://shopify/ProductVariant/50663735689286",
        "18x24": "gid://shopify/ProductVariant/50663735754822",
        "24x36": "gid://shopify/ProductVariant/50663735820358",
        "32x48": "gid://shopify/ProductVariant/50663735885894",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663735951430",
        "12x18": "gid://shopify/ProductVariant/50663736016966",
        "18x24": "gid://shopify/ProductVariant/50663736082502",
        "24x36": "gid://shopify/ProductVariant/50663736148038",
        "32x48": "gid://shopify/ProductVariant/50663736213574",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663736279110",
        "12x18": "gid://shopify/ProductVariant/50663736344646",
        "18x24": "gid://shopify/ProductVariant/50663736410182",
        "24x36": "gid://shopify/ProductVariant/50663736475718",
        "32x48": "gid://shopify/ProductVariant/50663736541254",
      },
    },
  } satisfies Record<PrintFormat, Record<PrintFinish, Record<PrintSizeId, string>>>,
  /**
   * The same with a frame (Shopify option Frame = "Box frame" for paper,
   * "Float frame" otherwise; the colour travels as the "Frame" line detail).
   * Prices = finish price + FRAME_PRICES in config/products.ts.
   */
  framedVariants: {
    single: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663732215878",
        "12x18": "gid://shopify/ProductVariant/50663732281414",
        "18x24": "gid://shopify/ProductVariant/50663732346950",
        "24x36": "gid://shopify/ProductVariant/50663732412486",
        "32x48": "gid://shopify/ProductVariant/50663732478022",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663732543558",
        "12x18": "gid://shopify/ProductVariant/50663732609094",
        "18x24": "gid://shopify/ProductVariant/50663732674630",
        "24x36": "gid://shopify/ProductVariant/50663732740166",
        "32x48": "gid://shopify/ProductVariant/50663732805702",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663732871238",
        "12x18": "gid://shopify/ProductVariant/50663732936774",
        "18x24": "gid://shopify/ProductVariant/50663733002310",
        "24x36": "gid://shopify/ProductVariant/50663733067846",
        "32x48": "gid://shopify/ProductVariant/50663733133382",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663733198918",
        "12x18": "gid://shopify/ProductVariant/50663733264454",
        "18x24": "gid://shopify/ProductVariant/50663733329990",
        "24x36": "gid://shopify/ProductVariant/50663733395526",
        "32x48": "gid://shopify/ProductVariant/50663733461062",
      },
    },
    diptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663733755974",
        "12x18": "gid://shopify/ProductVariant/50663733821510",
        "18x24": "gid://shopify/ProductVariant/50663733887046",
        "24x36": "gid://shopify/ProductVariant/50663733952582",
        "32x48": "gid://shopify/ProductVariant/50663734018118",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663734083654",
        "12x18": "gid://shopify/ProductVariant/50663734149190",
        "18x24": "gid://shopify/ProductVariant/50663734214726",
        "24x36": "gid://shopify/ProductVariant/50663734280262",
        "32x48": "gid://shopify/ProductVariant/50663734345798",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663734411334",
        "12x18": "gid://shopify/ProductVariant/50663734476870",
        "18x24": "gid://shopify/ProductVariant/50663734542406",
        "24x36": "gid://shopify/ProductVariant/50663734607942",
        "32x48": "gid://shopify/ProductVariant/50663734673478",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663734739014",
        "12x18": "gid://shopify/ProductVariant/50663734804550",
        "18x24": "gid://shopify/ProductVariant/50663734870086",
        "24x36": "gid://shopify/ProductVariant/50663734935622",
        "32x48": "gid://shopify/ProductVariant/50663735001158",
      },
    },
    triptych: {
      paper: {
        "8x10": "gid://shopify/ProductVariant/50663735328838",
        "12x18": "gid://shopify/ProductVariant/50663735394374",
        "18x24": "gid://shopify/ProductVariant/50663735459910",
        "24x36": "gid://shopify/ProductVariant/50663735525446",
        "32x48": "gid://shopify/ProductVariant/50663735590982",
      },
      canvas: {
        "8x10": "gid://shopify/ProductVariant/50663735656518",
        "12x18": "gid://shopify/ProductVariant/50663735722054",
        "18x24": "gid://shopify/ProductVariant/50663735787590",
        "24x36": "gid://shopify/ProductVariant/50663735853126",
        "32x48": "gid://shopify/ProductVariant/50663735918662",
      },
      metal: {
        "8x10": "gid://shopify/ProductVariant/50663735984198",
        "12x18": "gid://shopify/ProductVariant/50663736049734",
        "18x24": "gid://shopify/ProductVariant/50663736115270",
        "24x36": "gid://shopify/ProductVariant/50663736180806",
        "32x48": "gid://shopify/ProductVariant/50663736246342",
      },
      acrylic: {
        "8x10": "gid://shopify/ProductVariant/50663736311878",
        "12x18": "gid://shopify/ProductVariant/50663736377414",
        "18x24": "gid://shopify/ProductVariant/50663736442950",
        "24x36": "gid://shopify/ProductVariant/50663736508486",
        "32x48": "gid://shopify/ProductVariant/50663736574022",
      },
    },
  } satisfies Record<PrintFormat, Record<PrintFinish, Record<PrintSizeId, string>>>,
} as const;

export const shopifyConfigured = () => Boolean(SHOPIFY.storefrontToken);
