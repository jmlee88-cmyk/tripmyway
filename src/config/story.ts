/**
 * "Tell us your story": settings for the AI that reads a customer's story and
 * recommends a single print or a set. The AI only suggests places, titles and
 * dates — every place is geocoded and confirmed by the customer, and the
 * design itself happens in the normal editor.
 */
export const STORY = {
  /** Smallest current Claude model; plenty for extracting places and titles. */
  model: "claude-haiku-5-5",
  maxTokens: 900,
  /** Longest story we send to the model (characters). */
  maxStoryLength: 2000,
  minStoryLength: 20,
  maxPanels: 3,
  /** Per-visitor limit, enforced per server instance (a backstop, not billing protection). */
  rateLimit: { requests: 8, windowMs: 10 * 60 * 1000 },
  placeholder:
    "We met at a coffee shop in Pasadena in 2014. He proposed on the Pont des Arts in Paris three years later, and now we've just bought our first home together in Brooklyn…",
  examples: [
    "Our wedding at the Huntington Library in San Marino, June 2019.",
    "I grew up in Seattle, studied in Boston and finally settled in Austin — I want something that shows the whole journey.",
    "A gift for my dad, who has run the same bakery on Main Street in Bozeman, Montana since 1988.",
  ],
  /**
   * Place names shared by several well-known towns with no single famous
   * meaning (unlike Paris or London). If a story uses one
   * without saying which (a state, region or country in the story itself),
   * we always ask instead of letting the AI pick. Extend freely.
   */
  ambiguousPlaceNames: [
    "springfield",
    "portland",
    "columbus",
    "richmond",
    "arlington",
    "georgetown",
    "franklin",
    "clinton",
    "salem",
    "madison",
    "jackson",
    "burlington",
    "manchester",
    "birmingham",
    "cambridge",
    "kingston",
    "newport",
    "alexandria",
    "victoria",
    "valencia",
    "cordoba",
    "santiago",
    "san jose",
    "san juan",
    "santa cruz",
    "hamilton",
    "dover",
    "lancaster",
    "greenville",
    "fairfield",
    "washington",
    "durham",
    "perth",
    "toledo",
    "plymouth",
    "concord",
    "bristol",
    "auburn",
    "canton",
  ],
} as const;

/** Where the story page hands its result to the Create page. */
export const STORY_DRAFT_KEY = "tripmyway-story-draft-v1";
