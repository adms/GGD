/**
 * `config.ap-coefficient@1` —— ⭐⭐ **AP 係數的六維公式**（GH#942）。
 *
 * ## ⛔ 它取代的是「148 個手填的數字」
 *
 * `ratios[].coeff` 今天是 148 個手填值（19 種相異值，0.1 → 7.0，**70 倍**）——
 * ⭐ 那違反第〇·四守則：**一個算得出來的值被烘進每一份文件**。
 *
 * ⇒ ⭐ 改公式從「重寫 148 個數字」變成「**改一格表 + 跑一次產生器**」。
 *
 * ## ⭐ 六個維度（⛔ 不是五個）
 *
 * ```
 * coeff = BASE × 冷卻 × 吟唱 × 距離 × 目標形狀 × 條件 × 基礎值補償
 * ```
 *
 * ⚠️ ⭐ **第六維是 owner 逐字補的**（2026-09-02 00:34）：
 * > 「有時候技能本身如果**基礎傷害低**，我也會用**高 AP/AD 加成來彌補**，
 * >  **也請你考量這個變因**」
 *
 * ⛔ 而前五維量的全是「這一發要付出什麼**代價**」——
 * ⭐ 沒有一項在問「這一發的**基礎值**有多少」。
 *
 * ⇒ ⛔ **只做五維的後果是可預測的**：一支 `damageTier: 極小` 而 owner 刻意
 * 給 7.0 AP 的技能，公式會把那個 7.0 判成**離群值收掉** —— ⭐ 而那正是他的設計意圖。
 *
 * ## ⭐⭐ `base` 是**校準**出來的，⛔ 不是挑的
 *
 * 全庫 **135** 條 `ap` ratio（2026-09-06 重校準；在此之前是 154 個節點 · 0.6163 / 4.6975 ⇒ 0.1312）：
 * · 現況 `coeff` 幾何平均 = **0.6988**
 * · 公式（`base=1` 時）幾何平均 = **4.8507**
 * ⇒ ⭐ `base` = **0.1441**（總量守恆）。
 *
 * ⚠️ ⭐ 2026-09-06 為什麼重校準：owner「重新用公式判斷 看是不是判斷錯了」量到**讀標籤那一層**四個
 * 系統性誤判（冷卻表以節點判 · 形狀看不到祖先 `damageArea` · 普攻 hook 當 60 秒大招 · 條件以節點判且
 * 看不到 EX／祖先 hook）—— 判準改了，六維乘積的幾何平均跟著改 ⇒ `base` 照同一個程序重量，
 * ⛔ 不是調水位（`apCoefficient.test.ts` 的「校準成立」是這件事的閘）。
 *
 * ⚠️⚠️ ⭐ **而它必須走出貨的 `apCoeffInputsFrom` 量** —— 我第一次用一支離線
 * 腳本算出 **0.1099**，差了 **19%**，⛔ 因為那支腳本自己重寫了一份輸入推導
 * （形狀判定、冷卻解析、被動吟唱）。⇒ ⭐ 這正是「量出貨的那一個」的價值
 * （CLAUDE.md 失敗形態⑤：被測的不是出貨的那個）。
 *
 * ⚠️⚠️ ⛔ **計畫書寫的 `0.225` 是五維的值** —— 加了第六維直接沿用它，
 * 全庫會**通膨將近一倍**（眾數那一格 `小` 佔 87 個節點，補償 1.3×）。
 * ⇒ ⭐ 這就是 owner 逐字警告的「⛔ 不可以直接乘上去」。
 *
 * ## ⭐ 兩格 owner 旋鈕（⛔ 預設就是他勾過的）
 *
 * · `globalMult`（預設 **1.0**）—— 整體水位。> owner：「建議取 ⓑ⋯**=> ok**」
 * · `cooldownSlopeExp`（預設 **1.0** ＝線性）。> owner：「1.00 ⋯ **建議 ok**」
 *
 * ⭐ 而 `baseTierCompensation.enabled: false` **一鍵回到五維公式**。
 */
import { z } from "zod";
import { zId } from "../common";
import { SKILL_TIER_NAMES } from "../../skillTiers";

/** ⭐ 五格逐字對到 `SKILL_TIER_NAMES` —— ⛔ 不在這裡再抄一份級距名。 */
const zByTier = (min: number, max: number) =>
  z
    .object(
      Object.fromEntries(SKILL_TIER_NAMES.map((n) => [n, z.number().min(min).max(max)])) as Record<
        (typeof SKILL_TIER_NAMES)[number],
        z.ZodNumber
      >,
    )
    .strict();

export const zConfigApCoefficientDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ap-coefficient@1"),
    note: z.string().optional(),
    /** ⛔ 止血閥：false ⇒ 完全走文件上寫死的 `coeff`（＝2026-09-02 之前的行為）。 */
    enabled: z.boolean(),
    /**
     * ⭐⭐ **校準常數**（⛔ 不是「挑一個好看的數字」）。
     * 出貨 **0.1441** ＝ 現況幾何平均 ÷ 六維乘積幾何平均（總量守恆；2026-09-06 判準修正後重校準）。
     * ⚠️ ⛔ 改任何一個維度的表 ⇒ **這一格要重新校準**，⛔ 不是憑感覺調。
     */
    base: z.number().min(0.001).max(10),
    /** ⭐ owner 旋鈕：整體水位。出貨 1.0。 */
    globalMult: z.number().min(0.1).max(10),
    /** ⭐ owner 旋鈕：冷卻斜率指數。出貨 1.0 ＝線性。 */
    cooldownSlopeExp: z.number().min(0.1).max(3),
    cooldown: z
      .object({
        /**
         * ⭐ 用**該形狀的「中」格**正規化（⛔ 不是寫死 30 秒）——
         * ⚠️ 單體「中」是 30 秒而範圍「中」是 60 秒，⛔ 用同一個分母會讓
         * 範圍技全部拿到兩倍的冷卻乘數。
         */
        normalizeToMidOfShape: z.boolean(),
        scale: z.number().min(0.1).max(5),
        min: z.number().min(0.01).max(1),
        max: z.number().min(1).max(10),
      })
      .strict(),
    castTime: z
      .object({
        // ⚠️ ⭐ 上界是**必要的**（第一守則逐字：「欄位要有上界，不是只有下界」）——
        //   打錯一個 0 會過後台、在下游才被拒或被靜默夾掉（同 #277）。
        base: z.number().min(0.1).max(5),
        slope: z.number().min(0).max(5),
        capSec: z.number().min(0).max(10),
      })
      .strict(),
    range: z
      .object({
        reference: z.number().min(0.1).max(50),
        exponent: z.number().min(0).max(2),
        /** ⭐ 施法距離 0（自我中心）⇒ 用這個值（＝最貼臉）。 */
        selfCenteredAs: z.number().min(0.1).max(50),
      })
      .strict(),
    shape: z
      .object({
        single: z.number().min(0.1).max(10),
        line: z.number().min(0.1).max(10),
        area: z.object({ reference: z.number().min(0.1).max(50), exponent: z.number().min(0).max(2) }).strict(),
      })
      .strict(),
    /** ⭐ 條件五級距 —— 判準是「**這個條件我自己控制得了嗎**」。 */
    condition: zByTier(0.1, 10),
    /**
     * ⭐⭐ **觸發頻率的三把尺**（GH#939）—— owner 2026-09-02 逐字核准：
     * > 「我贊同你的新三類五級距（**普攻 0.10/0.16/0.33/0.70/1.00** ·
     * >  **技能 0.30/0.50/0.60/0.80/1.00** · **特殊條件 0.50/0.60/1.20/3.00/7.00**）」
     *
     * ⛔⛔ **為什麼一把尺抓不平**（owner 同一則的前半逐字）：
     * > 「AP 加成有比較多條件變因⋯**頻率[每次攻擊/技能施展/技能標籤變身反彈等特殊條件]**
     * >  ⋯請你提建議而非**一把尺抓平**」
     *
     * ⭐ 量到的實例（GH#946）：92-04 的 3.0×AP 掛在 `onBasicAttack` 上，
     * 而 6 秒窗口內普攻約 4 次 ⇒ **等效 12×AP**，⛔ 而全庫中位是 0.6。
     * ⇒ ⭐ **同一個數字在三種頻率下不是同一件事** —— 那正是三把尺存在的理由。
     *
     * ⚠️ ⭐ 三把尺**刻意不共用形狀**：
     * · `basicAttack` 上限 **1.00** —— 它每秒觸發，⛔ 再高就是全遊戲最大輸出
     * · `abilityCast` 下限 **0.30** —— 一次施放要付冷卻與耗魔，⛔ 給太低等於沒有回報
     * · `specialCondition` 到 **7.00** —— 它要先滿足一個玩家控制不了的前提
     */
    frequency: z
      .object({
        /** 每次普攻都會觸發（`onBasicAttack`）。⭐ 上限 1.00。 */
        basicAttack: zByTier(0.01, 3),
        /** 一次技能施放。⭐ 這是**基準**那一把尺。 */
        abilityCast: zByTier(0.01, 3),
        /** 變身／反彈／標籤等**玩家控制不了**的前提。⭐ 上限最高。 */
        specialCondition: zByTier(0.01, 20),
      })
      .strict(),
    /**
     * ⭐⭐ **第六維**（owner 2026-09-02 逐字補的）。
     * ⛔ `enabled: false` ⇒ 全部視為 1.0 ＝**一鍵回到五維公式**。
     */
    baseTierCompensation: z
      .object({
        enabled: z.boolean(),
        byDamageTier: zByTier(0.1, 5),
        /** ⭐ 沒有 `damageTier` 的節點用哪一格 —— 出貨 1.3（＝眾數「小」）。 */
        whenTierAbsent: z.number().min(0.1).max(5),
      })
      .strict(),
  })
  .strict();

export type ConfigApCoefficientDoc = z.infer<typeof zConfigApCoefficientDoc>;
