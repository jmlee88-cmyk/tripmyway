import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

/**
 * Vector-tile access for the print renderer. Mirrors what MapLibre does for the
 * on-screen preview: same TileJSON, same 512px tile grid, same tile zoom
 * (floor of the map zoom, capped at the source's maxzoom).
 */

export const TILE_SIZE = 512;

export interface TileSource {
  urlTemplate: string;
  minzoom: number;
  maxzoom: number;
}

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

export interface LoadedTile extends TileRef {
  tile: VectorTile;
}

export type Fetcher = (url: string) => Promise<Response>;

export async function loadTileSource(tileJsonUrl: string, fetcher: Fetcher): Promise<TileSource> {
  const res = await fetcher(tileJsonUrl);
  if (!res.ok) throw new Error(`Map tiles unavailable (TileJSON ${res.status})`);
  const json = (await res.json()) as { tiles?: string[]; minzoom?: number; maxzoom?: number };
  const urlTemplate = json.tiles?.[0];
  if (!urlTemplate) throw new Error("TileJSON has no tile URL");
  return { urlTemplate, minzoom: json.minzoom ?? 0, maxzoom: json.maxzoom ?? 14 };
}

/** Web-Mercator world pixel coordinates at `zoom` for 512px tiles. */
export function project(lng: number, lat: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, lat));
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
  };
}

/** Tile zoom MapLibre requests for a given map zoom. */
export function tileZoomFor(zoom: number, source: Pick<TileSource, "minzoom" | "maxzoom">) {
  return Math.max(source.minzoom, Math.min(source.maxzoom, Math.floor(zoom)));
}

/**
 * The tiles covering a canvas of `width`×`height` px centred on `center` (world
 * px at `zoom`). Returns tile refs plus each tile's placement in canvas px.
 */
export function coverTiles(
  center: { x: number; y: number },
  width: number,
  height: number,
  zoom: number,
  tileZoom: number,
) {
  const tileWorld = TILE_SIZE * 2 ** (zoom - tileZoom); // a tile's size in canvas px
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const n = 2 ** tileZoom;
  const x0 = Math.floor(left / tileWorld);
  const x1 = Math.floor((left + width) / tileWorld);
  const y0 = Math.max(0, Math.floor(top / tileWorld));
  const y1 = Math.min(n - 1, Math.floor((top + height) / tileWorld));
  const out: { ref: TileRef; ox: number; oy: number; size: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % n) + n) % n;
      out.push({
        ref: { z: tileZoom, x: wrapped, y: ty },
        ox: tx * tileWorld - left,
        oy: ty * tileWorld - top,
        size: tileWorld,
      });
    }
  }
  return out;
}

export function tileUrl(source: TileSource, t: TileRef) {
  return source.urlTemplate
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

export async function fetchTile(
  source: TileSource,
  t: TileRef,
  fetcher: Fetcher,
): Promise<VectorTile | null> {
  const res = await fetcher(tileUrl(source, t));
  if (res.status === 404 || res.status === 204) return null; // empty ocean/edge tiles
  if (!res.ok) throw new Error(`Map tile ${t.z}/${t.x}/${t.y} failed (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) return null;
  return new VectorTile(new PbfReader(buf));
}
