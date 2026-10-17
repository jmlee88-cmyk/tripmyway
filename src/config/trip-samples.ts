import type { TripDesign, TripStop } from "@/types/trip";

/**
 * Example trips for the trip preview page (/trip/preview). Real places, so
 * the fit, split and placement rules can be seen on real maps.
 */
const stop = (label: string, lng: number, lat: number, date?: string): TripStop => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  label,
  ...(date ? { date } : {}),
  location: { id: label, name: label, formattedAddress: label, latitude: lat, longitude: lng },
});

export const SAMPLE_TRIPS: { id: string; name: string; design: TripDesign }[] = [
  {
    id: "italy",
    name: "Italy, 7 stops",
    design: {
      title: "Italy 2026",
      styleId: "modern-minimal",
      printSize: "18x24",
      stops: [
        stop("Milan", 9.19, 45.4642, "Jun 3"),
        stop("Lake Como", 9.085, 45.81),
        stop("Venice", 12.3155, 45.4408),
        stop("Florence", 11.2558, 43.7696),
        stop("Cinque Terre", 9.7385, 44.0994),
        stop("Rome", 12.4964, 41.9028),
        stop("Amalfi", 14.6027, 40.634, "Jun 18"),
      ],
    },
  },
  {
    id: "pacific",
    name: "California to Japan",
    design: {
      title: "California to Japan",
      styleId: "modern-minimal",
      printSize: "18x24",
      stops: [
        stop("Los Angeles", -118.2437, 34.0522, "May 2"),
        stop("Santa Barbara", -119.6982, 34.4208),
        stop("San Francisco", -122.4194, 37.7749),
        stop("Tokyo", 139.7671, 35.6812),
        stop("Kyoto", 135.7681, 35.0116),
        stop("Osaka", 135.5023, 34.6937, "May 21"),
      ],
    },
  },
  {
    id: "usa",
    name: "Coast to coast USA",
    design: {
      title: "Coast to Coast",
      styleId: "modern-minimal",
      printSize: "18x24",
      stops: [
        stop("New York", -74.006, 40.7128),
        stop("Chicago", -87.6298, 41.8781),
        stop("Denver", -104.9903, 39.7392),
        stop("Grand Canyon", -112.1129, 36.1069),
        stop("Las Vegas", -115.1398, 36.1699),
        stop("Los Angeles", -118.2437, 34.0522),
        stop("San Francisco", -122.4194, 37.7749),
      ],
    },
  },
  {
    id: "rome",
    name: "A day in Rome",
    design: {
      title: "Roma",
      styleId: "modern-minimal",
      printSize: "18x24",
      stops: [
        stop("Colosseum", 12.4922, 41.8902),
        stop("St Peter's", 12.4534, 41.9029),
        stop("Pantheon", 12.4768, 41.8986),
        stop("Trevi", 12.4833, 41.9009),
        stop("Termini", 12.5014, 41.9009),
      ],
    },
  },
];
