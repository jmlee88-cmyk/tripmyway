import { createFileRoute } from "@tanstack/react-router";

/** Upload a customer photo (see src/server/photos.ts). */
export const Route = createFileRoute("/api/photos/$key")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { handleUpload } = await import("@/server/photos");
        return handleUpload(request, params.key);
      },
    },
  },
});
