import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { DELAYED_MAX_COUNT, DELAYED_MAX_DELAY_SEC, DELAYED_MAX_INTERVAL_SEC, DELAYED_MAX_STEP_DIST } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
} from "./_shared";

export const zDelayed =

/**
 * ── Lane 3（2026-08-10）兩個新 kind ──────────────────────────────────────
 * 上下界一律從 `sim/effects/kindLimits.ts` 讀，⛔ 不在這裡抄字面值。
 */

/**
 * ⭐ G12【延遲序列】(20-002 連續七次斬擊 · 52-002 連續 100 下)。
 *
 * ⭐ 它與 `randomArea` 的差別只有一句話，而那句話就是它存在的理由：
 * `randomArea` 到期時用**圓心重解**（目標走開就打空），`delayed` 到期時用
 * **施放那一刻凍住的名單**。今天寫「連續七次斬擊」只能寫成同一 tick 七發傷害 ——
 * 畫面上那不是連擊。
 * ⭐ 這個 kind **完全不碰 rng**（沒有落點要抽）。
 */
z
  .object({
    kind: z.literal("delayed"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    /** 第一發等多久（秒）。 */
    delaySec: z.number().positive().max(DELAYED_MAX_DELAY_SEC),
    /** 總共幾發。省略 = 1（＝退化成純延遲）。 */
    count: z.number().int().positive().max(DELAYED_MAX_COUNT).optional(),
    /**
     * 兩發之間隔幾秒（`count > 1` 才有意義）。執行期夾成**至少 1 tick** ——
     * 0.001 秒與 0.033 秒在 30Hz 下是同一件事，而算出 0 tick 間隔的排程會把整波
     * 塞進同一個 tick。
     */
    intervalSec: z.number().positive().max(DELAYED_MAX_INTERVAL_SEC).optional(),
    /** 每一發跑的東西。`.min(1)` 同 `randomArea`：什麼都不做 = 看起來壞掉。 */
    effects: z.array(z.lazy(() => zEffectDef)).min(1),
    /**
     * **最後一發**額外跑的東西。省略 = 最後一發與其餘完全相同
     *（⛔ **不是**「最後一發不跑」）。20-002 的「最後再給予…」住在這裡。
     */
    finalEffects: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .optional()
      .describe("只有最後一下才追加的效果（「最後一擊附加擊退＋恐懼」）。"),
    targetMode: z
      .enum(["frozen", "reresolve"])
      .optional()
      .describe(
        "目標怎麼決定：frozen（預設，施放那一刻就鎖定，追著他打）或 " +
          "reresolve（每一發到期時重新以落點解目標，走開就打空）。",
      ),
    /**
     * ⭐【沿向量分段推進】(GH#393，owner 2026-08-19「JASS 應該有安排位置移動
     * 播放的多次特效搭配傷害」)。填了它，這一串就沿著一條線往前走：第 i 發的
     * 落點 = 錨點 + 方向 × (startDist + i × stepDist)。
     * 配 `targetMode: "reresolve"` + `shape: "circle"` = 每一段各結算一次。
     * 缺席 = 原地連擊（嚴格 no-op）。上下界一律讀 `sim/effects/kindLimits.ts`。
     */
    advance: z
      .object({
        stepDist: z
          .number()
          .positive()
          .max(DELAYED_MAX_STEP_DIST)
          .describe("每一發往前推幾格（GGD 單位，⛔ 不是 WC3 單位）。"),
        startDist: z
          .number()
          .min(0)
          .max(DELAYED_MAX_STEP_DIST)
          .optional()
          .describe("第一發離施法者多遠。留空＝0，第一發就在腳下。"),
        dir: z
          .enum(["facing", "target"])
          .optional()
          .describe(
            "這條線往哪指：target（預設，從施法者穿過觸發者）或 facing（身體當下面向）。" +
              "方向在施放那一刻凍住，之後轉身不會把線掰彎。",
          ),
      })
      .strict()
      .optional(),
    /**
     * ⭐【週期領域】—— 這一串的**圓心**每一發重讀，還是釘在施放那一刻。
     *
     * ⚠️ 它與 `targetMode` 是**兩件事**，而混起來看會以為已經有了：
     * `targetMode: "reresolve"` 決定「到期**重新算一次誰在圈裡**」，
     * 這一格決定「**那個圈在哪裡**」。⇒ 只有 `reresolve` 時，圈永遠釘在施放
     * 那一刻的落點 —— 那是一個**地上的**傷害場，⛔ 不是一個跟著人走的光環。
     *
     * | 值 | 圓心 | 誰要它 |
     * |---|---|---|
     * | `"point"`（省略 = 這個） | 施放那一刻的錨點（釘住） | 04-02 炸彈陣的火柱、37-03 災難之牆 —— 放完就留在原地 |
     * | `"caster"` | **每一發**讀施法者當下的位置 | 90-01 飛葉快刀「每秒對**附近**的敵人」、92-04 馬勒戈壁「每秒奪取**周圍**英雄」、99-04「初音**週遭**的部隊每秒受到傷害」 |
     *
     * ⛔ 省略 = `"point"` = 這一格出現以前每一份文件逐位元相同（嚴格 no-op）。
     * ⭐ 回頭的成本是**這一格改回 point**（或整格刪掉），⛔ 不是一次部署。
     *
     * ⚠️ 施法者離場（死亡／被移出世界）時退回錨點，⛔ 不是整串消失 ——
     * 一支安靜什麼都不做的技能是失敗形態②。要讓它跟著死就填 `stopOnCasterDeath`。
     */
    anchor: z
      .enum(["point", "caster"])
      .optional()
      .describe(
        "圓心釘在施放那一刻的落點（point，預設）還是每一發跟著施法者走（caster）。" +
          "配 targetMode: reresolve + shape: circle 就是【週期領域】。",
      ),
    hitOncePerTarget: z
      .boolean()
      .optional()
      .describe(
        "同一個人整串只吃一次（一條掃過去的線，卡片寫的是一次的傷害）。留空＝每一段都吃。",
      ),
    dropDeadTargets: z
      .boolean()
      .optional()
      .describe("鎖定的目標死了就跳過他。留空＝跳過（不繼續鞭屍）。"),
    stopOnCasterDeath: z.boolean().optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "delayed" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
