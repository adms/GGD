/**
 * ⭐⭐【平衡錨點 —— **固定數值**，⛔ 不再取名單中位】
 *
 * owner 2026-09-12（逐字，三則）：
 * > 「這個中位數是**相對所有出身**而言 不是指所有角色 **不然這個值會變動到停不下來**」
 * > 「⋯以後**固定數值 别再取中位數了**」
 * > 「這些常數是**可被編輯的設定檔** 而非寫死」
 *
 * ⛔ 在此之前這兩組數字是 `median(每一張出貨卡)` 算出來的
 * ⇒ ⭐ **上架一批英雄，全遊戲的傷害刻度與每一項屬性上限就重算一次**。
 * ⚠️ 實測（2026-09-12）：81 名上架之後傷害五級距自動降 20%、耗魔降 24%、
 * `maxHealth` 上限 402,129 → 567,600 —— ⛔ 而那**不是任何人的決定**。
 *
 * ⭐ 現在它們是**這一份設定檔**，owner 在後台就改得到（第一守則）。
 *
 * ⚠️ ⭐ 兩支產生器仍然**量**名單中位並印出偏差（> 10% 印一行）——
 * ⛔ 值不會自己動，⭐ 但「固定值與世界脫節」看得見
 * （CLAUDE.md：fail-open 沒錯，**靜默才是缺陷**）。
 */
import { z } from "zod";
import { zId } from "../common";

/** ⭐ 三個錨點等級（owner 2026-09-06：「已經改成 **30/50/99 三個標準**了」）。 */
const lvl = (n: 30 | 50 | 99, what: string) =>
  z
    .number()
    .min(0)
    .max(10_000_000)
    .describe(
      `@zh LV${n} ${what}\n` +
        `@note ⭐ **LV${n} 這個錨點**的${what}（純基礎空間：⛔ 無系統倍率、⛔ 無初始加成）。` +
        (n === 30
          ? "⚠️ LV30 是 **hard limit**（一定要滿足）——⭐ 五級距就是從這一格反推的。"
          : n === 50
            ? "⭐ LV50 是 **soft limit**（能滿足比較好）。"
            : "⭐ LV99 是**極限**（不要求滿足）。"),
    );

const zByLevel = z
  .object({
    30: lvl(30, "值"),
    50: lvl(50, "值"),
    99: lvl(99, "值"),
  })
  .strict();

/** ⭐ 屬性上限用得到的七項（`DERIVED_CAP_STATS`）。 */
const STAT_KEYS = ["maxHealth", "maxMana", "healthRegen", "manaRegen", "ad", "armor", "mr"] as const;

export const zConfigBalanceAnchorsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.balance-anchors@1"),
    note: z.string().optional(),
    /**
     * ⛔ 關掉 ⇒ 兩支產生器**回到取名單中位**（＝ 2026-09-12 之前的行為）。
     * ⭐ 這是一鍵 rollback，⛔ 不是「關掉就沒有錨點」。
     */
    enabled: z.boolean().describe(
      "@zh 固定錨點總開關\n" +
        "@note ⭐ **一鍵回頭**：關掉之後錨點回到「取名單中位」——⚠️ 那會讓傷害刻度與屬性上限**再度隨上架名單漂動**。",
    ),
    /** ⭐ 五級距的分母（純基礎空間，⛔ 無系統倍率、⛔ 無初始加成）。 */
    baseHp: zByLevel.describe(
      "@zh 血量錨點（純基礎）\n@note ⭐ **傷害與耗魔五級距的分母**。⚠️ 動它 = 全遊戲每一支技能的傷害同時變。",
    ),
    baseMana: zByLevel.describe(
      "@zh 魔力錨點（純基礎）\n@note ⭐ **耗魔五級距的分母**。",
    ),
    /** ⭐ 屬性上限的基礎中位；上限 = 這個值 × `STAT_CAP_MULTIPLE`。 */
    statMedian: z
      .object(Object.fromEntries(STAT_KEYS.map((k) => [k, zByLevel])) as Record<
        (typeof STAT_KEYS)[number],
        typeof zByLevel
      >)
      .strict()
      .describe("@zh 屬性上限的基礎中位\n@note ⭐ 上限 = 這個值 × 倍數。⚠️ 動它 = 玩家堆得到的天花板跟著動。"),
  })
  .strict();

export type ConfigBalanceAnchorsDoc = z.infer<typeof zConfigBalanceAnchorsDoc>;

/** ⭐ 出貨值 —— 2026-09-12「逐出身梯子」落地之後量到的那一組。 */
export const DEFAULT_BALANCE_ANCHORS: Omit<ConfigBalanceAnchorsDoc, "id" | "schema" | "note"> =
  Object.freeze({
    enabled: true,
    baseHp: { 30: 2838, 50: 4438, 99: 8358 },
    baseMana: { 30: 1745, 50: 2745, 99: 5195 },
    statMedian: {
      maxHealth: { 30: 2838, 50: 4438, 99: 8358 },
      maxMana: { 30: 1745, 50: 2745, 99: 5195 },
      healthRegen: { 30: 4.645, 50: 7.165, 99: 13.26 },
      manaRegen: { 30: 6.24, 50: 7.205, 99: 7.5 },
      ad: { 30: 107.66, 50: 163.02, 99: 315 },
      armor: { 30: 23.1, 50: 34.27, 99: 61.64 },
      mr: { 30: 76.555, 50: 117.48, 99: 206.96 },
    },
  });
