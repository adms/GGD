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
 * REWRITTEN AGAIN, 2026-08-19 (GH#402), by explicit owner decision:
 *
 *   > 「請幫我**註記取消這個規則**，現在的線上已經是**雙重審查只給認識的親友玩了**，
 *   >  請**直接上架但註記來源就好 不要ignore**」
 *
 * That retires clause 3's "no Blizzard bytes may live in content/" FOR ONE
 * NAMED SET, widened the same day by a second ruling ("既有 60 個 wc3.* 沒一起搬
 * => move"): the model-soundset clips AND task #78's ability-declared ones now
 * share content/assets/audio/wc3/, committed and served from the ordinary prod
 * content route. What stayed behind is the 511 CHARACTER VOICE LINES — neither
 * ruling mentioned them, and "he opened the SFX" must not be read as "he opened
 * data/blizzard-overlay/".
 * It is the same posture as #239 (the retired per-peer copyright gate): the
 * deploy is a double-screened family site, and the owner is the map's author.
 *
 * ⚠️ THE GATE WAS NOT DELETED — IT WAS TURNED AROUND. Deleting it would swap a
 * gate for nothing, and the owner's permission came WITH A CONDITION attached
 * ("註記來源"). So the question this file asks changed from
 *
 *     "does content/ contain Blizzard bytes?"        (now: yes, deliberately)
 * to  "does every Blizzard byte in content/ carry its provenance?"
 *
 * A byte with no ledger row is the violation now, and it fails BOTH ways: an
 * unlisted file is red, and a ledger row with no file is red. What did NOT
 * change: data/blizzard-overlay/ (the other 437 voice clips + 60 ability SFX +
 * 40 models) is still git-ignored, still never baked into an image, and this
 * permission does not reach it.
 *
 * So the rule this file pins is no longer "never". It is:
 *
 *   1. DEFAULT OFF. Nothing about a normal build, image, chart or compose stack
 *      requests, serves, bakes or mounts the overlay. A deploy that does not
 *      opt in has no blizzard-local route at all.
 *
 *      (Before #239 this clause also covered a per-peer copyright gate that
 *      403'd the restricted mounts for a `public` $remote_addr. That gate was
 *      RETIRED on 2026-07-26 by explicit owner decision, taken knowing that
 *      /content/assets/** authenticates nobody — see
 *      docs/copyright-content-gate.md. What is asserted below is therefore
 *      about MOUNTS and BYTES, never about who may read them.)
 *   2. OPT-IN IS ONE EXPLICIT, VISIBLE ACT. Turning it on is a separate compose
 *      overlay file that must be named on the command line, and it flips FOUR
 *      coordinated switches at once (declared tier, client build flag, nginx
 *      tier mount, byte mount). Forgetting any one fails safe.
 *   3. THE OVERLAY STORE'S BYTES STILL NEVER TRAVEL WITH GIT.
 *      data/blizzard-overlay/ is git-ignored and no image bakes it in; it
 *      arrives only as an explicit runtime mount. The GH#402 clips are a
 *      SEPARATE, NAMED set that lives in content/ and must carry provenance.
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
import { createHash } from "node:crypto";
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

  it("the README names the owner, points at the real store, and states the redistribution rule", () => {
    // This used to assert the README said "LOCAL DEV ONLY". It no longer does,
    // and it MUST not: since #177 the overlay is mounted on the family host,
    // and since #239 no per-peer gate stands in front of it. A README that
    // still claimed "never deployed" would be the lie a future audit "fixes"
    // by re-adding a gate the owner deliberately removed.
    //
    // What is still true — and is the whole point of this file living in
    // content/ as a signpost rather than as bytes — is asserted instead.
    const readme = read("content/assets/blizzard-local/README.md");
    expect(readme).toMatch(/Blizzard/);
    expect(readme).toContain(OVERLAY_DIR);
    expect(readme, "the README must state the bytes are not redistributable").toMatch(
      /not redistributable/i,
    );
    expect(readme, "the README must say the bytes never enter git").toMatch(/git-ignored/i);
  });

  it("the overlay store is git-ignored wholesale (never committed)", () => {
    expect(read(".gitignore")).toContain("/data/**");
  });
});

// ===========================================================================
// GH#402 — THE CONDITION ON THE PERMISSION.
//
// The owner allowed these 73 clips into content/ "但註記來源就好". This is that
// condition as a gate: every committed Blizzard byte carries its origin, and
// the ledger describes exactly what is on disk — no ghosts in either direction.
//
// Derived, never a hand-kept list: the file set comes from readdirSync and the
// rows from the generated ledger, so adding a clip without regenerating is red.
// ===========================================================================

describe("overlay gate: every committed Blizzard byte carries its provenance", () => {
  const CLIP_DIR = "content/assets/audio/wc3";
  const ledger = JSON.parse(read(`${CLIP_DIR}/PROVENANCE.json`)) as {
    clips: Record<string, { wc3Path: string; archive: string; sha256: string; file: string }>;
    gaps: unknown[];
  };
  const onDisk = readdirSync(join(REPO, CLIP_DIR))
    .filter((f) => f.endsWith(".wav"))
    .sort();

  it("the clip files and the ledger rows are the SAME set (no undocumented byte, no ghost row)", () => {
    const fromLedger = Object.values(ledger.clips)
      .map((c) => c.file.replace(/^.*\//, ""))
      .sort();
    expect(onDisk).toEqual(fromLedger);
    expect(onDisk.length).toBeGreaterThan(0);
  });

  it("every row names its source archive + original path and PINS the bytes by sha256", () => {
    for (const [key, c] of Object.entries(ledger.clips)) {
      expect(c.archive, `${key}: no source archive`).toMatch(/\S/);
      expect(c.wc3Path, `${key}: no original MPQ path`).toMatch(/\\/);
      // The hash is the part that cannot be faked by editing prose: recompute it.
      const bytes = readFileSync(join(REPO, "content", c.file));
      expect(createHash("sha256").update(bytes).digest("hex"), `${key}: sha256 drift`).toBe(
        c.sha256,
      );
    }
  });

  it("the permission does NOT reach the overlay store — it is still ignored and unbaked", () => {
    // The owner named TWO sets across two rulings (the model soundsets, then
    // "既有 60 個 wc3.* 沒一起搬 => move"). Both are technical SFX and both now
    // live in CLIP_DIR. The 511 CHARACTER VOICE LINES in data/blizzard-overlay/
    // sounds/ were in NEITHER ruling (#10 / #81 territory) and keep the old
    // posture, as do the 40 models.
    expect(read(".gitignore")).toContain("/data/**");
    expect(existsSync(join(REPO, CLIP_DIR, "PROVENANCE.md"))).toBe(true);
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

  it("the family tier fragments actually serve the URL prefix", () => {
    const geo = stripHashComments(read("nginx/tier/family/00-full-assets.geo.conf"));
    // The two halves of /0 that classify every peer into the served tier. They
    // are deliberately NOT written as `0.0.0.0/0`: that is the same network as
    // geo's own `default`, which nginx warns about and resolves by position,
    // making the outcome depend on where the include lands (#239).
    expect(geo).toMatch(/0\.0\.0\.0\/1\s+lan/);
    expect(geo).toMatch(/128\.0\.0\.0\/1\s+lan/);
    expect(geo).toMatch(/::\/1\s+lan/);
    expect(geo).toMatch(/8000::\/1\s+lan/);
    expect(geo, "a /0 row duplicates geo's own default — use the two /1 halves").not.toMatch(
      /0\.0\.0\.0\/0|(^|\s)::\/0/m,
    );
    const srv = read("nginx/tier/family/10-blizzard-overlay.server.conf");
    expect(srv).toContain(`location ${OVERLAY_URL_PREFIX}/`);
    expect(srv).toContain("alias /srv/blizzard-overlay/");
  });

  it("no nginx file references the retired $ggd_deny_copyright variable", () => {
    // THE DANGLING-VARIABLE TRAP. The copyright gate was retired on 2026-07-26
    // by explicit owner decision (#239): the `map $ggd_env_tier
    // $ggd_deny_copyright` is gone from nginx.conf, so ANY surviving reference
    // in a mounted fragment makes nginx refuse to start with `unknown
    // "ggd_deny_copyright" variable`. infracheck's `nginx -t` runs against
    // nginx.conf ALONE and cannot see the fragments, so this text assertion is
    // the only thing standing between a stray `if` and a dead family edge
    // (compose.family.yaml sets restart: "no" — the site would stay down).
    for (const conf of [
      "nginx/nginx.conf",
      "deploy/helm/ggd/files/nginx.conf",
      "nginx/tier/family/00-full-assets.geo.conf",
      "nginx/tier/family/10-blizzard-overlay.server.conf",
      "nginx/dev/blizzard-overlay.conf",
      "nginx/dev/content-api.conf",
    ]) {
      expect(stripHashComments(read(conf)), conf).not.toMatch(/\$ggd_deny_copyright/);
    }
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
    // dev/preview servers only — never a build-time asset copy.
    // ⭐ 2026-08-22：斷言收窄到 **`serveBlizzardOverlay` 這個 plugin 自己**，
    // ⛔ 不是整份 vite.config。⚠️ 原本掃全檔 ⇒ 任何**無關**的 build hook 都會讓它紅，
    // 而訊息說的是「overlay 被 build 期複製了」——⛔ 一句用錯誤訊息說謊的話。
    // #83 的 `ggd-strip-debug-pages`（安全修正，必須是 build hook）就是這樣被誤判的。
    const plugin = /name:\s*"ggd-serve-blizzard-overlay"[\s\S]*?\n\s{2}\};/.exec(stripJsComments(conf));
    expect(plugin, "找不到 ggd-serve-blizzard-overlay —— 被改名或刪掉了").toBeTruthy();
    expect(plugin![0]).not.toMatch(/closeBundle|generateBundle|writeBundle/);
    expect(plugin![0]).toMatch(/apply:\s*"serve"|configureServer/);
  });

  it("the dev nginx include serves the overlay from a bind mount, not the image", () => {
    const conf = read("nginx/dev/blizzard-overlay.conf");
    expect(conf).toContain(`location ${OVERLAY_URL_PREFIX}/`);
    expect(conf).toContain("alias /srv/blizzard-overlay/");
    expect(conf).toMatch(/DEV-ONLY/);
  });
});
