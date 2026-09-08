import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  COMBO_MAX_FINISHER_DELAY_SEC,
  COMBO_MAX_REPOSITION_DIST_U,
  PULL_MAX_ANCHORS,
  COMBO_MAX_INTERVAL_SEC,
  COMBO_MAX_STEP_SEC,
  COMBO_MAX_STRIKES,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, zEffectDef } from "./_shared";

/**
 * ⭐【連段】`comboStrikes`（#541）—— 「連斬七次，每一次斬擊皆造成極大傷害」。
 *
 * 上下界一律讀 `sim/effects/kindLimits.ts`，⛔ 這裡不抄字面值。
 * 機制、與 `dot` / `delayed` 的差別、以及「排不出班表就擲錯」的理由，
 * 完整寫在 `sim/effects/comboStrikes.ts` 的檔頭 —— ⛔ 這裡不重複一份。
 */
export const zComboStrikes = z
  .object({
    kind: z.literal("comboStrikes"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    /**
     * ⭐ 節奏表的 key（`config.combo-strikes@1`）。**在載入時**由
     * `sim/effects/comboFamilies.ts::resolveComboFamilies` 翻成 `steps`/`strikes`
     * （第〇·四守則：值在載入時從共用表解析，⛔ 不烘進每一份文件）。
     */
    family: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "連段家族（節奏表 config.combo-strikes@1 的 key）。填了它就不用填段數與間隔 —— " +
          "幾段、每段隔多久、收尾等多久全部從那張表載入時解析。",
      ),
    /** 幾段。⚠️ 上界與 `delayed.count` **同值**（同一個排程器，見 kindLimits）。 */
    strikes: z.number().int().positive().max(COMBO_MAX_STRIKES).optional(),
    /** 等間隔秒數（配 `strikes`）。與 `steps` 互斥。 */
    intervalSec: z.number().positive().max(COMBO_MAX_INTERVAL_SEC).optional(),
    /**
     * ⭐⭐ **M6（GH#965）—— 逐擊音效**（原作那一族「每一刀各響一次」）。
     *
     * ⭐ 為什麼掛在連段上而不是開一個 `playSound` effect：
     * 連段的**節奏**已經住在這裡（`strikes` / `intervalSec` / `steps`）——
     * ⛔ 一個獨立的音效 effect 要自己再排一次那個班表 ＝ **同一個節奏兩個住處**，
     * ⚠️ 而它們一定會漂（改了段數而音效還響舊的次數）。
     *
     * 省略 ＝ 不響 ＝ 逐位元組同這一格出現之前。
     */
    perStrikeSoundKey: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "每一段各播一次這個音效鍵。⭐ 它跟著段數走 —— 改了 `strikes`，響幾次自動跟著改。",
      ),
    /**
     * ⭐⭐ **M10（GH#965）—— 段距的隨機抖動**（±這個比例）。
     *
     * ⚠️⚠️ ⭐ **它必須吃 `ctx.rng`，⛔ 不可以用 `Math.random`** ——
     * `sim/**` 禁 `Math.random`（`sim/purity.test.ts` 在守），
     * ⭐ 而更重要的是 determinism：一場比賽的每一份錄影都要重播得出來。
     *
     * ⭐ `0` ＝ 完全等距（＝ 今天的行為，也是 rollback）。
     * ⚠️ 上界 **0.5**：再高會讓「連段」變成「隨機噴」——
     * ⛔ 而那不是抖動，是換一個機制。
     */
    intervalJitter: z
      .number()
      .min(0)
      .max(0.5)
      .optional()
      .describe(
        "段距的隨機抖動（±比例，0 = 完全等距）。⭐ 吃比賽的種子 —— ⛔ 同一份錄影重播結果相同。",
      ),
    /**
     * ⭐ **不等間隔**：每一段離施法那一刻的秒數偏移。與 `intervalSec` 互斥。
     * JASS 的連段多半是這一種（前三刀快、停頓、最後一刀重）。
     */
    steps: z
      .array(z.number().min(0).max(COMBO_MAX_STEP_SEC))
      .min(1)
      .max(COMBO_MAX_STRIKES)
      .optional()
      .describe("每一段離施法那一刻的秒數（不等間隔用這格）。"),
    /** 每一段各跑一次的東西。`.min(1)` 同 `delayed`：什麼都不做 = 看起來壞掉。 */
    perStrike: z.array(z.lazy(() => zEffectDef)).min(1),
    /** 收尾（「…最後施展約束與勝利之劍」）。⭐ 可省 = 純連段。 */
    finisher: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .optional()
      .describe("最後一發額外跑的效果（「連續七次斬擊…最後施展約束與勝利之劍」）。留空＝純連段。"),
    /** 收尾在最後一段之後**再等**幾秒。省略／0 = 與最後一段同一個 tick。 */
    finisherDelaySec: z.number().min(0).max(COMBO_MAX_FINISHER_DELAY_SEC).optional(),
    targetMode: z
      .enum(["frozen", "reresolve"])
      .optional()
      .describe(
        "目標怎麼決定：frozen（預設，施放那一刻鎖定，追著他劈）或 reresolve（每一段重新以落點解目標）。",
      ),
    dropDeadTargets: z.boolean().optional(),
    stopOnCasterDeath: z.boolean().optional(),
    /**
     * ⭐【逐段瞬移】GH#838 M1 —— 原作連段每一刀都把身體挪到目標旁邊
     * （01-04：施法者到目標周圍 70 wc3u、角度每刀 +270°；20-002：目標被拖 10u）。
     * `tpl-lock-combo.json` 的展開器自己記著「原作連段中施法者一擊一擊瞬移到
     * 目標身邊，這裡沒有搬」—— 這一格就是把那句話收掉。
     *
     * ⚠️ **角度用等分格，⛔ 不是度數**：`sim/**` 禁止三角函式
     *（`purity.test.ts`），等分方向的唯一住處是 `ringPoints` 的常數旋轉表。
     * 原作的 +270°／刀 正好是「4 等分走 3 格」——⭐ 表達得下，而且**逐位元**是
     * 同一個東西，⛔ 不是近似（第〇·五守則：翻譯，不是湊）。
     */
    strikeReposition: z
      .object({
        /** 誰被挪：施法者貼上去（01-04）或受害者被拖（20-002）。 */
        who: z.enum(["caster", "victim"]),
        /** 半徑（GGD 世界單位；原作 70 wc3u ÷54.5 ≈ 1.3）。 */
        distU: z.number().positive().max(COMBO_MAX_REPOSITION_DIST_U),
        /** 環的等分數（原作 270°／刀 ⇒ 4）。 */
        ringN: z.number().int().min(2).max(PULL_MAX_ANCHORS),
        /** 每一刀往前走幾格（原作 270°＝4 等分走 3 格 ⇒ 3）。 */
        stepPerStrike: z.number().int().min(1).max(PULL_MAX_ANCHORS),
      })
      .strict()
      .optional()
      .describe(
        "⭐【逐段瞬移】連段的每一段把身體挪到目標周圍環上的一點（原作 01-04 施法者貼到目標旁 70wc3u、角度每刀 +270°；20-002 目標被拖到 Saber 身邊）。who＝誰被挪（caster/victim）· distU＝半徑（世界單位）· ringN＝環的等分數 · stepPerStrike＝每一刀往前走幾格。⚠️ 角度用**等分格**⛔不是度數（sim 禁三角函式，而原作的 270°／刀 正好是 4 等分走 3 格）。缺席 ⇒ 誰都不動。",
      ),
  })
  .strict();

/**
 * 這一支的跨欄位檢查。⛔ 掛在 `index.ts` 的派發表上（`.superRefine` 會把
 * `ZodObject` 變成 `ZodEffects`，而 `z.discriminatedUnion` 只收 `ZodObject`）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "comboStrikes" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);

  // ⛔ 排不出班表的節點在**載入時**擋掉，⛔ 不是等到比賽中 handler 擲錯。
  if (e.family === undefined && e.steps === undefined && e.strikes === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["family"],
      message:
        "連段至少要有一個節奏來源：family（推薦 —— 節奏住 config.combo-strikes@1）、" +
        "steps（不等間隔）或 strikes（等間隔）。三個都沒有的話這一段一刀都不會劈。",
    });
  }
  // 兩份查表就是「編輯器顯示一種節奏、場上跑另一種」（同 knockback 的
  // distanceTier ⊕ launchDistance）。
  if (e.steps !== undefined && e.intervalSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["intervalSec"],
      message: "steps 與 intervalSec 只能填一個 —— 兩者都在決定節奏，同時填時 steps 贏，intervalSec 是一格沒有人讀的數字",
    });
  }
  if (e.steps !== undefined && e.strikes !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["strikes"],
      message: "steps 已經決定了段數（陣列長度），⛔ 不要再填 strikes —— 兩格打架時 steps 贏",
    });
  }
  if (e.finisherDelaySec !== undefined && e.finisher === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finisherDelaySec"],
      message: "沒有 finisher 的話這一格沒有人讀 —— 要收尾請填 finisher（第一·五守則：卡片上不可以有說了但不會發生的字）",
    });
  }
};
