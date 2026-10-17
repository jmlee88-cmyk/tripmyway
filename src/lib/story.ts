import { createServerFn } from "@tanstack/react-start";
import type { Customization, PrintFormat } from "@/types/product";
import { STORY, STORY_DRAFT_KEY } from "@/config/story";
import type { StoryRecommendation } from "@/server/story-ai";

export type { StoryPanel, StoryRecommendation } from "@/server/story-ai";

/**
 * Client entry point for "Tell us your story". The server function runs on
 * the Worker; the API key never reaches the browser. Secrets (set in
 * Cloudflare → Workers → tripmyway → Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY       required
 *   ANTHROPIC_WORKSPACE_ID  only for keys that aren't scoped to a workspace
 */
export const readStory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown): { story: string } => {
    const story =
      typeof (d as { story?: unknown })?.story === "string" ? (d as { story: string }).story : "";
    return { story: story.trim().slice(0, STORY.maxStoryLength) };
  })
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; result: StoryRecommendation } | { ok: false; error: string }> => {
      const { recommendFromStory, StoryError } = await import("@/server/story-ai");
      const { serverEnv, clientKey, rateLimited } = await import("@/server/runtime");
      if (data.story.length < STORY.minStoryLength)
        return {
          ok: false,
          error:
            "Tell us a little more — a sentence or two about the place and what happened there.",
        };
      const apiKey = serverEnv("ANTHROPIC_API_KEY");
      if (!apiKey) {
        console.error("ANTHROPIC_API_KEY is not set");
        return {
          ok: false,
          error: "Our story reader isn't set up yet. You can still design your map directly.",
        };
      }
      if (rateLimited(`story:${clientKey()}`, STORY.rateLimit))
        return {
          ok: false,
          error:
            "You've told us a lot of stories in a short time — please try again in a few minutes.",
        };
      try {
        const result = await recommendFromStory(data.story, {
          apiKey,
          workspaceId: serverEnv("ANTHROPIC_WORKSPACE_ID"),
        });
        return { ok: true, result };
      } catch (e) {
        if (e instanceof StoryError) return { ok: false, error: e.message };
        console.error(e);
        return { ok: false, error: "Something went wrong reading your story. Please try again." };
      }
    },
  );

/** What the story page hands to the Create page: the panels, already placed. */
export interface StoryDraft {
  format: PrintFormat;
  panels: Customization[];
}

export function saveStoryDraft(draft: StoryDraft) {
  try {
    sessionStorage.setItem(STORY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable: the Create page just starts fresh */
  }
}

/** Read and clear the draft (it applies once). */
export function takeStoryDraft(): StoryDraft | null {
  try {
    const raw = sessionStorage.getItem(STORY_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORY_DRAFT_KEY);
    const d = JSON.parse(raw) as StoryDraft;
    return Array.isArray(d.panels) && d.panels.length > 0 ? d : null;
  } catch {
    return null;
  }
}
