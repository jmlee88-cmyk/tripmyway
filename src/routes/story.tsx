import { createFileRoute, redirect } from "@tanstack/react-router";

/** "Tell us your story" became "Map Your Journey"; old links land there. */
export const Route = createFileRoute("/story")({
  beforeLoad: () => {
    throw redirect({ to: "/journey", statusCode: 301 });
  },
});
