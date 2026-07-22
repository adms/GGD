/** adminui-hub-config: hub link resolution — dev localhost defaults, PROD
 * same-origin preset, and VITE_* overrides winning over both. */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { resolveHubLinks } from "./config";

function byKey(links: ReturnType<typeof resolveHubLinks>, key: string) {
  const l = links.find((x) => x.key === key);
  if (!l) throw new Error(`no link ${key}`);
  return l;
}

describe("hub config (adminui-hub-config)", () => {
  it("dev defaults point at localhost dev servers", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({}, "dev");
    expect(byKey(links, "client").url).toBe("http://localhost:39527");
    expect(byKey(links, "editor").url).toBe("http://127.0.0.1:5174/editor/");
    expect(byKey(links, "api").healthUrl).toBe("http://localhost:8080/v1/healthz");
    // content-api card exists in dev (has a default URL)
    expect(links.some((l) => l.key === "contentApi")).toBe(true);
  });

  it("PROD preset collapses to same-origin paths and hides content-api", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({}, "prod");
    expect(byKey(links, "client").url).toBe("/");
    expect(byKey(links, "editor").url).toBe("/editor/");
    expect(byKey(links, "admin").url).toBe("/admin/");
    expect(byKey(links, "api").healthUrl).toBe("/api/v1/healthz");
    // content-api is dev-only → no card in prod
    expect(links.some((l) => l.key === "contentApi")).toBe(false);
  });

  it("explicit VITE_* env overrides the preset", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({ VITE_CLIENT_URL: "https://play.ggd.gg", VITE_PLATFORM_API_URL: "https://api.ggd.gg" }, "prod");
    expect(byKey(links, "client").url).toBe("https://play.ggd.gg");
    expect(byKey(links, "api").url).toBe("https://api.ggd.gg/v1/healthz");
  });
});
