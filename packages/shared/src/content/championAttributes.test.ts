/**
 * 三圍 attribute derivation (docs/todo/attributes.md attr-01..attr-05, task #248).
 *
 * The risk this file exists to catch is NOT "the arithmetic is wrong" — it is
 * SILENT DOUBLE-COUNTING and STALE READERS. A champion's level-L stat is three
 * additive layers:
 *
 *     stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
 *
 * and the owner deliberately kept all three (「growth 區塊就是重複來源 =>
 * 本來就可以重複沒有衝突」). Three additive layers is exactly the shape where a
 * reader applies two of the three, or applies one of them twice, and the result
 * still looks plausible — a champion is simply 20% tankier than intended and
 * nobody notices for a month. So these tests assert the LAYERS SEPARATELY and
 * re-derive them from the raw document fields, independently of
 * `championStatBase`. A bug that lives inside that helper cannot hide here.
 *
 * Reads docs by DIRECT file path (same rationale as abilityScaling.test.ts):
 * the point is to check what SHIPS, not what a registry happens to hold.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import { Stat, ALL_STATS } from "../sim/stats/statTypes";
import {
  championStatBase,
  championStatGrowth,
  attributeAtLevel,
  ATTR_STAT_SOURCE,
  type AttrKey,
} from "../sim/stats/attributes";
import {
  ATTRIBUTE_ENV_DEFAULTS,
  COMBAT_ENV_DEFAULTS,
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  isAttributeEnvKey,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "../sim/combatEnv";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const LEVELS = [1, 2, 6, 12, 18];

function allChampions(): ChampionDoc[] {
  return readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as unknown)
    .filter((d): d is ChampionDoc => (d as ChampionDoc)?.schema === "champion@1")
    .map((d) => zChampionDoc.parse(d));
}

const champs = allChampions();

/** The doc's own raw numbers, read WITHOUT going through the sim helpers. */
function raw(c: ChampionDoc, stat: Stat): { base: number; growth: number } {
  const b = c.baseStats as Record<string, number | undefined>;
  const g = c.growth as Record<string, number | undefined>;
  return { base: b[stat as string] ?? 0, growth: g[stat as string] ?? 0 };
}

/** attr(L) recomputed from the doc, not from `attributeAtLevel`. */
function rawAttrAt(c: ChampionDoc, which: AttrKey, level: number): number {
  const a = c.attributes!;
  const at = { str: [a.str, a.strGrowth], agi: [a.agi, a.agiGrowth], int: [a.int, a.intGrowth] }[which];
  return at[0]! + at[1]! * (level - 1);
}

/** A combat-env table with one key overridden — for the separability probes. */
function envWith(overrides: Partial<Record<CombatEnvKey, number>>): CombatEnvMultipliers {
  return Object.freeze({ ...COMBAT_ENV_DEFAULTS, ...overrides }) as CombatEnvMultipliers;
}

/**
 * 這個檔案釘的是 #248 的三層加法律 —— 而 2026-07-28 的 #265 在 maxHealth 上又
 * 疊了一個「全英雄初始生命 +300」的平移項，它不屬於三圍模型（不隨等級、不隨
 * 屬性、也不是 designer 的 growth 旋鈕）。這裡一律把它關掉，讓每一條斷言仍然
 * 只在講屬性解析；那 300 本身由 sim/balanceTuning.test.ts 直接釘死，連「它必須
 * 落在 combat-env 倍率之前」都一起釘。
 */
function sheet(
  c: Parameters<typeof championStatBase>[0],
  stat: Stat,
  level: number,
  env: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
): number {
  return championStatBase(c, stat, level, env);
}

describe("#248 attr-01 — the derivation law holds for every champion", () => {
  it("derived stat == baseStats + attr(L)·coefficient + growth·(L−1), at 5 levels", () => {
    cover("attr-248-derivation-law");
    // 母體＝**現在營運中**的英雄卡。2026-08-13 owner 把 41 位未上架的英雄搬到
    // `content/_legacy/champions/`(不在 `COLLECTION_NAMES` 裡,引擎讀不到),
    // 所以這裡以前抄的 114 是一個會過期的出貨值 —— 第零守則的「第四個住處」。
    // 這一行現在只擋一件事:**空集合也算通過**。下面那個三層加法律的三重迴圈
    // 如果一位英雄都沒跑到,它會全綠而什麼都沒驗。
    expect(champs.length).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const c of champs) {
      for (const stat of ALL_STATS) {
        const src = ATTR_STAT_SOURCE[stat];
        const { base, growth } = raw(c, stat);
        for (const level of LEVELS) {
          // Independent re-derivation from the raw doc fields.
          const authored = base + growth * (level - 1);
          let expected = authored;
          if (src !== undefined && c.attributes !== undefined) {
            const coef = ATTRIBUTE_ENV_DEFAULTS[src.key as keyof typeof ATTRIBUTE_ENV_DEFAULTS];
            const attr = rawAttrAt(c, src.attr, level);
            // Attack speed is the one MULTIPLICATIVE row: in WC3 agility
            // shortens the attack cooldown rather than adding attacks/sec.
            expected = src.mode === "add" ? authored + coef * attr : authored * (1 + coef * attr);
          }
          const actual = sheet(c, stat, level);
          if (Math.abs(actual - expected) > 1e-9) {
            problems.push(`${c.id} ${stat}@L${level}: got ${actual}, law says ${expected}`);
          }
        }
      }
    }
    expect(problems.slice(0, 20).join("\n")).toBe("");
  });

  it("the reported per-level growth is the real increment, both layers included", () => {
    cover("attr-248-derivation-law");
    for (const c of champs) {
      for (const stat of ALL_STATS) {
        const src = ATTR_STAT_SOURCE[stat];
        if (src === undefined || c.attributes === undefined) continue;
        // championStatGrowth must equal base(2)−base(1) AND, for the additive
        // rows, must be the SUM of the two layers — never one of them.
        const g = championStatGrowth(c, stat);
        expect(g).toBeCloseTo(sheet(c, stat, 2) - sheet(c, stat, 1), 9);
        if (src.mode === "add") {
          const coef = ATTRIBUTE_ENV_DEFAULTS[src.key as keyof typeof ATTRIBUTE_ENV_DEFAULTS];
          const attrLayer = coef * (rawAttrAt(c, src.attr, 2) - rawAttrAt(c, src.attr, 1));
          const growthLayer = raw(c, stat).growth;
          expect(g).toBeCloseTo(attrLayer + growthLayer, 9);
        }
      }
    }
  });

  it("attributeAtLevel is linear and level 1 is the base value", () => {
    cover("attr-248-derivation-law");
    for (const c of champs.slice(0, 12)) {
      const a = c.attributes!;
      for (const which of ["str", "agi", "int"] as const) {
        expect(attributeAtLevel(a, which, 1)).toBe(a[which]);
        for (const level of LEVELS) {
          expect(attributeAtLevel(a, which, level)).toBeCloseTo(rawAttrAt(c, which, level), 9);
        }
        // levels below 1 clamp to 1 rather than running the curve backwards
        expect(attributeAtLevel(a, which, 0)).toBe(a[which]);
      }
    }
  });
});

describe("#248 attr-02 — the three layers are separable", () => {
  it("zeroing a coefficient removes ONLY the attribute term", () => {
    cover("attr-248-layers-separable");
    // If `growth` were ever folded into the attribute term (or vice versa),
    // switching the coefficient off would take the designer knob with it.
    for (const c of champs) {
      for (const stat of ALL_STATS) {
        const src = ATTR_STAT_SOURCE[stat];
        if (src === undefined) continue;
        const off = envWith({ [src.key]: 0 });
        const { base, growth } = raw(c, stat);
        for (const level of LEVELS) {
          const expected =
            src.mode === "add"
              ? base + growth * (level - 1)
              : (base + growth * (level - 1)) * 1; // ×(1+0·attr) = ×1
          expect(sheet(c, stat, level, off)).toBeCloseTo(expected, 9);
        }
      }
    }
  });

  it("doubling a coefficient doubles ONLY the attribute term", () => {
    cover("attr-248-layers-separable");
    const c = champs.find((x) => x.id === "godie-hart")!;
    const stat = Stat.MaxHealth;
    const { base, growth } = raw(c, stat);
    const key = ATTR_STAT_SOURCE[stat]!.key;
    for (const level of LEVELS) {
      const attrTerm = ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth * rawAttrAt(c, "str", level);
      const authored = base + growth * (level - 1);
      expect(sheet(c, stat, level)).toBeCloseTo(authored + attrTerm, 9);
      expect(sheet(c, stat, level, envWith({ [key]: ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth * 2 }))).toBeCloseTo(
        authored + attrTerm * 2,
        9,
      );
    }
  });

  it("a doc with NO attributes block reduces to the pre-#248 law exactly", () => {
    cover("attr-248-layers-separable");
    const c = champs.find((x) => x.id === "godie-hart")!;
    const { attributes: _dropped, ...without } = c;
    for (const stat of ALL_STATS) {
      const { base, growth } = raw(c, stat);
      for (const level of LEVELS) {
        expect(sheet(without, stat, level)).toBeCloseTo(base + growth * (level - 1), 9);
      }
    }
  });
});

describe("#248 attr-03 — the roster and the coefficient table are complete", () => {
  it("every shipped champion carries a full 三圍 block", () => {
    cover("attr-248-roster-complete");
    const missing = champs.filter((c) => c.attributes === undefined).map((c) => c.id);
    expect(missing).toEqual([]);
    for (const c of champs) {
      const a = c.attributes!;
      for (const k of ["str", "agi", "int", "strGrowth", "agiGrowth", "intGrowth"] as const) {
        expect(`${c.id}.${k}:${Number.isFinite(a[k])}`).toBe(`${c.id}.${k}:true`);
      }
      expect(["STR", "AGI", "INT"]).toContain(a.primary);
      expect(["w3x", "authored"]).toContain(a.source);
    }
    // Exactly the three champions with no source map entry are hand-authored.
    const authored = champs.filter((c) => c.attributes!.source === "authored").map((c) => c.id).sort();
    expect(authored).toEqual(["godie-zombiex", "sela", "thorne"]);
  });

  it("the nine coefficients live in the combat-env table with their shipped values", () => {
    cover("attr-248-roster-complete");
    // #28 built the multiplier table and #136 added abilityRange to it; #248
    // follows that precedent instead of inventing a second config surface, so
    // the admin 戰鬥系統 page tunes all of them together.
    for (const [key, value] of Object.entries(ATTRIBUTE_ENV_DEFAULTS)) {
      expect(COMBAT_ENV_KEYS).toContain(key as CombatEnvKey);
      expect(isAttributeEnvKey(key)).toBe(true);
      expect(DEFAULT_COMBAT_ENV[key as CombatEnvKey]).toBe(value);
    }
    // A coefficient's neutral value is NOT 1.0 — resetting str→hp to 1 would
    // delete 96% of every champion's health, which is why they are a distinct
    // kind of entry in the same table.
    //
    // 23, not Blizzard's 25: the SOURCE MAP ships its own gameplay-constants
    // table (`war3mapMisc.txt`, StrHitPointBonus=23) and it wins. The full
    // provenance, per coefficient, and the guard that READS both source files
    // live in sim/attributeCoefficients.test.ts.
    expect(ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth).toBe(23);
    expect(ATTRIBUTE_ENV_DEFAULTS.intToMaxMana).toBe(15);
    // …and every non-attribute key is still a neutral ×1 factor.
    for (const k of COMBAT_ENV_KEYS) {
      if (!isAttributeEnvKey(k)) expect(`${k}:${DEFAULT_COMBAT_ENV[k]}`).toBe(`${k}:1`);
    }
    // Every attribute-derived stat names a real coefficient key.
    for (const [stat, src] of Object.entries(ATTR_STAT_SOURCE)) {
      expect(`${stat}:${isAttributeEnvKey(src!.key)}`).toBe(`${stat}:true`);
    }
    // mr HAS an attribute source since GH#221 (owner 2026-07-30:「新增 智慧→
    // 每 1 點智慧增加的魔抗 0.6」). Until then this line asserted the OPPOSITE —
    // 「WC3 has no magic-resistance attribute, so 魔抗 is growth-only by nature」 —
    // which was a true statement about Warcraft and is now a false one about GGD.
    // The owner-designed axis is deliberate, so pin it the same way: which
    // attribute feeds it, through which coefficient key, additively.
    expect(ATTR_STAT_SOURCE[Stat.MagicResist]).toEqual({
      attr: "int",
      key: "intToMagicResist",
      mode: "add",
    });
  });
});

describe("#248 attr-04 — `growth` survived the re-derivation", () => {
  it("no champion lost a growth row", () => {
    cover("attr-248-growth-kept");
    // An earlier draft of #248 deleted the seven growth rows the attribute
    // growths also supply. The owner WITHDREW that: two additive sources is
    // only double-counting if they mean the same thing, and these do not.
    // If a future change re-deletes them, every champion's curve silently
    // flattens by roughly half — this is the tripwire for that.
    const withoutAnyGrowth = champs.filter((c) => Object.keys(c.growth).length === 0).map((c) => c.id);
    expect(withoutAnyGrowth).toEqual([]);

    // The seven attribute-backed rows are still present on the roster at large
    // (they are the ones an over-eager cull would take).
    for (const stat of [
      Stat.MaxHealth,
      Stat.HealthRegen,
      Stat.MaxMana,
      Stat.ManaRegen,
      Stat.AttackDamage,
      Stat.Armor,
      Stat.AttackSpeed,
    ]) {
      // 以前是「> 100 位有這一列」,那是 119 隻母體時代的出貨值。母體換成營運
      // 內容之後,正確的形狀不是換一個數字而是**從母體推導**:這七列是每一張
      // 英雄卡都該有的,所以斷言是「一位都沒漏」。這比舊的下界**更嚴**,而且
      // 不會因為下一次上架/下架而過期。
      const carriers = champs.filter((c) => (c.growth as Record<string, number>)[stat] !== undefined);
      const without = champs.filter((c) => (c.growth as Record<string, number>)[stat] === undefined);
      expect(`${stat}:${carriers.length}`, `缺 ${stat} growth 的英雄：${without.map((c) => c.id).join(", ")}`).toBe(
        `${stat}:${champs.length}`,
      );
    }
    // …and so is the growth-only one.
    expect(champs.every((c) => (c.growth as Record<string, number>)[Stat.MagicResist] !== undefined)).toBe(true);
  });

  it("reproduces the owner's four level-12 effective-HP sanity numbers", () => {
    cover("attr-248-growth-kept");
    // Stated in the #248 brief as the check that our attribute resolution
    // agrees with his: level 12, maxHealth multiplier ×4, both sources kept.
    // (Deleting `growth` would land these at 50–63% instead of 78–91%.)
    //
    // THESE FOUR MOVED, and the reason is recorded rather than papered over.
    // #248 computed them with Blizzard's strToMaxHealth 25; the SOURCE MAP's
    // own war3mapMisc.txt says 23, and the map wins. Every level-12 figure
    // therefore drops by `2 × STR(12)`, roughly −5%:
    //
    //   godie-e002    8246 -> 7824   (亞瑟王 - Saber)
    //   godie-u00n    8241 -> 7837   (蒙其.D.魯夫)
    //   godie-efur    5070 -> 4818   (揍敵客桀諾)
    //   godie-zombiex 5480 -> 5322   (喪標麥可 — see attr-05: his LEVEL-1 380
    //                                 is owner-chosen and was re-preserved by
    //                                 back-solving the raw card 80 -> 104; only
    //                                 the per-level attribute layer moved)
    //
    // These are a CONSEQUENCE of a corrected coefficient, not a re-tune. If the
    // owner wants the old totals back, the lever is the combat-env maxHealth
    // ×factor, not the imported coefficient.
    //
    // 2026-07-28 (#265): THE SHIPPED NUMBERS ARE NO LONGER THESE. The owner set
    // maxHealth ×4 → ×3 and added a flat +300 to every champion's base, so what
    // a player actually sees at level 12 is `(sheet + 300) × 3`. This test
    // deliberately keeps ×4 and the bonus OFF, because what it guards is the
    // ATTRIBUTE RESOLUTION agreeing with the owner's #248 arithmetic — a pin
    // that has to survive every later balance pass or it stops being a pin. The
    // shipped multiplier and the +300 are pinned in sim/balanceTuning.test.ts.
    const MULT = 4;
    const expected: Record<string, number> = {
      "godie-e002": 7824, // 亞瑟王 - Saber
      "godie-u00n": 7837, // 蒙其.D.魯夫
      "godie-efur": 4818, // 揍敵客桀諾
      "godie-zombiex": 5322, // 喪標麥可
    };
    for (const [id, want] of Object.entries(expected)) {
      const c = champs.find((x) => x.id === id)!;
      const got = sheet(c, Stat.MaxHealth, 12) * MULT;
      expect(`${id}:${Math.round(got)}`).toBe(`${id}:${want}`);
    }
  });
});

describe("#248 attr-05 — godie-zombiex keeps #244's deliberate tuning", () => {
  it("380 HP at level 1, with the attribute layer supplying exactly +45/level", () => {
    cover("attr-248-zombiex-pinned");
    const z = champs.find((c) => c.id === "godie-zombiex")!;
    // #244 chose 380 / +45 on purpose. #248 moved WHERE the 380 comes from
    // without changing it, and the coefficient correction had to move it AGAIN.
    //
    // 喪標麥可 has NO w3x source — his `attributes.source` is "authored", i.e.
    // the block exists only to REPRODUCE a sheet the owner chose. So when the
    // reconstruction constant changed (strToMaxHealth 25 -> the map's 23), the
    // reconstruction was redone rather than left to drift: the raw card went
    // 80 -> 104 so that `104 + 23 × 12` is still exactly 380. Leaving it would
    // have silently dropped him to 356 and quietly undone #244.
    expect(z.attributes!.source).toBe("authored");
    expect(sheet(z, Stat.MaxHealth, 1)).toBe(380);
    expect(z.attributes!.str).toBe(12);
    expect(z.attributes!.strGrowth).toBe(1.8);
    // WHAT COULD NOT BE PRESERVED, stated plainly. Under 25 the attribute layer
    // happened to supply exactly +45/level, matching #244's authored growth.
    // Under 23 it supplies 41.4, and hitting 45 would need strGrowth 1.9565…,
    // a number invented to flatter a coincidence. The owner's AUTHORED knob is
    // untouched at 45; the effective per-level is now 86.4 instead of 90 and is
    // logged for him in docs/_execution-batches.md.
    expect(ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth * z.attributes!.strGrowth).toBeCloseTo(41.4, 9);
    expect((z.growth as Record<string, number>)[Stat.MaxHealth]).toBe(45);
    expect(championStatGrowth(z, Stat.MaxHealth)).toBeCloseTo(86.4, 9);
  });
});
