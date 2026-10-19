import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Server-only runtime helpers. On Cloudflare Workers the bindings (secrets and
 * variables) arrive per request; nitro exposes them on globalThis.__env__.
 * Locally they come from process.env.
 */
export function serverEnv(name: string): string | undefined {
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const v = cf?.[name] ?? (typeof process !== "undefined" ? process.env?.[name] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Best-effort visitor key for rate limiting. */
export function clientKey(): string {
  try {
    return (
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anon"
    );
  } catch {
    return "anon";
  }
}

const hits = new Map<string, number[]>();

/**
 * Sliding-window limit kept in this server instance's memory. Workers run many
 * instances, so this only slows a single abuser down; a Cloudflare rate
 * limiting rule on the server-function path is the real protection.
 */
export function rateLimited(
  key: string,
  { requests, windowMs }: { requests: number; windowMs: number },
) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= requests) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

/**
 * Cloudflare's rate limiting binding (wrangler.jsonc "ratelimits"), counted
 * across all Worker instances at that location. True when `key` is over the
 * binding's limit. Not configured (local dev, tests): never limited.
 */
export async function cloudflareLimited(binding: string, key: string): Promise<boolean> {
  const cf = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  const rl = cf?.[binding] as
    { limit?: (o: { key: string }) => Promise<{ success: boolean }> } | undefined;
  if (!rl?.limit) return false;
  try {
    return !(await rl.limit({ key })).success;
  } catch {
    return false;
  }
}
