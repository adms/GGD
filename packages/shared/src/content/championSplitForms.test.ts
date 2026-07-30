/**
 * `CHAMPION_SPLIT_FORMS` — the Primal-Split 變身 the pair table cannot hold.
 *
 * WHAT THIS SUITE IS FOR (task #208). `championForms.test.ts` pins 26 pairs and
 * asserts the table is a clean bipartition, and every one of those assertions
 * passed while a 27th transform was missing entirely — because both the table
 * and the test only ever ask about `Eme1`/`Emeu`. 37 巴恩大魔王's 「37-04
 * 魔界之王」 is built on `ANef` (Blizzard's Primal Split), writes `Nef1`, and is
 * therefore invisible to every assertion in that file no matter how strict.
 *
 * So this suite pins the OTHER family, against
 * `tools/w3x-import/out/GoDieEX22s-src/UNIT_SWAP_CENSUS.json`, which
 * `extract_unit_swap_census.py` regenerates by classifying EVERY w3a entry by
 * the shape of its Blizzard base row rather than by a hand-list of field codes.
 *
 * Four things can go wrong and each has its own pin:
 *   1. the shipped table drifts from the map        → compared to the fixture;
 *   2. the census itself silently stops finding it  → the counts are pinned,
 *      including the two it must NOT promote (the dead `A0SJ`, the 3 JASS
 *      easter eggs);
 *   3. the three bodies get treated as pickable heroes → `isTransformedBody`;
 *   4. `tiersInContent` goes stale in EITHER direction — it is read off the
 *      real `content/champions` directory, so it flips on its own when the docs
 *      land and goes red if they land half-way.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import {
  CHAMPION_FORM_PAIRS,
  CHAMPION_SPLIT_FORMS,
  SPLIT_FORM_BY_BASE_ID,
  isAlternateForm,
  isBaseForm,
  isSplitFormBody,
  isTransformedBody,
} from "./championForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAMP_DIR = join(HERE, "../../../../content/champions");
const FIXTURE_PATH = join(
  HERE,
  "../../../../tools/w3x-import/out/GoDieEX22s-src/UNIT_SWAP_CENSUS.json",
);

interface CensusUnit {
  rawcode: string;
  championId: string;
  subName: string | null;
  model: string | null;
  scale: number | null;
  moveSpeed: number | null;
  maxHealth: number | null;
  maxMana: number | null;
  armor: number | null;
  attackDamageBase: number | null;
  abilities: string[];
}
interface CensusSplit {
  abilityRawcode: string;
  abilityBase: string;
  abilityName: string | null;
  heroNumber: string | null;
  live: boolean;
  durationSecByLevel: Record<string, number>;
  cooldownSecByLevel: Record<string, number>;
  casterUnits: { unitRawcode: string; slot: string }[];
  formsByLevel: { level: number; unitsPerCast: number; units: CensusUnit[] }[];
}
interface Census {
  schema: string;
  counts: {
    metamorphEntries: number;
    splitEntries: number;
    splitEntriesLive: number;
    summonEntries: number;
    jassReplaceUnitSites: number;
  };
  splitEntries: CensusSplit[];
  jassReplaceUnitSites: { targetRawcode: string }[];
}

const loadCensus = (): Census =>
  JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Census;

describe("w3x split forms (split-forms-w3x-pin)", () => {
  it("the census fixture is checked in and still finds the whole picture", () => {
    cover("split-forms-w3x-pin");
    expect(existsSync(FIXTURE_PATH), "extract_unit_swap_census.py output").toBe(true);
    const fx = loadCensus();
    expect(fx.schema).toBe("w3x-unit-swap-census@1");
    // The two families must stay in agreement about the 26 — a census that
    // "found" 27 Metamorphosis pairs would mean the classifier had started
    // swallowing summons.
    expect(fx.counts.metamorphEntries).toBe(CHAMPION_FORM_PAIRS.length);
    expect(fx.counts.metamorphEntries).toBe(26);
    // 2 split entries, of which 1 is live. Both numbers matter: dropping the
    // dead one would make "2" a lie, promoting it would invent a transform.
    expect(fx.counts.splitEntries).toBe(2);
    expect(fx.counts.splitEntriesLive).toBe(1);
    expect(CHAMPION_SPLIT_FORMS.length).toBe(fx.counts.splitEntriesLive);
    // 68 summons — the B/one-way shape, which is NOT a form change. If this
    // collapses to 0 the classifier has stopped separating the families.
    expect(fx.counts.summonEntries).toBeGreaterThan(50);
    // 3 JASS ReplaceUnitBJ sites, all player-name-gated easter eggs whose
    // targets already ship as ordinary champions. They are NOT split forms.
    expect(fx.counts.jassReplaceUnitSites).toBe(3);
    expect(fx.jassReplaceUnitSites.map((s) => s.targetRawcode).sort()).toEqual([
      "H02K",
      "H02K",
      "O02P",
    ]);
    for (const site of fx.jassReplaceUnitSites) {
      expect(isTransformedBody(`godie-${site.targetRawcode.toLowerCase()}`)).toBe(false);
    }
  });

  it("ships the map's live split form, tier for tier", () => {
    cover("split-forms-tiers");
    const fx = loadCensus();
    const live = fx.splitEntries.filter((s) => s.live);
    expect(live.map((s) => s.abilityRawcode)).toEqual(
      CHAMPION_SPLIT_FORMS.map((f) => f.abilityRawcode),
    );

    for (const form of CHAMPION_SPLIT_FORMS) {
      const want = live.find((s) => s.abilityRawcode === form.abilityRawcode)!;
      const where = `${form.abilityRawcode} ${form.abilityName}`;
      expect(form.abilityBase, `${where} base`).toBe(want.abilityBase);
      expect(form.abilityName, `${where} name`).toBe(want.abilityName);
      expect(form.heroNumber, `${where} hero number`).toBe(want.heroNumber);
      expect(form.durationSec, `${where} ahdu`).toEqual(want.durationSecByLevel);
      expect(form.cooldownSec, `${where} acdn`).toEqual(want.cooldownSecByLevel);
      // The CASTER is the hero, and the map puts the ability on its HERO list.
      expect(
        want.casterUnits.some(
          (u) => u.unitRawcode === form.casterUnitRawcode && u.slot === "uhab",
        ),
        `${where} caster ${form.casterUnitRawcode} owns it as a hero ability`,
      ).toBe(true);

      expect(form.tiers.length, `${where} tier count`).toBe(want.formsByLevel.length);
      for (const tier of form.tiers) {
        const src = want.formsByLevel.find((f) => f.level === tier.level)!;
        const w = `${where} lv${tier.level}`;
        // ONE unit per level is the whole "tiered, not a squad" claim.
        expect(src.unitsPerCast, `${w} summons one body`).toBe(1);
        const u = src.units[0]!;
        expect(tier.unitRawcode, `${w} rawcode`).toBe(u.rawcode);
        expect(tier.championId, `${w} id`).toBe(u.championId);
        expect(tier.subName, `${w} unsf`).toBe(u.subName);
        expect(tier.maxHealth, `${w} uhpm`).toBe(u.maxHealth);
        expect(tier.maxMana, `${w} umpm`).toBe(u.maxMana);
        expect(tier.armor, `${w} udef`).toBe(u.armor);
        expect(tier.attackDamageBase, `${w} ua1b`).toBe(u.attackDamageBase);
        expect(tier.moveSpeedWc3, `${w} umvs`).toBe(u.moveSpeed);
        expect([...tier.abilityRawcodes], `${w} uabi`).toEqual(u.abilities);
      }
    }
  });

  it("re-derives 'tiered, not a squad' from the map instead of trusting it", () => {
    cover("split-forms-tiered-proof");
    const fx = loadCensus();
    for (const form of CHAMPION_SPLIT_FORMS) {
      const want = fx.splitEntries.find((s) => s.abilityRawcode === form.abilityRawcode)!;
      // Blizzard's ANef puts three units in ONE comma list at level 1. This
      // map writes one unit per LEVEL — so the levels must be 1..N, distinct
      // units, and each summoning exactly one body.
      expect(form.tiers.map((t) => t.level)).toEqual(
        form.tiers.map((_, i) => i + 1),
      );
      expect(new Set(form.tiers.map((t) => t.unitRawcode)).size).toBe(form.tiers.length);
      expect(want.formsByLevel.every((f) => f.unitsPerCast === 1)).toBe(true);
      // …and the ability list GROWS with the tier, which is what the map's own
      // tooltip promises (lv2 adds 凱薩之鷹, lv3 adds 天地魔鬥). A flat list
      // would mean the three bodies are interchangeable and the "tier" reading
      // is wrong.
      const sizes = form.tiers.map((t) => t.abilityRawcodes.length);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
      expect(sizes[0]!).toBeLessThan(sizes[sizes.length - 1]!);
      // Every earlier tier's abilities survive into the later ones.
      for (let i = 1; i < form.tiers.length; i += 1) {
        const prev = new Set(form.tiers[i - 1]!.abilityRawcodes);
        for (const code of prev) {
          expect(form.tiers[i]!.abilityRawcodes, `lv${i + 1} keeps ${code}`).toContain(
            code,
          );
        }
      }
      // Stats escalate monotonically — the other half of "tier".
      const hp = form.tiers.map((t) => t.maxHealth);
      expect(hp).toEqual([...hp].sort((a, b) => a - b));
      expect(new Set(hp).size).toBe(hp.length);
    }
  });

  it("split bodies are NOT pickable heroes, and do not collide with the pairs", () => {
    cover("split-forms-not-pickable");
    const bodies = CHAMPION_SPLIT_FORMS.flatMap((f) => f.tiers.map((t) => t.championId));
    expect(new Set(bodies).size).toBe(bodies.length);
    for (const id of bodies) {
      expect(isSplitFormBody(id), `${id} is a split body`).toBe(true);
      // `isTransformedBody` is the question callers should ask. Asking only
      // `isAlternateForm` is exactly what kept these three invisible.
      expect(isTransformedBody(id), `${id} is a transformed body`).toBe(true);
      expect(isAlternateForm(id), `${id} is not an Emeu alternate`).toBe(false);
      expect(isBaseForm(id), `${id} is not a pair base`).toBe(false);
    }
    for (const form of CHAMPION_SPLIT_FORMS) {
      expect(SPLIT_FORM_BY_BASE_ID.get(form.baseId)).toBe(form);
      // The caster IS a hero and must stay one.
      expect(isSplitFormBody(form.baseId)).toBe(false);
      expect(isTransformedBody(form.baseId)).toBe(false);
    }
    // No id may be both a pair half and a split body.
    const paired = new Set(CHAMPION_FORM_PAIRS.flatMap((p) => [p.baseId, p.alternateId]));
    expect(bodies.filter((b) => paired.has(b))).toEqual([]);
    // A champion in neither table is untouched.
    expect(isSplitFormBody("godie-e00q")).toBe(false);
    expect(isTransformedBody("godie-e00q")).toBe(false);
  });

  it("`tiersInContent` reports the REAL content directory, both ways", () => {
    cover("split-forms-content-flag");
    for (const form of CHAMPION_SPLIT_FORMS) {
      const present = form.tiers.map((t) =>
        existsSync(join(CHAMP_DIR, `${t.championId}.json`)),
      );
      // ALL or NONE — a half-landed set is the dangerous state, because
      // `Registry.get()` throws on an unregistered id and `snapshot.ts` calls
      // it every tick for every champion entity.
      expect(
        new Set(present).size,
        `${form.abilityRawcode} tiers are half-imported: ` +
          form.tiers.map((t, i) => `${t.championId}=${present[i]}`).join(" "),
      ).toBe(1);
      expect(form.tiersInContent, `${form.abilityRawcode} tiersInContent`).toBe(
        present[0],
      );
      // The caster's own doc must exist either way — it is a pickable hero.
      expect(
        existsSync(join(CHAMP_DIR, `${form.baseId}.json`)),
        `${form.baseId} (the caster) has a champion doc`,
      ).toBe(true);
    }
  });
});
