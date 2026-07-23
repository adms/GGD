/**
 * w3x-import gate suite. Shells the python pipeline against a tiny synthetic
 * fixture .w3x (crafted by make_fixture.py — no Blizzard data), then checks
 * the real imported content docs when present. Each assertion group emits its
 * TODO test_id beacon via cover() (docs/todo/w3x-import.md).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REPO = join(ROOT, "..", "..");

/** Find a python able to import mpyq+Pillow. A node running under Rosetta
 * launches universal python binaries as x86_64, which can't load arm64
 * wheels — so `arch -arm64 python3` is probed too. */
function findPython(): string[] | null {
  const candidates: string[][] = [
    ["python3"],
    ["arch", "-arm64", "python3"],
    ["arch", "-x86_64", "python3"],
    ["/opt/homebrew/bin/python3"],
    ["/usr/bin/python3"],
  ];
  for (const c of candidates) {
    try {
      execFileSync(
        c[0]!,
        [...c.slice(1), "-c", "import mpyq; from PIL import Image"],
        { stdio: "pipe" },
      );
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
const PYCMD = findPython();
const pyOk = PYCMD !== null;
const runPy = (args: string[], opts: object = {}) =>
  execFileSync(PYCMD![0]!, [...PYCMD!.slice(1), ...args], opts) as unknown as string;

const FIXTURE_IDS = [
  "w3x-extract-roundtrip",
  "w3x-explode-pkware",
  "w3x-w3u-parse",
  "w3x-r00r-parse",
  "w3x-original-table-hero",
  "w3x-trigstr-resolve",
  "w3x-mdx-header-parse",
  "w3x-gltf-writer-valid",
  "w3x-anim-timing",
  "w3x-clipmap-automap",
  "w3x-import-pipeline",
  "w3x-pool-extract",
  "w3x-name-combine",
  "w3x-usca-scale",
  "w3x-alpha-material",
  "w3x-attach-bake",
  "w3x-effect-geoset-guard",
  "w3x-rawmods-passthrough",
] as const;

describe.runIf(pyOk)("w3x importer — synthetic fixture pipeline", () => {
  let work: string;
  let passed: Set<string>;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "w3x-fixture-"));
    const fixture = join(work, "fixture.w3x");
    runPy([join(HERE, "make_fixture.py"), fixture], { stdio: "pipe" });
    const out = runPy([join(HERE, "fixture_checks.py"), fixture, work], {
      encoding: "utf-8",
    });
    passed = new Set(
      out
        .split("\n")
        .filter((l) => l.startsWith("PASS "))
        .map((l) => l.slice(5).trim()),
    );
  }, 120_000);

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  for (const id of FIXTURE_IDS) {
    it(id, () => {
      expect(passed.has(id), `fixture_checks.py did not report PASS ${id}`).toBe(true);
      cover(id);
    });
  }
});

describe("w3x importer — real imported content", () => {
  const contentDir = join(REPO, "content");
  const modelsDir = join(contentDir, "models");
  const hasImports =
    existsSync(modelsDir) &&
    readdirSync(modelsDir).some((f) => f.startsWith("imported."));

  it.runIf(hasImports)("imported champion/model/item docs parse and are wired", () => {
    const champs = readdirSync(join(contentDir, "champions")).filter((f) =>
      f.startsWith("godie-"),
    );
    expect(champs.length).toBeGreaterThan(0);
    const champ = JSON.parse(
      readFileSync(join(contentDir, "champions", champs[0]!), "utf-8"),
    );
    expect(champ.schema).toBe("champion@1");
    expect(champ.modelKey.startsWith("imported.")).toBe(true);

    const modelDoc = JSON.parse(
      readFileSync(join(modelsDir, champ.modelKey + ".json"), "utf-8"),
    );
    const glb = readFileSync(join(contentDir, modelDoc.glbPath));
    expect(glb.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    for (const key of ["idle", "run", "attack", "cast", "hurt", "death"]) {
      expect(typeof modelDoc.clipMap[key]).toBe("string");
    }

    const items = readdirSync(join(contentDir, "items")).filter((f) =>
      f.startsWith("godie-"),
    );
    expect(items.length).toBeGreaterThan(100);
    expect(existsSync(join(contentDir, "arenas", "arena.godie.json"))).toBe(true);
    cover("w3x-content-drafts");
  });

  // 一擊斬 Critical Strike carries a chance (DataA1) AND a multiplier (DataB1).
  // The importer read only DataA1, so every crit item shipped as "N% chance for
  // the default 1.75x" no matter what the source said.
  //
  // THE ORACLE MOVED. It used to be the tooltip: the item's own 「N%機率造成M倍
  // 傷害」 text was authoritative and the stats had to reproduce it. That held
  // only while nothing rescaled the stats. Task #82's AEP pass moves magnitudes
  // to a tier budget, so the imported text cannot stay true — and the decision
  // (task #108) was that the MODIFIERS are the oracle and the 效能 block is
  // regenerated from them by tools/economy/regen_descriptions.py. So this now
  // asserts the two AGREE, in whichever direction they drifted, plus the
  // original regression: a chance with no multiplier beside it.
  it.runIf(hasImports)("crit items carry the multiplier their tooltip states", () => {
    // GGD `critDamage` is an ABSOLUTE multiplier (2.0 = double damage) whose
    // champion base is 1.75, and an item modifier is a flat delta into
    // `(base + Σflat)`. Pinned to a real champion doc so that if the base ever
    // moves, this fails here instead of silently rescaling every crit item.
    const champBase = JSON.parse(
      readFileSync(join(contentDir, "champions", "godie-ogld.json"), "utf-8"),
    ).baseStats.critDamage;
    expect(champBase).toBe(1.75);

    const TOOLTIP = /([\d.]+)%機率造成([\d.]+)倍傷害/;
    let checked = 0;
    for (const f of readdirSync(join(contentDir, "items"))) {
      const doc = JSON.parse(readFileSync(join(contentDir, "items", f), "utf-8"));
      const m = TOOLTIP.exec(doc.description ?? "");
      if (!m) continue;
      // A 製作書 recipe book describes the item it COMBINES INTO, not itself, so
      // three of them quote a crit tooltip while carrying no modifiers at all.
      // That is deliberate and load-bearing (they are no-ops, excluded from
      // both shop and draft — see starter.go S3 / item-02), so they are not
      // evidence of a dropped multiplier. Matched by the same 製作書 substring
      // the curation gates use, never by a count.
      if (doc.name.includes("製作書")) continue;
      checked++;
      const mods: { stat: string; op: string; value: number }[] = doc.modifiers ?? [];
      const val = (stat: string) => mods.find((x) => x.stat === stat)?.value;

      expect(val("critChance"), `${doc.name} critChance`).toBeCloseTo(Number(m[1]) / 100, 5);
      // the regression: a crit item with a chance and no multiplier
      expect(val("critDamage"), `${doc.name} has no critDamage`).toBeDefined();
      expect(champBase + val("critDamage")!, `${doc.name} crit multiplier`).toBeCloseTo(
        Number(m[2]),
        5,
      );
    }
    // 天堂之劍 (exempt from the rescale, so still its authored 3% / 50x),
    // 斬龍刀, 龍騎士之劍 and 武聖手鐲.
    expect(checked, "no crit items matched the tooltip pattern").toBe(4);
    cover("w3x-item-crit-multiplier");
  });

  // Task #82 phase 2 scaled two legendaries UP until `critChance` hit the
  // loader's sanity band of 1, and shipped them: `chance(1.0)` is always true
  // in BasicAttackSystem, so 斬龍刀 and 龍騎士之劍 crit on EVERY auto attack at
  // ~4-4.8x. The rescale reported it as an 88%-of-budget shortfall, because it
  // measured the AEP gap and not the mechanic. These bands sit on a
  // qualitative cliff, so being AT one is the failure, not being past it.
  it.runIf(hasImports)("no item ships a modifier at a degenerate value", () => {
    // stat -> the value at which the modifier stops being a magnitude
    const DEGENERATE: Record<string, number> = { critChance: 1, lifesteal: 1 };
    const offenders: string[] = [];
    for (const f of readdirSync(join(contentDir, "items"))) {
      const doc = JSON.parse(readFileSync(join(contentDir, "items", f), "utf-8"));
      for (const m of (doc.modifiers ?? []) as { stat: string; op: string; value: number }[]) {
        const limit = DEGENERATE[m.stat];
        if (limit !== undefined && m.op === "flat" && Math.abs(m.value) >= limit) {
          offenders.push(`${doc.name ?? f} ${m.stat} ${m.value}`);
        }
      }
    }
    expect(offenders, "a guaranteed crit / full lifesteal is a broken mechanic").toEqual([]);
    cover("w3x-item-no-degenerate-modifier");
  });

  // The w3a stores an ability's data column in the mod header, but the parser
  // used to infer it from the 4th character of the mod code. That works for the
  // spell families ('Ocr1') and not for the item family, whose fields are
  // mnemonic ('Iatt', 'Iagi', 'Ilif') — so 86 items imported missing 139
  // modifiers. Both recovery routes are pinned to a real item here:
  //   斬龍刀   'Iatt 55' / 'Iagi 20' — read from the map, mnemonic codes
  //   龍騎士之劍 an UNMODIFIED `AIaz`, absent from the w3a entirely, whose 敏捷+10
  //            can only come from the stock `Units\AbilityData.slk` row
  it.runIf(hasImports)("item abilities beside a crit still contribute their stats", () => {
    for (const id of ["godie-i06d", "godie-i06s"]) {
      const doc = JSON.parse(readFileSync(join(contentDir, "items", `${id}.json`), "utf-8"));
      const stats = new Set<string>(
        ((doc.modifiers ?? []) as { stat: string }[]).map((m) => m.stat),
      );
      for (const stat of ["ad", "armor", "as", "critChance", "critDamage"]) {
        expect(stats.has(stat), `${doc.name} lost its ${stat} modifier`).toBe(true);
      }
    }
    cover("w3x-item-data-column");
  });

  // Task #144: every champion appeared to walk at the same speed. The importer's
  // old AFFINE move-speed map — ms = 5.5 + (clamp(raw,270,522)-270)*2.5/252 —
  // squashed relative differences (its +5.5 offset turned WC3 295-vs-315, a real
  // 6.8% gap, into 5.75-vs-5.95) and floored every slow unit at 270, so 78% of
  // the roster (87/111) landed in the 5.7-5.9 band. The PROPORTIONAL map
  // (ms = raw * 5.8/300, anchored on the shop's WC3-300 == 5.8) restores the
  // source spread: a WC3 320 unit is now faster than a 270 one, the 522-cap
  // heroes reach ~10.1 and the 240-250 heroes drop to ~4.6-4.8. Anchored to the
  // shipped docs and the OBJECTS.json source so a re-flattening fails here.
  it.runIf(hasImports)("champion move speeds carry the source's real spread", () => {
    const champs = readdirSync(join(contentDir, "champions")).filter((f) =>
      f.startsWith("godie-"),
    );
    const ms = champs.map(
      (f) =>
        JSON.parse(readFileSync(join(contentDir, "champions", f), "utf-8"))
          .baseStats.ms as number,
    );
    const distinct = new Set(ms.map((v) => v.toFixed(1)));
    const min = Math.min(...ms);
    const max = Math.max(...ms);
    // Not flattened: many distinct tiers and a real span, unlike the old cram.
    expect(distinct.size).toBeGreaterThanOrEqual(10);
    expect(max - min).toBeGreaterThanOrEqual(3);
    expect(max / min).toBeGreaterThanOrEqual(1.6);
    // No single 0.3-wide band swallows the roster (the old map put 78% in one).
    const inBand = ms.filter((v) => v >= 5.7 && v <= 5.9).length;
    expect(inBand / ms.length).toBeLessThan(0.7);

    // Source-anchored spot-checks — OBJECTS.json move_speed -> baseStats.ms:
    //   300 龍宮禮奈  godie-e001 -> 5.8  (the shop-scale anchor, 「基礎跑速 300」)
    //   522 神鳴流劍士 godie-e00x -> ~10.1 (WC3 cap, the roster's fastest)
    //   240 種子神奇寶貝 godie-h02r -> ~4.6 (among the slowest)
    const msOf = (id: string) =>
      JSON.parse(
        readFileSync(join(contentDir, "champions", `${id}.json`), "utf-8"),
      ).baseStats.ms as number;
    expect(msOf("godie-e001")).toBe(5.8);
    expect(msOf("godie-e00x")).toBeGreaterThan(msOf("godie-e001"));
    expect(msOf("godie-h02r")).toBeLessThan(msOf("godie-e001"));
    cover("w3x-champion-move-speed-spread");
  });
});
