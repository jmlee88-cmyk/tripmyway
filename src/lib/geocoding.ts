import type { Location } from "@/types/product";

/**
 * Geocoding adapter. Uses Mapbox when VITE_MAPBOX_TOKEN is set (publishable
 * token, safe in the browser); otherwise falls back to the free Photon
 * (OpenStreetMap) geocoder. Swap providers here without touching the UI.
 */
const MAPBOX_TOKEN = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;

export const geocoderProvider = MAPBOX_TOKEN ? "mapbox" : "openstreetmap";

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Location[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return MAPBOX_TOKEN ? searchMapbox(q, signal) : searchPhoton(q, signal);
}

async function searchMapbox(q: string, signal?: AbortSignal): Promise<Location[]> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=6&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal: signal ?? null });
  if (!res.ok) throw new Error("Geocoding failed");
  const json = await res.json();
  return (json.features ?? []).map((f: any): Location => {
    const ctx: any[] = f.context ?? [];
    const find = (p: string) => ctx.find((c) => String(c.id).startsWith(p))?.text;
    return {
      id: f.id,
      name: f.text,
      formattedAddress: f.place_name,
      longitude: f.center[0],
      latitude: f.center[1],
      city: f.place_type?.includes("place") ? f.text : find("place"),
      region: find("region"),
      country: find("country"),
      placeType: f.place_type?.[0],
      countryCode: (
        ctx.find((c) => String(c.id).startsWith("country"))?.short_code ??
        (f.place_type?.includes("country") ? f.properties?.short_code : undefined)
      )?.toUpperCase(),
    };
  });
}

async function searchPhoton(q: string, signal?: AbortSignal): Promise<Location[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`,
    { signal: signal ?? null },
  );
  if (!res.ok) throw new Error("Geocoding failed");
  const json = await res.json();
  return (json.features ?? []).map((f: any, i: number): Location => {
    const p = f.properties ?? {};
    const city = p.city ?? (["city", "town", "village"].includes(p.osm_value) ? p.name : undefined);
    const parts = [
      p.name,
      p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street,
      city !== p.name ? city : undefined,
      p.state,
      p.country,
    ];
    return {
      id: `${p.osm_type ?? "x"}${p.osm_id ?? i}`,
      name: p.name ?? p.street ?? city ?? q,
      formattedAddress: Array.from(new Set(parts.filter(Boolean))).join(", "),
      longitude: f.geometry.coordinates[0],
      latitude: f.geometry.coordinates[1],
      city: city ?? p.name,
      region: p.state,
      country: p.country,
      placeType: p.osm_value,
      countryCode: typeof p.countrycode === "string" ? p.countrycode.toUpperCase() : undefined,
    };
  });
}

const SETTLEMENTS = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "borough",
  "suburb",
  "quarter",
  "neighbourhood",
  "locality",
  "place",
  "district",
  "county",
  "state",
  "region",
  "province",
  "country",
]);

/**
 * Best match for a place suggested by "Tell us your story", or null — never
 * a guess. Free-text
 * geocoders often rank a shop called "Made in USA" above the city of Seattle,
 * so results are re-ranked: the name should match the first part of the
 * query, the country must match when one is given (the AI may write the
 * query in the customer's language), and for city- or region-scale maps an
 * actual settlement wins.
 */
export async function findPlace(
  query: string,
  zoom: "neighborhood" | "city" | "regional",
  /** ISO country code the place must be in, e.g. "ES" (from the story AI). */
  countryCode?: string,
): Promise<Location | null> {
  // Free-text geocoders match "USA" against shop names, so spell countries out,
  // then fall back to shorter queries until the name itself matches.
  const expanded = query
    .replace(/\bU\.?S\.?A?\.?(?=,|$)/gi, "United States")
    .replace(/\bU\.?K\.?(?=,|$)/gi, "United Kingdom");
  const cc = countryCode?.toUpperCase();
  const acceptable = (l: Location) =>
    nameMatches(expanded, l) && (!cc || !l.countryCode || l.countryCode === cc);
  const parts = expanded
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const attempts = Array.from(
    new Set([expanded, parts.slice(0, 2).join(", "), parts[0] ?? ""].filter(Boolean)),
  );
  let pool: Location[] = [];
  for (const q of attempts) {
    pool = pool.concat(await searchPlaces(q));
    const best = rankPlaces(expanded, zoom, pool).find(acceptable);
    if (best) return best;
  }
  // Nothing matched the name itself: return nothing rather than a guess, and
  // let the customer search for it.
  return null;
}

const norm = (s: string | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function nameMatches(query: string, l: Location) {
  const head = norm(query.split(",")[0]);
  const name = norm(l.name);
  if (!head || !name) return false;
  if (name === head || name.includes(head) || head.includes(name)) return true;
  // Spelling variants across languages (Seville / Sevilla, Lisbon / Lisboa).
  return levenshtein(name, head) <= Math.max(2, Math.floor(head.length * 0.25));
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

export function rankPlaces(
  query: string,
  zoom: "neighborhood" | "city" | "regional",
  results: Location[],
): Location[] {
  const [head = "", ...rest] = query.split(",").map(norm);
  const score = (l: Location, i: number) => {
    const name = norm(l.name);
    let s = -i * 0.1;
    if (name === head) s += 4;
    else if (name && head && (name.includes(head) || head.includes(name))) s += 2;
    const addr = norm(l.formattedAddress);
    // Region and country matter: "Barcelona, Spain" must beat Barcelona, Chile.
    for (const part of rest) if (part && addr.includes(part)) s += 1.5;
    if (zoom !== "neighborhood" && SETTLEMENTS.has(norm(l.placeType))) s += 3;
    return s;
  };
  return results
    .map((l, i) => ({ l, s: score(l, i) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.l);
}
