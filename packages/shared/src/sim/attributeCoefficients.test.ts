/**
 * PROVENANCE GUARD for the eight 三圍 coefficients (#248 follow-up).
 *
 * THE BUG THIS EXISTS TO KILL, in two halves:
 *
 *  1. #248 took the coefficients from memory (25 / 0.05 / 0.30 / 0.05 …) —
 *     Blizzard's stock numbers — while THE SOURCE MAP SHIPS ITS OWN OVERRIDE of
 *     that constants table and changes four of them. That is the same error
 *     class #248 was itself restarted to fix ("read a default where the map
 *     wrote an override"), one layer up from the w3u.
 *  2. The comment then credited those numbers to `Units\UnitBalance.slk`, which
 *     contains no coefficient at all. A comment that names the wrong source is
 *     worse than no comment: it stops the next person from checking.
 *
 * So this file NEVER hardcodes a copy of the coefficients. It READS
 *
 *   - the map's own table   tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt
 *   - Blizzard's fallback   tools/w3x-import/out/stock/STOCK_MISCGAME.json
 *                           (extracted by tools/w3x-import/stock_misc_data.py)
 *
 * and asserts ATTRIBUTE_ENV_DEFAULTS equals the map's value where the map has
 * one and Blizzard's where it does not. Editing the shipped table without a
 * matching change in the source data — or "correcting" a value back to the WC3
 * number everyone remembers — turns this red.
 *
 * MaxHeroLevel is checked too, but only REPORTED: the map says 40 and GGD's own
 * cap is a separate design decision the owner has to make (see the note below
 * and docs/_execution-batches.md).
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ATTRIBUTE_ENV_DEFAULTS, type AttributeEnvKey } from "./combatEnv";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const MAP_MISC = join(REPO, "tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt");
const STOCK_MISC = join(REPO, "tools/w3x-import/out/stock/STOCK_MISCGAME.json");

/**
 * `key=value` lines of a WC3 gameplay-constants txt, `//` starting a comment.
 * Mirrors `parse_misc` in tools/w3x-import/stock_misc_data.py. Section headers
 * are skipped: the [Misc] block is the only one that carries these names.
 */
function parseMisc(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split("//")[0] ?? "").trim();
    if (line === "" || line.startsWith("[") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const mapMisc = parseMisc(readFileSync(MAP_MISC, "utf8"));
const stockMisc = (
  JSON.parse(readFileSync(STOCK_MISC, "utf8")) as { heroConstants: Record<string, string> }
).heroConstants;

/**
 * Which WC3 gameplay-constants FIELD each shipped coefficient derives from.
 *
 * `{ ownerDesign }` = there is no upstream field, so the value is the owner's
 * design and this file asserts the ABSENCE of a source rather than a number.
 * The name it carries is the field WC3 WOULD have used if the axis existed —
 * it has to be per-key, because the two owner-designed rows are different axes
 * and a single hardcoded name would silently stop checking one of them.
 */
type Provenance =
  | { field: string }
  | { ownerDesign: string }
  /**
   * ⭐ **第三種：owner 明知有上游來源，仍然覆寫它。**
   *
   * 第〇·六守則的優先序階梯：第 1 層（owner 的新版設計）贏過第 5 層
   * （w3x 原始設定）。但同一條守則也說：「⭐ **『分開』不是『丟掉』**。
   * 被取代的原作數值要**另存** —— 測試可以跟著設計走，**知識不可以無聲消失**。」
   *
   * 所以這一種要**同時**成立三件事，少一件就紅：
   *   ① 上游來源**仍然存在**（不然它該是 `ownerDesign`）
   *   ② 出貨值**確實不等於**上游值（不然它該是 `field` —— 覆寫已經被撤銷了）
   *   ③ 上游那個數字**真的被記在** `docs/legacy/_w3x-fidelity-superseded.md` 裡
   *
   * ⛔ ③ 是這一種存在的理由。少了它，「偏離原作」就只是一個沒有人讀的註解。
   */
  | { overrides: string; upstream: number; why: string };

const FIELD_OF: Record<AttributeEnvKey, Provenance> = {
  strToMaxHealth: { field: "StrHitPointBonus" },
  strToHealthRegen: { field: "StrRegenBonus" },
  // 🔴 owner 2026-08-13 覆寫：1.0 → 0.4。
  //   理由：「現在的玩法**普通攻擊太有利了**⋯技能傷害爆發力⋯**＝雞肋**」。
  //   量到法師 L99 普攻每秒 1,328 而一發技能只有 388（＝普攻 0.29 秒）。
  //   ⭐ 削 AD 比補 AP 有效，因為普攻是乘法（AD × 攻速）技能是加法。
  strToAttackDamage: {
    overrides: "StrAttackBonus",
    upstream: 1.0,
    why: "普攻 vs 技能再平衡（owner 2026-08-13）",
  },
  agiToArmor: { field: "AgiDefenseBonus" },
  // 🔴 owner 2026-08-13 覆寫：0.02 → 0.01。
  //   「我覺得問題應該是**敏捷提升攻擊速度的屬性該調整**吧，畢竟**之前等級上限只有 30**」
  //   ⚠️ 暴雪設計 0.02 時英雄上限是 10 級；地圖拉到 30，GGD 拉到 99。
  //   攻速是九條裡**唯一的乘法列**，所以只有它在等級外插下指數放大：
  //   敏捷中位 L30=70 → 2.39×，L99=197 → **4.95×**。
  agiToAttackSpeed: {
    overrides: "AgiAttackSpeedBonus",
    upstream: 0.02,
    why: "等級上限 30 → 99 之後，唯一的乘法列被指數外插（owner 2026-08-13）",
  },
  intToMaxMana: { field: "IntManaBonus" },
  // 🔴 owner 2026-08-20 覆寫：0.07 → 0.21（×3）。GH#446。
  //   「那我覺得**智慧影響回魔可以增加更多**、**初始回魔也增加少許**，
  //    同時 **20 秒的限制可以調高到 30 秒**」
  //   ⇒ 三個錨點的中位滿魔從 42.1/38.0/34.5 秒降到 14.9/13.8/12.9 秒。
  intToManaRegen: {
    overrides: "IntRegenBonus",
    upstream: 0.07,
    why: "回魔節奏：中位滿魔 42 秒 → 15 秒以內（owner 2026-08-20，GH#446）",
  },
  // Warcraft III has no 法強 attribute axis at all — the owner's own decision.
  intToAbilityPower: { ownerDesign: "IntAbilityPowerBonus" },
  // …and no 魔抗 ATTRIBUTE axis either (WC3's magic resistance is a per-unit
  // armour-type table, not a stat derived from 智慧). GH#221, owner 2026-07-30.
  intToMagicResist: { ownerDesign: "IntMagicResistBonus" },
};

/** Map value if the map overrides the field, else Blizzard's, else undefined. */
function sourceValue(field: string): { value: number; from: "map" | "blizzard" } | undefined {
  const fromMap = mapMisc[field];
  if (fromMap !== undefined) return { value: Number(fromMap), from: "map" };
  const fromStock = stockMisc[field];
  if (fromStock !== undefined) return { value: Number(fromStock), from: "blizzard" };
  return undefined;
}

/** 被取代的原作數值台帳 —— 第〇·六守則要求「分開不是丟掉」。 */
const SUPERSEDED = readFileSync(
  join(__dirname, "../../../../docs/legacy/_w3x-fidelity-superseded.md"),
  "utf8",
);

describe("三圍 coefficient provenance (#248 follow-up)", () => {
  it("attr-248-coef-provenance: every shipped coefficient equals its source file's field", () => {
    cover("attr-248-coef-provenance");

    // The two files must actually be the files we think they are, or an empty
    // parse would make every assertion below vacuously pass.
    expect(Object.keys(mapMisc).length).toBeGreaterThan(40);
    expect(Object.keys(stockMisc).length).toBeGreaterThan(8);

    const report: string[] = [];
    for (const key of Object.keys(FIELD_OF) as AttributeEnvKey[]) {
      const prov = FIELD_OF[key];
      if ("overrides" in prov) {
        // ① 上游來源仍然存在 —— 不然它該被改成 ownerDesign
        const src = sourceValue(prov.overrides);
        expect(src, `${key} 標成 override 但上游來源不見了`).toBeDefined();
        expect(src?.value, `${key} 記錄的上游值與檔案對不上`).toBe(prov.upstream);
        // ② 出貨值確實偏離了 —— 不然覆寫已經被撤銷，這一列該改回 field
        expect(
          ATTRIBUTE_ENV_DEFAULTS[key],
          `${key} 現在等於上游值了，把它改回 { field } 這一種`,
        ).not.toBe(prov.upstream);
        // ③ ⭐ 原作那個數字真的被另存了（第〇·六守則：分開不是丟掉）
        expect(
          SUPERSEDED,
          `${key} 的原作值 ${prov.upstream} 沒有記在 docs/legacy/_w3x-fidelity-superseded.md`,
        ).toContain(prov.overrides);
        report.push(
          `${key} = ${ATTRIBUTE_ENV_DEFAULTS[key]}  (owner 覆寫 ${src?.from}:${prov.overrides}=${prov.upstream} — ${prov.why})`,
        );
        continue;
      }
      if ("ownerDesign" in prov) {
        // Owner's design: assert NO upstream source has appeared. If a future
        // MiscGame/war3mapMisc gains such a field, this fails and someone has
        // to decide consciously whether to import it.
        expect(mapMisc[prov.ownerDesign], `${key} gained a map source`).toBeUndefined();
        expect(stockMisc[prov.ownerDesign], `${key} gained a stock source`).toBeUndefined();
        report.push(`${key} = ${ATTRIBUTE_ENV_DEFAULTS[key]}  (owner's design, no WC3 source)`);
        continue;
      }
      const { field } = prov;
      const src = sourceValue(field);
      expect(src, `no source found for ${key} (${field})`).toBeDefined();
      expect(ATTRIBUTE_ENV_DEFAULTS[key], `${key} must equal ${field} from the ${src?.from}`).toBe(
        src?.value,
      );
      report.push(`${key} = ${ATTRIBUTE_ENV_DEFAULTS[key]}  (${src?.from}:${field})`);
    }
    // NINE since GH#221 (智慧→魔抗 0.6); #248 shipped eight.
    expect(report).toHaveLength(9);
  });

  it("attr-248-coef-map-overrides: the four fields the map really does override", () => {
    cover("attr-248-coef-map-overrides");
    // Named individually because these are exactly the four where reading
    // Blizzard's default is the bug. If the map file is ever re-extracted and a
    // value moves, this says WHICH one moved rather than "something drifted".
    expect(Number(mapMisc["StrHitPointBonus"])).not.toBe(Number(stockMisc["StrHitPointBonus"]));
    expect(Number(mapMisc["StrRegenBonus"])).not.toBe(Number(stockMisc["StrRegenBonus"]));
    expect(Number(mapMisc["AgiDefenseBonus"])).not.toBe(Number(stockMisc["AgiDefenseBonus"]));
    expect(Number(mapMisc["IntRegenBonus"])).not.toBe(Number(stockMisc["IntRegenBonus"]));

    // …and the one the map deliberately leaves alone, which is why the fallback
    // rule has to exist at all.
    expect(mapMisc["AgiAttackSpeedBonus"]).toBeUndefined();
    // ⚠️ 2026-08-13：owner 覆寫了它（0.02 → 0.01），所以出貨值**不再等於**暴雪值。
    //   ⭐ 這一行改成釘住**上游那個數字沒有變** —— 覆寫的紀錄住在 FIELD_OF 的
    //     `{ overrides, upstream }`，那邊會逐條驗「上游仍在 / 確實偏離 / 原作值有另存」。
    //   ⛔ 不可以改成 `.toBe(0.01)`：那會把「暴雪說 0.02」這個事實從測試裡刪掉，
    //     而那正是這一條在守的東西。
    expect(Number(stockMisc["AgiAttackSpeedBonus"])).toBe(0.02);
  });

  it("attr-248-coef-unmodelled: the map constants GGD does NOT implement stay visible", () => {
    cover("attr-248-coef-unmodelled");
    // AgiDefenseBase: WC3 armour is `base + AgiDefenseBase + AgiDefenseBonus·AGI`.
    // GGD has no constant offset term, which reproduces the MAP's 0, not
    // Blizzard's −2. Pinned so that "GGD is faithful here" stays TRUE rather
    // than accidentally true.
    expect(Number(mapMisc["AgiDefenseBase"])).toBe(0);
    expect(Number(stockMisc["AgiDefenseBase"])).toBe(-2);

    // AgiMoveBonus: the map DOES grant move speed per agility (0.1/point) and
    // GGD models no such axis. This is an open gap for the owner, logged in
    // docs/_execution-batches.md — not something to invent here.
    expect(Number(mapMisc["AgiMoveBonus"])).toBe(0.1);
    expect(Number(stockMisc["AgiMoveBonus"])).toBe(0);
  });

  it("attr-248-coef-maxherolevel: the map's level cap is recorded, not silently ignored", () => {
    cover("attr-248-coef-maxherolevel");
    // war3mapMisc says 40 where Blizzard says 10 — that disagreement is the
    // proof the map's table is genuinely customised rather than a copy, which
    // is the whole reason the four overrides above must be believed.
    expect(Number(mapMisc["MaxHeroLevel"])).toBe(40);
    expect(Number(stockMisc["MaxHeroLevel"])).toBe(10);
  });
});
