/**
 * `config.displacement-tiers@1` 的 Zod schema —— 位移級距（GH#318）。
 *
 * ⚠️ 這一份**刻意住在自己的檔案**而不是 `schema/config.ts`：那個檔案這一輪由
 * 四個 lane 同時碰，union 那一行由主 agent 統一接。要接的是：
 *
 *     import { zConfigDisplacementTiersDoc } from "./displacementDoc";
 *     // 加進 zConfigDoc 的 discriminated union
 *
 * ⛔ union 漏掉這一行 = 這份文件在 `content:build` 的嚴格驗證就被拒 →
 * 內容**整份**載入失敗 → fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
 *
 * ⭐ 這裡**沒有** `maxSpeed` 與 `minBodyRadius` 兩格，那是故意的：它們是
 * **推導**出來的（`floor(TICK_HZ × 最小身體半徑 × safetyFactor)`，半徑來自
 * `config.arena-rules@1`）。把推導值也開成欄位＝第二個住處，而那個住處會在
 * 有人調 mob 半徑的那天靜默說謊。要調天花板就調 `safetyFactor`。
 */
import { z } from "zod";
import { zId } from "./common";
import {
  DEFAULT_DISPLACEMENT_TIERS,
  DISPLACEMENT_AUTHORED_SPEED_MAX,
  DISPLACEMENT_DISTANCE_MIN,
  DISPLACEMENT_PUSH_DISTANCE_MAX,
  DISPLACEMENT_SAFETY_FACTOR_MAX,
  DISPLACEMENT_SAFETY_FACTOR_MIN,
  DISPLACEMENT_SPEED_MIN,
  DISPLACEMENT_TIERS_DOC_ID,
  DISPLACEMENT_TIER_NAMES,
  DISPLACEMENT_TRAVEL_DISTANCE_MAX,
  type DisplacementTierName,
} from "../displacementTiers";
// ⚠️ content → sim 是**既有方向**（`displacementTiers.ts` 已經 import
// `sim/effects/knockbackLimits`），所以這一條不會產生模組循環。
// ⛔ 出貨值只有一份：`DEFAULT_WALL_BLOCK`，⛔ 不在這裡重打四個字面值。
import { DEFAULT_WALL_BLOCK, WALL_BLOCK_POLICIES } from "../../sim/movement/wallBlock";

/** 四個級別的名字（schema / 後台下拉 / 技能欄位共用同一份）。 */
export const zDisplacementTier = z.enum(DISPLACEMENT_TIER_NAMES);

/**
 * ⭐ owner 2026-08-21「有許多地圖的牆 瞬移過去」的三個處置，**兩格共用同一份**
 * （GH#992 從 `apps/admin/src/configForms/specs/ui.ts` 搬回來）。
 *
 * ⛔ 逐項對 `WALL_BLOCK_POLICIES` 展開，⛔ 不是手打三行 —— 哪天多一種處置，
 * 這一份自己會多一行，而**少了標籤的那一格**會被 `configForms.test.ts`
 * 「每一個 enum 欄位的每一個選項都有中文標籤」當場指名。
 */
const WALL_BLOCK_POLICY_ZH: Record<string, string> = {
  allow: "allow 照舊穿過去（＝這個缺陷本體，只給 rollback 用）",
  clamp: "clamp 停在牆前（出貨）",
  cancel: "cancel 整段位移不發生",
};
const WALL_BLOCK_POLICY_OPTS = WALL_BLOCK_POLICIES.map(
  (p) => `@opt ${p} ${WALL_BLOCK_POLICY_ZH[p] ?? p}`,
).join("\n");

/**
 * 一格級別的 `{distance, speed}`。
 *
 * ⭐ `族` / `tier` / `為什麼` 只餵 `.describe()` 的**行首指令**（GH#992）——
 * 後台那一頁的中文短名與說明從這裡推導，⛔ 不在 `apps/admin` 再打一份
 * （同一句人話兩個住處＝第〇·四守則的病灶）。⛔ 型別與上下界一格都沒有動。
 */
const zTierRow = (distanceMax: number, what: string, 族: string, tier: string, 為什麼: string) =>
  z
    .object({
      distance: z
        .number()
        .min(DISPLACEMENT_DISTANCE_MIN)
        .max(distanceMax)
        .describe(
          `@zh ${族} · ${tier} · 距離\n` +
            `@note ${what}多遠（GGD 單位）。${為什麼}`,
        ),
      speed: z
        .number()
        .min(DISPLACEMENT_SPEED_MIN)
        .max(DISPLACEMENT_AUTHORED_SPEED_MAX)
        .describe(
          `@zh ${族} · ${tier} · 速度\n` +
            "@note 移動速度（GGD 單位/秒）。⚠️ 註冊時還會被**推導出來的天花板**再夾一次" +
            "（穿牆門檻 = 每 tick 位移不可以超過身體半徑），所以填高於天花板的值不會生效。" +
            "收招時間 = 距離 ÷ 速度。⚠️ 這是**安全欄位不是手感欄位**：超過上限會被「夾住位移速度」那一格截掉。",
        ),
    })
    .strict();

/** 一條梯子 = 四格級別 × 一組 `{distance, speed}`。⛔ 級別名從那一份陣列來，不重打。 */
const zLadder = (distanceMax: number, what: string, 族: string, 為什麼: (tier: string) => string) => {
  const row = zTierRow(distanceMax, what, 族, DISPLACEMENT_TIER_NAMES[0]!, 為什麼(DISPLACEMENT_TIER_NAMES[0]!));
  return z
    .object(
      Object.fromEntries(
        DISPLACEMENT_TIER_NAMES.map((n) => [n, zTierRow(distanceMax, what, 族, n, 為什麼(n))]),
      ) as Record<DisplacementTierName, typeof row>,
    )
    .strict();
};

export const zConfigDisplacementTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.displacement-tiers@1"),
    note: z.string().optional(),
    /**
     * ① 級距的止血閥。false = 技能上的 `distanceTier` 不解析（填了不生效，
     * 但看得見它是關的）。⚠️ 關掉它**不會**關掉速度天花板 —— 那是下面那一格。
     */
    enabled: z
      .boolean()
      .describe("@zh 級距總開關\n" +
      "@note 關掉之後技能照自己文件裡寫的距離走，等於這套級距沒有存在過。⚠️ 它**不會**連帶關掉速度夾限（那是下面獨立的一格）。\n" +
      "技能上填的位移級別（小/中/大/極大）要不要被翻成距離與速度。關掉＝只吃手寫數字。"),
    /**
     * ② 速度天花板的止血閥。⛔ 關掉 = GH#318 的穿牆回來。
     * 與 `enabled` 分開，因為「不想用級距」與「想讓人穿牆」不是同一件事。
     */
    clampSpeed: z
      .boolean()
      .describe(
        "@zh 夾住位移速度（穿牆修復本體）\n" +
        "@note ⛔ **這一格才是 GH#318 的修復本體**，而且它**無條件套用**（跟有沒有填級別無關）。關掉它，出貨 35 個位移效果裡有 29 個會穿牆。\n" +
        "所有衝刺／擊退的速度要不要被安全上限夾住（無條件，跟有沒有填級別無關）。⚠️ 關掉會讓高速位移穿過牆與柱子（GH#318）。"
      ),
    safetyFactor: z
      .number()
      .min(DISPLACEMENT_SAFETY_FACTOR_MIN)
      .max(DISPLACEMENT_SAFETY_FACTOR_MAX)
      .describe(
        "@zh 速度上限的安全係數\n" +
        "@note 速度上限 = ⌊30 × 最小身體半徑 × 這一格⌋。1.0 = 剛好貼著穿牆門檻，出貨 {{出貨值}} 留一成餘裕。⚠️ 調高會讓位移更快但逼近穿牆。\n" +
        "安全係數。速度上限 = 無條件捨去(30 × 最小身體半徑 × 這一格)。1.0 正好踩在穿牆的平手線上，所以出貨留 0.9 當浮點餘裕。調小＝更安全也更慢。"
      ),
    /** 梯 A —— 自己動（`dash`）。 */
    travel: zLadder(
      DISPLACEMENT_TRAVEL_DISTANCE_MAX,
      "衝刺",
      "衝刺",
      (tier) =>
        `自己位移（衝刺類）在「${tier}」這一格走多遠。⚠️ 改它會同時影響**每一支**填了這個級別的技能。`,
    ),
    /** 梯 B —— 別人被推（`knockback`）。 */
    push: zLadder(
      DISPLACEMENT_PUSH_DISTANCE_MAX,
      "把人推",
      "擊退",
      (tier) =>
        `被別人推（擊退類）在「${tier}」這一格推多遠。⚠️ 與衝刺是**兩條獨立的梯子**，改這裡不影響衝刺。`,
    ),
    /**
     * ③ 穿牆的**另一半**（owner 2026-08-21「有許多地圖的牆 瞬移過去」）。
     *
     * ⚠️ 與上面的 `clampSpeed` 是**兩個不同的缺陷**，⛔ 不可以合成一格：
     * `clampSpeed` 修的是「一步跨太遠 ⇒ 穿隧」（`dash` / 擊退滑行，GH#318），
     * 這一區塊修的是「**終點就在牆的另一邊**」（`blink` 沒有中間位置、`leap`
     * 刻意離開平面物理）。夾住瞬移的速度是沒有意義的 —— 它沒有速度。
     *
     * ⚠️ **必須 `.optional()`**：線上已經有 `config.displacement-tiers@1` 的耐久
     * 覆蓋層，而那一份沒有這個 key。必填會讓它在 `content:build` 被拒 ⇒ 內容
     * 整份載入失敗 ⇒ fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
     * 缺席時 `wallBlockFromDoc` 回**出貨值**（＝修好的那一邊），⛔ 不是關掉。
     */
    /**
     * ⭐ GH#448 「標記→順移」的旋鈕。**必須 `.optional()`**，理由與 `wallBlock`
     * 逐字相同：缺席時 `markedBlinkFromDoc` 回**出貨值**（＝功能開著），⛔ 不是關掉。
     */
    markedBlink: z
      .object({
        // [spec] ⭐ owner 2026-08-21「我發現**有許多地圖的牆 瞬移過去** 例如**無限城**等」。
        // [spec]    ⛔ 這**不是**上面那一格的重複：「夾住位移速度」修的是穿隧（一步跨太遠），
        // [spec]    這四格修的是「終點就在牆的另一邊」。瞬移沒有速度，夾它是沒有意義的。
        enabled: z
          .boolean()
          .describe(
            "@zh 「標記→順移」總開關（30-00 攝影機）\n" +
            "@note ⭐ **這是 GH#448 的 rollback 開關**（owner 2026-08-19「給予指定敵方英雄標記，之後施展若無指定敵方英雄單位代表順移至敵方身邊」）。⛔ 關掉之後 `to: \"markedUnit\"` 的瞬移**一律不發生**，施法者原地不動 —— ⚠️ 而卡面第二句會變成謊話，所以這是**應急**用的，⛔ 不是長期形狀。\n" +
            "⭐ **rollback 開關**：關掉之後 30-00 攝影機的第二段（順移到被標記的人）一律不發生，施法者原地不動。⚠️ ⛔ 關掉會讓卡面第二句變成謊話 —— 這是**應急**用的，⛔ 不是長期形狀。"
          )
          .optional(),
        requireOwnMark: z
          .boolean()
          .describe(
            "@zh 只認自己這支技能打的標記\n" +
            "@note 比對 `StatusEffect.sourceId === ctx.origin`（＝這支技能的 id）。⛔ 關掉之後兩位臭作會互相搶對方標記的目標（同一個 statusId、不同施法者）。⭐ 出貨值開著。\n" +
            "只認**自己這支技能**打的標記。⛔ 關掉之後兩位臭作會互相搶對方標記的目標（同一個 statusId 但不同施法者）。⭐ 出貨值開著。"
          )
          .optional(),
      })
      .optional(),
    wallBlock: z
      .object({
        enabled: z
          .boolean()
          .describe(
            "@zh 位移不可以穿牆（總開關）\n" +
            "@note ⭐ **這是 owner 2026-08-21 那則回報的修復本體**：瞬移／跳躍的**終點**必須落在牆的這一邊。⛔ 關掉＝回到 2026-08-21 之前（無限城的 16 道牆對位移完全不存在）。⚠️ 它與「夾住位移速度」是**兩個不同的缺陷**，兩格都要開著。\n" +
            "位移的終點要不要被牆擋住。⛔ 關掉＝ 2026-08-21 之前的行為（瞬移／跳躍直接穿過牆）。"
          ),
        blink: z
          .enum(WALL_BLOCK_POLICIES)
          .describe(
            "@zh 真瞬移撞到牆時\n" +
              "@note 真瞬移（blink）撞到牆時要怎麼處置。⚠️ **不建議 cancel**：一支保命技在最需要它的貼牆場合會靜默失效，玩家看到的是「按了沒反應」。\n" +
              WALL_BLOCK_POLICY_OPTS,
          ),
        leap: z
          .enum(WALL_BLOCK_POLICIES)
          .describe(
            "@zh 跳躍／擊飛撞到牆時\n" +
              "@note 管的是拋物線（`leap` 與 `launchHeight > 0` 的擊飛）。⚠️ 地面滑行的擊退本來就撞得到牆（走碰撞），所以這一格開著之後，同一支技能的兩條路才對地形有一致的看法。⚠️ 跳過**柱子**不受這一格影響（見下一格）。\n" +
              WALL_BLOCK_POLICY_OPTS,
          ),
        pillarsBlock: z
          .boolean()
          .describe(
            "@zh 圓柱也算牆\n" +
            "@note false（出貨）＝只有有厚度的牆（box）與牆線（segment）擋位移，**圓柱跳得過也瞬移得過**——那本來就是跳躍的定義，而且六張手寫舊場地的障礙物全是圓，所以它們逐位元組不變。打開＝地形完全實心。\n" +
            "圓柱算不算牆。false（出貨）＝只有 box／segment 的牆擋位移，柱子照樣跳得過、瞬移得過。"
          ),
        /**
         * ⭐ GH#490 —— **飛行是這條規則的合法例外**（owner 2026-08-21「翔封界 等飛行效果」）。
         *
         * ⚠️ **必須 `.optional()`**，理由與 `wallBlock` 自己那一格逐字相同：
         * 線上的耐久覆蓋層可能已經存過一份**有 `wallBlock` 但沒有這個 key** 的
         * 文件（`wallBlock` 是同一天早上才加的）。⛔ 必填 ⇒ `.strict()` 退回 ⇒
         * 內容整份載入失敗 ⇒ fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
         * 缺席時 `wallBlockFromDoc` 回**出貨值 `true`**，⛔ 不是關掉。
         */
        // [spec] ⭐ GH#490 owner 2026-08-21「翔封界 等飛行效果實作」——「飛行是那條規則的
        // [spec]    合法例外」。⛔ 這**不是**一支技能的 if：判準綁在「走路時就穿得過牆」上，
        // [spec]    所以每一個帶飛行的來源（天生技 / 限時 buff / 道具 / 增益卡）自動吃到。
        flightExempt: z
          .boolean()
          .optional()
          .describe(
            "@zh 在飛的單位不受穿牆判定\n" +
            "@note ⭐ **飛行是上面那條規則的合法例外**（GH#490）。判準是「這具身體**走路時**就穿得過牆嗎」（`sim/flight.ts`），所以 04-00 翔封界、77-03 GLADIARIA ALAT、天叢雲劍、立體機動裝置、職階技能・騎乘 EX 全部自動吃到，⛔ 沒有任何一支技能被特別點名。⚠️ 關掉＝連飛行也擋：她**走**得過去卻**瞬移／跳**不過去，同一具身體被兩個系統用兩種方式對待。⛔ 帶著 `ignoreObstacles: false` 的飛行（飛起來但仍然撞牆）**不吃這一格**，那是刻意的。\n" +
            "在飛的單位（走路就穿得過牆的那些）位移時要不要照樣穿得過。true（出貨）＝飛行是這條規則的合法例外。"
          ),
      })
      .strict()
      .optional(),
  })
  .strict();

/** 出貨值的文件形狀 —— 第一守則三個住處裡的「Zod DEFAULT_*」那一個。 */
export const DEFAULT_DISPLACEMENT_TIERS_DOC = {
  id: DISPLACEMENT_TIERS_DOC_ID,
  schema: "config.displacement-tiers@1",
  enabled: DEFAULT_DISPLACEMENT_TIERS.enabled,
  clampSpeed: DEFAULT_DISPLACEMENT_TIERS.clampSpeed,
  safetyFactor: DEFAULT_DISPLACEMENT_TIERS.safetyFactor,
  travel: DEFAULT_DISPLACEMENT_TIERS.travel,
  push: DEFAULT_DISPLACEMENT_TIERS.push,
  wallBlock: DEFAULT_WALL_BLOCK,
} as const;
