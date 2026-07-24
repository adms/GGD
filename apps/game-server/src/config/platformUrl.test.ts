/**
 * Task #48 — platform-URL resolution and the LOUDNESS of the fail-safe path
 * (pu-01..pu-13).
 *
 * The bug: the game-server reached the platform through the hardcoded k8s host
 * `platform:8080`, which never resolves on a dev box or a LAN host, so curation
 * (whitelist), combat-env (admin multipliers) and server-ops all fell back to
 * defaults on EVERY local match — silently. The owner tuned numbers in the
 * admin console and then played matches that had never read them.
 *
 * These lock down all three halves of the fix:
 *   pu-01..02, 06..07  the resolution ORDER: explicit env → in-cluster k8s host
 *                      (only when KUBERNETES_SERVICE_HOST proves we are a pod)
 *                      → localhost. `platform:8080` may never appear on a laptop.
 *   pu-03, 08, 13      the degradation REGISTRY: warn once per condition, count
 *                      the suppressed repeats, retract on recovery, re-arm for
 *                      the next outage — so /healthz describes NOW, not "ever".
 *   pu-09..12          the boot PROBE: an unreachable platform prints a banner
 *                      naming every subsystem about to serve defaults; a
 *                      reachable one prints the champion count.
 *   pu-04..05          the fail-safe behavior itself (allow-all / bundled
 *                      defaults), also asserted in whitelist/combatEnv tests.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import {
  DEFAULT_PLATFORM_URL,
  CLUSTER_PLATFORM_URL,
  resolvePlatformUrl,
  resolvePlatformUrlDetailed,
  isInCluster,
  warnOnce,
  hasWarned,
  resetWarnOnce,
  clearDegradation,
  degradations,
  platformStatus,
  probePlatformAtBoot,
  BOOT_PROBE_KEY,
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

describe("in-cluster tier of the resolution order (pu-06..pu-07)", () => {
  it("pu-06: with no env var, the k8s Service host is used ONLY inside a pod", () => {
    cover("platformurl-cluster-tier");
    // The kubelet injects KUBERNETES_SERVICE_HOST into every pod; its presence
    // is the ONLY thing that may promote the cluster host over localhost.
    expect(isInCluster({})).toBe(false);
    expect(isInCluster({ KUBERNETES_SERVICE_HOST: "  " })).toBe(false);
    expect(isInCluster({ KUBERNETES_SERVICE_HOST: "10.96.0.1" })).toBe(true);

    const inPod = resolvePlatformUrlDetailed({ KUBERNETES_SERVICE_HOST: "10.96.0.1" });
    expect(inPod.url).toBe(CLUSTER_PLATFORM_URL);
    expect(inPod.url).toBe("http://platform:8080");
    expect(inPod.source).toBe("cluster");

    // The original bug: `platform:8080` on a machine that is not a pod.
    const onLaptop = resolvePlatformUrlDetailed({});
    expect(onLaptop.url).toBe(DEFAULT_PLATFORM_URL);
    expect(onLaptop.source).toBe("localhost");
    expect(onLaptop.url).not.toContain("platform:8080");
  });

  it("pu-07: an explicit GGD_PLATFORM_URL outranks the in-cluster default", () => {
    cover("platformurl-env-beats-cluster");
    const r = resolvePlatformUrlDetailed({
      GGD_PLATFORM_URL: "http://ggd-platform:8080",
      KUBERNETES_SERVICE_HOST: "10.96.0.1",
    });
    // Matters in practice: the helm chart prefixes Services with the release
    // name, so the bare `platform` guess would be WRONG there.
    expect(r.url).toBe("http://ggd-platform:8080");
    expect(r.source).toBe("env");
  });
});

describe("degradation registry — surfaced, not just logged (pu-08)", () => {
  it("pu-08: warnOnce files a degradation, counts suppressed repeats, clear retracts", () => {
    cover("platformurl-degradation-registry");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(platformStatus().degraded).toBe(false);
    expect(platformStatus().degradations).toEqual([]);

    warnOnce("combat-env-unreachable", "boom");
    warnOnce("combat-env-unreachable", "boom"); // suppressed in the log, counted here
    warnOnce("combat-env-unreachable", "boom");
    const active = degradations();
    expect(active).toHaveLength(1);
    expect(active[0]?.key).toBe("combat-env-unreachable");
    expect(active[0]?.occurrences).toBe(3);
    expect(typeof active[0]?.since).toBe("string");

    // /healthz reports it, along with which platform was resolved and why.
    const status = platformStatus();
    expect(status.degraded).toBe(true);
    expect(status.url).toBe(resolvePlatformUrl());
    expect(status.reason.length).toBeGreaterThan(0);

    // A later SUCCESS retracts it — /healthz must describe NOW, not "ever" —
    // and re-arms the warning so a second outage is loud again.
    clearDegradation("combat-env-unreachable");
    expect(hasWarned("combat-env-unreachable")).toBe(false);
    expect(platformStatus().degraded).toBe(false);
  });
});

describe("boot probe makes the fallback impossible to miss (pu-09..pu-10)", () => {
  it("pu-09: an unreachable platform prints a DEGRADED banner naming every fallback", async () => {
    cover("platformurl-boot-probe-degraded");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.fn();
    const result = await probePlatformAtBoot({ fetchImpl: failFetch, log });

    expect(result.ok).toBe(false);
    // Nothing on the healthy channel; the banner went out loud on stderr.
    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    const banner = String(err.mock.calls[0]?.[0]);
    expect(banner).toContain("CANNOT REACH THE PLATFORM");
    // It must name what will actually be wrong, not just "an error occurred".
    expect(banner).toContain("ALLOW-ALL");
    expect(banner).toContain("combat-env");
    expect(banner).toContain("server-ops");
    expect(banner).toContain("GGD_PLATFORM_URL");
    expect(banner).toContain(resolvePlatformUrl());
    // And it is queryable afterwards on /healthz, not only in the scrollback.
    expect(hasWarned(BOOT_PROBE_KEY)).toBe(true);
    expect(platformStatus().degraded).toBe(true);
  });

  it("pu-10: a reachable platform reports the champion count and clears the banner", async () => {
    cover("platformurl-boot-probe-ok");
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Pre-existing degradation from an earlier failed probe.
    warnOnce(BOOT_PROBE_KEY, "stale");
    const log = vi.fn();
    const okFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ champions: ["a", "b", "c"], items: [], abilities: [] }),
    })) as unknown as typeof fetch;

    const result = await probePlatformAtBoot({ fetchImpl: okFetch, log });
    expect(result.ok).toBe(true);
    expect(result.championCount).toBe(3);
    // The count is the number that tells the owner he is on HIS curated roster.
    expect(String(log.mock.calls[0]?.[0])).toContain("3 champion(s) enabled");
    expect(hasWarned(BOOT_PROBE_KEY)).toBe(false);
    expect(platformStatus().degraded).toBe(false);
  });

  it("pu-11: a reachable platform with an EMPTY whitelist still says so", async () => {
    cover("platformurl-boot-probe-empty");
    const log = vi.fn();
    const emptyFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ champions: [], items: [], abilities: [] }),
    })) as unknown as typeof fetch;
    const result = await probePlatformAtBoot({ fetchImpl: emptyFetch, log });
    expect(result.ok).toBe(true);
    expect(result.championCount).toBe(0);
    expect(String(log.mock.calls[0]?.[0])).toContain("EMPTY");
  });

  it("pu-12: a non-200 from the platform degrades exactly like a dead socket", async () => {
    cover("platformurl-boot-probe-status");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const badFetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const result = await probePlatformAtBoot({ fetchImpl: badFetch, log: vi.fn() });
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("HTTP 503");
    expect(String(err.mock.calls[0]?.[0])).toContain("CANNOT REACH THE PLATFORM");
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

  it("pu-13: a recovered platform retracts the degradation, and a SECOND outage warns again", async () => {
    cover("platformurl-degradation-recovery");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const okFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: 1, champions: ["sela"], items: [], abilities: [] }),
    })) as unknown as typeof fetch;

    // Outage → one warning, /healthz red.
    await fetchWhitelist(DEFAULT_PLATFORM_URL, { bypass: false, fetchImpl: failFetch });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(platformStatus().degraded).toBe(true);

    // Recovery → the real whitelist is enforced again and /healthz goes green.
    // Without this the shard would report an outage forever after one blip.
    const wl = await fetchWhitelist(DEFAULT_PLATFORM_URL, { bypass: false, fetchImpl: okFetch });
    expect(wl.bypass).toBe(false);
    expect(wl.allowsChampion("sela")).toBe(true);
    expect(wl.allowsChampion("not-curated")).toBe(false);
    expect(platformStatus().degraded).toBe(false);

    // A LATER outage must be loud again, not swallowed by the first one's dedup.
    await fetchWhitelist(DEFAULT_PLATFORM_URL, { bypass: false, fetchImpl: failFetch });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(platformStatus().degraded).toBe(true);
  });
});
