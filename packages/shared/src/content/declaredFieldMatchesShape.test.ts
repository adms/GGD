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
  // ⭐⭐ GH#1211（2026-09-11）：`cooldownArrayAlongsideTier` **從棘輪裡拿掉了**。
  //
  // ⚠️ 它今天量到 **739**（上限 334）—— ⛔ 而那**不是**「又多了 405 支壞技能」：
  //   342 → 739 純粹是 2026-09-10／11 上架 81 名英雄，他們的技能**用同一種合法寫法**。
  //
  // ⭐ 而這一條規則的本體，這個檔案自己的檔頭已經下過結論（逐字）：
  //   > ⭐⭐ **342 支**，⛔ 而它**不是第二個住處**：`resolveCooldownTier()` 在**載入時**
  //   > 把整個陣列覆寫成級距解出來的值 ⇒ 那些數字是**被覆寫的殘留**
  //   > ⇒ ⭐ ③ 從「**修 342 份檔**」變成「**釘住那個覆寫真的還在**」
  //
  // ⇒ ⛔ 既然它不是缺陷，「⭐ 只能變少」就是**錯的儀器**：
  //   那個數字會**跟著名冊成長**，而每一次上架新英雄都會讓這條閘紅 ——
  //   ⭐ 訊息還會說「⇒ 修那一支，⛔ 不是把上限調大」，⛔ 而根本沒有「那一支」可修。
  //   ⚠️ 一條會在正常成長時開火、而修法建議指向不存在的東西的閘，
  //   ⭐ 只會教人「把上限調大」—— 那才是真正的損失。
  //
  // ⭐ 承重的那一條**留著而且是綠的**：本檔的
  //   「⭐⭐⭐ **③ 的承重條**：級距真的會把 `cooldown` 陣列覆寫掉」。
  //   ⇒ 「級別贏」被拿掉的那一刻，那 739 個殘留會變成活的第二份住處 —— ⭐ 而**那一條**會紅。
  //   ⛔ 這次拿掉的只有「數量只能變少」，⛔ 不是那個性質。
  // ⭐⭐ `basicAttackHookNotOnCard` 也**不在**這張表了（GH#1239，2026-09-15）：它歸零了，
  //   ⇒ 改成下面那一條**零容忍**的名單斷言（⛔ 一個上限 0 的數字只說得出「多了」，說不出「是哪一支」）。
});

describe("宣告的欄位與實際結構相符（GH#948）", () => {
  it("⭐ 儀器：普查真的掃到了技能（⛔ 否則下面全是 0 ≤ 上限）", () => {
    expect(census.counts["abilities"], "⛔ 一支技能都沒掃到").toBeGreaterThan(300);
  });

  it("⭐⭐ 規則都**只能變少**（⛔ 新增一支不符就紅）", () => {
    for (const [k, cap] of Object.entries(CEIL)) {
      expect(
        census.counts[k],
        `⛔ ${k}：${census.counts[k]} > 上限 ${cap} ⇒ 又多了一支「宣告與實際不符」的技能。\n` +
          "   ⇒ 修那一支，⛔ 不是把上限調大。",
      ).toBeLessThanOrEqual(cap);
    }
  });

  /**
   * ⭐⭐ 掛 `onBasicAttack` 的技能，卡面（剝台詞後）一定要讓玩家讀得到「普攻觸發」（GH#1239）。
   *
   * 2026-09-15 歸零的三條路（⛔ 沒有一條是「把『攻擊時』硬寫上卡」）：
   * - 26（＋5 支早已出普查的同型）社群天生技：卡面組成與同一名英雄 Q/W/E/R **同一個三行格式**
   *   —— 【目前模板可執行】（recipe `currentBehavior`，與出貨 JSON 推導的那一句逐字比對過）／
   *   【目標設計】（原始描述逐字）／【待補機制】（`requiredRefinement` 逐字）。
   *   組字住 `tools/ship-81/passive_card.py` 一處（匯入器 `gen.py` 也呼叫它）。
   *   ⛔ 真正要的 hook 還沒做 —— 那一半留在 `requiredRefinement` 與 GH#1239 的 B 段，⛔ 沒有被這一次宣告做完。
   * - 92-04 馬勒戈壁 · 30-002 變態紳士：卡面**本來就說了**「攻擊身上有⋯的敵人」⇒ 補偵測器詞表。
   * - 77-002 御雷劍：那條 40% 落雷 hook 在五層裡一層都沒有、而且與 augment 重複計數 ⇒ **拿掉 hook**。
   */
  it("⭐ `onBasicAttack` 上卡：名單必須是空的", () => {
    expect(
      census.basicAttackHookNotOnCard.map((r) => r.id),
      "⛔⛔ 這幾支掛了 `onBasicAttack` 而卡面沒說「普通攻擊」—— ⭐ 三種可能，先分清楚再動手：\n" +
        "   ① 卡面**其實說了**但用了新的詞 ⇒ 去 `tools/declared-shape/gen.ts` 把那個詞加進\n" +
        "      `ON_BASIC_ATTACK_SAID`（⚠️ 這個病 2026-09-07、09-12、09-15 已經各犯過一次）\n" +
        "   ② 它借了 `onBasicAttack` 頂著一個引擎還沒有的 hook ⇒ 卡面照實寫出**目前**發生的事\n" +
        "      （社群英雄走 `tools/ship-81/passive_card.py` 的三行格式），⛔ 並把真正要的 hook 留在待補\n" +
        "   ③ 那個 hook 在設計的五層裡**一層都沒有** ⇒ 拿掉 hook（77-002 御雷劍的前例）\n" +
        "   ⛔ 三者都**不是**「把上限調大」。",
    ).toEqual([]);
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
