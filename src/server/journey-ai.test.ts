import { describe, expect, it } from "vitest";
import { JOURNEY } from "@/config/journey";
import { buildJourneyRequest, parseJourney, readJourneyText } from "./journey-ai";

const stop = (place: string, label: string, extra: Record<string, string> = {}) => ({
  place,
  countryCode: "IT",
  named: label,
  qualifier: "",
  label,
  date: "",
  ...extra,
});

const ITALY_TEXT = "Jun 3 – Milan, Italy\nJun 5 – Lake Como\nJun 7 – Venice";

describe("journey AI", () => {
  it("asks the configured model for a forced tool call with the trip wrapped as data", () => {
    const req = buildJourneyRequest("Rome, then Florence");
    expect(req.model).toBe(JOURNEY.model);
    expect(req.tool_choice).toEqual({ type: "tool", name: "record_stops" });
    expect(req.messages[0]!.content).toBe("<trip>\nRome, then Florence\n</trip>");
  });

  it("keeps stops in order with labels, dates and a title", () => {
    const r = parseJourney(
      {
        title: "Italy 2026",
        titleEnglish: "Italy 2026",
        stops: [
          stop("Milan, Lombardy, Italy", "Milan", { date: "Jun 3" }),
          stop("Lake Como, Lombardy, Italy", "Lake Como", { date: "Jun 5" }),
          stop("Venice, Veneto, Italy", "Venice", { date: "Jun 7" }),
        ],
        followUp: null,
      },
      ITALY_TEXT,
    );
    expect(r.followUp).toBeNull();
    expect(r.title).toBe("Italy 2026");
    expect(r.stops.map((s) => s.label)).toEqual(["Milan", "Lake Como", "Venice"]);
    expect(r.stops[0]!.date).toBe("Jun 3");
    expect(r.stops[0]!.countryCode).toBe("IT");
  });

  it("cleans and clamps model output", () => {
    const r = parseJourney({
      title: `"${"T".repeat(80)}"`,
      titleEnglish: "",
      stops: [
        stop("<b>Rome</b>, Italy", "R".repeat(60), { countryCode: "Italy", date: "x".repeat(50) }),
        stop("", "Nowhere"),
      ],
      followUp: null,
    });
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0]!.place).not.toMatch(/[<>]/);
    expect(r.stops[0]!.label.length).toBeLessThanOrEqual(JOURNEY.labelMax);
    expect(r.stops[0]!.date.length).toBeLessThanOrEqual(20);
    expect(r.stops[0]!.countryCode).toBe("");
    expect(r.title.length).toBeLessThanOrEqual(40);
    expect(r.title).not.toContain('"');
  });

  it("uses the place name when the label isn't in the Latin alphabet", () => {
    const r = parseJourney({
      title: "日本",
      titleEnglish: "Japan",
      stops: [stop("Kyoto, Japan", "京都", { countryCode: "JP" })],
      followUp: null,
    });
    expect(r.stops[0]!.label).toBe("Kyoto");
    expect(r.title).toBe("Japan");
  });

  it("shows a place visited twice once, and says so", () => {
    const r = parseJourney({
      title: "Loop",
      titleEnglish: "Loop",
      stops: [
        stop("Rome, Italy", "Rome"),
        stop("Naples, Italy", "Naples"),
        stop("Rome, Italy", "Rome"),
      ],
      followUp: null,
    });
    expect(r.stops.map((s) => s.label)).toEqual(["Rome", "Naples"]);
    expect(r.merged).toBe(true);
  });

  it(`asks which stops to keep when there are more than ${JOURNEY.maxStops}`, () => {
    const many = Array.from({ length: 9 }, (_, i) => stop(`Town ${i + 1}, Italy`, `Town ${i + 1}`));
    const r = parseJourney({ title: "Big", titleEnglish: "Big", stops: many, followUp: null });
    expect(r.stops).toEqual([]);
    expect(r.followUp).toContain("9 stops");
    expect(r.followUp).toContain("Town 9");
  });

  it("asks about an ambiguous town the text doesn't place, whatever the model said", () => {
    const r = parseJourney(
      {
        title: "West",
        titleEnglish: "West",
        stops: [stop("Portland, Oregon, United States", "Portland", { qualifier: "Oregon" })],
        followUp: null,
      },
      "A long weekend in Portland",
    );
    expect(r.stops).toEqual([]);
    expect(r.followUp).toMatch(/Which Portland/);
  });

  it("accepts an ambiguous town the text does place", () => {
    const r = parseJourney(
      {
        title: "West",
        titleEnglish: "West",
        stops: [stop("Portland, Oregon, United States", "Portland", { qualifier: "Oregon" })],
        followUp: null,
      },
      "A long weekend in Portland, Oregon",
    );
    expect(r.followUp).toBeNull();
    expect(r.stops).toHaveLength(1);
  });

  it("passes the model's question through, and asks when nothing was found", () => {
    expect(
      parseJourney({
        title: "",
        titleEnglish: "",
        stops: [],
        followUp: "Which town is the cabin in?",
      }).followUp,
    ).toBe("Which town is the cabin in?");
    expect(parseJourney({}).followUp).toMatch(/Where did you go/);
  });

  it("calls the API and reads the tool answer", async () => {
    let sent: { headers: Record<string, string>; body: string } | null = null;
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = { headers: init.headers as Record<string, string>, body: String(init.body) };
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "record_stops",
              input: {
                title: "Italy",
                titleEnglish: "Italy",
                stops: [stop("Rome, Italy", "Rome")],
                followUp: null,
              },
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const r = await readJourneyText("Rome", { apiKey: "k", fetcher });
    expect(r.stops[0]!.label).toBe("Rome");
    expect(sent!.headers["x-api-key"]).toBe("k");
    expect(JSON.parse(sent!.body).model).toBe(JOURNEY.model);
  });

  it("reports an unavailable API without leaking details", async () => {
    const fetcher = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    await expect(readJourneyText("Rome", { apiKey: "k", fetcher })).rejects.toThrow(
      "Our trip reader is unavailable right now.",
    );
  });
});
