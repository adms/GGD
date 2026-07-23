/**
 * COPYRIGHT GATE — executable proof that the extracted Blizzard assets cannot
 * reach a deployed build. The rules asserted here are the ones
 * content/assets/blizzard-local/README.md promises:
 *
 *   1. the deployable content/ tree carries NO Blizzard binaries (README only);
 *   2. the extracted assets live in data/blizzard-overlay/, which .gitignore
 *      excludes wholesale (`/data/**`) → never committed;
 *   3. no Dockerfile COPYs data/ → never baked into an image;
 *   4. prod nginx (and its Helm copy) has no route to the overlay — it serves
 *      /content/ from /srv/content, which is the repo content/ dir;
 *   5. the ONLY mappings are dev-only: the vite middleware and the optional
 *      nginx/dev include, and the edge image never copies nginx/dev/.
 *
 * These are filesystem facts, so the test is a plain node read of the repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/**
 * Drop `//` line comments and block comments so a source-text assertion reads
 * CODE and not prose. Deliberately crude — it is only ever pointed at this
 * repo's own config files, and over-stripping a string literal that happens to
 * contain "//" would make an assertion here stricter, never weaker.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Physical store (git-ignored, outside content/). */
const OVERLAY_DIR = "data/blizzard-overlay";
/** URL mount the client fetches (dev-only backing). */
const OVERLAY_URL_PREFIX = "/content/assets/blizzard-local";

describe("copyright gate: content/ ships no Blizzard binaries", () => {
  it("content/assets/blizzard-local contains only the README", () => {
    const entries = readdirSync(join(REPO, "content/assets/blizzard-local"));
    expect(entries).toEqual(["README.md"]);
  });

  it("the README states LOCAL DEV ONLY and points at the real store", () => {
    const readme = read("content/assets/blizzard-local/README.md");
    expect(readme).toMatch(/LOCAL DEV ONLY/i);
    expect(readme).toMatch(/Blizzard/);
    expect(readme).toContain(OVERLAY_DIR);
    expect(readme).toMatch(/user-reskin/);
  });
});

describe("copyright gate: the overlay store is git-ignored", () => {
  it(".gitignore excludes /data/** (the overlay's parent)", () => {
    const ignore = read(".gitignore");
    expect(ignore).toContain("/data/**");
  });
});

describe("copyright gate: no image or chart can pick the overlay up", () => {
  it("no Dockerfile COPYs data/", () => {
    for (const f of readdirSync(join(REPO, "docker")).filter((n) => n.endsWith(".Dockerfile"))) {
      const body = read(`docker/${f}`);
      for (const line of body.split("\n")) {
        const copy = line.trim();
        if (!/^COPY\b/i.test(copy)) continue;
        expect(copy, `${f}: ${copy}`).not.toMatch(/(^|\s)\.?\/?data\//);
        expect(copy, `${f}: ${copy}`).not.toMatch(/blizzard/i);
      }
    }
  });

  it("the edge image never copies the dev-only nginx routes", () => {
    const dockerfile = read("docker/edge.Dockerfile");
    expect(dockerfile).not.toMatch(/^COPY\s+nginx\/dev/im);
  });

  it("prod nginx has no overlay route (both the source and the Helm copy)", () => {
    for (const conf of ["nginx/nginx.conf", "deploy/helm/ggd/files/nginx.conf"]) {
      const body = read(conf);
      // Ignore COMMENT lines: task #127's env-tier gate added an explanatory
      // comment mentioning "blizzard-local" (a deny/caveat about keeping the
      // restricted assets out of the image — NOT a serving route). The guard is
      // that no ACTIVE directive routes/serves the overlay.
      const active = body.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(active, conf).not.toMatch(/blizzard/i);
      expect(body, conf).not.toContain(OVERLAY_DIR);
      // /content/ is served from the repo content/ dir — nothing else.
      expect(body, conf).toContain("location /content/ {");
      expect(body, conf).toContain("root /srv;");
    }
  });

  it("the dev nginx include is NOT synced into the Helm chart", () => {
    expect(existsSync(join(REPO, "nginx/dev/blizzard-overlay.conf"))).toBe(true);
    expect(existsSync(join(REPO, "deploy/helm/ggd/files/blizzard-overlay.dev.conf"))).toBe(false);
    // …and the sync target only ever copies the two prod-relevant files.
    const makefile = read("Makefile");
    expect(makefile).not.toMatch(/blizzard/i);
  });
});

describe("copyright gate: the only mappings are dev-only", () => {
  it("the vite middleware maps the URL prefix onto data/blizzard-overlay", () => {
    const conf = read("apps/client/vite.config.ts");
    expect(conf).toContain(OVERLAY_DIR);
    expect(conf).toContain(OVERLAY_URL_PREFIX);
    // registered in the plugin list, so `pnpm dev`/`preview` actually serve it
    expect(conf).toMatch(/plugins:\s*\[[^\]]*serveBlizzardOverlay\(\)/);
    // dev/preview servers only — never a build-time asset copy.
    //
    // COMMENTS ARE STRIPPED BEFORE THIS CHECK, and that is not a loosening —
    // it is what makes the check mean what it says. Task #102 added a comment
    // to vite.config.ts explaining that its content-api guard has no
    // "configureBuild/closeBundle hook", and this assertion went red on the
    // WORD "closeBundle" inside prose that was documenting the very property
    // being asserted. A safety test that fails when someone writes down why the
    // code is safe teaches people to weaken the test; the next person to hit it
    // might have deleted the `not` instead. Strip comments, then assert on
    // actual code — the guarantee is unchanged and now it cannot cry wolf.
    expect(stripComments(conf)).not.toMatch(/closeBundle|generateBundle|writeBundle/);
  });

  it("the dev nginx include serves the overlay from a bind mount, not the image", () => {
    const conf = read("nginx/dev/blizzard-overlay.conf");
    expect(conf).toContain(`location ${OVERLAY_URL_PREFIX}/`);
    expect(conf).toContain("alias /srv/blizzard-overlay/");
    expect(conf).toMatch(/DEV-ONLY/);
  });
});
