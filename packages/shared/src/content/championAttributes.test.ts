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
import { balancePopulationIds } from "../../testkit/balancePopulation";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import {
  DEFAULT_STAT_NORMALIZATION,
  NORMALIZED_STAT_TO_STAT,
  resolveChampionStats,
  type NormalizedStatKey,
} from "./statNormalization";
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
/** 平衡母體（49 位可選本體）。⛔ 模組層一份，不要在每個 `it` 裡各自建。 */
const POP = new Set(balancePopulationIds(join(HERE, "../../../..")));

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

  it("每級成長 100% 由 `growth` 供給 —— 屬性層一格都不出（owner 2026-08-21）", () => {
    cover("attr-248-growth-kept");
    // ═══════════════════════════════════════════════════════════════════════
    // ⭐ 這一條 2026-08-21 換過守的東西，⛔ 舊的那個不是被放寬，是**被架構取代**
    // ═══════════════════════════════════════════════════════════════════════
    // 它原本釘的是 owner 在 #248 給的**四個 level-12 有效血量**（`godie-e002` 7824 /
    // `godie-u00n` 7837 / `godie-efur` 4818 / `godie-zombiex` 5322，MULT ×4）。
    // 那四個數字連同它們**兩次**移動的完整沿革，已經另存在
    // `docs/legacy/_attr-growth-zeroed-superseded.md` —— ⛔ 測試可以跟著設計走，
    // 知識不可以無聲消失。
    //
    // owner 2026-08-21 逐字：
    //   > 「我決定**廢掉三屬性 純用十出身的五級距表來代表每級屬性成長**就好，
    //   >  我所謂的廢掉指的是 **所有角色的 力敏智成長都歸 0 不是真的沒作用**，
    //   >  不然**隨機能力那些都要大改太麻煩**」
    //
    // ⇒ 那四個數字的**兩個輸入同時被取代**了（`strGrowth` 歸 0、`growth.maxHealth`
    //    改由出身五級距推導），所以它們現在既不是 owner 的算術也不是我們的 ——
    //    重新算一組填回去只是給一個**每次重錨都會變**的出貨值找第四個住處
    //    （第零守則：⛔ 數字不可以住在測試裡）。
    //
    // ⭐ 取代它的是**那個裁決本身**：三圍的每級成長全部 0 ⇒ 一位英雄的每級成長
    //    **就是** `growth` 那一格，⛔ 屬性層一分錢都不出。這是新架構的**唯一**
    //    承重點，而且它是有人把 `strGrowth` 改回非零時**第一個**會紅的東西 ——
    //    那一天五級距表就不再是每級成長的唯一來源，而沒有別的東西會說。
    //
    // ⚠️ **母體是那 49 位對戰可選本體**，⛔ 不是 `content/champions` 全部 71 張卡 ——
    //    因為 2026-08-21 的落地**只走到那 49 位**。剩下的 22 張（20 個變身態 +
    //    sela/thorne 兩張 fail-open 骨架佔位）**還帶著三圍成長**，而那是一個
    //    ⭐ **owner 還沒裁決過**的缺口：一位英雄變身之後，他的每級成長又同時有
    //    兩個來源了。⛔ 我不替他決定要不要一起歸零 —— 下面第二段把它**逐張列出來**，
    //    而反向斷言保證它收乾淨的那天這裡會紅、這段話會被刪掉。
    expect(POP.size, "平衡母體讀壞了 —— 下面兩個迴圈會空轉成綠").toBeGreaterThan(0);
    const attrKeys = ["strGrowth", "agiGrowth", "intGrowth"] as const;
    const inPop: string[] = [];
    const outside: string[] = [];
    for (const c of champs) {
      const a = c.attributes!;
      for (const k of attrKeys) {
        if (a[k] === 0) continue;
        (POP.has(c.id) ? inPop : outside).push(`${c.id}.${k} = ${a[k]}`);
      }
    }
    expect(
      inPop.slice(0, 20),
      "對戰可選本體的三圍每級成長不是 0 —— 那一位的每級成長就同時有兩個來源了\n" +
        "（出身五級距 + 屬性層），而 owner 2026-08-21 的裁決是「力敏智成長都歸 0」。\n" +
        "⛔ 不要改這條測試。",
    ).toEqual([]);
    // ⭐ 反向：缺口必須**還在**。變身態與骨架被一起歸零的那天，這一條會紅，
    //    而正確的修法是**刪掉這一段**（連同上面那段說明），⛔ 不是放寬它。
    expect(
      outside.length,
      "變身態／骨架佔位的三圍成長已經歸零了 —— 缺口收乾淨了，把這一段反向斷言刪掉。",
    ).toBeGreaterThan(0);

    // ⭐ 而且要真的走到最終物件：每一條屬性支撐的列，`championStatGrowth`（引擎報給
    //    面板、給小怪曲線、給試算的那一個）必須**逐位元**等於卡上的 `growth`。
    //    ⛔ 掃屬性欄位是屬性，這一段才是行為（失敗形態⑦）。
    // ⚠️ 容差 1e-9 而不是逐位元組相等：`championStatGrowth` 是 `base(2) − base(1)`
    //    的差，浮點誤差 ~1e-14（`61.0037` 出來是 `61.00369999999998`）。⛔ 那不是
    //    「屬性層出了錢」—— 屬性層出錢的量級是**整數位**（喪標麥可那一層是 41.4）。
    const leaking: string[] = [];
    for (const c of champs) {
      if (!POP.has(c.id)) continue; // 上面那個缺口 —— 變身態今天還走舊模型
      for (const stat of ALL_STATS) {
        if (ATTR_STAT_SOURCE[stat] === undefined) continue;
        if (ATTR_STAT_SOURCE[stat]!.mode !== "add") continue; // 攻速是乘區，不是一層加法
        const gap = championStatGrowth(c, stat) - raw(c, stat).growth;
        if (Math.abs(gap) > 1e-9) leaking.push(`${c.id}.${stat} 多了 ${gap}`);
      }
    }
    expect(
      leaking.slice(0, 20),
      "每級成長不等於卡上的 growth —— 屬性層又開始出錢了（五級距表不再是唯一來源）",
    ).toEqual([]);
  });
});

describe("#248 attr-05 — 照**出身表**套用，⛔ 沒有逐英雄的例外（owner 2026-08-21）", () => {
  /**
   * ⭐ owner 2026-08-21 逐字（針對 #244「每級 +45 HP」與 #248 四個 level-12 有效血量）：
   *
   *   > 「**照出身表套用不行嗎 有什麼例外的原因？**
   *   >  如果沒有例外特定原因請將**舊規則及文件打包移到 legacy**」
   *
   * ⇒ **沒有例外原因。** 被取代的那一組（喪標麥可的 380 / +45、四位英雄的
   *   level-12 有效血量、`attributes.str === 12`）連同它們**守過什麼**、
   *   為什麼那個缺陷不會再發生，全部另存在
   *   `docs/legacy/_attr-growth-zeroed-superseded.md`（②④）——
   *   ⭐ **測試可以跟著設計走，知識不可以無聲消失。**
   *
   * ── ⛔ 為什麼不是把那幾個數字重算一組填回來 ──────────────────────────
   * 那會是**第四個住處**（前三個：`content/config/` · Zod `DEFAULT_*` ·
   * admin `SHIPPED_*`），而它沒有守衛 ⇒ 一定過期，而且會用
   * 「殭屍王壞了」這種**錯誤訊息**紅（第零守則）。
   *
   * ── ⭐ 接手的性質：**出身表是唯一的來源，卡上手寫的 growth 不算數** ────
   * 這比舊斷言強：舊的只在**一位**英雄身上抽查一個總和；這一條在**全部**
   * 母體身上證明「同一個出身 + 同一份初始值 ⇒ 同一組每級成長，⛔ 與作者
   * 在卡上填了什麼**完全無關**」。#244 的「+45」如果哪天被人用任何形式接回去
   * （逐英雄的 if、讀回作者值、一張豁免表），這一條就會紅並指名那一位。
   */
  it("正規化後的每級成長是**出身的函數** —— 卡上手寫的 growth 一格都不算數", () => {
    cover("attr-248-zombiex-pinned");
    const N = DEFAULT_STAT_NORMALIZATION;
    const growthKeys = N.appliesTo.filter((k) => N.channel[k] === "growth");
    expect(growthKeys.length, "出身表沒有任何一條走 growth 通道 —— 讀取器壞了").toBeGreaterThan(0);

    const deps = {
      statAt: (def: unknown, key: NormalizedStatKey, level: number): number => {
        const d = def as { baseStats?: unknown; growth?: unknown };
        const safe = { ...(d as object), baseStats: d.baseStats ?? {}, growth: d.growth ?? {} };
        return championStatBase(safe as never, NORMALIZED_STAT_TO_STAT[key], level);
      },
    };
    const normalizedGrowth = (c: ChampionDoc, authored: Record<string, number>) =>
      (
        resolveChampionStats({ ...c, growth: authored } as never, N, deps as never) as {
          growth: Record<string, number>;
        }
      ).growth;

    const leaking: string[] = [];
    for (const c of champs) {
      if (!POP.has(c.id)) continue;
      const asShipped = normalizedGrowth(c, c.growth as Record<string, number>);
      // ⭐ 同一張卡，**只**把作者填的每級成長換成一組荒謬的值。出身表若真的是
      //    唯一來源，正規化後的結果必須**逐位元相同**。
      const vandalised = Object.fromEntries(
        Object.keys(c.growth as Record<string, number>).map((k) => [k, 999]),
      );
      const asVandalised = normalizedGrowth(c, vandalised);
      for (const key of growthKeys) {
        if (asShipped[key] !== asVandalised[key]) {
          leaking.push(`${c.id}.${key}: 出貨 ${asShipped[key]} vs 塗改後 ${asVandalised[key]}`);
        }
      }
    }
    expect(
      leaking.slice(0, 20),
      "⛔ 有英雄的每級成長仍然吃卡上手寫的值 —— 出身表不是唯一來源了（owner 2026-08-21：「照出身表套用」）",
    ).toEqual([]);
  });

  it("喪標麥可**不是**例外 —— 他走的是跟另外 48 位一模一樣的那一條路", () => {
    cover("attr-248-zombiex-pinned");
    const z = champs.find((c) => c.id === "godie-zombiex")!;
    // ⚠️ 他的 `attributes.source` 仍然是 `authored`（他沒有 w3x 來源），
    //    ⭐ 但那是**出處標籤**，⛔ 不再是一張「這一位可以有自己的數字」的通行證。
    expect(POP.has(z.id), "喪標麥可掉出平衡母體了 —— 這條守衛會變成空轉").toBe(true);
    // 每級成長 100% 由 `growth` 供給、屬性層一分錢都不出（上一條 attr-04 對全部
    // 英雄驗這件事；這裡把他那一份寫明，因為 #244 的另一半就是在這一格被取代的）。
    expect(championStatGrowth(z, Stat.MaxHealth)).toBeCloseTo(raw(z, Stat.MaxHealth).growth, 9);
    expect(ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth * (z.attributes!.strGrowth ?? 0)).toBe(0);
  });
});
