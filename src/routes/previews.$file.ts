import { createFileRoute } from "@tanstack/react-router";

/** Map preview images (see src/server/previews.ts). */
export const Route = createFileRoute("/previews/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { handleServe } = await import("@/server/previews");
        return handleServe(params.file);
      },
    },
  },
});
