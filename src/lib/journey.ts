import { createServerFn } from "@tanstack/react-start";
import { JOURNEY } from "@/config/journey";
import type { JourneyReading } from "@/server/journey-ai";

export type { JourneyReading, JourneyStop } from "@/server/journey-ai";

/**
 * Client entry point for "Map Your Journey". The server function runs on the
 * Worker; the API key never reaches the browser. Secrets (Cloudflare →
 * Workers → tripmyway → Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY       required
 *   ANTHROPIC_WORKSPACE_ID  only for keys that aren't scoped to a workspace
 */
export const readJourney = createServerFn({ method: "POST" })
  .inputValidator((d: unknown): { text: string } => {
    const text =
      typeof (d as { text?: unknown })?.text === "string" ? (d as { text: string }).text : "";
    return { text: text.trim().slice(0, JOURNEY.maxLength) };
  })
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; result: JourneyReading } | { ok: false; error: string }> => {
      const { readJourneyText, JourneyError } = await import("@/server/journey-ai");
      const { serverEnv, clientKey, rateLimited, cloudflareLimited } =
        await import("@/server/runtime");
      if (data.text.length < JOURNEY.minLength)
        return {
          ok: false,
          error: "Tell us a little more: the places you went, in the order you went.",
        };
      const apiKey = serverEnv("ANTHROPIC_API_KEY");
      if (!apiKey) {
        console.error("ANTHROPIC_API_KEY is not set");
        return {
          ok: false,
          error: "Our trip reader isn't switched on yet. Please check back soon.",
        };
      }
      if (
        rateLimited(`journey:${clientKey()}`, JOURNEY.rateLimit) ||
        (await cloudflareLimited("JOURNEY_LIMIT", `journey:${clientKey()}`))
      )
        return {
          ok: false,
          error: "That's a lot of trips in a short time. Please try again in a few minutes.",
        };
      try {
        const result = await readJourneyText(data.text, {
          apiKey,
          workspaceId: serverEnv("ANTHROPIC_WORKSPACE_ID"),
        });
        return { ok: true, result };
      } catch (e) {
        if (e instanceof JourneyError) return { ok: false, error: e.message };
        console.error(e);
        return { ok: false, error: "Something went wrong reading your trip. Please try again." };
      }
    },
  );
