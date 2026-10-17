import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { DemoMapArt } from "@/components/map/DemoMapArt";
import { MAP_STYLES } from "@/config/map-styles";
import { DEFAULT_CUSTOMIZATION, DEMO_LOCATIONS, formatCoordinates } from "@/config/products";
import type { Customization } from "@/types/product";
import hero from "@/assets/hero-interior.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Personalized Map Art | Turn Places Into Art" },
      { name: "description", content: "Create personalized map artwork from the places that matter most. Choose your location, style and story, then turn it into beautiful wall art." },
      { property: "og:title", content: "Personalized Map Art | Turn Places Into Art" },
      { property: "og:description", content: "Create personalized map artwork from the places that matter most. Choose your location, style and story, then turn it into beautiful wall art." },
    ],
  }),
  component: Home,
});

const ex = (i: number, styleId: string, title: string, sub: string, date: string): Customization => {
  const l = DEMO_LOCATIONS[i]!;
  return { ...DEFAULT_CUSTOMIZATION, location: l, styleId, title, subtitle: sub, date, coordinates: formatCoordinates(l.latitude, l.longitude), printSize: "12x18", markerStyle: "dot" };
};
const EXAMPLES = [
  { label: "Our First Home", c: ex(5, "modern-minimal", "OUR FIRST HOME", "SEATTLE, WASHINGTON", "2019") },
  { label: "Where We Met", c: ex(3, "midnight", "WHERE WE MET", "PARIS, FRANCE", "14.06.2015") },
  { label: "A Place to Remember", c: ex(4, "vintage", "A PLACE TO REMEMBER", "TOKYO, JAPAN", "2022") },
];
const USES = ["New Home", "Wedding", "Anniversary", "Birth", "Travel", "Memorial"];

function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pt-10 md:px-10 md:pt-16 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div className="fade-in">
          <p className="eyebrow">Personalized map art</p>
          <h1 className="mt-5 text-5xl leading-[1.02] md:text-7xl">Turn the places that matter into art.</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Create a beautifully designed map of the place you call home, the place you met, or anywhere your story began.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="editorial" size="xl"><Link to="/create">Create Your Map</Link></Button>
            <Button asChild variant="editorial-outline" size="xl"><Link to="/styles">Explore Styles</Link></Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Have more than one place in mind?{" "}
            <Link to="/story" className="text-foreground underline underline-offset-4">Tell us your story</Link>{" "}
            and we'll suggest a print — or a set of three.
          </p>
        </div>
        <img src={hero} alt="Three framed map prints in a warm living room" width={1600} height={1104} className="w-full" />
      </section>

      <Section eyebrow="Examples" title="Made from places that mean something.">
        <div className="grid gap-10 md:grid-cols-3">
          {EXAMPLES.map((e) => (
            <figure key={e.label}>
              <div className="bg-stage p-8"><PosterPreview customization={e.c} className="w-full shadow-print" /></div>
              <figcaption className="mt-4 font-display text-2xl">{e.label}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section eyebrow="Five styles" title="Choose your style.">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
          {MAP_STYLES.map((s, i) => (
            <Link key={s.id} to="/styles/$styleId" params={{ styleId: s.id }} className="group">
              <div className="aspect-[4/5] overflow-hidden border border-border transition-colors group-hover:border-foreground">
                <DemoMapArt config={s.configuration} seed={i + 3} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.03]" />
              </div>
              <p className="mt-3 font-display text-sm italic text-ochre">{s.number}</p>
              <p className="text-lg">{s.name}</p>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Occasions" title="Designed for the moments that matter.">
        <ul className="grid grid-cols-2 border-l border-t border-border md:grid-cols-3">
          {USES.map((u) => (
            <li key={u} className="border-b border-r border-border px-6 py-10 font-display text-3xl md:text-4xl">{u}</li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="How it works" title="From location to wall art.">
        <ol className="grid gap-10 md:grid-cols-3">
          {[
            ["Choose a place", "Search any address, neighborhood or landmark in the world."],
            ["Make it yours", "Pick a style, add your words, frame the area and choose a size."],
            ["We turn it into art", "Your design is prepared as a high-resolution file for printing."],
          ].map(([t, d], i) => (
            <li key={t} className="border-t border-foreground pt-6">
              <span className="font-display text-5xl italic text-ochre">{i + 1}</span>
              <h3 className="mt-3 text-3xl">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
        <div className="bg-stage px-8 py-20 text-center md:py-28">
          <p className="eyebrow">Quality</p>
          <h2 className="mt-4 text-5xl md:text-6xl">Printed with care.</h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            Every map is drawn from real geographic data and prepared as print-ready artwork for high-quality wall-art printing — crisp lines, considered type, and balanced composition.
          </p>
          <Button asChild variant="editorial" size="xl" className="mt-10"><Link to="/create">Create Your Map</Link></Button>
        </div>
      </section>
    </>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-28 max-w-7xl px-5 md:px-10">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mb-12 mt-3 max-w-2xl text-4xl md:text-5xl">{title}</h2>
      {children}
    </section>
  );
}
