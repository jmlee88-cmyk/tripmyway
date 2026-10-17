# Architecture rules

- Map styles, sizes/prices, zoom levels and markers are data in `src/config/*`; UI must read from config, never hardcode — enables adding styles/variants and Shopify mapping.
- All geography renders through `src/components/map/MapRenderer.tsx` (MapLibre + OpenMapTiles vector tiles); never AI-generate maps — accuracy is a product principle.
- `DemoMapArt` is illustrative only (thumbnails/fallback), never used for real previews or print.
- Cart lives behind `src/lib/cart.ts` (localStorage) — the single Shopify AJAX cart swap point.
- Geocoding goes through `src/lib/geocoding.ts` (Mapbox if `VITE_MAPBOX_TOKEN`, else Photon/OSM).
- Print output is separate from screen preview: `src/lib/print.ts` `generatePrintFile` is the hook for a future server-side 300 DPI renderer.
- Analytics only via `track()` in `src/lib/analytics.ts` — provider-agnostic.
