import { z } from "zod";
import { zId } from "../common";
// 傷害五級距（GH#447）—— 唯一的**回報**軸。五個數字從冷卻表推導，
// 推導式與 owner 的兩條輸入寫在 content/damageTiers.ts。
import { DAMAGE_TIER_MAX, DAMAGE_TIER_MIN, DAMAGE_TIER_NAMES, DAMAGE_TIERS_DOC_ID, DEFAULT_DAMAGE_TIERS, KILL_CASTS_REF, SHIPPED_ANCHOR_LEVEL, anchorFloor, castsToKill, castsToKillBase } from "../../damageTiers";
import { BALANCE_ANCHOR_LEVELS, HARD_ANCHOR_LEVEL, HP_BASE_BONUS, MEDIAN_BASE_HP, medianFinalHp, medianBaseHp } from "../../balanceAnchors";
// ⭐ GH#992 —— 每一格「為什麼是這個數字」搬到 Zod 的 `.describe()`（原本住
//    `apps/admin/.../specs/tiers.ts`）。⛔ 一句人話只有一個住處（第〇·四守則）。
//    ⚠️ 每一個數字都**現算**：這一段在 2026-08-20 之前是手抄的（700 / 1,150 / 2,400⋯），
//    錨點換掉之後它整段變成謊話，而 `content:build` 與全套測試都是綠的。
import { minTierStep, tierRatios, tierStep } from "../../damageTiers";
import { DEFAULT_COOLDOWN_TIERS } from "../../cooldownTiers";

const RATIOS = tierRatios();
const SMALLEST_NAME = DAMAGE_TIER_NAMES[0]!;
const DAMAGE_TIER_WHY = DAMAGE_TIER_NAMES.map((tier, i) => {
  const dmg = DEFAULT_DAMAGE_TIERS.damage[tier];
  const share = ((dmg / DAMAGE_TIER_MAX) * 100).toFixed(0);
  if (i === 0) {
    const raw = (medianBaseHp(SHIPPED_ANCHOR_LEVEL) + HP_BASE_BONUS) / KILL_CASTS_REF;
    return (
      `⭐ **這一格是整張表的錨**，而且它是**算出來的**：` +
      `（LV${SHIPPED_ANCHOR_LEVEL} 的**純基礎**中位血量 ${medianBaseHp(SHIPPED_ANCHOR_LEVEL)}` +
      ` ＋ 初始加成 ${HP_BASE_BONUS}）÷ owner 的 ${KILL_CASTS_REF} 次 ＝ ${raw.toFixed(1)}` +
      `，進位到 ${tierStep()}（「使五格皆整數的最小單位」是 ${minTierStep()}，粒度取它的整數倍）⇒ **${dmg}**。` +
      `⛔⛔ **推導鏈裡一個系統倍率都沒有。** owner 2026-08-22：「你的傷害要從生命反推我沒意見，` +
      `但**不能把系統倍率乘進去再反推**啊，這樣我用系統倍率就沒意義了」；` +
      `2026-08-20：「不要計算 HP 系統倍率以及魔抗減傷 **會讓我誤判**」。` +
      `⚠️ 這一行在 2026-08-22 之前寫著「× HP 倍率」—— 而那正是讓 \`maxHealth\` 4.0／6.0／7.2 ` +
      `三個值**都落在 51% 左右**（一格轉不動任何東西）的原因。閘：\`pnpm echoloop:check\`。` +
      `⚠️ 一定要**進位** —— 捨去會差幾個 % 違反 owner 的 Q1，而且沒有任何東西會紅。`
    );
  }
  const line =
    `＝ 錨 × ${RATIOS[tier]}（單體冷卻 ${DEFAULT_COOLDOWN_TIERS.seconds["單體"][tier]} 秒 ÷ ` +
    `${DEFAULT_COOLDOWN_TIERS.seconds["單體"][SMALLEST_NAME]} 秒）。`;
  if (i < DAMAGE_TIER_NAMES.length - 1) return line;
  return (
    line +
    `＝ LV${HARD_ANCHOR_LEVEL} **引擎最終**中位血量的 **${share}%**` +
    `（${BALANCE_ANCHOR_LEVELS.map((lv) => `LV${lv} ${((dmg / medianFinalHp(lv)) * 100).toFixed(0)}%`).join(" / ")}）。` +
    `⚠️ 上界 **${DAMAGE_TIER_MAX}** ＝ **LV${HARD_ANCHOR_LEVEL}（hard limit）**的引擎最終中位血量：` +
    `超過它的一發就是**一發秒殺**，那不是傷害級距而是另一種設計。` +
    `⭐ 取最早會遇到它的那一級，⛔ 不是更高的錨點。`
  );
});

/**
 * config.damage-tiers@1 — 傷害**五級距**（GH#447）。
 *
 * owner 2026-08-19：「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**」+
 * Q1「單體 Q 冷卻 6 秒⋯**20 次以內一定要能殺死對方**」+
 * Q4「**不用**（γ 超線性）已經有**傷害相應的冷卻**做限制」。
 *
 * ⭐ owner 2026-08-20 的兩則更正：錨點是 **LV30(hard) / LV50(soft) / LV99(極限)**（⛔ 不是 Lv18），
 * 而出貨錨**就是 hard limit**（「拿 30 級的當標準就好」）—— ⛔ 不再是「滿足得了的最高那一個」。
 * 同一天第三則：「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」⇒ 魔抗那一層**整層退場**。
 *
 * ⛔ **這裡刻意不抄任何一個級距數字。** 五格與達成率都在
 * `content/damageTiers.ts` 現算，量到的血量由 `pnpm anchors:build` 寫進
 * `balanceAnchorsDerived.ts` —— 抄一份到這個檔頭就是**第二個住處**，
 * 而它會在下一次重量時無聲過期（這一段在 2026-08-20 就這樣說過一次謊）。
 * 每一格的完整推導鏈印在下面那個 `.describe()` 裡，⭐ 那一份是**算出來的**。
 *
 * ⚠️ 上界 = **hard limit 那一級的「引擎最終」中位血量**：超過它的一發就是一發秒殺，
 * 那不是一個傷害級距。取最早會遇到它的那一級，⛔ 不是更高的錨點。
 */
export const zConfigDamageTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-tiers@1"),
    note: z.string().optional(),
    /** 止血閥兼一鍵 rollback。false = `damageTier` 不解析（＝今天的那一套數字）。 */
    enabled: z
      .boolean()
      .describe("@zh 級距總開關\n" +
      "@note 關掉之後 `damageTier` 不解析，技能回到自己手寫的 `flat` / `perRank` —— ⭐ 那就是**一鍵回到重錨之前的那一套傷害**。⚠️ 關掉**不會**讓技能不再造成傷害。\n" +
      "關掉之後 `damageTier` 不解析，技能回到自己手寫的 flat / perRank ——一鍵 rollback。"),
    /** 級別 → 卡面基礎傷害。五格都必填。 */
    damage: z
      .object(
        Object.fromEntries(
          DAMAGE_TIER_NAMES.map((n, i) => [
            n,
            z
              .number()
              .min(DAMAGE_TIER_MIN)
              .max(DAMAGE_TIER_MAX)
              .describe(
                // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
                `@zh ${n} — 基礎傷害\n` +
                  `@note 填 \`damageTier: "${n}"\` 的那一格實際打多少（卡面值，上場還要乘「戰鬥系統」頁的 \`damageDealt\` 與對方的減免）。` +
                  `改這一格，樹上每一處標成「${n}」的傷害同時跟著變。${DAMAGE_TIER_WHY[i]}` +
                  `「${n}」的卡面基礎傷害。⭐ 五格由 \`pnpm anchors:build\` 推導，⛔ 不要手打 ——` +
                  `純基礎中位血量 ${MEDIAN_BASE_HP[HARD_ANCHOR_LEVEL]}（LV${HARD_ANCHOR_LEVEL}，⛔ 無倍率⛔ 無加成⛔ 無魔抗）` +
                  `（＋初始加成 ${HP_BASE_BONUS}）÷ ${KILL_CASTS_REF} 發` +
                  `→ 進位到「使五格皆整數」的粒度 ⇒ 極小 ${anchorFloor(HARD_ANCHOR_LEVEL)}。` +
                  `⛔⛔ **推導鏈裡一個系統倍率都沒有** —— owner 2026-08-22：「你的傷害要從生命反推我沒意見，` +
                  `但**不能把系統倍率乘進去再反推**啊，這樣我用系統倍率就沒意義了」「對 我說過**這是我人工的旋鈕**，` +
                  `並沒有放在公式裡」。⚠️ 這一行在 2026-08-22 之前寫著「× HP 倍率」，而那正是讓 ` +
                  `\`maxHealth\` 4.0 / 6.0 / 7.2 三個值都落在 51% 左右（**一格轉不動任何東西**）的原因。` +
                  `閘：\`pnpm echoloop:check\`。` +
                  `其餘四格與單體冷卻表嚴格成正比 ⇒ ` +
                  `${DAMAGE_TIER_NAMES.map((k) => `${k} ${DEFAULT_DAMAGE_TIERS.damage[k]}`).join(" / ")}。` +
                  `出貨錨＝hard limit LV${SHIPPED_ANCHOR_LEVEL}（owner 2026-08-20「拿 30 級的當標準就好」）。` +
                  `⭐ 設計承諾的達成率（分母＝**純基礎＋加成**，⛔ 不是引擎最終血量；門檻 ${KILL_CASTS_REF} 發）：` +
                  `${BALANCE_ANCHOR_LEVELS.map((lv) => {
                    const n2 = castsToKillBase(lv, DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[0]]);
                    return `LV${lv} ${n2.toFixed(1)} 發 ${n2 <= KILL_CASTS_REF ? "✅" : "❌"}`;
                  }).join(" · ")}。` +
                  `⚠️ **玩家實際**要打幾發是另一個數字（含系統倍率）：` +
                  `${BALANCE_ANCHOR_LEVELS.map((lv) => {
                    const n3 = castsToKill(lv, DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[0]]);
                    return `LV${lv} ${n3.toFixed(1)} 發`;
                  }).join(" · ")}。` +
                  `⭐ 兩者**刻意不相等**，差距就是 HP 系統倍率本身 —— 那正是 owner 要的旋鈕。` +
                  `⛔ 拿「玩家實際」那一欄去對門檻是**兩個空間混算**（2026-08-22 抓到：三個錨點全印 ❌ 而閘是綠的）。` +
                  `上界 ${DAMAGE_TIER_MAX} = LV${HARD_ANCHOR_LEVEL} 的**引擎最終**中位血量 ${medianFinalHp(HARD_ANCHOR_LEVEL)}：超過它的一發就是一發秒殺。`,
              ),
          ]),
        ) as Record<(typeof DAMAGE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_DAMAGE_TIERS_DOC = {
  id: DAMAGE_TIERS_DOC_ID,
  schema: "config.damage-tiers@1",
  enabled: DEFAULT_DAMAGE_TIERS.enabled,
  damage: DEFAULT_DAMAGE_TIERS.damage,
} as const;
