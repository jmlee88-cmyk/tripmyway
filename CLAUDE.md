# TripMyWay (tripmyway.com) — project handoff

TripMyWay is a new site built from the Atlas & Ink codebase
(github.com/jmlee88-cmyk/atlas-ink-maps, copied at commit `e5be632`, Oct 13 2026).

**What it sells:** a single print of a customer's whole trip. Customers either make
one map of the trip or several maps (one per destination), attach a photo to each
destination, and everything prints together as **one** piece.

**Ground rule:** keep the Atlas & Ink print engine and the Shopify cart/checkout
code as they are. The frontend, the print theme and the editing UI are new.

---

## 1. Keep these as they are (inherited from Atlas & Ink)

| Area | Files | What it does |
|---|---|---|
| Data model | `src/types/product.ts` | `Customization`, `CartItem`, `PrintSizeId`, `PrintFinish`, `FrameColor`, `PrintFormat` |
| Sizes, finishes, frames, prices | `src/config/products.ts` | 5 sizes (8×10 → 32×48); paper / canvas / metal / acrylic; box frame (paper) or float frame (others); `FINISH_PRICES`, `FRAME_PRICES` (frame prices are placeholders); `CANVAS_WRAP_IN = 2` |
| Shopify variant map | `src/config/shopify.ts` | Storefront domain/token (public token, override with `VITE_SHOPIFY_STORE_DOMAIN` / `VITE_SHOPIFY_STOREFRONT_TOKEN`), API `2026-07`, variant GIDs per format × finish × size, plus framed variants |
| Cart | `src/lib/cart.ts` | localStorage cart; the single swap point for cart behaviour. Line-item properties come from `toLineItemProperties` / `itemLineItemProperties` |
| Checkout | `src/lib/checkout.ts` | Storefront `cartCreate` → Shopify checkout URL. Each line carries readable details, hidden `_`-prefixed details, `_preview` (PNG URL) and `_design` (full design JSON so the studio can regenerate the exact print). Clears bought items on the next visit by noticing the Shopify cart is gone (5-day window) |
| Print renderer | `src/lib/print.ts` → `src/print/render-pdf.ts`, `tiles.ts`, `fonts.ts` | Vector PDF at physical size from OpenMapTiles vector tiles, with bleed and canvas gallery wrap. Needs only `fetch`, so it can move to a Worker triggered by Shopify `orders/paid` |
| Shared layout geometry | `src/components/poster/poster-layout.ts` | All lengths in % of poster width, shared by the screen preview and the PDF, so print matches what the customer approved |
| Screen preview | `src/components/poster/*` (`PosterPreview`, `FramedPoster`, `FinishSurface`) | Finish textures, frames, in-room look |
| Map | `src/components/map/MapRenderer.tsx`, `build-map-style.ts` | MapLibre + OpenMapTiles. **Never AI-generate maps; accuracy is a product principle** |
| Geocoding | `src/lib/geocoding.ts` | Mapbox if `VITE_MAPBOX_TOKEN`, otherwise Photon/OSM |
| Order previews | `src/lib/preview.ts`, `src/server/previews.ts`, routes `api.previews.$key.ts`, `previews.$file.ts` | PNG drawn with the print renderer, keyed by SHA-256 of the design, stored in Cloudflare R2 (binding `PREVIEWS`) |
| Print studio | `src/routes/studio.print.tsx` | Internal, noindex page: paste an order's `_design` JSON → print-ready PDF for the fulfilment partner (ArtBeat) |
| Shopify app | `shopify-app/` | Checkout UI extension showing the map preview on Thank-you / Order status pages |
| Email preview | `docs/shopify-email-map-preview.md` | Liquid snippet for order emails using `_preview` |
| Analytics | `src/lib/analytics.ts` | Only via `track()` |
| Tests | `*.test.ts` (vitest) | checkout, print sets, PDF renderer, previews, story AI |

Architecture rules carried over (from Atlas & Ink's `AGENTS.md`):
- Styles, sizes, prices, zooms and markers are **data in `src/config/*`**; UI reads config, never hardcodes.
- All geography goes through `MapRenderer`; `DemoMapArt` is illustrative only.
- Print output is separate from screen preview; print geometry lives in `poster-layout.ts`, not in either renderer.
- Map attribution (OpenStreetMap / OpenMapTiles) must appear on every print.

Stack: TanStack Start (React, Vite), Tailwind v4, shadcn/Radix UI, bun, deployed as a
Cloudflare Worker (`wrangler.jsonc`), R2 for preview images.

## 2. New for TripMyWay

- **Frontend & brand:** new home page, header, about/FAQ, colours and type. Drop the
  Atlas & Ink "Tell us your story" flow (`story.tsx`, `server/story-ai.ts`, `config/story.ts`)
  unless reused deliberately.
- **Print theme:** new map styles added in `src/config/map-styles.ts` (data only).
- **Trip editor UI:** add destinations in order, choose one map for the whole trip or
  one map per destination, attach a photo per destination, preview the combined print.

## 3. Where the "keep it intact" rule meets the new product

The current engine prints **one location per panel** (`Customization.location`, fixed
zoom levels, one marker). A trip print needs things the engine doesn't do yet. Add
them **alongside** the existing code, without changing how single prints behave:

1. **Trip data model** — a new type (e.g. `TripDesign`: ordered stops with location,
   label, date, photo, optional caption; layout choice; shared style/size/finish/frame)
   rather than reshaping `Customization`.
2. **Multi-stop map** — fit the map to all stops (bounding box) instead of the three
   fixed zoom levels; numbered/labelled markers; optional route line between stops.
3. **Photos in the print** — new composition in `poster-layout.ts` (map + photo slots),
   drawn by both `PosterPreview` and `render-pdf.ts` from the same geometry.
   - Photos must be uploaded and stored at print resolution (e.g. a second R2 bucket),
     and embedded in the PDF. Warn when a photo is too small for the chosen size.
   - `_design` and the preview hash should reference photo URLs/keys, never image data
     (Shopify line attributes must stay small).
4. **Shopify products** — the variant IDs in `config/shopify.ts` belong to the Atlas &
   Ink store. TripMyWay needs its own products/variants (and likely its own prices,
   since photos add work) — see open decisions.

## 4. Infrastructure to set up fresh

- New GitHub repo (not connected to Lovable — remove the Lovable block from `AGENTS.md`
  and `.lovable/`).
- Cloudflare Worker name and R2 bucket names in `wrangler.jsonc` (e.g. `tripmyway`,
  `tripmyway-previews`, `tripmyway-photos`).
- Domain tripmyway.com pointed at Cloudflare.
- New Shopify store for TripMyWay (owner creates the account), its Headless channel + public Storefront token, and its own products/variants; replace every value in `config/shopify.ts`.
- Shopify app: deploy a separate app (or reuse) for the order-page preview.

## 5. Decisions made

- **Separate Shopify store** for TripMyWay (decided Oct 17 2026) — the project stays
  completely separate from Atlas & Ink: its own store, products, variant IDs, Storefront
  token, checkout, notification emails and Shopify app install. Nothing in TripMyWay
  should point at `atlasandink-5xx4gzrr.myshopify.com`.
- **Up to 7 stops per trip** (decided Oct 17 2026), each with an optional photo.
- **Auto-fit, then split** (decided Oct 17 2026): the map zooms out to fit all stops. If
  the trip is too spread out for one map to look good, the site suggests a **diptych (2)
  or triptych (3)**, each panel covering a consecutive leg of the trip.
  Proposed implementation (not yet built):
  - "Fits" is a deterministic geometry test, not an AI judgement (accuracy principle):
    fitted zoom ≥ a per-style minimum (below it the map loses the street-level look),
    and every pair of stop markers ≥ a minimum distance apart in inches at the chosen
    print size (otherwise markers/labels collide).
  - Splitting keeps trip order: try every way to cut the stop list into 2, then 3,
    consecutive legs; keep splits where each panel fits; prefer the fewest panels, then
    the most even zooms.
  - The agent (Claude) only explains and offers the options the geometry produced; it
    never invents a split. Same pattern as the story AI: validated output only.
  - Diptych is a new format: add `"diptych"` to `PrintFormat` alongside `single` and
    `triptych`, with its own Shopify variants.

## 6. Open decisions

- Pricing for trip prints with photos.
- Layouts offered per print size (how 7 map stops + photos are arranged).
- Trips that don't fit even as a triptych (e.g. around-the-world): allow a zoomed-out
  "world" style, an overview inset, or more panels?
- Trips crossing the date line (e.g. Los Angeles → Tokyo) need the map centred on the
  Pacific rather than spanning the whole world.
- Whether finishes and frames match Atlas & Ink exactly (default: yes).
- Customer accounts / saved trips (expected eventually; may hand off to Shopify).

## 7. Owner context

- Owner: Jerry. Builds with Claude, not Lovable.
- Fulfilment partner: ArtBeat (box/float frame dimensions in `config/products.ts` are ArtBeat's profiles).
- Prefers not to over-engineer or rewrite what already works.
