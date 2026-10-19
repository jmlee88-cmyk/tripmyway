import type { StyleSpecification } from "maplibre-gl";
import type { MapStyleConfig } from "@/types/product";

/**
 * Translates an artwork MapStyleConfig into a MapLibre style spec over
 * OpenMapTiles-schema vector tiles (real OpenStreetMap geography).
 * Tile source is configurable via VITE_MAP_TILES_URL.
 */
export const TILE_SOURCE_URL =
  (import.meta.env?.["VITE_MAP_TILES_URL"] as string | undefined) ?? "https://tiles.openfreemap.org/planet";

const w = (stops: [number, number][]) =>
  ["interpolate", ["exponential", 1.6], ["zoom"], ...stops.flat()] as unknown as number;

export function buildMapStyle(c: MapStyleConfig): StyleSpecification {
  const roads = (classes: string[]) =>
    ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", classes]]] as any;
  return {
    version: 8,
    sources: { omt: { type: "vector", url: TILE_SOURCE_URL, attribution: "© OpenStreetMap contributors" } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": c.background } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland", "wetland"]]], paint: { "fill-color": c.landcover, "fill-opacity": 0.8 } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": c.park } },
      { id: "landuse-park", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["cemetery", "stadium", "pitch"]]], paint: { "fill-color": c.park, "fill-opacity": 0.7 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": c.water, "line-width": w([[10, 1], [16, 6]]) } },
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 14, paint: { "fill-color": c.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, 0.9] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: roads(["rail", "transit"]), paint: { "line-color": c.rail, "line-width": w([[10, 0.6], [16, 2]]), "line-dasharray": [3, 2] } },
      // Footpaths, alleys and parking aisles only at Neighborhood framing; at City
      // scale they read as noise rather than street pattern.
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 15, filter: roads(["path", "track"]), paint: { "line-color": c.minorRoad, "line-width": w([[15, 0.4], [17, 1]]), "line-opacity": 0.6 } },
      { id: "service", type: "line", source: "omt", "source-layer": "transportation", minzoom: 15, filter: roads(["service"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.minorRoad, "line-width": w([[15, 0.6], [17, 2.5]]), "line-opacity": 0.8 } },
      { id: "minor", type: "line", source: "omt", "source-layer": "transportation", filter: roads(["minor"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.minorRoad, "line-width": w([[11, 0.6], [13, 1.2], [15, 3], [17, 7]]) } },
      { id: "secondary", type: "line", source: "omt", "source-layer": "transportation", filter: roads(["secondary", "tertiary"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.secondaryRoad, "line-width": w([[8, 0.8], [12, 2], [15, 4.5], [18, 10]]) } },
      { id: "primary", type: "line", source: "omt", "source-layer": "transportation", filter: roads(["primary", "trunk", "motorway"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.primaryRoad, "line-width": w([[6, 1], [10, 2.4], [13, 4.5], [16, 7.5], [18, 14]]) } },
    ],
  };
}

/**
 * Width, in layout pixels, of the canvas every map is composed on before being
 * scaled to fit (see MapRenderer). Line widths above are in these pixels.
 * The print renderer should use the same width with a higher pixelRatio.
 */
export const DESIGN_WIDTH = 1600;

/**
 * Converts a framing zoom (defined for a 520px-wide map) to the zoom used on
 * the DESIGN_WIDTH canvas, so framings keep their geographic extent. At City
 * framing this lands near z13.8, where OpenMapTiles includes side streets.
 */
export function effectiveZoom(baseZoom: number) {
  return baseZoom + Math.log2(DESIGN_WIDTH / 520);
}
