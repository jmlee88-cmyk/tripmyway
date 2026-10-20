# tripmyway-fulfil

Turns paid Shopify orders into print files for ArtBeat. A separate Cloudflare
Worker in the same repo as the site (the site itself is unchanged by it).

**Two modes** (`FULFIL_MODE` in `wrangler.jsonc`):

- **`manual`** (now): each paid order gets its print files made, then waits on
  the **orders page** as *To order*. Someone downloads the files and places the
  order on ArtBeat by hand, then presses *Mark as ordered*. No ArtBeat API key or
  product codes needed.
- **`api`** (later): the same files, then the order is posted to ArtBeat's
  partner API automatically (flow below).

## The orders page

`https://tripmyway-fulfil.jerry-912.workers.dev/orders`. Enter the access code
(the `STATUS_TOKEN` secret) once; the browser stays signed in for 30 days. Old
`/status?token=…` links still work and sign you in.

- Tabs: **To order**, **Ordered**, **Needs attention**, **All**.
- Each order shows the preview the customer approved, one card per print (size,
  finish, frame, quantity, pixel size) with **Download file** and **Copy
  details**, the ship-to address with **Copy address**, and **Open in Shopify**.
- Step-by-step instructions for ordering on ArtBeat sit at the top (collapsible).
- **Mark as ordered** (optionally with ArtBeat's order number) moves it to
  *Ordered*; **Undo** moves it back.
- **Print file options → Make files again**: remake the files *front only*
  (exactly the printed face; ArtBeat adds its own bleed and canvas edge — the
  default, `PRINT_EDGE`) or *with bleed / canvas edge* (⅛″ bleed, or the 1.5″
  mirrored edge on canvas). Also how to get files back after the 14-day cleanup.
- Single-place (Atlas-style) designs can't be made here; they're flagged with a
  pointer to `/studio/print` on the site.

```
Shopify "order paid" webhook
  → POST /shopify/orders-paid      signature checked, order kept in R2, queued
  → queue consumer                 one order at a time, retried with back-off
      → PrintConverter container   site's own trip renderer → PDF → pdftoppm
                                   → JPEG at 300 ppi (+1.5″ mirrored edge for canvas)
      → R2 tripmyway-printfiles    served at /files/<random token>/<name>.jpg
      → ArtBeat partner API        one line per print, no prices
  → ArtBeat charges the card on file and pushes fulfilment + tracking to Shopify
  (manual mode: stops here as "ready to order" on the orders page)
GET /orders                        orders page: files, ship-to, instructions, mark as ordered
```

Code: `src/index.ts` (Worker), `container/` (converter), and the tested logic in
`../src/lib/fulfil/` (Shopify order reading and signature, ArtBeat order body).
Settings: `../src/config/artbeat.ts` (product codes, ppi, file format, canvas wrap).

## One-time setup

1. **Cloudflare Workers Paid plan** (containers and long-running work need it).
2. **Queue** `tripmyway-orders` and **R2 bucket** `tripmyway-printfiles`
   (lifecycle rule: delete `files/` after 14 days; ArtBeat reads files within 48 h).
3. **Worker project** in Workers & Pages → Create → Import a repository →
   `jmlee88-cmyk/tripmyway`, name `tripmyway-fulfil`, root directory `/`,
   build command `bun install`, deploy command
   `npx wrangler deploy --config fulfil/wrangler.jsonc`. Workers Builds builds the
   container image from `fulfil/container/Dockerfile` (context: repo root).
4. **Secrets** on `tripmyway-fulfil` (Settings → Variables and Secrets):
   `STATUS_TOKEN` (any long random string; the orders page access code),
   `SHOPIFY_WEBHOOK_SECRET` (step 5), and for API mode only `ARTBEAT_API_KEY`
   (af.…, from ArtBeat's API page).
5. **Shopify webhook**: Settings → Notifications → Webhooks → Create webhook →
   event *Order payment*, format JSON, URL
   `https://tripmyway-fulfil.jerry-912.workers.dev/shopify/orders-paid`,
   latest API version. Copy the signing secret shown under the list into
   `SHOPIFY_WEBHOOK_SECRET`.
6. *(API mode only)* **ArtBeat product presets**: on ArtBeat's API page, build one product per
   finish and frame we sell and put each code in `src/config/artbeat.ts`. An
   order whose code is missing stops with "needs attention" instead of guessing.
7. **ArtBeat ↔ Shopify**: ArtBeat pushes fulfilment and tracking to this Shopify
   store, so the store must be connected in ArtBeat, but its ordinary order
   *import* must stay off for TripMyWay (orders arrive through the API with
   their print files; importing them too would duplicate them).

## Switching to automatic (API mode)

Fill in the product codes (step 6), add `ARTBEAT_API_KEY`, set `FULFIL_MODE` to
`"api"` in `fulfil/wrangler.jsonc` and push. Orders already marked as ordered by
hand are left alone. `ARTBEAT_ENV` is `dev` (orders are validated, never produced). Switch it to
`live` in `fulfil/wrangler.jsonc` once ArtBeat confirms the live address in
`src/config/artbeat.ts`. Shopify test orders are not sent to live ArtBeat unless
`SUBMIT_TEST_ORDERS` is `"true"`.
