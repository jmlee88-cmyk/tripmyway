import { PRINT_SIZES } from "@/config/products";
import { TRIP } from "@/config/trip";
import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ | TripMyWay" },
      {
        name: "description",
        content: "Answers about trip map prints: stops, photos, sizes, frames and printing.",
      },
      { property: "og:title", content: "FAQ | TripMyWay" },
      { property: "og:description", content: "Answers about trip map prints." },
    ],
  }),
  component: Faq,
});

const QA: [string, string][] = [
  [
    "How many stops can a trip have?",
    `Up to ${TRIP.maxStops}. Add them in the order you went; the route is drawn between them in that order. A place you visited twice is marked once.`,
  ],
  [
    "Is the map accurate?",
    "Yes. Maps are drawn from real OpenStreetMap data, so coastlines, roads and towns are where they really are. Only the colours and lettering are designed. We never invent or rearrange geography.",
  ],
  [
    "What if my trip is too spread out for one map?",
    "If one map would be mostly empty, for example a trip that crosses an ocean, your trip is split into a set of two or three prints that follow your route in order, with the distance marked between them and a small map of the whole trip. You'll see this, and the size from which your trip fits on one print, before you order.",
  ],
  [
    "What photos work best?",
    "Any photo from your phone or camera, including iPhone photos. Each photo sits in a circle beside its stop, and you choose what shows in it. If a photo is too small to print sharply at your size, we'll tell you before you order and suggest a size that works.",
  ],
  [
    "Do you keep my photos?",
    "Your photos are stored only to print your order and are deleted automatically after 180 days. Location data hidden inside phone photos is removed before upload.",
  ],
  [
    "What sizes and finishes are there?",
    `${PRINT_SIZES.map((x) => x.label).join(", ")} inches, on fine art paper, canvas, metal or acrylic. Paper prints can have a box frame; canvas, metal and acrylic a float frame.`,
  ],
  [
    "Can I paste my itinerary instead of adding stops one by one?",
    "Yes. Map Your Journey reads an itinerary, a list of places or a few sentences about your trip, finds every stop and asks if anything is unclear. You can then check and change every stop before ordering.",
  ],
];

function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 md:px-10">
      <h1 className="text-5xl md:text-6xl">Questions, answered.</h1>
      <Accordion type="single" collapsible className="mt-12 border-t border-border">
        {QA.map(([q, a]) => (
          <AccordionItem key={q} value={q}>
            <AccordionTrigger className="py-6 text-left font-display text-2xl font-semibold hover:no-underline">
              {q}
            </AccordionTrigger>
            <AccordionContent className="pb-6 text-base text-muted-foreground">
              {a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
