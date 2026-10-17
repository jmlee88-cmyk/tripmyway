import { createFileRoute } from "@tanstack/react-router";

/** Upload a map preview PNG (see src/server/previews.ts). */
export const Route = createFileRoute("/api/previews/$key")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { handleUpload } = await import("@/server/previews");
        return handleUpload(request, params.key);
      },
    },
  },
});
