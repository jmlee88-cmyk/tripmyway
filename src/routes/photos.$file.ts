import { createFileRoute } from "@tanstack/react-router";

/** Customer photos (see src/server/photos.ts). */
export const Route = createFileRoute("/photos/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { handleServe } = await import("@/server/photos");
        return handleServe(params.file);
      },
    },
  },
});
