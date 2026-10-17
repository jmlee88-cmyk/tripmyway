import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ | TripMyWay" },
      { name: "description", content: "Answers about personalized map prints: locations, styles, sizes and printing." },
      { property: "og:title", content: "FAQ | TripMyWay" },
      { property: "og:description", content: "Answers about personalized map prints." },
    ],
  }),
  component: Faq,
});

const QA: [string, string][] = [
  ["Is the map accurate?", "Yes. Maps are drawn from real OpenStreetMap geographic data — streets, water and parks appear exactly where they are. Only colors and typography are designed."],
  ["Can I choose any location?", "Any address, neighborhood, city or landmark that can be found by search. You can also start from one of our featured cities."],
  ["What sizes are available?", "8 × 10, 12 × 18, 18 × 24 and 24 × 36 inches."],
  ["Do you offer frames?", "Prints are currently offered unframed. Framing options are coming soon."],
  ["Is the preview exactly what I'll receive?", "The preview shows your composition, style and text. Final artwork is re-rendered separately at full print resolution, so lines will be even crisper."],
  ["Can I change my text after ordering?", "Please review your title, subtitle and date carefully before adding to cart — the preview shows exactly how they will be set."],
];

function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 md:px-10">
      <p className="eyebrow">Questions</p>
      <h1 className="mt-4 text-5xl md:text-6xl">Frequently asked.</h1>
      <Accordion type="single" collapsible className="mt-12 border-t border-border">
        {QA.map(([q, a]) => (
          <AccordionItem key={q} value={q}>
            <AccordionTrigger className="py-6 text-left font-display text-2xl font-normal hover:no-underline">{q}</AccordionTrigger>
            <AccordionContent className="pb-6 text-base text-muted-foreground">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
