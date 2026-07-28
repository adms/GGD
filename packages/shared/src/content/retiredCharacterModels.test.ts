/**
 * PERMANENT REGRESSION GUARD — the four retired KayKit Adventurers characters
 * may not come back (task #240, enforcing owner directive #226).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS. DO NOT DELETE IT TO MAKE A BUILD GREEN.
 * ---------------------------------------------------------------------------
 * On 2026-07-26 the owner said, of four CC0 character models, 「我不想再看到這
 * 些模組了」. #226 deleted them and replaced every champion that wore one with a
 * generated box-man from `tools/voxel-gen`. That deletion was verified live
 * (the four URLs 404) — but NOTHING stopped them being re-added. This test is
 * that stop. Two independent reasons it must hold:
 *
 *   1. OWNER DIRECTIVE. It is not a performance opinion that can be re-litigated
 *      by a future contributor who finds a rigged humanoid convenient. The
 *      owner looked at them and said no.
 *   2. POLY / RIG BUDGET. Each was 5,683–6,952 triangles on a shared 41-bone
 *      rig with a 1024×1024 baked albedo, and 42 of 114 champions wore one — so
 *      a legal 12-seat draft cost 12 × 6,952 tris, 12 × 15 draw calls and
 *      12 × 123 animation channels/frame (2.19 ms of CPU on an M5 Max before a
 *      single pixel was drawn). The replacements are 168 tris, 1 draw call and
 *      8 channels each. Re-adding one silently re-breaks
 *      `tools/model-budget/limits.ts`'s champion gate on three axes at once.
 *
 * ---------------------------------------------------------------------------
 * SCOPE — DELIBERATELY NARROW. READ BEFORE WIDENING.
 * ---------------------------------------------------------------------------
 * "KayKit" is NOT the banned thing. Kay Lousberg authored FOUR MORE packs that
 * this project still ships, credits and depends on, and sweeping them up would
 * be a far worse bug than the one this guard prevents:
 *
 *   • KayKit Dungeon Remastered  → `assets/models/props/*.glb` (pillar, torch,
 *     barrel, chest, crates, floor tiles, the four banner shields)
 *   • KayKit Character Pack: Skeletons → `assets/models/props/guardian_skeleton.glb`
 *     — a CHARACTER pack, still shipped, and it is BOTH the `arena.skeleton`
 *     guardian AND 聖杯黑泥醬-喪標麥可 (`champ.godie-zombiex`, task #217)
 *   • KayKit Medieval Hexagon Pack → `assets/models/hex/*.glb` (arena.dota decor)
 *   • KayKit Halloween Bits → `guardian_treant_trunk.glb`
 *
 * What is banned is exactly the four **Character Pack: Adventurers** meshes and
 * their two LOD tiers each — twelve files — plus that pack's name appearing in
 * the SHIPPED credit ledger, which would claim provenance for bytes we do not
 * distribute.
 *
 * Prose that merely mentions the retired models as HISTORY is fine and often
 * valuable (CREDITS.md keeps a "RETIRED" section on purpose: a credit for an
 * asset we do not ship is as dishonest as a missing one). The guard therefore
 * matches ASSET PATHS, not the word "KayKit", and skips the trees that exist to
 * record history — each listed with its reason in HISTORY_ONLY below.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../..");
const CONTENT = join(REPO_ROOT, "content");

/** The four retired characters. Basenames, not ids — the files ARE the thing. */
const RETIRED_STEMS = ["mage", "knight", "barbarian", "rogue"] as const;
/** #115 generated two decimation tiers per base model; all twelve are retired. */
const RETIRED_BASENAMES: readonly string[] = RETIRED_STEMS.flatMap((s) => [
  `${s}.glb`,
  `${s}-mid.glb`,
  `${s}-small.glb`,
]);

/**
 * A reference is only a reference if it points into the champions directory.
 * Bare "mage.glb" would false-positive on any future unrelated file, and
 * "knight" alone would hit `blocky-knight.glb` — the REPLACEMENT — which is
 * exactly the model we want people to use.
 */
const PATH_RE = new RegExp(
  `(?<![\\w-])models/champions/(${RETIRED_STEMS.join("|")})(-mid|-small)?\\.glb`,
  "g",
);

/** The upstream pack, as it would appear in a credit line or a download URL. */
const PACK_RE = /Character[- ]Pack[-: ]\s*Adventure(rs|s)?(-1\.0)?/gi;

const WHY =
  "\n\n  ─────────────────────────────────────────────────────────────────\n" +
  "  The four KayKit *Character Pack: Adventurers* models (mage / knight /\n" +
  "  barbarian / rogue, plus their -mid / -small LOD tiers) were removed by\n" +
  "  OWNER DIRECTIVE #226 on 2026-07-26 — 「我不想再看到這些模組了」 — and\n" +
  "  replaced by the generated box-men in tools/voxel-gen. They are also far\n" +
  "  over the champion poly/rig budget: 6,952 tris on a 41-bone rig with a\n" +
  "  1024² albedo, worn by 42 of 114 champions, versus 168 tris / 15 bones /\n" +
  "  1 draw call for the replacements.\n" +
  "  If you are re-adding one: DON'T. Use content/assets/models/champions/\n" +
  "  blocky-*.glb, or generate a new look with `pnpm voxel:gen`.\n" +
  "  If the owner has reversed the directive, delete this test IN THE SAME\n" +
  "  COMMIT as the re-add, and say so in the message — do not silence it.\n" +
  "  Full record: content/assets/CREDITS.md, section 'RETIRED'.\n" +
  "  ─────────────────────────────────────────────────────────────────";

/**
 * Trees the scan skips, and why. Every entry is a place whose JOB is to record
 * what used to be true; scrubbing them would destroy provenance and audit
 * history, which is the opposite of what #240 asks for.
 */
const HISTORY_ONLY: readonly { prefix: string; why: string }[] = [
  { prefix: "docs", why: "design records + frozen audit datasets (#61/#68/#150) describing the pre-#226 tree" },
  { prefix: `content${sep}assets${sep}CREDITS.md`, why: "the authoritative provenance ledger; its RETIRED section must name them" },
  { prefix: `tools${sep}w3x-import${sep}out`, why: "frozen importer output dumps, never re-read by the game" },
  { prefix: `packages${sep}shared${sep}src${sep}content${sep}retiredCharacterModels.test.ts`, why: "this guard" },
  { prefix: "node_modules", why: "dependencies" },
  { prefix: ".git", why: "history is history" },
];

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".venv", "__pycache__"]);
/** Text formats that could carry an asset reference. Binaries are handled separately. */
const TEXT_EXT = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".json", ".md", ".html",
  ".css", ".py", ".sh", ".yaml", ".yml", ".conf", ".go", ".toml", ".txt",
];

/** The trees a shipped build is assembled from — source, content and tooling. */
const SCANNED_TREES = ["apps", "packages", "tools", "content", "nginx", "docker", "deploy"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function isHistoryOnly(rel: string): boolean {
  return HISTORY_ONLY.some((h) => rel === h.prefix || rel.startsWith(h.prefix + sep) || rel.startsWith(h.prefix));
}

/** Every scannable text file in the shipped trees, repo-relative. */
function scannableFiles(): string[] {
  const files: string[] = [];
  for (const tree of SCANNED_TREES) {
    const root = join(REPO_ROOT, tree);
    if (!existsSync(root)) continue;
    for (const abs of walk(root)) {
      const rel = relative(REPO_ROOT, abs);
      if (isHistoryOnly(rel)) continue;
      if (!TEXT_EXT.some((e) => abs.endsWith(e))) continue;
      files.push(rel);
    }
  }
  return files.sort();
}

function hitsIn(rel: string, re: RegExp): string[] {
  const text = readFileSync(join(REPO_ROOT, rel), "utf8");
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(m[0]);
  return [...found].map((s) => `${rel} → ${s}`);
}

describe("retired KayKit Adventurers characters (#226 owner directive / #240 guard)", () => {
  it("none of the twelve retired .glb files exists on disk", () => {
    cover("model-retired-kaykit-guard");
    const modelsRoot = join(CONTENT, "assets/models");
    const back = walk(modelsRoot)
      .filter((p) => RETIRED_BASENAMES.includes(p.slice(p.lastIndexOf(sep) + 1)))
      .map((p) => relative(REPO_ROOT, p))
      .sort();
    expect(back, `a retired character model is back on disk.${WHY}`).toEqual([]);
  });

  it("the five replacements ARE present — the guard must fail loudly if the swap is undone", () => {
    cover("model-retired-kaykit-guard");
    const champs = join(CONTENT, "assets/models/champions");
    const present = readdirSync(champs)
      .filter((f) => f.endsWith(".glb"))
      .sort();
    expect(present).toEqual(
      expect.arrayContaining([
        "blocky-barbarian.glb",
        "blocky-knight.glb",
        "blocky-mage.glb",
        "blocky-rogue.glb",
        "blocky-undead.glb",
      ]),
    );
    // …and NOTHING ELSE may appear here except the generator's own output.
    // 特徵生成 (docs/_體素特徵生成規格.md) adds `voxel-<championId>.glb`, written
    // by `pnpm voxel:build` from the barcode JSON. Both prefixes are emitted by
    // `tools/voxel-gen`, so this stays a real guard against a hand-dropped
    // character model sneaking back in — it just no longer freezes the count.
    const unexpected = present.filter(
      (f) => !f.startsWith("blocky-") && !f.startsWith("voxel-"),
    );
    expect(unexpected, `an un-generated character model is in champions/.${WHY}`).toEqual([]);
  });

  it("no shipped source, content doc, manifest, LOD table or built bundle references one", () => {
    cover("model-retired-kaykit-guard");
    const hits = scannableFiles().flatMap((f) => hitsIn(f, new RegExp(PATH_RE.source, "g")));
    expect(hits, `a retired character model path is referenced again.${WHY}`).toEqual([]);
  });

  it("the built content bundle + manifest + LOD manifest are clean (the artifacts the client actually fetches)", () => {
    cover("model-retired-kaykit-guard");
    // Checked explicitly as well as via the tree walk, because these three are
    // GENERATED: a stale one can carry a reference no hand-edited file has.
    const artifacts = ["content/bundle.json", "content/manifest.json", "content/assets/models/_lod.json"];
    const hits = artifacts
      .filter((f) => existsSync(join(REPO_ROOT, f)))
      .flatMap((f) => hitsIn(f, new RegExp(PATH_RE.source, "g")));
    expect(hits, `a build artifact still ships a retired model path.${WHY}`).toEqual([]);
  });

  it("the SHIPPED credit ledger does not name the Adventurers pack (we do not distribute it)", () => {
    cover("model-retired-kaykit-guard");
    // CREDITS.md is exempt by design — it keeps the RETIRED record. So are
    // `*.test.ts`: a test that forbids a string has to be able to spell it, and
    // vite never bundles test files into a browser payload. What must NOT name
    // the pack is anything a player actually downloads.
    const shipped = scannableFiles().filter(
      (f) =>
        (f.startsWith(`apps${sep}`) || f.startsWith(`packages${sep}`)) &&
        !/\.test\.[cm]?[jt]sx?$/.test(f),
    );
    const hits = shipped.flatMap((f) => hitsIn(f, new RegExp(PACK_RE.source, "gi")));
    expect(hits, `the retired pack is credited in shipped code.${WHY}`).toEqual([]);
  });

  it("does NOT ban the four KayKit packs this project still ships", () => {
    cover("model-retired-kaykit-guard");
    // A guard that took out guardian_skeleton.glb (KayKit Character Pack:
    // Skeletons — the arena.skeleton guardian AND 喪標麥可) or the hex terrain
    // would be a much worse bug than the one it prevents. Pin the distinction.
    const stillShipped = [
      "content/assets/models/props/guardian_skeleton.glb",
      "content/assets/models/props/pillar.glb",
      "content/assets/models/hex/hex_grass.glb",
      "content/assets/models/guardians/guardian_treant_trunk.glb",
    ].filter((f) => existsSync(join(REPO_ROOT, f)));
    expect(stillShipped.length).toBeGreaterThanOrEqual(3);
    for (const f of stillShipped) {
      expect(PATH_RE.test(f), `${f} must not match the retired-model pattern`).toBe(false);
      PATH_RE.lastIndex = 0;
    }
    // ...and the courtesy credit for those packs is still owed and still there.
    const credits = readFileSync(join(CONTENT, "assets/CREDITS.md"), "utf8");
    expect(credits).toContain("Dungeon Remastered");
    expect(credits).toContain("Character Pack: Skeletons");
    expect(credits).toContain("Medieval Hexagon Pack");
  });

  it("the pattern really would catch a re-add (self-test, so a broken regex cannot pass silently)", () => {
    cover("model-retired-kaykit-guard");
    const wouldFail = [
      'glbPath: "assets/models/champions/knight.glb"',
      "content/assets/models/champions/mage-small.glb",
      "/content/assets/models/champions/barbarian-mid.glb",
      '"assets/models/champions/rogue.glb"',
      "KayKit-Character-Pack-Adventures-1.0",
      "Character Pack: Adventurers",
    ];
    for (const s of wouldFail) {
      const matched = new RegExp(PATH_RE.source, "g").test(s) || new RegExp(PACK_RE.source, "gi").test(s);
      expect(matched, `guard would MISS "${s}"`).toBe(true);
    }
    const mustNotFire = [
      'glbPath: "assets/models/champions/blocky-knight.glb"',
      "assets/models/props/guardian_skeleton.glb",
      "KayKit — Dungeon Remastered (1.0)",
      "KayKit — Character Pack: Skeletons (1.0)",
      "KayKit — Medieval Hexagon Pack (1.0)",
    ];
    for (const s of mustNotFire) {
      const matched = new RegExp(PATH_RE.source, "g").test(s) || new RegExp(PACK_RE.source, "gi").test(s);
      expect(matched, `guard would WRONGLY fire on "${s}"`).toBe(false);
    }
  });
});
