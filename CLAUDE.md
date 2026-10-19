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

- **Frontend & brand (built Oct 18 2026):** TripMyWay look, distinct from Atlas & Ink: map paper
  `#fbfbf8`, navy ink `#1b2a41`, sea `#d7e8ea`, land `#efe8d6`, marigold pin `#f2b134` (tokens in
  `styles.css`; `ochre` is now a dark amber for text). Type: Bricolage Grotesque (headings) + Figtree
  (body); poster fonts (Cormorant, Jost, Playfair, Plex) still load for the print styles. Buttons are
  pills; eyebrows are sentence case. Logo/favicon: a T-shaped pin on a folded map
  (`public/favicon.svg`, `favicon.ico` with a simpler 16 px frame, `public/brand/*.png`;
  `components/site/Logo.tsx` draws the same pin). Home (`routes/index.tsx`): hero with a sample Italy
  trip print drawn from Natural Earth coastlines (`components/home/home-maps.ts`, generated; photos are
  illustrated stand-ins in `Vignette.tsx`), two ways to start, four steps, the split-trip example
  (California → Japan), sizes/finishes from config. About and FAQ rewritten for trips.
- **Create = trip builder (built Oct 18 2026):** `/create` no longer hosts the Atlas single-place
  editor (it's in git history before this change). It uses `components/trip/TripEditor.tsx`, shared
  with /journey: stops in order (search to add, rename, date, reorder, remove, "Wrong place?"), photo
  per stop, live trip print, fit/split advice, size (blocked when a photo is too small), finish, frame,
  price and Add to cart. The draft is kept in localStorage (`tripmyway-trip-draft-v1`); `?style=` sets
  the map style.
  - Guided tour (driver.js 1.8.0, MIT; intro.js is AGPL so not used): `components/trip/trip-tour.ts`.
    A "start" tour (trip name, add stop, preview) on a first visit and a "stop" tour (rename, date,
    photo, reorder, empty photo spots, order options) once a stop exists; each once per browser,
    replayable with "Show me how". Steps target `data-tour` attributes.
  - "Show empty photo spots" switch: the grey circles are preview-only (never printed); turning
    them off shows exactly what prints.
  - **Naming (decided Oct 18 2026):** one place = a **Location map** (chip above the preview, cart
    label, "Format: Location map" on the order, "Location map print" product name; its print line
    is the place's address). Every place counts as a stop, so A → B is 2 stops; its print line is
    just "Lisbon → Porto" (no count). Counts appear from 3 stops.
- **Trip prints in the cart (built Oct 18 2026):** `src/lib/trip-cart.ts`, alongside the single-print
  cart. `CartItem.trip` + `tripPrints`; `customization` holds a stand-in from the first stop. The
  Shopify product follows the deterministic plan (1 → single, 2 → diptych, 3 → triptych), priced per
  print. Line properties: Trip, Stops, Photos, Format, Style, Size, Finish, Frame; `_design` is
  `{v: 2, trip}` with photo URLs/keys and crops (no image data). `_preview`: a PNG of every print
  of the trip side by side (`lib/preview.ts`, drawn from the real print file without empty photo
  spots), made in the background on add to cart and before checkout.
  Fulfilment: `/studio/trip` (noindex) turns a pasted `_design` into the print PDF with bleed.
- **Map Your Journey** (decided and built Oct 18 2026) replaces "Your Story" in the menu:
  `/journey` (`routes/journey.tsx`; `/story` redirects there). The customer pastes an
  itinerary or writes a few sentences; one Claude call (`server/journey-ai.ts`, settings
  in `config/journey.ts`, client `lib/journey.ts`) returns the stops in order with labels,
  dates and a suggested title, or ONE follow-up question (ambiguous town, vague place, or
  more than 7 stops → "which 7?"). Same safeguards as the Atlas story AI: forced tool
  call, output validated and clamped, ambiguous town names checked in code, no guessed
  places; a place visited twice is marked once. Stops are geocoded (`findPlace`), can be
  corrected or renamed, get a photo each, and the real trip print (`TripPrintPreview`)
  plus fit/split advice from `plansBySize` show beside them. The page teaches three ways
  to write a trip (day-by-day list, just places, a few sentences) with "use this example".
  - Worker secrets `ANTHROPIC_API_KEY` and `ANTHROPIC_WORKSPACE_ID` set on `tripmyway`
    (Production runtime variables, Oct 18 2026). Tested live: day-by-day list (7 stops,
    fits 18×24), sentences (Tokyo → Kyoto → Nara → Osaka), and the follow-up question
    ("Which Springfield…?" → answered → mapped).
  - Code guards added after live testing: a date must contain a number (lengths of stay
    like "three days" are dropped); years the text never gave are removed from the title;
    geocoding treats St./Saint, Mt./Mount, Ft./Fort, Ste./Sainte as the same (St. Louis
    had matched Washington University).
  - The old story code (`server/story-ai.ts`, `lib/story.ts`, `config/story.ts`) stays:
    journey-ai reuses its `clean`, `ambiguousName` and `printableTitle`.
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
- **Done (Oct 18 2026):** Cloudflare Worker `tripmyway` in "Jerry@demesh.com's Account",
  connected to jmlee88-cmyk/tripmyway (branch `main`, build `bun run build`, deploy
  `npx wrangler deploy`, preview builds on, own "tripmyway build token"); R2 bucket
  `tripmyway-previews`. Live at https://tripmyway.jerry-912.workers.dev (every push to
  `main` redeploys; other branches get preview links). Trip preview: `/trip/preview`.
- Domain tripmyway.com pointed at Cloudflare (not yet).
- **Done (Oct 18 2026): Shopify store** `tripmyway-bf2kmucg.myshopify.com` (admin.shopify.com/store/tripmyway-bf2kmucg;
  Development plan, needs a paid plan + payments before real orders). Headless channel
  "Tripmyway Headless"; its public Storefront token is in `config/shopify.ts`.
  Products (all published to Tripmyway Headless, untracked inventory, options Size × Finish × Frame,
  40 variants each, SKUs `TMW-<FORMAT>-<FINISH>-<SIZE>[-F]`): "Trip Map Print" (handle trip-map-print),
  "Trip Map Diptych (Set of Two)", "Trip Map Triptych (Set of Three)". Prices = Atlas & Ink's
  (`FINISH_PRICES` + `FRAME_PRICES` when framed), × 2 for diptych and × 3 for triptych.
  `"diptych"` added to `PrintFormat` / `PRINT_FORMATS`; checkout picks the format by panel count.
  Verified live Oct 18: cartCreate prices match (e.g. set of two 18 × 24 paper = $178) and /cart →
  Checkout hands off to the TripMyWay store, which shows its password page until a paid plan is picked.
- **Done (Oct 18 2026): customer photo storage.** R2 bucket `tripmyway-photos` (binding `PHOTOS`,
  also for preview builds) with a lifecycle rule deleting objects **180 days** after upload (owner's
  decision). Photos for orders must be printed within that window.
- **Rate limits (Oct 18 2026):** Cloudflare rate limiting bindings in `wrangler.jsonc`: `UPLOAD_LIMIT`
  (40/min per IP, photo + preview uploads) and `JOURNEY_LIMIT` (10/min per IP, trip readings; plus the
  in-memory limiter). Helper `cloudflareLimited()` in `server/runtime.ts`; absent bindings never limit.
- **Styles pages (Oct 18 2026):** index shows each style with an illustrative route; each style page
  renders the real Italy sample print in that style and links to /create?style=….
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
  **Built** in `src/lib/trip/` (fit.ts, plan.ts; rules in `src/config/trip.ts`; tests in
  trip.test.ts with real Italy, California→Japan and coast-to-coast US trips):
  - "Fits" is a deterministic geometry test, not an AI judgement (accuracy principle):
    fitted zoom ≥ a per-style minimum (below it the map loses the street-level look),
    and every pair of stop markers ≥ a minimum distance apart in inches at the chosen
    print size (otherwise markers/labels collide).
  - Splitting keeps trip order: try every way to cut the stop list into 2, then 3,
    consecutive legs; keep splits where each panel fits; prefer the fewest panels, then
    panels at similar scales (no lone city close-up beside country maps), then cutting at
    the longest legs, then the most even zooms.
  - `plansBySize` gives the plan at every size, so the site can say "fits on one print
    from 12 × 18 up" before suggesting a split (e.g. Italy splits only at 8 × 10).
  - `minFramingZoom` is 3.5 (≈ 3,000 km across), a PLACEHOLDER to tune on real renders.
  - Not built yet: the water estimate from map tiles (`waterShare` hook is in place;
    today only distance and zoom trigger splits, which already covers LA → Tokyo), and
    naming the crossing ("Pacific Ocean") for the break mark (the km are computed).
  - The agent (Claude) only explains and offers the options the geometry produced; it
    never invents a split. Same pattern as the story AI: validated output only.
  - Diptych is a new format: add `"diptych"` to `PrintFormat` alongside `single` and
    `triptych`, with its own Shopify variants.
- **Overview inset** (decided Oct 17 2026): when a trip is split into detailed panels
  (or doesn't fit even as a triptych), the print adds a small overview map showing the
  whole route with the stops numbered, so the detailed panels read as parts of one trip.
- **No empty ocean** (decided Oct 17 2026): a map that would be mostly open water (e.g.
  Los Angeles → Tokyo) isn't shown as one map. Each side of the ocean becomes its own
  detailed panel, and the gap is shrunk *visibly*, never faked:
  - Panels are never stitched or squashed into one fake-continuous map; within a panel,
    geography stays true (accuracy principle).
  - Between panels, a break mark with the crossing, e.g. "Pacific Ocean · 8,800 km",
    makes the jump self-explanatory.
  - The overview inset shows the true route, centred on the ocean crossed (handles the
    date line: centre on the Pacific, not Greenwich).
  - Trigger: same deterministic test as splitting, plus "share of the fitted map that
    is water" above a threshold; the split cuts at the longest leg.

- **Print layout B, "photos on the map"** (decided Oct 17 2026; mockups on the
  "TripMyWay Print Layouts" design canvas): full-width map with the route line and
  numbered stops; each stop's photo sits in a circle beside its marker, joined by a
  dotted leader line; title and trip line (from → to · stops · dates) centred below;
  map attribution at the foot.
  - **Built** in `src/lib/trip/placement.ts` (geometry in `TRIP_LAYOUT`, `poster-layout.ts`).
  - Photo placement must be automatic and deterministic, like the fit/split test:
    for each stop, try candidate spots around its marker and pick one that keeps the
    circle inside the map, off other markers, labels, circles and the route line, with
    a short leader. If a stop can't be placed (crowded cluster), shrink circles a step,
    then fall back to the photo strip (layout A) for that print. Never place by AI.
    Leaders may cross the route only when no clear spot exists (scored, not forbidden).
    Stops without a photo get just their name beside the marker.
  - Circle size scales with print size (all geometry in `poster-layout.ts`, % of width).
- **Trip print renderer and preview page: built** (Oct 17 2026).
  - `src/print/render-trip-pdf.ts`: one PDF page per print, reusing the single-print
    renderer's tiles, map styles and fonts (its helpers are now exported; single prints
    unchanged). Draws route, numbered markers, photos in ringed circles, names, title,
    trip line, break marks, the whole-trip overview, and the OSM credit.
  - `/trip/preview` (`src/routes/trip.preview.tsx`, noindex): sample trips
    (`config/trip-samples.ts`), size/style pickers, your own photos per stop, and the real
    PDF rendered on screen; warns when a photo is under 150 px per printed inch.
  - Checked on real coastlines (Natural Earth) before shipping; the live tile server is
    not reachable from Claude's workspace, so real-map review happens on a deployed site.
  - Seen on live map data (Oct 18): works for Italy and the California → Japan split.
    The route is drawn in the style's accent colour, which is near-black in Modern
    Minimal, so it competes with the dense road network at trip scale; the TripMyWay
    print theme should give the route its own colour and thin out roads at low zoom.
  - Known gaps: crowded prints fall back to names only (the photo strip isn't drawn yet);
    no canvas gallery wrap for trips yet; the inherited Atlas styles show no country
    borders or rivers at trip scale (TripMyWay print theme should add them); print
    fonts lack → ← ≈, so the text falls back to words ("Milan to Amalfi", "about 8,300 km").
- **Split trips look like the split mockup** (decided Oct 17 2026): one print per leg,
  stops numbered across the whole trip, "Part N of M" in the trip line, the break mark
  at the inner edges ("Pacific Ocean · ≈ 8,300 km →" / "← From San Francisco"), and the
  whole-trip overview inset on one panel. Each split panel uses layout B (photos on
  the map), with the same fallback to the photo strip when a panel is crowded.

- **Customer photos** (decided and built Oct 18 2026):
  - Browser prep (`src/lib/photos.ts`): HEIC converted with `heic-to` (loaded only for HEIC files),
    turned upright, long side ≤ 3000 px, re-encoded JPEG q0.9; redrawing drops all EXIF incl. GPS.
    Stored under the SHA-256 of the JPEG via `PUT /api/photos/:key`, served at `/photos/:key.jpg`
    (`src/server/photos.ts`: same-origin, JPEG only, ≤ 8 MB, id must match content, size read server-side).
  - **Cropping:** the customer drags/zooms what shows in the circle (`TripPhotoField` + crop dialog);
    stored as `TripPhoto.crop {x, y, zoom}` and drawn identically by the PDF (`cropSquare`).
  - **Too small = refused** (owner's decision, not just a warning): the part shown in the circle needs
    ≥ 150 ppi at the chosen size (`src/lib/trip/photos.ts`, `TRIP.photo`). A too-small photo is refused
    before upload; once photos are chosen, sizes they're too small for can't be picked on /journey; zoom
    is capped so the circle stays sharp. `photoProblems()` is there for the cart to re-check.
  - Verified live Oct 18: sideways phone JPEG with GPS → stored upright, no EXIF; crop shows in the
    print; 280 px photo refused at 18 × 24. HEIC (rotated, with GPS) verified in headless Chromium.
  - Trip add-to-cart, `/studio/trip` and upload rate limits are built (see sections 2 and 4).

- **ArtBeat fulfilment (built Oct 19 2026, not yet deployed):** `fulfil/` is a separate Worker,
  `tripmyway-fulfil` (see `fulfil/README.md`): Shopify "order paid" webhook (HMAC checked) → queue →
  `PrintConverter` container (site's trip renderer → PDF → pdftoppm → 300 ppi JPEG; canvas gets a 1.5″
  mirrored edge in the file) → R2 `tripmyway-printfiles` → ArtBeat partner API
  (`/api/partner/orders`, key `af.<vendor>.<secret>`), one line per print, never a price; status page
  `/status?token=` with "Send again". Logic in `src/lib/fulfil/` (tested), settings in
  `src/config/artbeat.ts` (product codes still empty: they come from ArtBeat's API page).
  ArtBeat answers (Oct 19): accepted orders become real orders; card on file is charged; files JPG/PNG/TIF
  (not PDF), consumed within 48 h; canvas 1.5″ wrap with mirrored edge; ArtBeat pushes fulfilment and
  tracking to Shopify; packing is theirs; print cost covers shipping (free shipping or a small fee is our
  choice in Shopify); frames as on artbeatstudios.com/pages/custom-frames (matches ours).
  `CANVAS_WRAP_IN` is now 1.5. Single-place (v1) designs aren't automated: they're flagged for the studio.

## 6. Open decisions

- Pricing for trip prints with photos.
- Whether finishes and frames match Atlas & Ink exactly (default: yes).
- Customer accounts / saved trips (expected eventually; may hand off to Shopify).

## 7. Owner context

- Owner: Jerry. Builds with Claude, not Lovable.
- Fulfilment partner: ArtBeat (box/float frame dimensions in `config/products.ts` are ArtBeat's profiles).
- Prefers not to over-engineer or rewrite what already works.
