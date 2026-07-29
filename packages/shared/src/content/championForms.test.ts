/**
 * championForms — the 26 base⇄alternate 變身 pairs, pinned three ways.
 *
 * WHAT THIS SUITE IS FOR. Task #249 found a live gameplay bug that existed
 * precisely because NOTHING checked this: the importer drops the w3x
 * Metamorphosis fields `Eme1`/`Emeu` (task #56), so no code could tell a hero
 * from its transformed body, and 10 of the 50 first-open-roster slots shipped
 * the ALTERNATE form as if it were the champion — including 草泥馬's lying-down
 * 臥 body, whose w3x movement speed is 0.
 *
 * Three independent things can go wrong, so there are three pins:
 *   1. the shipped table drifts from the MAP  → checked against the fixture
 *      `tools/w3x-import/out/GoDieEX22s-src/TRANSFORM_FORMS.json`, which
 *      `extract_transform_forms.py` regenerates from raw/war3map.{w3a,w3u};
 *   2. the CHAMPION DOCS drift from the table → every doc's `transform` block
 *      is compared field-for-field, both directions;
 *   3. a pair gets REVERSED — base and alternate swapped. This is the subtle
 *      one and it has real teeth: reading the w3a with a "last writer wins"
 *      parse instead of level 1 silently produces a table that is wrong on ~9
 *      of the 26 pairs. The direction is re-derived here from the map's own
 *      `unsf` sub-names (base = bare 「(NN)」, alternate = 「(NN變身名)」), not
 *      taken on trust.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import {
  CHAMPION_FORM_PAIRS,
  baseFormIdOf,
  counterpartFormId,
  isAlternateForm,
  isBaseForm,
  isW3xFormPair,
} from "./championForms";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const CHAMP_DIR = join(CONTENT_DIR, "champions");
const FIXTURE_PATH = join(
  HERE,
  "../../../../tools/w3x-import/out/GoDieEX22s-src/TRANSFORM_FORMS.json",
);

interface FixtureUnit {
  rawcode: string;
  championId: string;
  subName: string | null;
}
interface FixturePair {
  heroNumber: string | null;
  abilityRawcode: string;
  abilityName: string | null;
  normalUnit: FixtureUnit;
  alternateUnit: FixtureUnit;
  durationSecByLevel: Record<string, number>;
  cooldownSecByLevel: Record<string, number>;
}
interface Fixture {
  schema: string;
  count: number;
  pairs: FixturePair[];
}

const loadFixture = (): Fixture =>
  JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

function loadDocs(): Map<string, ChampionDoc> {
  const out = new Map<string, ChampionDoc>();
  for (const file of readdirSync(CHAMP_DIR).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const raw = JSON.parse(readFileSync(join(CHAMP_DIR, file), "utf8")) as { schema?: string };
    if (raw.schema !== "champion@1") continue;
    const doc = zChampionDoc.parse(raw);
    out.set(doc.id, doc);
  }
  return out;
}

const DOCS = loadDocs();

describe("w3x transform pairs (transform-forms-w3x-pin)", () => {
  it("ships EXACTLY the map's 26 Eme1/Emeu pairs, in the right direction", () => {
    cover("transform-forms-w3x-pin");
    expect(existsSync(FIXTURE_PATH), "the extractor output is checked in").toBe(true);
    const fx = loadFixture();
    expect(fx.schema).toBe("w3x-transform-forms@1");
    expect(fx.count, "the map declares 26 transform abilities").toBe(26);
    expect(CHAMPION_FORM_PAIRS.length).toBe(fx.count);

    // A pair is identified by its ABILITY, so a dropped/added pair fails here…
    expect(CHAMPION_FORM_PAIRS.map((p) => p.abilityRawcode).sort()).toEqual(
      fx.pairs.map((p) => p.abilityRawcode).sort(),
    );

    const byAbility = new Map(fx.pairs.map((p) => [p.abilityRawcode, p]));
    for (const pair of CHAMPION_FORM_PAIRS) {
      const want = byAbility.get(pair.abilityRawcode)!;
      const where = `${pair.abilityRawcode} ${pair.abilityName}`;
      // …and a REVERSED pair fails here: base must be Eme1, alternate Emeu.
      expect(pair.baseId, `${where} base = Eme1`).toBe(want.normalUnit.championId);
      expect(pair.alternateId, `${where} alternate = Emeu`).toBe(want.alternateUnit.championId);
      expect(pair.normalUnitRawcode).toBe(want.normalUnit.rawcode);
      expect(pair.alternateUnitRawcode).toBe(want.alternateUnit.rawcode);
      expect(pair.heroNumber, `${where} hero number`).toBe(want.heroNumber);
      expect(pair.abilityName, `${where} name`).toBe(want.abilityName);
      expect(pair.durationSec, `${where} ahdu`).toEqual(want.durationSecByLevel);
      expect(pair.cooldownSec, `${where} acdn`).toEqual(want.cooldownSecByLevel);
    }
  });

  it("re-derives the direction from the map's own `unsf` sub-names, 26/26", () => {
    cover("transform-forms-direction");
    const fx = loadFixture();
    for (const p of fx.pairs) {
      const num = p.heroNumber!;
      // BASE carries the bare 編號, e.g. "(90)" — nothing else.
      expect(p.normalUnit.subName, `${p.abilityRawcode} base sub-name`).toBe(`(${num})`);
      // ALTERNATE names the form: "(90 妙蛙花)", "(92 臥草)", "(61 鳳凰蛋)"…
      const alt = (p.alternateUnit.subName ?? "").trim();
      expect(alt.startsWith(`(${num}`), `${p.abilityRawcode} alt sub-name "${alt}"`).toBe(true);
      expect(alt, `${p.abilityRawcode} alt sub-name is not the bare number`).not.toBe(`(${num})`);
    }
  });

  it("keeps the two no-duration entries honest (both real toggles)", () => {
    cover("transform-forms-no-duration");
    const noDuration = CHAMPION_FORM_PAIRS.filter(
      (p) => Object.keys(p.durationSec).length === 0,
    ).map((p) => p.abilityRawcode);
    // An EMPTY duration map is a recovered fact, never missing data:
    //   A0DZ 20-01 風王結界 and A0O6 70-00 紮根 are TOGGLES — no `ahdu` at all.
    //
    // ⚠️ Aphx 61-00 百連我殺 (鳳凰蛋) USED TO BE PINNED HERE, and that was this
    // suite pinning a bug rather than a fact. The comment claimed 「a death-state
    // morph, `adur` 0.01s, instant」 — but `adur` is the UNIT duration and `ahdu`
    // is the HERO duration, and only `ahdu` governs a hero morph. Aphx's `ahdu`
    // is 10s. It looked absent purely because the extractor did not resolve the
    // value through the MPQ, so the fixture, `championForms.ts`, its comment and
    // THIS ASSERTION were all wrong in agreement — the exact four-layer shape
    // CLAUDE.md rule 3 warns about. Adding a rawcode back to this list is only
    // ever correct if `TRANSFORM_FORMS.json` really has no `ahdu` for it.
    expect(noDuration.sort()).toEqual(["A0DZ", "A0O6"]);
    // …and every other pair really does carry a level-1 duration.
    for (const p of CHAMPION_FORM_PAIRS) {
      if (noDuration.includes(p.abilityRawcode)) continue;
      expect(p.durationSec["1"], `${p.abilityRawcode} has a level-1 duration`).toBeGreaterThan(0);
    }
  });

  it("the helpers agree with the table and never overlap", () => {
    cover("transform-forms-helpers");
    for (const p of CHAMPION_FORM_PAIRS) {
      expect(isBaseForm(p.baseId)).toBe(true);
      expect(isAlternateForm(p.baseId), `${p.baseId} is not an alternate`).toBe(false);
      expect(isAlternateForm(p.alternateId)).toBe(true);
      expect(isBaseForm(p.alternateId), `${p.alternateId} is not a base`).toBe(false);
      expect(counterpartFormId(p.baseId)).toBe(p.alternateId);
      expect(counterpartFormId(p.alternateId)).toBe(p.baseId);
      expect(isW3xFormPair(p.baseId, p.alternateId)).toBe(true);
      expect(isW3xFormPair(p.alternateId, p.baseId)).toBe(true);
      expect(baseFormIdOf(p.alternateId)).toBe(p.baseId);
      expect(baseFormIdOf(p.baseId)).toBe(p.baseId);
    }
    // A champion in no pair is left completely alone.
    expect(counterpartFormId("godie-e00q")).toBeNull();
    expect(isAlternateForm("godie-e00q")).toBe(false);
    expect(baseFormIdOf("godie-e00q")).toBe("godie-e00q");
    // The table is a clean bipartition: no id is both, none appears twice.
    const bases = CHAMPION_FORM_PAIRS.map((p) => p.baseId);
    const alts = CHAMPION_FORM_PAIRS.map((p) => p.alternateId);
    expect(new Set(bases).size).toBe(bases.length);
    expect(new Set(alts).size).toBe(alts.length);
    expect(bases.filter((b) => alts.includes(b))).toEqual([]);
  });
});

describe("champion docs carry the form link (transform-forms-docs)", () => {
  it("both halves of every imported pair link back to each other", () => {
    cover("transform-forms-docs");
    for (const pair of CHAMPION_FORM_PAIRS) {
      const base = DOCS.get(pair.baseId);
      const alt = DOCS.get(pair.alternateId);
      expect(base, `${pair.baseId} exists (base form)`).toBeDefined();
      expect(base!.transform, `${pair.baseId} declares its transform`).toBeDefined();
      expect(base!.transform!.role).toBe("base");
      expect(base!.transform!.normalUnitRawcode).toBe(pair.normalUnitRawcode);
      expect(base!.transform!.alternateUnitRawcode).toBe(pair.alternateUnitRawcode);
      expect(base!.transform!.triggerAbility.rawcode).toBe(pair.abilityRawcode);
      expect(base!.transform!.triggerAbility.name).toBe(pair.abilityName);

      if (alt === undefined) {
        // Four alternate bodies were never imported — a recovered fact. The
        // base still declares the link, minus a counterpart it cannot name.
        expect(pair.alternateInContent, `${pair.alternateId} absence is declared`).toBe(false);
        expect(base!.transform!.counterpartId).toBeUndefined();
        continue;
      }
      expect(pair.alternateInContent).toBe(true);
      expect(base!.transform!.counterpartId).toBe(pair.alternateId);
      expect(alt.transform, `${pair.alternateId} declares its transform`).toBeDefined();
      expect(alt.transform!.role).toBe("alternate");
      expect(alt.transform!.counterpartId, `${pair.alternateId} points back`).toBe(pair.baseId);
      // Both halves carry the SAME w3x facts — a doc is readable on its own.
      expect(alt.transform!.normalUnitRawcode).toBe(base!.transform!.normalUnitRawcode);
      expect(alt.transform!.alternateUnitRawcode).toBe(base!.transform!.alternateUnitRawcode);
      expect(alt.transform!.triggerAbility).toEqual(base!.transform!.triggerAbility);
    }
  });

  it("no OTHER champion doc claims a transform", () => {
    cover("transform-forms-docs-closed");
    const linked = new Set(
      CHAMPION_FORM_PAIRS.flatMap((p) => [p.baseId, p.alternateId]),
    );
    const strays = [...DOCS.values()]
      .filter((d) => d.transform !== undefined && !linked.has(d.id))
      .map((d) => d.id);
    expect(strays, "a transform link may only come from the w3x table").toEqual([]);
  });

  it("carries the per-level w3x numbers so the mechanic needs no second trip", () => {
    cover("transform-forms-doc-numbers");
    // 妙蛙種子 is the sparse case: the map authors levels 1 and 4 only.
    const bulba = DOCS.get("godie-hgam")!.transform!;
    expect(bulba.triggerAbility.rawcode).toBe("A0VG");
    expect(bulba.triggerAbility.durationSec).toEqual({ "1": 18, "4": 25 });
    expect(bulba.triggerAbility.cooldownSec).toEqual({ "1": 75, "4": 30 });
    // 20-01 風王結界 is a toggle: neither number exists, and neither is faked.
    const saber = DOCS.get("godie-e002")!.transform!;
    expect(saber.triggerAbility.rawcode).toBe("A0DZ");
    expect(saber.triggerAbility.durationSec).toBeUndefined();
    expect(saber.triggerAbility.cooldownSec).toBeUndefined();
  });
});
