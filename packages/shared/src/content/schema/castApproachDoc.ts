/**
 * `config.cast-approach@1` —— **超過施法距離時走過去放技能**。
 *
 * owner 2026-08-22（逐字）:
 *   「超過施法距離人物不會走過去放技能（做成後台開關）」
 *
 * ⭐ 這份文件回答的是一個**決策點**,不是一個平衡數字(第一守則的那一半):
 * 「按了一支放不到的技能,角色該站著不動,還是自己走進射程?」——
 * LoL / Dota 的答案都是「走進去」,owner 的答案也是,所以出貨 `enabled: true`。
 * ⛔ 但它必須是一格後台開關,因為那是一個會被推翻的**設計**,不是一條算式。
 *
 * ⚠️ 這份 schema 刻意**不住** `schema/config/`(2026-08-22 有另一條 lane 在拆
 * 那個資料夾)。它與 `displacementDoc` / `mitigationDoc` / `audioMixDoc` 同一個
 * 形狀:schema 住自己的檔,`schema/config/index.ts` 只掛一行 union 成員。
 * ⛔ **漏掉那一行 = 一份 cast-approach.json 進了 content/ 之後整份內容驗證失敗
 *    → 客戶端退回 2 隻骨架英雄**(2026-08-02 線上壞掉四小時的形狀)。
 *
 * 語意與**每一個上下界的理由**寫在
 * `packages/shared/src/sim/abilities/abilitySystem.ts` 的 `CastApproachRules`。
 */
import { z } from "zod";
import { zId } from "./common";

export const zConfigCastApproachDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cast-approach@1"),
    note: z.string().optional(),
    /**
     * 距離不足時要不要走過去。
     *
     *   true （出貨）—— 發一道接近指令,走進射程的那一 tick 自動施放。
     *   false        —— 回到 2026-08-22 之前:`castAbility` 直接回
     *                   `"out-of-range"`,角色一步都不動。
     *
     * ⭐ 出貨 true 是 owner 明說的那一邊(第〇·六守則:「優先權大的更新後都是
     * 預設啟動」)。開關存在是為了**回頭**,⛔ 不是為了觀望。
     */
    enabled: z.boolean().describe(
      "@zh 距離不夠時走過去\n" +
      "@note 關掉之後回到 2026-08-22 之前：放不到就直接拒絕，魔力不扣、冷卻不轉、角色一步都不動 —— 玩家只看到一個沒反應的按鈕。這一格是止血閥：接近行為若在線上把玩家拖去不該去的地方，關掉它立刻回到舊行為。",
    ),
    /**
     * **走多遠就放棄**（GGD 單位,從按下按鍵的那一格量起）。
     *
     * ⚠️ 它同時是一道**事前閘**:按下去的當下如果 `距離 > 射程 + 這個值`,
     * 直接回 `"out-of-range"`,⛔ 不會先跑一段再無聲停下 —— 那種「跑到一半自己
     * 停住」比不能施法更難懂。
     *
     * 上下界**兩端都有**(#277 —— 只有下界的欄位會讓 24 打成 240 靜默通過):
     *   · 下界 1 ——「接近」小於一個身位(出貨身體半徑 0.5)時,它完成不了任何
     *     一步,畫面上與 `enabled: false` **一模一樣**。一個做不到的宣稱不可以
     *     存在(第一·五守則),所以 0 不是「關掉」,關掉請用 `enabled`。
     *   · 上界 48 —— 決鬥區**直徑**(半徑 24,見 `config/range-tiers.json` 的
     *     校準說明)。走得比整張場地還遠的「接近」不是接近,是把方向盤交出去。
     */
    maxApproachDistance: z.number().min(1).max(48).describe(
      "@zh 最多走多遠（超過就直接拒絕）\n" +
      "@note 從按下按鍵的那一格量起，超出射程多遠之內才願意走過去。出貨 {{出貨值}} = 決鬥區半徑，走過半張場地已經是「這一發不值得」。⭐ 它是**事前**閘：按下去的當下就決定要不要走，⛔ 不會跑到一半自己無聲停下（那比不能施法更難懂）。調小 = 只有擦邊的距離會自動貼上去；調大 = 按一個遠方目標會讓角色橫越整張場地。",
    ),
    /**
     * 接近途中**有別人接管移動通道**時要不要放棄。
     *
     *   true （出貨）—— 玩家送出新的走位/攻擊指令、或「卡住就接敵」把方向盤
     *                   接走,接近立刻取消。⭐ 與 `combatFeel.autoEngage`
     *                   的 `respectLiveSteering` 同一個哲學:一條新到的指令
     *                   當場把方向盤還給玩家。
     *   false        —— 接近**每 tick 重新宣告**自己的目的地,只有施放成功、
     *                   目標消失或走超過 `maxApproachDistance` 才結束。
     *                   ⚠️ 代價要說清楚:目標在牆的另一邊時,角色會一路磨到
     *                   `maxApproachDistance` 才放手。
     */
    cancelOnNewOrder: z.boolean().describe(
      "@zh 途中收到新指令就放棄\n" +
      "@note 接近的路上玩家送出新的走位／攻擊指令、或「卡住就自動接敵」把方向盤接走時，要不要取消這次接近。開著＝新指令一律贏（與戰鬥手感的「尊重玩家操作」同一個哲學）；關掉＝角色會固執地走完再放技能，玩家的走位指令要等它結束。",
    ),
  })
  .strict();

export type ConfigCastApproachDoc = z.infer<typeof zConfigCastApproachDoc>;
