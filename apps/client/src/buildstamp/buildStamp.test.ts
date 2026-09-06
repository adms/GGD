/**
 * BUILD STAMP RESOLUTION (task #66, defect P0-6(a)).
 *
 * The regression under test, in one sentence: the stamp used to be computed
 * from git ALONE, with `catch { return "dev" }` — and a container has neither
 * `.git` (excluded by .dockerignore) nor a git binary (node:22-alpine), so
 * every image ever built baked the word `dev`. `https://ggd.adms.ai/` showed
 * `dev` at the bottom of every screen and two different images were
 * indistinguishable, which is the only thing the badge is for.
 *
 * Two properties are asserted here, and they are the whole fix:
 *   1. an explicit stamp from the ENVIRONMENT wins over git — that is the
 *      container path, where the host computes the value and threads it in as a
 *      docker build arg;
 *   2. when nothing can identify the build the result is LOUD
 *      (`UNSTAMPED-BUILD`), never a plausible-looking `"dev"`. Plausibility is
 *      what made this survive for months.
 *
 * The wiring half — that every build path actually passes the arg — is guarded
 * in Go, over the real files: tools/testrunner/internal/infracheck/buildstamp_test.go.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BUILD_STAMP_ENV_VARS,
  REQUIRE_STAMP_ENV_VAR,
  UNSTAMPED,
  computeBuildStamp,
  resolveBuildStamp,
  unstampedBanner,
  utcDate,
} from "../../dev/buildStamp";

const noGit = (): null => null;
const today = (): string => "2026-07-24";

describe("build stamp resolution (build-stamp-env)", () => {
  it("an explicit env stamp wins — this is the ONLY source a container has", () => {
    cover("build-stamp-env");
    const r = resolveBuildStamp({
      env: { GGD_BUILD_STAMP: "49dca64 2026-07-24" },
      git: () => ({ sha: "aaaaaaa", dirty: false }),
      today,
    });
    expect(r.stamp).toBe("49dca64 2026-07-24");
    expect(r.source).toBe("env");
    expect(r.detail).toBe("GGD_BUILD_STAMP");
  });

  it("accepts VITE_BUILD_STAMP too, but GGD_BUILD_STAMP has priority", () => {
    cover("build-stamp-env");
    expect(BUILD_STAMP_ENV_VARS).toEqual(["GGD_BUILD_STAMP", "VITE_BUILD_STAMP"]);
    expect(
      resolveBuildStamp({ env: { VITE_BUILD_STAMP: "abc1234 2026-07-24" }, git: noGit, today })
        .stamp,
    ).toBe("abc1234 2026-07-24");
    expect(
      resolveBuildStamp({
        env: { GGD_BUILD_STAMP: "win 1", VITE_BUILD_STAMP: "lose 2" },
        git: noGit,
        today,
      }).stamp,
    ).toBe("win 1");
  });

  it("an EMPTY build arg is not a stamp — docker passes '' for an unset arg", () => {
    cover("build-stamp-env");
    // `GGD_BUILD_STAMP: "${GGD_BUILD_STAMP:-}"` in compose yields "" when the
    // host never set it. Treating that as a stamp would bake a blank badge.
    const r = resolveBuildStamp({ env: { GGD_BUILD_STAMP: "   " }, git: noGit, today });
    expect(r.source).toBe("none");
    expect(r.stamp).toBe(UNSTAMPED);
  });

  it("skaffold's `<no value>` is not a stamp either", () => {
    cover("build-stamp-env");
    // MEASURED with a probe image: skaffold does NOT fail on an unset env var
    // in `buildArgs: {K: "{{.K}}"}` — it renders the literal `<no value>` and
    // hands it to docker. Accepting it would put `<no value>` on the badge.
    const r = resolveBuildStamp({ env: { GGD_BUILD_STAMP: "<no value>" }, git: noGit, today });
    expect(r.source).toBe("none");
    expect(r.stamp).toBe(UNSTAMPED);
    // …and it must still lose to a real git head rather than shadowing it.
    expect(
      resolveBuildStamp({
        env: { GGD_BUILD_STAMP: "<no value>" },
        git: () => ({ sha: "49dca64", dirty: false }),
        today,
      }).stamp,
    ).toBe("49dca64 2026-07-24");
  });

  it("falls back to git on a machine that has one, and marks a dirty tree", () => {
    cover("build-stamp-env");
    expect(
      resolveBuildStamp({ env: {}, git: () => ({ sha: "49dca64", dirty: false }), today }).stamp,
    ).toBe("49dca64 2026-07-24");
    // Two images off the SAME commit with different working trees must not be
    // one string — the owner builds from a modified tree routinely.
    expect(
      resolveBuildStamp({ env: {}, git: () => ({ sha: "49dca64", dirty: true }), today }).stamp,
    ).toBe("49dca64-dirty 2026-07-24");
  });

  it("with no env and no git the stamp is LOUD, never a plausible 'dev'", () => {
    cover("build-stamp-env");
    const r = resolveBuildStamp({ env: {}, git: noGit, today });
    expect(r.stamp).toBe("UNSTAMPED-BUILD");
    expect(r.source).toBe("none");
    // The exact regression: the old code returned "dev" here, which reads like a
    // deliberate label and so was never questioned.
    expect(r.stamp).not.toBe("dev");
    expect(r.stamp).toMatch(/UNSTAMPED/);
  });

  it("the failure banner names the reason and the fix", () => {
    cover("build-stamp-env");
    const banner = unstampedBanner(resolveBuildStamp({ env: {}, git: noGit, today }));
    expect(banner).toContain("BUILD STAMP MISSING");
    expect(banner).toContain("GGD_BUILD_STAMP");
    expect(banner).toContain(UNSTAMPED);
  });

  it("computeBuildStamp logs its provenance, and can be made fatal", () => {
    cover("build-stamp-env");
    const lines: string[] = [];
    const stamp = computeBuildStamp(
      { GGD_BUILD_STAMP: "49dca64 2026-07-24" },
      (m) => lines.push(m),
      noGit,
    );
    expect(stamp).toBe("49dca64 2026-07-24");
    expect(lines.join("\n")).toContain("GGD_BUILD_STAMP");

    // No env, no git (the container case): warn loudly, still return a stamp.
    const warned: string[] = [];
    expect(computeBuildStamp({}, (m) => warned.push(m), noGit)).toBe(UNSTAMPED);
    expect(warned.join("\n")).toContain("BUILD STAMP MISSING");

    // A pipeline that refuses to ship an anonymous artifact opts in:
    expect(() =>
      computeBuildStamp({ [REQUIRE_STAMP_ENV_VAR]: "1" }, () => {}, noGit),
    ).toThrow(/build stamp required/);
  });

  it("utcDate is YYYY-MM-DD in UTC", () => {
    cover("build-stamp-env");
    expect(utcDate(new Date("2026-07-24T23:59:59Z"))).toBe("2026-07-24");
  });
});
