/**
 * BUILD STAMP RESOLUTION (task #66, defect P0-6(a) of docs/_false-completions.md).
 *
 * WHAT WENT WRONG. `computeBuildStamp()` used to live inline in vite.config.ts
 * and asked exactly ONE source — `git rev-parse --short HEAD` — returning the
 * string `"dev"` on any throw. That is correct on a laptop and WRONG in every
 * container: `.dockerignore` excludes `.git`, and docker/edge.Dockerfile builds
 * on `node:22-alpine`, which has no git binary. So every image ever built baked
 * `"dev"`, and `https://ggd.adms.ai/` showed `dev` at the bottom of every
 * screen. TWO DIFFERENT IMAGES WERE INDISTINGUISHABLE — which is the only
 * reason the badge exists. Worse, `"dev"` is PLAUSIBLE: it reads like a
 * deliberate label, so nobody ever questioned it. `grep -rn BUILD_STAMP docker
 * deploy Makefile nginx` returned 0 hits for months.
 *
 * THE RULE THIS MODULE ENCODES, in priority order:
 *   1. an EXPLICIT stamp from the environment (`GGD_BUILD_STAMP`, or vite's own
 *      `VITE_BUILD_STAMP`). This is the container path: the host has git, the
 *      image does not, so the host computes the stamp and threads it in as a
 *      docker build arg. Every build path must pass it — see the guard test
 *      tools/testrunner/internal/infracheck/buildstamp_test.go, which fails if
 *      a compose file / skaffold / the Makefile forgets one.
 *   2. GIT, on a machine that has both the binary and a repo (dev + `pnpm
 *      --filter @ggd/client build` from a checkout).
 *   3. NOTHING — and then the stamp is deliberately, unmistakably BROKEN-looking
 *      (`UNSTAMPED-BUILD`), never a plausible `"dev"`. A build that cannot say
 *      what it is must SAY SO on screen, in every screenshot, rather than
 *      quietly impersonating a normal local build.
 *
 * The `-dirty` marker matters as much as the sha: the owner routinely builds
 * from a modified working tree, and two images from the same commit with
 * different working trees are otherwise identical strings.
 *
 * Everything here is pure except `gitProbe()`, so the precedence rules are unit
 * tested (apps/client/src/build/buildStamp.test.ts) without a repo or a git.
 */
import { execSync } from "node:child_process";

/** The stamp shown when NOTHING could identify the build. Deliberately ugly. */
export const UNSTAMPED = "UNSTAMPED-BUILD";

/**
 * Environment variables consulted, in order. `GGD_BUILD_STAMP` is the one the
 * Dockerfiles/compose/Makefile thread through; `VITE_BUILD_STAMP` is accepted
 * because it is what a vite user would reach for by reflex.
 */
export const BUILD_STAMP_ENV_VARS = ["GGD_BUILD_STAMP", "VITE_BUILD_STAMP"] as const;

/** Set to `1` to make an unidentifiable build a hard error instead of a badge. */
export const REQUIRE_STAMP_ENV_VAR = "GGD_REQUIRE_BUILD_STAMP";

/**
 * Strings that LOOK like a stamp but mean "nobody set one". MEASURED, not
 * theorised: skaffold renders `{{.GGD_BUILD_STAMP}}` as the literal
 * `<no value>` when the variable is absent from the environment (verified with
 * a probe image — it does not error), and docker/compose passes `""` for an
 * unset `${GGD_BUILD_STAMP:-}`. Accepting either would bake a badge that reads
 * `<no value>` or is blank — a new flavour of the same defect.
 */
const NON_VALUES = new Set(["", "<no value>", "undefined", "null"]);

export type StampSource = "env" | "git" | "none";

export interface StampResult {
  /** What the badge will show. Never empty. */
  readonly stamp: string;
  readonly source: StampSource;
  /** Human-readable provenance for the build log (`GGD_BUILD_STAMP`, `git`, …). */
  readonly detail: string;
}

export interface GitHead {
  readonly sha: string;
  /** Working tree modified relative to HEAD — two builds of one commit differ. */
  readonly dirty: boolean;
}

/** `YYYY-MM-DD` in UTC. */
export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Pure precedence rule. `env` first (the container path), then `git` (the
 * laptop path), then the loud fallback.
 */
export function resolveBuildStamp(opts: {
  env: Record<string, string | undefined>;
  git: () => GitHead | null;
  today?: () => string;
}): StampResult {
  const today = opts.today ?? (() => utcDate());
  for (const name of BUILD_STAMP_ENV_VARS) {
    const raw = opts.env[name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!NON_VALUES.has(value)) return { stamp: value, source: "env", detail: name };
  }
  const head = opts.git();
  if (head && head.sha.trim().length > 0) {
    const sha = head.sha.trim() + (head.dirty ? "-dirty" : "");
    return { stamp: `${sha} ${today()}`, source: "git", detail: "git rev-parse" };
  }
  return {
    stamp: UNSTAMPED,
    source: "none",
    detail: "no GGD_BUILD_STAMP build arg and no usable git",
  };
}

/**
 * The loud banner printed to stderr when a build could not identify itself.
 * Returned rather than printed so it is assertable in a test.
 */
export function unstampedBanner(result: StampResult): string {
  return [
    "",
    "  ############################################################",
    "  #  BUILD STAMP MISSING — this bundle cannot identify itself",
    `  #  reason: ${result.detail}`,
    `  #  the version badge will read: ${result.stamp}`,
    "  #",
    "  #  A container has no .git (see .dockerignore) and no git",
    "  #  binary. The HOST must compute the stamp and pass it in:",
    "  #    --build-arg GGD_BUILD_STAMP=\"$(git rev-parse --short HEAD) $(date -u +%F)\"",
    "  #  Every build path already does this — see the Makefile,",
    "  #  docker/compose*.yaml and skaffold.yaml.",
    "  ############################################################",
    "",
  ].join("\n");
}

/** Read HEAD from git, or null when git/the repo is unavailable. */
export function gitProbe(): GitHead | null {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (!sha) return null;
    let dirty = false;
    try {
      // --untracked-files=no: a stray scratch file is not a different build.
      dirty =
        execSync("git status --porcelain --untracked-files=no", {
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 2000,
        })
          .toString()
          .trim().length > 0;
    } catch {
      dirty = false; // sha alone still identifies the build; don't lose it
    }
    return { sha, dirty };
  } catch {
    return null;
  }
}

/**
 * The real entry point used by vite.config.ts. Resolves, reports its provenance
 * to the build log, and — when nothing identified the build — prints the loud
 * banner (or throws, if `GGD_REQUIRE_BUILD_STAMP=1` was set by a pipeline that
 * refuses to ship an anonymous artifact).
 */
export function computeBuildStamp(
  env: Record<string, string | undefined> = process.env,
  log: (msg: string) => void = (m) => console.warn(m),
  git: () => GitHead | null = gitProbe,
): string {
  const result = resolveBuildStamp({ env, git });
  if (result.source === "none") {
    log(unstampedBanner(result));
    if ((env[REQUIRE_STAMP_ENV_VAR] ?? "").trim() === "1") {
      throw new Error(
        `build stamp required (${REQUIRE_STAMP_ENV_VAR}=1) but ${result.detail}`,
      );
    }
  } else {
    log(`[ggd] build stamp: ${result.stamp}  (source: ${result.detail})`);
  }
  return result.stamp;
}
