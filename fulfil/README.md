# tripmyway-fulfil

Sends paid Shopify orders to ArtBeat automatically. A separate Cloudflare Worker
in the same repo as the site (the site itself is unchanged by it).

```
Shopify "order paid" webhook
  → POST /shopify/orders-paid      signature checked, order kept in R2, queued
  → queue consumer                 one order at a time, retried with back-off
      → PrintConverter container   site's own trip renderer → PDF → pdftoppm
                                   → JPEG at 300 ppi (+1.5″ mirrored edge for canvas)
      → R2 tripmyway-printfiles    served at /files/<random token>/<name>.jpg
      → ArtBeat partner API        one line per print, no prices
  → ArtBeat charges the card on file and pushes fulfilment + tracking to Shopify
GET /status?token=…                recent orders, their print files, "Send again"
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
   `ARTBEAT_API_KEY` (af.…, from ArtBeat's API page), `SHOPIFY_WEBHOOK_SECRET`
   (step 5), `STATUS_TOKEN` (any long random string; opens /status).
5. **Shopify webhook**: Settings → Notifications → Webhooks → Create webhook →
   event *Order payment*, format JSON, URL
   `https://tripmyway-fulfil.jerry-912.workers.dev/shopify/orders-paid`,
   latest API version. Copy the signing secret shown under the list into
   `SHOPIFY_WEBHOOK_SECRET`.
6. **ArtBeat product presets**: on ArtBeat's API page, build one product per
   finish and frame we sell and put each code in `src/config/artbeat.ts`. An
   order whose code is missing stops with "needs attention" instead of guessing.
7. **ArtBeat ↔ Shopify**: ArtBeat pushes fulfilment and tracking to this Shopify
   store, so the store must be connected in ArtBeat, but its ordinary order
   *import* must stay off for TripMyWay (orders arrive through the API with
   their print files; importing them too would duplicate them).

## Going live

`ARTBEAT_ENV` is `dev` (orders are validated, never produced). Switch it to
`live` in `fulfil/wrangler.jsonc` once ArtBeat confirms the live address in
`src/config/artbeat.ts`. Shopify test orders are not sent to live ArtBeat unless
`SUBMIT_TEST_ORDERS` is `"true"`.
