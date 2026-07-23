/**
 * OVERLAY GATE — executable proof of how the local-only Blizzard overlay may
 * and may not reach a deploy.
 *
 * THIS TEST WAS REWRITTEN (tasks #176/#177). It used to assert the overlay
 * could reach NO deployed build, ANYWHERE, by any path — the #10/#127 decision.
 * The owner has deliberately reversed that FOR HIS FAMILY-ONLY DEPLOY: he is the
 * copyright holder of the map, the audience is his household, and a relative on
 * a tunnel must see what he sees on localhost rather than 40 of 113 champions
 * replaced by generic KayKit stand-ins with no voice.
 *
 * So the rule this file pins is no longer "never". It is:
 *
 *   1. DEFAULT OFF. Nothing about a normal build, image, chart or compose stack
 *      requests, serves, bakes or mounts the overlay. A deploy that does not
 *      opt in behaves exactly as it did before #176 — including the copyright
 *      gate that refuses the restricted mounts to a public peer.
 *   2. OPT-IN IS ONE EXPLICIT, VISIBLE ACT. Turning it on is a separate compose
 *      overlay file that must be named on the command line, and it flips FOUR
 *      coordinated switches at once (declared tier, client build flag, nginx
 *      tier mount, byte mount). Forgetting any one fails safe.
 *   3. THE BYTES STILL NEVER TRAVEL WITH GIT. The overlay is git-ignored and no
 *      image bakes it in; it arrives only as an explicit runtime mount.
 *   4. A HALF-CONFIGURED OPT-IN FAILS LOUDLY AT BOOT rather than quietly serving
 *      stand-ins. That silence is the single most dangerous thing about this
 *      feature and the boot assertion exists to remove it.
 *
 * Deleting this test, or the gate it guards, is how a deliberate decision
 * becomes an accident six months later — so it is rewritten, never removed.
 * The behavioural half (missing/partial/corrupt → boot fails) lives in
 * blizzardOverlayBoot.test.ts, which drives the real script.
 *
 * These are filesystem/config facts, so the test is a plain node read of the
 * repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFullAssets } from "../../config/fullAssets";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/**
 * Drop `//` line comments and block comments (JS) or `#` lines (nginx/compose)
 * so a source-text assertion reads DIRECTIVES and not prose. Deliberately crude
 * — it is only ever pointed at this repo's own config files, and over-stripping
 * would make an assertion stricter, never weaker.
 */
const stripJsComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const stripHashComments = (src: string): string =>
  src
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

/** Physical store (git-ignored, outside content/). */
const OVERLAY_DIR = "data/blizzard-overlay";
/** URL mount the client fetches. */
const OVERLAY_URL_PREFIX = "/content/assets/blizzard-local";

// ===========================================================================
// UNCHANGED INVARIANTS — true before #176 and still true. The bytes are
// Blizzard-owned and never enter git or an image; they arrive only by mount.
// ===========================================================================

describe("overlay gate: content/ ships no Blizzard binaries", () => {
  it("content/assets/blizzard-local contains only the README", () => {
    const entries = readdirSync(join(REPO, "content/assets/blizzard-local"));
    expect(entries).toEqual(["README.md"]);
  });

  it("the README states LOCAL DEV ONLY and points at the real store", () => {
    const readme = read("content/assets/blizzard-local/README.md");
    expect(readme).toMatch(/LOCAL DEV ONLY/i);
    expect(readme).toMatch(/Blizzard/);
    expect(readme).toContain(OVERLAY_DIR);
  });

  it("the overlay store is git-ignored wholesale (never committed)", () => {
    expect(read(".gitignore")).toContain("/data/**");
  });

  it("no Dockerfile bakes the overlay bytes into an image", () => {
    for (const f of readdirSync(join(REPO, "docker")).filter((n) => n.endsWith(".Dockerfile"))) {
      for (const line of read(`docker/${f}`).split("\n")) {
        const copy = line.trim();
        if (!/^COPY\b/i.test(copy)) continue;
        // The edge image DOES now COPY the verification SCRIPT and the boot
        // entrypoint (tools/deploy/ggd-assets.sh, docker/edge-entrypoint.d/…) —
        // neither is under data/ and neither is a Blizzard binary. What must
        // never appear is a copy of the byte store itself.
        expect(copy, `${f}: ${copy}`).not.toMatch(/(^|\s)\.?\/?data\//);
        expect(copy, `${f}: ${copy}`).not.toMatch(/blizzard-overlay/i);
      }
    }
  });

  it("the edge image never copies the dev-only nginx routes", () => {
    expect(read("docker/edge.Dockerfile")).not.toMatch(/^COPY\s+nginx\/dev/im);
  });
});

// ===========================================================================
// DEFAULT OFF — a build/image/chart/compose that did not opt in is unchanged.
// ===========================================================================

describe("overlay gate: DEFAULT OFF — nothing opts in by accident", () => {
  it("the client build flag defaults to the build mode — a prod bundle never probes", () => {
    // resolveFullAssets(explicit, devBuild). Unset flag + a production build
    // (devBuild=false) must be false: the folded bundle never issues the
    // manifest request, exactly as before #176.
    expect(resolveFullAssets(undefined, false)).toBe(false);
    // A dev server (devBuild=true) still probes — local development unchanged.
    expect(resolveFullAssets(undefined, true)).toBe(true);
  });

  it("prod nginx (source + Helm copy) serves /content from /srv and has NO active overlay route of its own", () => {
    for (const conf of ["nginx/nginx.conf", "deploy/helm/ggd/files/nginx.conf"]) {
      const body = read(conf);
      const active = stripHashComments(body);
      // The only way the overlay is ever served is through a directory that a
      // family deploy explicitly mounts over /etc/nginx/ggd-tier/. The base
      // config itself contains no blizzard-serving directive — only a generic
      // `include /etc/nginx/ggd-tier/*.conf` glob that matches nothing unless
      // that mount is present.
      expect(active, conf).not.toMatch(/blizzard/i);
      expect(active, conf).not.toContain(OVERLAY_DIR);
      // /content/ is still served from the repo content/ dir — nothing else.
      expect(body, conf).toContain("location /content/ {");
      expect(body, conf).toContain("root /srv;");
    }
  });

  it("the default docker compose edge mounts neither the tier switch nor the bytes", () => {
    const base = read("docker/compose.yaml");
    // The base stack is the gated one: content only, no ggd-tier, no overlay.
    expect(base).not.toMatch(/ggd-tier/);
    expect(base).not.toContain(OVERLAY_DIR);
    expect(base).not.toMatch(/VITE_GGD_FULL_ASSETS/);
  });

  it("the Helm chart syncs only the two prod-relevant nginx files (no overlay conf)", () => {
    // The family tier fragments (nginx/tier/family/*) are never copied into the
    // chart's files/ — they are a compose-deploy mount, not a chart asset.
    expect(existsSync(join(REPO, "deploy/helm/ggd/files/blizzard-overlay.family.conf"))).toBe(false);
    const filesDir = readdirSync(join(REPO, "deploy/helm/ggd/files"));
    expect(filesDir.some((f) => /blizzard/i.test(f))).toBe(false);
  });
});

// ===========================================================================
// OPT-IN — turning it on is one explicit, visible, four-part act.
// ===========================================================================

describe("overlay gate: OPT-IN is explicit and turns everything on together", () => {
  it("docker/compose.family.yaml is a SEPARATE overlay file (must be named on the CLI)", () => {
    // Not a profile in the base file, not a default: a distinct file the
    // operator has to pass with `-f`. Its absence from the base stack is what
    // makes "off" the default.
    expect(existsSync(join(REPO, "docker/compose.family.yaml"))).toBe(true);
  });

  it("the family overlay flips all four switches — declared tier, build flag, nginx mount, byte mount", () => {
    const fam = read("docker/compose.family.yaml");
    // 1. declared tier
    expect(fam).toMatch(/GGD_DEPLOY_TIER:\s*"?family"?/);
    // 2. the client build flag — THE one that gets forgotten (fullAssets.ts)
    expect(fam).toMatch(/VITE_GGD_FULL_ASSETS:\s*"?1"?/);
    // 3. the nginx tier switch, mounted over /etc/nginx/ggd-tier
    expect(fam).toMatch(/nginx\/tier\/family:\/etc\/nginx\/ggd-tier/);
    // 4. the 84 MB, mounted read-only into the edge (the compose context is
    // docker/, so the path is written relative to it or via GGD_OVERLAY_SRC).
    expect(fam).toMatch(/blizzard-overlay[^\n]*:\/srv\/blizzard-overlay/);
  });

  it("the family tier fragments actually serve the URL prefix behind the copyright gate", () => {
    const geo = read("nginx/tier/family/00-full-assets.geo.conf");
    // The catch-all that reclassifies every peer into the served tier.
    expect(stripHashComments(geo)).toMatch(/0\.0\.0\.0\/0\s+lan/);
    const srv = read("nginx/tier/family/10-blizzard-overlay.server.conf");
    expect(srv).toContain(`location ${OVERLAY_URL_PREFIX}/`);
    expect(srv).toContain("alias /srv/blizzard-overlay/");
    // Even here the per-peer gate is kept, so mounting the location without the
    // geo switch still fails safe.
    expect(srv).toMatch(/\$ggd_deny_copyright/);
  });

  it("the overlay is served with the ?h= immutable cache policy, not no-store", () => {
    // The cheap win: a family member who plays twice must not re-download 84 MB.
    // These URLs already carry ?h=<contentVersion> (AssetManager / AudioSystem),
    // and $content_cache turns that into a one-year immutable cache.
    const srv = read("nginx/tier/family/10-blizzard-overlay.server.conf");
    expect(srv).toMatch(/add_header\s+Cache-Control\s+\$content_cache/);
    expect(srv).not.toMatch(/Cache-Control\s+"no-store"/);
  });
});

// ===========================================================================
// FAILS LOUD — a declared-but-broken opt-in refuses to boot (see the
// behavioural proof in blizzardOverlayBoot.test.ts).
// ===========================================================================

describe("overlay gate: a half-configured opt-in fails at boot, not silently", () => {
  it("the edge image wires the boot assertion into the nginx entrypoint", () => {
    const dockerfile = read("docker/edge.Dockerfile");
    expect(dockerfile).toMatch(/COPY\s+tools\/deploy\/ggd-assets\.sh/);
    expect(dockerfile).toMatch(/\/docker-entrypoint\.d\/20-ggd-assert-full-assets\.sh/);
    // The entrypoint runs the assert subcommand.
    const entry = read("docker/edge-entrypoint.d/20-ggd-assert-full-assets.sh");
    expect(entry).toMatch(/ggd-assets\.sh\s+assert/);
  });

  it("the family edge does NOT auto-restart, so a boot failure stays visible", () => {
    // A restart policy would turn the one loud failure into a crash-loop nobody
    // reads — re-introducing the silent degradation this whole task removes.
    expect(read("docker/compose.family.yaml")).toMatch(/restart:\s*"?no"?/);
  });

  it("the assertion is a no-op unless the full-asset switch is present (gated deploy untouched)", () => {
    const assets = read("tools/deploy/ggd-assets.sh");
    // The gate on the gate: assert only runs when 00-full-assets.geo.conf is
    // mounted. Everything else is byte-for-byte unaffected.
    expect(assets).toContain("00-full-assets.geo.conf");
  });
});

// ===========================================================================
// The dev path is unchanged — local development still serves the overlay the
// same way it always did.
// ===========================================================================

describe("overlay gate: the dev mappings are unchanged", () => {
  it("the vite middleware maps the URL prefix onto data/blizzard-overlay for dev/preview", () => {
    const conf = read("apps/client/vite.config.ts");
    expect(conf).toContain(OVERLAY_DIR);
    expect(conf).toContain(OVERLAY_URL_PREFIX);
    expect(conf).toMatch(/plugins:\s*\[[^\]]*serveBlizzardOverlay\(\)/);
    // dev/preview servers only — never a build-time asset copy. Comments are
    // stripped first so documenting the property cannot fail the assertion.
    expect(stripJsComments(conf)).not.toMatch(/closeBundle|generateBundle|writeBundle/);
  });

  it("the dev nginx include serves the overlay from a bind mount, not the image", () => {
    const conf = read("nginx/dev/blizzard-overlay.conf");
    expect(conf).toContain(`location ${OVERLAY_URL_PREFIX}/`);
    expect(conf).toContain("alias /srv/blizzard-overlay/");
    expect(conf).toMatch(/DEV-ONLY/);
  });
});
