/**
 * SITE — where customers reach TripMyWay. Data only; used by src/server.ts.
 *
 * The site answers on the custom domain (attached to the `tripmyway` Worker in
 * Cloudflare: Workers & Pages → tripmyway → Settings → Domains & Routes).
 * Other hostnames send page visits there with a permanent redirect, so
 * customers, search engines and shared links all end up on one address.
 */
export const SITE = {
  /** The one public address. */
  canonicalHost: "tripmyway.com",

  /** Always redirected to the canonical host (attach www as a custom domain too). */
  aliasHosts: ["www.tripmyway.com"],

  /**
   * The original workers.dev address. Page visits there are redirected when
   * this is true (on since Oct 20 2026, once tripmyway.com was attached and
   * loading the site).
   * Files and APIs (/photos, /previews, /api) keep answering there either
   * way, because orders already placed carry links to them. Preview builds
   * (other *.workers.dev hosts) are never redirected.
   */
  workersDevHost: "tripmyway.jerry-912.workers.dev",
  redirectWorkersDev: true,
} as const;

/** Paths that must keep working on every host (links stored in past orders, uploads). */
const ALWAYS_SERVED = /^\/(api|photos|previews)\//;

/**
 * Where a request should be redirected to, or null to serve it here.
 * www (and, when enabled, workers.dev) → the canonical host, same path and query.
 */
export function canonicalRedirect(url: URL, method: string): string | null {
  const host = url.hostname.toLowerCase();
  if (host === SITE.canonicalHost) return null;
  const alias = (SITE.aliasHosts as readonly string[]).includes(host);
  const oldHost = SITE.redirectWorkersDev && host === SITE.workersDevHost;
  if (!alias && !oldHost) return null;
  if (oldHost && (ALWAYS_SERVED.test(url.pathname) || (method !== "GET" && method !== "HEAD")))
    return null;
  return `https://${SITE.canonicalHost}${url.pathname}${url.search}`;
}
