import { TRIP } from "./trip";

/**
 * "Map Your Journey": settings for the AI that reads a customer's itinerary
 * or trip story and pulls out the stops, in travel order. The AI only
 * suggests places, names and dates: every place is found on the map by the
 * geocoder and confirmed by the customer, and fit/split is decided by the
 * trip engine (lib/trip), never by the AI.
 */
export const JOURNEY = {
  /** Smallest current Claude model; plenty for pulling places out of an itinerary. */
  model: "claude-haiku-5-5",
  maxTokens: 1400,
  /** Longest itinerary we send to the model (characters). */
  maxLength: 3000,
  minLength: 15,
  /** Stops a print holds; more than this and we ask which to keep. */
  maxStops: TRIP.maxStops,
  /** Stops the model may list before we ask the customer to choose (so we can say how many). */
  maxListed: 15,
  /** Longest stop name printed beside a marker. */
  labelMax: 24,
  /** Per-visitor limit, enforced per server instance (a backstop, not billing protection). */
  rateLimit: { requests: 8, windowMs: 10 * 60 * 1000 },
  placeholder:
    "Jun 3 – Milan, Italy\nJun 5 – Lake Como\nJun 7 – Venice\nJun 10 – Florence\nJun 12 – Cinque Terre\nJun 14 – Rome\nJun 17 – Amalfi Coast",
  /** Shown on the page as ways to write it; each can be loaded into the box. */
  examples: [
    {
      id: "list",
      label: "A day-by-day list",
      tip: "One stop per line, in the order you traveled. Dates are optional.",
      text: "Jun 3 – Milan, Italy\nJun 5 – Lake Como\nJun 7 – Venice\nJun 10 – Florence\nJun 12 – Cinque Terre\nJun 14 – Rome\nJun 17 – Amalfi Coast",
    },
    {
      id: "places",
      label: "Just the places",
      tip: "No dates needed. Add the country when a name could be in more than one.",
      text: "Lisbon, Portugal → Porto → Douro Valley → Salamanca, Spain → Madrid",
    },
    {
      id: "story",
      label: "A few sentences",
      tip: "Tell it as you'd tell a friend; name the towns you stayed in.",
      text: "We started our honeymoon in Tokyo in April 2026, took the train to Kyoto for three days, spent a night in Nara, and finished in Osaka before flying home.",
    },
  ],
  /** Short tips beside the box. */
  tips: [
    "Put the stops in the order you traveled.",
    'Name the town or city, not just "our hotel" or "the beach".',
    "Add the country (or state) when a name could be in more than one place.",
    `Up to ${TRIP.maxStops} stops fit on a print; tell us all of them and we'll help you choose.`,
    "Skip airports and layovers unless you spent time there.",
  ],
} as const;
