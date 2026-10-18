import { afterEach, describe, expect, it, vi } from "vitest";
import type { Location } from "@/types/product";
import { findPlace } from "./geocoding";

const place = (name: string, address: string, placeType: string): Location => ({
  id: name,
  name,
  formattedAddress: address,
  latitude: 38.6,
  longitude: -90.2,
  placeType,
  countryCode: "US",
});

/** Photon's response shape for the given places. */
function photon(places: Location[]) {
  return {
    features: places.map((p) => ({
      geometry: { coordinates: [p.longitude, p.latitude] },
      properties: {
        name: p.name,
        osm_value: p.placeType,
        state: "Missouri",
        country: "United States",
        countrycode: "US",
      },
    })),
  };
}

describe("findPlace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats "St." and "Saint" as the same, so the city beats a venue named after it', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          photon([
            place("Washington University in St. Louis", "", "university"),
            place("Saint Louis", "", "city"),
          ]),
        ),
      ),
    );
    const found = await findPlace("St. Louis, Missouri, United States", "city", "US");
    expect(found?.name).toBe("Saint Louis");
  });
});
