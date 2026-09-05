/**
 * content/vfx/godie-* must stay REGENERATABLE — the guard for GH#110.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * What went wrong, and why nothing caught it
 *
 * 2026-07-24 (48f487c3) fixed two extraction bugs: `emitter.radius` was
 * `width*scale` (2x too large, and PRE2 `Length` thrown away) and `burstCount`
 * carried a hardcoded 0.3 haircut. The FIX landed. The DATA never did — 226 of
 * the 228 shipped emitter docs kept the old numbers for nine days, and the
 * whole suite stayed green the entire time, because every test that touches
 * these docs reads whatever is on disk (failure form 5: the thing under test
 * was not the thing that ships).
 *
 * `test/particles_checks.py` DID detect it. It printed a REGENERATION PENDING
 * banner on every run — and it is a standalone script wired into nothing, so
 * the banner was printed to nobody. An alarm that only rings where no one is
 * standing is not a guard (CLAUDE.md). This file is the wire.
 *
 * ⚠️ It SHELLS the checker instead of re-implementing it. That is deliberate:
 * the checker re-derives the radius reading from the map's own .mdx bytes, and
 * a TS re-implementation here would be a second reading of the same binaries
 * that could drift from the extractor — which is precisely the class of bug
 * being guarded. Running the real thing is also what makes this immune to
 * failure form 6 (scanning source text instead of running behaviour): deleting
 * the formula from extract_particles.py makes the shelled process exit non-zero.
 *
 * The checker asserts, from the binaries, on every run:
 *   - the full-extent reading of PRE2 Width/Length (proof: 1hswd_01 Particle_2)
 *   - Python extractor and w3xEmitter.ts compute the SAME radius
 *   - every shipped godie-*-p*.json is on the corrected radius (was a banner,
 *     now fatal — the corpus is no longer knowingly stale)
 *   - every shipped godie-*-r*.json is reproduced exactly by a fresh
 *     extraction, #37 刀光殘影 budget included
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { findPython } from "../../testkit/findPython";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RAW = join(ROOT, "out", "GoDieEX22s", "raw");

/** The extractor also decodes PNG alpha; verify Pillow and architecture before choosing Python.
 * GH#1013: shared sentinel-checked probe in tools/testkit/findPython. */
const PY = findPython({ imports: "import struct, json; from PIL import Image" });

// No map extraction (fresh checkout) or no python -> nothing to assert against.
const runnable = PY !== null && existsSync(RAW);

describe.skipIf(!runnable)("content/vfx regeneration guard (GH#110)", () => {
  it("particles_checks.py passes: shipped docs match what the extractor produces", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync(PY![0]!, [...PY!.slice(1), join(HERE, "particles_checks.py")], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
    expect(out).not.toContain("SKIP: no godie-* docs");
    // Named assertions, so a checker that silently stopped checking is visible
    // here rather than passing on a bare exit code.
    expect(out, out).toContain("PASS radius content:");
    expect(out, out).toContain("PASS ribbon budget:");
    expect(code, out).toBe(0);
  }, 120_000);
});

/**
 * Rerunning the extractor must not eat config/ambient-vfx.json.
 *
 * That file is BOTH an extraction artifact and an admin-editable config, and
 * the extractor used to json.dump straight over it. A rerun therefore deleted
 * the whole `arenaFire` block (an admin form backed by zConfigAmbientVfxDoc)
 * plus three hand-added weapon-trail bindings the extractor cannot derive —
 * their RIBB visibility ratios are 0.03-0.24, far under the 0.5 ambient
 * threshold — which are the swing trails of three sword champions:
 * imported.mfls = 櫻綻剎那, imported.heromusashimiyamoto = 索隆,
 * imported.sesshomaru = 殺生丸 (modelKey -> name read back off
 * content/champions, not assumed from the model file name).
 *
 * The deletion is invisible at runtime: resolveArenaFire falls back to
 * DEFAULT_ARENA_FIRE, whose values equal the shipped ones, and a missing
 * ambient binding just means no trail is attached. Nothing errors. So this
 * runs the extractor for real (into a temp dir — never content/) and reads the
 * file it produced. Asserting on the shipped file instead would be failure
 * form 5: that file passing proves nothing about what a RERUN does to it.
 */
describe.skipIf(!runnable)("extractor rerun reproduces what ships", () => {
  const stage = mkdtempSync(join(tmpdir(), "ggd-vfx-stage-"));
  let staged = false;
  function restage(): void {
    if (staged) return;
    execFileSync(
      PY![0]!,
      [...PY!.slice(1), join(ROOT, "extract_particles.py"), `--out-dir=${stage}`],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
    );
    staged = true;
  }
  afterAll(() => rmSync(stage, { recursive: true, force: true }));

  /**
   * The doc-vs-extractor comparison that used to live here moved to
   * `test/shippedVfxIsCurrent.test.ts`, and moving it was a strengthening, not
   * a deletion. Two reasons:
   *
   *  1. This version staged WITHOUT `--overwrite-tuned`, so any doc the
   *     extractor classifies as "keep" was staged by copying the shipped file —
   *     i.e. exactly the docs most likely to have drifted compared EQUAL to
   *     themselves. The guard hid the thing it was looking for.
   *  2. It reported bare filenames. 226 names with no field and no values is a
   *     failure message nobody reads, and an unreadable failure is one the next
   *     person "fixes" by deleting the test.
   *
   * The replacement stages with `--overwrite-tuned` and prints
   * `doc.field: 出貨值 → 工具值`.
   */
  it("a staged rerun keeps arenaFire and the 3 hand-added ribbon bindings", () => {
    restage();
    const produced = JSON.parse(
      readFileSync(join(stage, "config", "ambient-vfx.json"), "utf8"),
    ) as {
      arenaFire?: Record<string, unknown>;
      bindings: Record<string, { vfx: string }[]>;
    };

    expect(produced.arenaFire).toBeDefined();
    expect(produced.arenaFire!.enabled).toBe(false); // owner's ruling, not a default
    expect(produced.arenaFire!.maxEmitters).toBe(16);

    for (const [key, ids] of Object.entries({
      "imported.mfls": ["godie-mfls-r0", "godie-mfls-r1"],
      "imported.heromusashimiyamoto": [
        "godie-heromusashimiyamoto-r0",
        "godie-heromusashimiyamoto-r1",
      ],
      "imported.sesshomaru": ["godie-sesshomaru-r0"],
    })) {
      expect((produced.bindings[key] ?? []).map((b) => b.vfx), key).toEqual(ids);
    }

    // …and the derived ones are still derived, not just echoed back.
    // ⚠️ GH#667 corrected the SHAPE of this assertion. It used to read
    // `.length).toBe(3)`, and that number was pinning the bug: the merge ran at
    // model-key granularity, so `godie-heroshana-r0` — a hand-added entry inside
    // a key the extractor DOES derive — was dropped on every rerun while the
    // run still printed "preserved". The invariant worth holding is "the three
    // derived ids are present AND the hand-added one survived", not a count.
    const shana = (produced.bindings["imported.heroshana"] ?? []).map((b) => b.vfx);
    expect(shana).toEqual(
      expect.arrayContaining([
        "godie-heroshana-p0",
        "godie-heroshana-p1",
        "godie-heroshana-p2",
      ]),
    );
    expect(shana, "hand-added entry inside a derived binding must survive").toContain(
      "godie-heroshana-r0",
    );
  }, 120_000);
});
