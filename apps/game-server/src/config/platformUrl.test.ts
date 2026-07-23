/**
 * Platform-URL + env resolution and one-time fail-safe logging (task #48,
 * pu-01..pu-05). The dev-env bug was a HARDCODED k8s host (platform:8080) that
 * never resolves on a dev box; these lock in the localhost fallback, the env
 * override, and that a burst of degradations logs ONCE — while the actual
 * fail-safe behavior (allow-all / bundled defaults) is asserted against an
 * unreachable URL in whitelist.test.ts / combatEnv.test.ts and re-checked here.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import {
  DEFAULT_PLATFORM_URL,
  resolvePlatformUrl,
  warnOnce,
  hasWarned,
  resetWarnOnce,
} from "./platformUrl";
import { fetchWhitelist } from "../curation/whitelist";
import { fetchCombatEnv } from "./combatEnv";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";

const failFetch: typeof fetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

beforeEach(() => resetWarnOnce());
afterEach(() => vi.restoreAllMocks());

describe("platform URL resolution (pu-01..pu-02)", () => {
  it("pu-01: falls back to localhost, NOT the k8s host, when GGD_PLATFORM_URL is unset", () => {
    cover("platformurl-fallback");
    expect(DEFAULT_PLATFORM_URL).toBe("http://localhost:8080");
    expect(resolvePlatformUrl({})).toBe("http://localhost:8080");
    // A blank / whitespace-only value is treated as unset (not a broken URL).
    expect(resolvePlatformUrl({ GGD_PLATFORM_URL: "" })).toBe("http://localhost:8080");
    expect(resolvePlatformUrl({ GGD_PLATFORM_URL: "   " })).toBe("http://localhost:8080");
    // The old hardcoded default must never be the fallback again.
    expect(resolvePlatformUrl({})).not.toContain("platform:8080");
  });

  it("pu-02: GGD_PLATFORM_URL overrides the fallback (k8s sets platform:8080)", () => {
    cover("platformurl-env-override");
    expect(resolvePlatformUrl({ GGD_PLATFORM_URL: "http://platform:8080" })).toBe(
      "http://platform:8080",
    );
    expect(resolvePlatformUrl({ GGD_PLATFORM_URL: "  http://p.internal:9000  " })).toBe(
      "http://p.internal:9000",
    );
  });
});

describe("warnOnce one-time fail-safe logging (pu-03)", () => {
  it("pu-03: logs a distinct key exactly once, keys are independent, reset re-arms", () => {
    cover("platformurl-warn-once");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnOnce("a", "first-a");
    warnOnce("a", "second-a"); // suppressed
    warnOnce("b", "first-b");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(hasWarned("a")).toBe(true);
    expect(hasWarned("b")).toBe(true);
    expect(hasWarned("c")).toBe(false);
    resetWarnOnce();
    warnOnce("a", "again-a");
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("unreachable platform → fail SAFE, logged once (pu-04..pu-05)", () => {
  it("pu-04: curation degrades to a NON-EMPTY allow-set and logs once", async () => {
    cover("platformurl-curation-failsafe");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // The default fallback URL is itself unreachable in the test env; use it to
    // prove the shipped default (no env) still fails safe rather than empty.
    const wl = await fetchWhitelist(DEFAULT_PLATFORM_URL, { fetchImpl: failFetch });
    const wl2 = await fetchWhitelist(DEFAULT_PLATFORM_URL, { fetchImpl: failFetch });
    // Allow-all: any champion/item is permitted — a NON-EMPTY allow-set, never
    // the empty roster that would brick the match.
    expect(wl.bypass).toBe(true);
    expect(wl.allowsChampion("sela")).toBe(true);
    expect(wl.filterChampions(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(wl.hasAnyChampion(["a"])).toBe(true);
    expect(wl2.bypass).toBe(true);
    // Two failures → a single degradation line.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("pu-05: combat-env falls back to bundled content defaults and logs once", async () => {
    cover("platformurl-combatenv-failsafe");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // With no content doc, the bundled neutral all-1.0 default table.
    const neutral = await fetchCombatEnv(DEFAULT_PLATFORM_URL, {
      contentDefaults: {},
      fetchImpl: failFetch,
    });
    expect(neutral).toEqual(DEFAULT_COMBAT_ENV);
    // With bundled content defaults present, those survive (admin NOT applied).
    const table = await fetchCombatEnv(DEFAULT_PLATFORM_URL, {
      contentDefaults: { cooldown: 0.25 },
      fetchImpl: failFetch,
    });
    expect(table.cooldown).toBe(0.25);
    expect(table.damageDealt).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
