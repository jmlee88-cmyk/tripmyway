# TripMyWay — Shopify app (map previews)

Shows each customer's map design under its order line on Shopify's
**Thank-you** and **Order status** pages. On Shopify Plus it also shows in
checkout itself.

## Deploy (one time, from your computer)

Requires Node.js 20+.

```sh
cd shopify-app
npm install
npx shopify app deploy
```

The first run asks you to log in to your Shopify developer account and to
**create a new app** (name: "TripMyWay Map Previews"). It then uploads the
extension and releases it.

Then install it on the store: in the developer dashboard open the app →
**Install app** → choose the *TripMyWay* store. The map appears under each
item automatically; there's nothing to place in the checkout editor.
