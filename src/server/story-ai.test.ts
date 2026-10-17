import { describe, expect, it } from "vitest";
import {
  ambiguousName,
  buildStoryRequest,
  parseRecommendation,
  recommendFromStory,
} from "./story-ai";
import { STORY } from "@/config/story";

const panel = (place: string, title = "Where We Met") => ({
  place,
  title,
  date: "2014",
  zoomLevel: "neighborhood",
  note: "where it began",
});

describe("story AI", () => {
  it("asks the configured model for a forced tool call with the story wrapped as data", () => {
    const req = buildStoryRequest("We met in Pasadena.");
    expect(req.model).toBe(STORY.model);
    expect(req.tool_choice).toEqual({ type: "tool", name: "recommend_prints" });
    expect(req.messages[0]!.content).toContain("<story>\nWe met in Pasadena.\n</story>");
  });

  it("keeps a triptych only when there are three places", () => {
    const three = parseRecommendation({
      format: "triptych",
      reason: "Three chapters.",
      panels: [panel("A, X"), panel("B, X"), panel("C, X")],
      followUp: null,
    });
    expect(three.format).toBe("triptych");
    const two = parseRecommendation({
      format: "triptych",
      reason: "",
      panels: [panel("A, X"), panel("B, X")],
    });
    expect(two.format).toBe("single");
  });

  it("clamps and cleans model output", () => {
    const r = parseRecommendation({
      format: "bogus",
      reason: "x".repeat(1000),
      panels: [
        { ...panel("<b>Paris</b>, France", `"${"T".repeat(80)}"`), zoomLevel: "street" },
        panel("", "No place"),
        panel("A"),
        panel("B"),
        panel("C"),
      ],
    });
    expect(r.format).toBe("single");
    expect(r.reason.length).toBeLessThanOrEqual(280);
    expect(r.panels).toHaveLength(3);
    expect(r.panels[0]!.place).not.toMatch(/[<>]/);
    expect(r.panels[0]!.title.length).toBeLessThanOrEqual(40);
    expect(r.panels[0]!.title).not.toContain('"');
    expect(r.panels[0]!.zoomLevel).toBe("city");
  });

  it("asks a follow-up question when the story has no place", () => {
    const r = parseRecommendation({
      format: "single",
      reason: "",
      panels: [],
      followUp: "Where was it?",
    });
    expect(r.followUp).toBe("Where was it?");
    expect(r.panels).toEqual([]);
    expect(parseRecommendation({}).followUp).toBeTruthy();
  });

  it("sends the key and optional workspace header, and reads the tool result", async () => {
    let headers: Record<string, string> = {};
    const fetcher = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "recommend_prints",
              input: {
                format: "single",
                reason: "One home.",
                panels: [panel("Pasadena, USA")],
                followUp: null,
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const r = await recommendFromStory("We met in Pasadena.", {
      apiKey: "k",
      workspaceId: "wrkspc_1",
      fetcher,
    });
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["anthropic-workspace-id"]).toBe("wrkspc_1");
    expect(r.panels[0]!.place).toBe("Pasadena, USA");
  });

  it("hides API error details from the customer", async () => {
    const fetcher = (async () =>
      new Response("secret detail", { status: 401 })) as unknown as typeof fetch;
    const orig = console.error;
    console.error = () => {};
    await expect(recommendFromStory("story", { apiKey: "k", fetcher })).rejects.toThrow(
      /unavailable/,
    );
    console.error = orig;
  });
});

import { rankPlaces } from "@/lib/geocoding";
import type { Location } from "@/types/product";

describe("rankPlaces", () => {
  const loc = (name: string, formattedAddress: string, placeType: string): Location => ({
    id: name,
    name,
    formattedAddress,
    placeType,
    latitude: 0,
    longitude: 0,
  });
  const photonSeattle = [
    loc("Made in USA", "Made in USA, SODO Trail, Seattle, Washington, United States", "shop"),
    loc("Seattle", "Seattle, Washington, United States", "city"),
  ];
  it("prefers the city over a shop that merely matches words", () => {
    expect(rankPlaces("Seattle, Washington, USA", "city", photonSeattle)[0]!.name).toBe("Seattle");
  });
  it("prefers the named venue at neighborhood scale", () => {
    const r = rankPlaces("Griffith Observatory, Los Angeles, United States", "neighborhood", [
      loc("Los Angeles", "Los Angeles, California, United States", "city"),
      loc(
        "Griffith Observatory",
        "Griffith Observatory, Los Angeles, California, United States",
        "attraction",
      ),
    ]);
    expect(r[0]!.name).toBe("Griffith Observatory");
  });
});

describe("findPlace", () => {
  it("expands USA and falls back until the name matches", async () => {
    const { findPlace } = await import("@/lib/geocoding");
    const queries: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      queries.push(q);
      const feature = (name: string, osm_value: string) => ({
        properties: { name, osm_value, state: "Washington", country: "United States" },
        geometry: { coordinates: [-122.3, 47.6] },
      });
      const features =
        q === "Seattle, Washington"
          ? [feature("Seattle", "city")]
          : [feature("Mattress Depot USA", "shop")];
      return new Response(JSON.stringify({ features }));
    }) as typeof fetch;
    try {
      const r = await findPlace("Seattle, Washington, USA", "city");
      expect(r?.name).toBe("Seattle");
      expect(queries[0]).toBe("Seattle, Washington, United States");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("never guess", () => {
  it("drops places whenever the model asks a question", () => {
    const r = parseRecommendation({
      format: "single",
      reason: "x",
      panels: [panel("Paris, France")],
      followUp: "Which town is the lake cabin near?",
    });
    expect(r.panels).toEqual([]);
    expect(r.followUp).toBe("Which town is the lake cabin near?");
  });

  it("returns no place when the geocoder only finds unrelated names", async () => {
    const { findPlace } = await import("@/lib/geocoding");
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              properties: { name: "Lost Cabin Lake", osm_value: "water", country: "Canada" },
              geometry: { coordinates: [-81, 47] },
            },
          ],
        }),
      )) as unknown as typeof fetch;
    try {
      expect(await findPlace("Lake cabin, up north", "neighborhood")).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("accepts spelling variants across languages", async () => {
    const { findPlace } = await import("@/lib/geocoding");
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                name: "Sevilla",
                osm_value: "city",
                state: "Andalusia",
                country: "Spain",
              },
              geometry: { coordinates: [-5.99, 37.39] },
            },
          ],
        }),
      )) as unknown as typeof fetch;
    try {
      expect((await findPlace("Seville, Andalusia, Spain", "city"))?.name).toBe("Sevilla");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("sets", () => {
  it("never pads a set with the same place twice", () => {
    const r = parseRecommendation({
      format: "triptych",
      reason: "",
      panels: [
        panel("Paris, France"),
        panel("Bemidji, Minnesota, United States"),
        panel("Bemidji, Minnesota, United States."),
      ],
      followUp: null,
    });
    expect(r.panels).toHaveLength(2);
    expect(r.format).toBe("single");
  });
});

describe("languages", () => {
  it("keeps Latin-alphabet titles and swaps others for the English title", () => {
    const r = parseRecommendation({
      format: "triptych",
      reason: "r",
      panels: [
        { ...panel("Seville, Spain", "Donde nos conocimos"), titleEnglish: "Where We Met" },
        {
          ...panel("The Bund, Shanghai, China", "初次相遇之地"),
          titleEnglish: "Where We First Met",
        },
        { ...panel("Kyoto, Japan", "学びの街"), titleEnglish: "学び" },
      ],
      followUp: null,
    });
    expect(r.panels.map((p) => p.title)).toEqual(["Donde nos conocimos", "Where We First Met", ""]);
  });

  it("drops the model's reason when the format had to change", () => {
    const r = parseRecommendation({
      format: "triptych",
      reason: "A set of three would be lovely.",
      panels: [panel("A, X"), panel("B, X")],
      followUp: null,
    });
    expect(r.format).toBe("single");
    expect(r.reason).toBe("");
  });
});

describe("rankPlaces country", () => {
  it("prefers the place in the named country", async () => {
    const { rankPlaces } = await import("@/lib/geocoding");
    const l = (formattedAddress: string) => ({
      id: formattedAddress,
      name: "Barcelona",
      formattedAddress,
      placeType: "city",
      latitude: 0,
      longitude: 0,
    });
    const r = rankPlaces("Barcelona, Catalonia, Spain", "city", [
      l("Barcelona, Curicó, Maule Region, Chile"),
      l("Barcelona, Catalonia, Spain"),
    ]);
    expect(r[0]!.formattedAddress).toContain("Spain");
  });
});

describe("ambiguous names", () => {
  const p = (place: string, qualifier: string) => ({ ...panel(place), qualifier, named: place });
  it("asks when the story doesn't say which Portland, even if the model picked one", () => {
    const r = parseRecommendation(
      {
        format: "single",
        reason: "x",
        panels: [p("Portland, Oregon, United States", "Oregon")],
        followUp: null,
      },
      "Ci siamo sposati a Portland nel 2018.",
    );
    expect(r.panels).toEqual([]);
    expect(r.followUp).toMatch(/Which Portland/);
  });
  it("accepts it when the story names the state", () => {
    const r = parseRecommendation(
      {
        format: "single",
        reason: "x",
        panels: [p("Portland, Maine, United States", "Maine")],
        followUp: null,
      },
      "Our first apartment was in Portland, Maine.",
    );
    expect(r.panels).toHaveLength(1);
    expect(r.followUp).toBeNull();
  });
  it("leaves famous single-meaning names alone", () => {
    expect(ambiguousName("Paris, France", "", "We met in Paris.")).toBeNull();
    expect(ambiguousName("London, United Kingdom", "", "We met in London.")).toBeNull();
  });
});

describe("country and state checks", () => {
  it("doesn't mistake a state for an ambiguous town", () => {
    expect(
      ambiguousName("Seattle, Washington, United States", "", "I grew up in Seattle.", "Seattle"),
    ).toBeNull();
    expect(
      ambiguousName(
        "Main Street, Springfield, United States",
        "",
        "Main Street in Springfield",
        "Main Street in Springfield",
      ),
    ).toBe("Springfield");
  });
  it("keeps only results in the AI's country, even with a query in Spanish", async () => {
    const { findPlace } = await import("@/lib/geocoding");
    const orig = globalThis.fetch;
    const f = (country: string, countrycode: string) => ({
      properties: { name: "Barcelona", osm_value: "city", country, countrycode },
      geometry: { coordinates: [0, 0] },
    });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ features: [f("Chile", "CL"), f("Spain", "ES")] }),
      )) as unknown as typeof fetch;
    try {
      expect((await findPlace("Barcelona, Cataluña, España", "city", "ES"))?.country).toBe("Spain");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
