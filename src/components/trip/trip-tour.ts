import type { DriveStep } from "driver.js";
import { TRIP } from "@/config/trip";

/**
 * Guided tour of the trip editor (driver.js, MIT). Two short tours, each shown
 * once per browser and replayable from "Show me how":
 *  - "start": before any stop, where to name the trip and add the first stop;
 *  - "stop": once a stop exists, how to rename it, date it, add a photo and
 *    reorder, then where the print and the order options are.
 * Steps point at `data-tour` attributes; steps whose element isn't on the page
 * are dropped.
 */
export type TourKind = "start" | "stop";

const SEEN_KEY = (k: TourKind) => `tripmyway-tour-${k}-v1`;

export function tourSeen(kind: TourKind): boolean {
  try {
    return localStorage.getItem(SEEN_KEY(kind)) === "1";
  } catch {
    return true; // no storage: don't keep popping the tour up
  }
}

function markSeen(kind: TourKind) {
  try {
    localStorage.setItem(SEEN_KEY(kind), "1");
  } catch {
    /* ignore */
  }
}

const STEPS: Record<TourKind, (DriveStep & { element: string })[]> = {
  start: [
    {
      element: '[data-tour="title"]',
      popover: {
        title: "Name your trip",
        description: "This is the title printed under your map. You can change it any time.",
      },
    },
    {
      element: '[data-tour="add-stop"]',
      popover: {
        title: "Add your first stop",
        description: `Search for where your trip started. Add up to ${TRIP.maxStops} places in the order you went. One place makes a location map; two or more make a trip map.`,
      },
    },
    {
      element: '[data-tour="preview"]',
      popover: {
        title: "Your print, as you build it",
        description: "The real print file appears here and updates with every change.",
        side: "left",
      },
    },
  ],
  stop: [
    {
      element: '[data-tour="stop-name"]',
      popover: {
        title: "Rename a stop",
        description:
          "This name is printed beside the stop. Tap it to shorten it or use your own name for the place.",
      },
    },
    {
      element: '[data-tour="stop-date"]',
      popover: {
        title: "Add a date (optional)",
        description: "Dates appear in the line under your trip name.",
      },
    },
    {
      element: '[data-tour="stop-photo"]',
      popover: {
        title: "Add a photo (optional)",
        description:
          "It sits in a circle beside this stop, and you choose what shows in the circle. iPhone photos work too. A stop without a photo just gets its name.",
      },
    },
    {
      element: '[data-tour="stop-tools"]',
      popover: {
        title: "Change the order",
        description: "Move a stop earlier or later, or remove it. The route follows this order.",
      },
    },
    {
      element: '[data-tour="spots"]',
      popover: {
        title: "Empty photo spots",
        description:
          "The grey circles only show where photos would go. They're not printed. Turn them off to see exactly what will print.",
        side: "left",
      },
    },
    {
      element: '[data-tour="order"]',
      popover: {
        title: "Size, finish and frame",
        description:
          "Pick these under your stops when you're happy with them, then add the print to your cart.",
        side: "top",
      },
    },
  ],
};

export async function startTripTour(kind: TourKind) {
  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);
  const steps = STEPS[kind].filter((s) => document.querySelector(s.element));
  if (!steps.length) return;
  markSeen(kind);
  const d = driver({
    steps,
    showProgress: steps.length > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    popoverClass: "tmw-tour",
    overlayColor: "#1b2a41",
    overlayOpacity: 0.45,
    stagePadding: 6,
    stageRadius: 14,
    smoothScroll: true,
  });
  d.drive();
}
