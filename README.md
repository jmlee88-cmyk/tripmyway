# TripMyWay

Travel-map prints at tripmyway.com: customers map their whole trip — one map or one per
destination — attach a photo to each stop, and it all prints as a single piece.

Built from the Atlas & Ink codebase. **Start with [CLAUDE.md](CLAUDE.md)** for what was
inherited, what's new, and the open decisions. Architecture rules are in [AGENTS.md](AGENTS.md).

## Development

```sh
bun install
bun run dev      # local dev server
bun run test     # vitest
bun run build    # Cloudflare Worker build
```

Shopify checkout stays disabled until the TripMyWay store's domain, Storefront token and
variant IDs are filled in (`src/config/shopify.ts`).
