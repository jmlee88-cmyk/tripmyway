import { afterEach, describe, expect, it } from "vitest";
import { SITE, canonicalRedirect } from "./site";

const go = (u: string, method = "GET") => canonicalRedirect(new URL(u), method);
const site = SITE as { redirectWorkersDev: boolean };

describe("one public address", () => {
  afterEach(() => {
    site.redirectWorkersDev = false;
  });

  it("serves tripmyway.com and sends www there, keeping path and query", () => {
    expect(go("https://tripmyway.com/create?style=classic")).toBeNull();
    expect(go("https://www.tripmyway.com/create?style=classic")).toBe(
      "https://tripmyway.com/create?style=classic",
    );
    expect(go("https://WWW.TripMyWay.com/")).toBe("https://tripmyway.com/");
  });

  it("leaves workers.dev alone until switched on, and preview builds always", () => {
    expect(go("https://tripmyway.jerry-912.workers.dev/journey")).toBeNull();
    site.redirectWorkersDev = true;
    expect(go("https://tripmyway.jerry-912.workers.dev/journey")).toBe(
      "https://tripmyway.com/journey",
    );
    expect(go("https://abc123-tripmyway.jerry-912.workers.dev/journey")).toBeNull();
  });

  it("keeps old photo and preview links, and uploads, working on workers.dev", () => {
    site.redirectWorkersDev = true;
    expect(go("https://tripmyway.jerry-912.workers.dev/photos/abc.jpg")).toBeNull();
    expect(go("https://tripmyway.jerry-912.workers.dev/previews/abc.png")).toBeNull();
    expect(go("https://tripmyway.jerry-912.workers.dev/api/photos/abc", "PUT")).toBeNull();
    expect(go("https://tripmyway.jerry-912.workers.dev/cart", "POST")).toBeNull();
  });
});
