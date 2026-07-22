/** adminui-hub-health: the Console Hub health-ping reducer transitions
 * unknown → checking → up/down and folds parallel results. */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { applyPingResult, applyPingResults, initHealth, pingOnce, startChecking } from "./health";

describe("health reducer (adminui-hub-health)", () => {
  it("initializes every key to unknown", () => {
    cover("adminui-hub-health");
    expect(initHealth(["a", "b"])).toEqual({ a: "unknown", b: "unknown" });
  });

  it("startChecking → up/down transitions", () => {
    cover("adminui-hub-health");
    let s = initHealth(["client", "api"]);
    s = startChecking(s, "client");
    expect(s.client).toBe("checking");
    s = applyPingResult(s, "client", true);
    expect(s.client).toBe("up");
    s = applyPingResult(s, "client", false);
    expect(s.client).toBe("down");
    // untouched key stays unknown
    expect(s.api).toBe("unknown");
  });

  it("folds parallel results and preserves referential identity on no-op", () => {
    cover("adminui-hub-health");
    const s0 = { client: "up", api: "down" } as const;
    const same = applyPingResult(s0, "client", true);
    expect(same).toBe(s0); // no change → same reference
    const next = applyPingResults(s0, { client: false, api: true });
    expect(next).toEqual({ client: "down", api: "up" });
  });

  it("pingOnce resolves true when the probe answers, false on abort/error", async () => {
    cover("adminui-hub-health");
    const okFetch = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await pingOnce("http://x", okFetch as unknown as typeof fetch, 1000)).toBe(true);
    const failFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await pingOnce("http://x", failFetch as unknown as typeof fetch, 1000)).toBe(false);
  });
});
