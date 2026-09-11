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
  // ⭐ 2026-09-07：18 → 3 —— ⛔ **不是放寬**，是判準修對了：原本只認「攻擊時」三個字，
  //    而 19 支裡有 16 支的卡面用「普攻」寫著同一件事（假陽性 84%，逐支複查過）。
  //    剩下的 3 支（77-002 御雷劍 · 92-04 馬勒戈壁 · 30-002 變態紳士）卡面真的沒提。
  basicAttackHookNotOnCard: 3,
});

/**
 * ⭐⭐ `onBasicAttack` **被當成別的 hook 的替身**的那 29 支（GH#1239）。
 *
 * ⛔ 這張名單**只能變短** —— ⛔ 而它**不是**「卡面忘了寫攻擊時」：
 * 逐支讀完卡面之後，它們描述的觸發條件**根本不是普攻**：
 *
 * | 卡面說的 | 擋住幾支 |
 * |---|---:|
 * | 資源／能源 | 6 · 其他 6 · 技能命中（非普攻）5 · 受擊／交鋒 5 |
 * | 友軍互動 3 · 助攻／擊殺 2 · 召喚物／陷阱 1 · 靜止／位移 1 | |
 *
 * 逐字例：`community-review-01`「**召喚物命中與陷阱成功觸發**」·
 * `community-review-09`「**參與有效助攻**」·`community-review-13`「**保持穩定姿勢**」。
 *
 * ⇒ ⭐⭐ **把「攻擊時」寫上這 29 張卡，只會讓它們用另一種方式說謊。**
 *   ⛔ 錯的不是文字，是引擎**沒有那些 hook** ⇒ 走第〇·五守則：
 *   盤點 → 按**擋住的支數**做機制 ⇒ 7 個機制解鎖 29 支，⛔ 不是 29 輪改文案。
 *
 * ⚠️ ⭐ 名單在這裡而**不是把上限從 3 調到 29** —— 上限調大會讓**下一支**
 *   真的「卡面忘了寫」的技能靜靜地混進來，⭐ 而那正是這條閘要抓的東西。
 */
const BASIC_ATTACK_PLACEHOLDER: ReadonlySet<string> = new Set([
  "community-review-01-20260907.passive",
  "community-review-02-20260907.passive",
  "community-review-04-20260907.passive",
  "community-review-05-20260907.passive",
  "community-review-07-20260907.passive",
  "community-review-09-20260907.passive",
  "community-review-10-20260907.passive",
  "community-review-12-20260907.passive",
  "community-review-13-20260907.passive",
  "community-review-15-20260907.passive",
  "community-review-16-20260907.passive",
  "community-review-18-20260907.passive",
  "community-review-19-20260907.passive",
  "community-review-20-20260907.passive",
  "community-review-21-20260907.passive",
  "community-review-23-20260907.passive",
  "community-review-24-20260907.passive",
  "community-review-26-20260907.passive",
  "community-review-27-20260907.passive",
  "community-review-28-20260907.passive",
  "community-review-29-20260907.passive",
  "community-review-30-20260907.passive",
  "community-review-32-20260907.passive",
  "community-review-34-20260907.passive",
  "community-review-36-20260907.passive",
  "community-review-37-20260907.passive",
  "godie-e00w.ex",
  "godie-h02v.r",
  "godie-o030.ex",]);

describe("宣告的欄位與實際結構相符（GH#948）", () => {
  it("⭐ 儀器：普查真的掃到了技能（⛔ 否則下面全是 0 ≤ 上限）", () => {
    expect(census.counts["abilities"], "⛔ 一支技能都沒掃到").toBeGreaterThan(300);
  });

  it("⭐⭐ 四條規則都**只能變少**（⛔ 新增一支不符就紅）", () => {
    for (const [k, cap] of Object.entries(CEIL)) {
      // ⭐ `basicAttackHookNotOnCard` 走**名單**而不是數字（見上面那段）——
      //   ⛔ 名單外的任何一支仍然紅，⭐ 而名單上修好的也要被拿掉（下一條）。
      if (k === "basicAttackHookNotOnCard") continue;
      expect(
        census.counts[k],
        `⛔ ${k}：${census.counts[k]} > 上限 ${cap} ⇒ 又多了一支「宣告與實際不符」的技能。\n` +
          "   ⇒ 修那一支，⛔ 不是把上限調大。",
      ).toBeLessThanOrEqual(cap);
    }
  });

  it("⭐ `onBasicAttack` 替身：名單外的一律紅（⛔ 不是把上限調大）", () => {
    const extra = census.basicAttackHookNotOnCard
      .map((r) => r.id)
      .filter((id) => !BASIC_ATTACK_PLACEHOLDER.has(id));
    expect(
      extra,
      "⛔⛔ 這幾支掛了 `onBasicAttack` 而卡面沒說「普通攻擊」——\n" +
        "   ⭐ 兩種可能，先分清楚再動手：\n" +
        "   ① 卡面**其實說了**但用了新的詞 ⇒ 去 `tools/declared-shape/gen.ts` 把那個詞加進\n" +
        "      `ON_BASIC_ATTACK_SAID`（⚠️ 這個病 2026-09-07 與 09-12 已經各犯過一次）\n" +
        "   ② 這支的觸發條件**根本不是普攻** ⇒ 它借了 `onBasicAttack` 頂著（GH#1239）\n" +
        "      ⇒ 補進 `BASIC_ATTACK_PLACEHOLDER` 並在那一段寫下它**真正**要的 hook。\n" +
        "   ⛔ 兩者都**不是**「把『攻擊時』寫上卡面」。",
    ).toEqual([]);
  });

  it("⭐ 替身名單只能變短（⛔ 修好了還留在名單上也紅）", () => {
    const live = new Set(census.basicAttackHookNotOnCard.map((r) => r.id));
    const healed = [...BASIC_ATTACK_PLACEHOLDER].filter((id) => !live.has(id));
    expect(
      healed,
      "⭐ 這幾支已經不在普查裡了 —— 把 id 從 `BASIC_ATTACK_PLACEHOLDER` 拿掉。\n" +
        "⛔ 不拿掉的話，這張名單會與世界脫節，而脫節的名單會讓上面那條開始放行真的缺陷。",
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
