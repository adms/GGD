/**
 * ⭐⭐ **宣告的欄位要與實際的結構／卡面相符**（GH#948）。
 *
 * ## ⛔⛔ 前提回驗把票文的四個數字改了三個
 *
 * | # | 票文 | ⭐ 掃描器量到 |
 * |---|---|---|
 * | ① 被動帶吟唱 | 34 | ⭐ **34** ✅ |
 * | ② 卡面「大範圍」而級距不是大 | 1（`godie-ewar.r`） | ⭐ **7** —— 含它的變身對 `godie-e007.r` |
 * | ③ 冷卻陣列 ＋ 級距並存 | 暗示少數幾支、且是「第二個住處」 | ⭐⭐ **342**，⛔ 而它**不是第二住處**（見下） |
 * | ④ `onBasicAttack` 沒上卡 | 1（`77-002`） | ⭐ **18** |
 *
 * ## ⭐⭐ ③ 的意義被完全推翻了
 *
 * `resolveCooldownTier()`（`cooldownTiers.ts:234`）在**載入時**把整個
 * `cooldown` 陣列**覆寫**成級距解出來的值：
 *
 * ```ts
 * return { ...def, cooldown: cd.map(() => secs) };
 * ```
 *
 * ⇒ ⭐ 那 342 個陣列是**被覆寫的殘留**，⛔ 不是活著的第二份。
 * ⇒ ⛔ 「修 342 份檔」是**錯的工作** —— ⭐ 對的工作是**釘住那個覆寫還在**：
 *   ⚠️ 若哪天「級別贏」被改掉，那 342 個殘留數字會**當場變成活的**，
 *   而 ⛔ 沒有任何東西會紅。
 *
 * ## ⭐ ① 今天**還沒發生** —— 它是預防，⛔ 不是止血
 *
 * 票文說「⭐⭐ AP 係數公式的吟唱項 `1 + 0.5×min(t,1.0)` **會照收**」——
 * ⭐ 而那條公式是 **#942 要建的**，今天**還不存在**。
 * ⇒ 這一條的價值是：#942 落地時，**這個數字必須是 0** ——
 *   ⛔ 否則 34 支被動白拿最多 +50% 係數。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCooldownTier } from "./cooldownTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const census = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-declared-shape-census.json"), "utf8"),
) as {
  counts: Record<string, number>;
  passiveWithCastTime: Array<{ id: string; castTimeSec: number }>;
  cardSaysWideButTierIsNot: Array<{ id: string }>;
  basicAttackHookNotOnCard: Array<{ id: string }>;
};

/** ⭐ 棘輪 —— **只能變小**。2026-09-02 量到的四個數字。 */
const CEIL = Object.freeze({
  passiveWithCastTime: 34,
  cardSaysWideButTierIsNot: 7,
  cooldownArrayAlongsideTier: 342,
  basicAttackHookNotOnCard: 18,
});

describe("宣告的欄位與實際結構相符（GH#948）", () => {
  it("⭐ 儀器：普查真的掃到了技能（⛔ 否則下面全是 0 ≤ 上限）", () => {
    expect(census.counts["abilities"], "⛔ 一支技能都沒掃到").toBeGreaterThan(300);
  });

  it("⭐⭐ 四條規則都**只能變少**（⛔ 新增一支不符就紅）", () => {
    for (const [k, cap] of Object.entries(CEIL)) {
      expect(
        census.counts[k],
        `⛔ ${k}：${census.counts[k]} > 上限 ${cap} ⇒ 又多了一支「宣告與實際不符」的技能。\n` +
          "   ⇒ 修那一支，⛔ 不是把上限調大。",
      ).toBeLessThanOrEqual(cap);
    }
  });

  it("⭐⭐⭐ **③ 的承重條**：級距真的會把 `cooldown` 陣列覆寫掉", () => {
    // ⛔⛔ 這一條才是 ③ 的本體。那 342 個陣列今天是**殘留**（載入時被覆寫），
    // ⭐ 而它們會在「級別贏」被拿掉的那一刻**變成活的第二份住處** ——
    // ⛔ 而沒有任何東西會紅。⇒ 這一條就是那個「東西」。
    const tiers = JSON.parse(
      readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
    ) as Parameters<typeof resolveCooldownTier>[1];
    const before = { cooldownTier: "中", cooldown: [999, 999, 999, 999], castType: "point" };
    const after = resolveCooldownTier(before, tiers) as { cooldown: number[] };
    expect(
      after.cooldown.every((n) => n !== 999),
      "⛔⛔ 級距**沒有**覆寫 `cooldown` 陣列 ⇒ ⭐ 那 342 個殘留數字**當場變成活的第二份住處**，\n" +
        "   而卡面與引擎會照不同的數字走（第〇·四守則）。",
    ).toBe(true);
    expect(new Set(after.cooldown).size, "⛔ 覆寫後每一階不一致").toBe(1);
  });

  it("⭐ ① 是**給 #942 的約束**：被動的吟唱項必須是 0", () => {
    // ⚠️ 那條公式今天**還不存在** ⇒ 這一條驗的是「⭐ 標本還在」，
    //   ⛔ 而不是假裝已經修好了（第一·五守則：不要宣稱沒發生的事）。
    expect(
      census.passiveWithCastTime.length,
      "⛔ 一支帶吟唱的被動都沒有 ⇒ 這一條在量空氣（或它已經被修好了 ⇒ 把上限調成 0）",
    ).toBeGreaterThan(0);
    for (const r of census.passiveWithCastTime) {
      expect(r.castTimeSec, `${r.id}: 吟唱時間不是正數`).toBeGreaterThan(0);
      expect(r.id, `${r.id} 不是被動槽`).toMatch(/\.passive$/);
    }
  });
});
