import { z } from "zod";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { MARK_MAX_COUNT } from "../../../sim/markLimits";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  HARD_CC_FLAGS,
  HARD_CC_MAX_DURATION_SEC,
  STATUS_MAX_DURATION_SEC,
  zRankScalar,
} from "./_shared";

/**
 * ⭐ 硬控的那一條較嚴的上界（見 {@link HARD_CC_MAX_DURATION_SEC}）。
 *
 * 住在 `refineEffectDef` 而不是 `duration` 自己的 `.max()`，有兩個各自獨立的
 * 理由，兩個都是硬的：
 *   ① 它是一個**跨欄位**規則 —— 同一個 24 秒在計數視窗上合法、在暈眩上不合法，
 *      而 `z.number()` 看不到隔壁那格布林。
 *   ② `zEffectDefUnion` 是 `z.discriminatedUnion`，它的成員**必須是 ZodObject**；
 *      在那一格掛 `.superRefine` 會讓它變成 `ZodEffects` 而整個聯集建不起來。
 *      ⛔ 這不是風格問題，是 zod 的型別約束（試過，`pnpm typecheck` 直接紅）。
 */
function refineHardCcDuration(
  e: Extract<EffectDef, { kind: "applyStatus" }>,
  ctx: z.RefinementCtx,
): void {
  const flags = HARD_CC_FLAGS.filter((f) => e[f] === true);
  if (flags.length === 0) return;
  const cols = typeof e.duration === "number" ? [e.duration] : e.duration;
  cols.forEach((v, i) => {
    if (v <= HARD_CC_MAX_DURATION_SEC) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: typeof e.duration === "number" ? ["duration"] : ["duration", i],
      message:
        `硬控（${flags.join("/")}）最長 ${HARD_CC_MAX_DURATION_SEC} 秒，拿到 ${v}。` +
        "一場回合三分鐘，再長等於「那個人這一場不用玩了」。" +
        `不拿走操作的狀態（計數視窗、減速、減益數值）可以到 ${STATUS_MAX_DURATION_SEC} 秒。`,
    });
  });
}

export const zApplyStatus =
z
  .object({
    kind: z.literal("applyStatus"),
    ...EFFECT_COMMON_SHAPE,
    statusId: zRef<StatusId>("status-effects", { soft: true }),
    /**
     * ⭐ 層數的**增減**（owner 2026-08-09 / GH#301-5「狀態除了有無也會是數字
     * 層數」＋ GH#304「疊層可能會隨觸發／隨時間 增加**或減少**」）。
     *
     * 省略 = 1 = 今天的行為（「身上有這個狀態」）。⛔ 不是 0 —— 0 層等於沒有，
     * 而一份沒寫這一格的舊文件的意思是「有」。**0 本身被拒絕**：一個什麼都不
     * 做的效果掛在卡片上是失敗形態②。
     *
     * ⭐ **負數 = 減層**（GH#304 軸①②）。這一格是這一批唯一需要的新詞彙：
     *   · 軸①【隨觸發】把這個效果掛在任何一個 `HookEvent` 上
     *     （`onBasicAttack` +1、`onDamageTaken` -1、`onKill` +2…）；
     *   · 軸②【隨時間】掛在 `onInterval` 上，節奏用 `HookDef.internalCooldown`
     *     表達（`internalCooldown: 3` 就是「每 3 秒」）。
     * ⛔ 兩條軸都**沒有**新的引擎機制，這是刻意的：`IntervalHookSystem` 決策 1
     * 已經拒絕過「第二個冷卻概念」，而 `sim/marks.ts` 檔頭⑤說明了為什麼在
     * `MarkSpec` 上開一格 `decayEverySec` 會多出一支沒有人呼叫的掃描器。
     *
     * ⚠️ 減層**不會**憑空建立一筆狀態（身上沒有 = 什麼都不做），也**不會**
     * 把到期時間往後推 —— 見 `refresh`。
     *
     * 界共用 `sim/markLimits.ts` 的 `MARK_MAX_COUNT`（±999，擋「12 打成 120」
     * 那種多一個零），⛔ 不抄字面值：那已經是這個 repo 對「一個計數器最多幾層」
     * 的答案，抄第二份就是第四個住處。
     */
    stacks: z
      .number()
      .int()
      .min(-MARK_MAX_COUNT)
      .max(MARK_MAX_COUNT)
      .refine((n) => n !== 0, {
        message: "stacks 不可以是 0 —— 一個不動任何層數的效果在卡片上看得到、在遊戲裡什麼都不會發生",
      })
      .optional(),
    /**
     * 重複施加時**要不要把到期時間往後推**。省略 = `"extend"` = 這一格出現
     * 之前的行為（`Math.max(舊到期, 新到期)`）。
     *
     * ⭐ 它是 GH#304 軸②的必要條件，不是選配：一個掛在 `onInterval` 上、
     * 每 3 秒 +1 層的計數器如果每次都續期，那筆狀態就**永遠不會到期** ——
     * 「20 秒內疊到 5 層」會變成「永久 5 層」，而畫面上完全看不出差別
     *（失敗形態②）。`"keep"` 讓層數與窗口變成兩件獨立的事。
     *
     * ⚠️ 減層（`stacks < 0`）**一律**當作 `"keep"`，不管這一格填什麼：
     * 「扣一層」不是「重新施加」，而一個會延長減益的減益是沒有人要的東西。
     */
    refresh: z.enum(["extend", "keep"]).optional(),
    /**
     * 這個狀態掛多久(秒)。**兩端都有界**(CLAUDE.md「欄位要有上界」/ #277) ——
     * 這一格在 2026-08-01 之前只有 `.min(0)`,也就是完全沒有上界,而 owner 當天
     * 剛好給了殺豬刀一個 0.3 秒的控場,所以它是最需要護欄的那一格。
     *
     * · 下界 0.034 = 30 Hz 的一個 tick。`applyStatus` 算的是
     *   `world.tick + Math.round(duration / world.dt)`,所以任何小於半 tick 的
     *   數字會 round 成 **0 tick** —— 狀態掛上去的同一瞬間就過期,玩家永遠拿不到
     *   (失敗形態 ②)。這不是理論:出貨最短的一格正是 0.034(血染八月
     *   `godie-i06o` 的 fang-stun),下界因此貼著它而不是憑空挑的。
     * · 上界分兩層（⭐ 2026-08-09 / GH#299 第 1 條改的）：
     *   **硬控** ≤ {@link HARD_CC_MAX_DURATION_SEC}（20 秒，逐字是舊的那個數字），
     *   其餘 ≤ {@link STATUS_MAX_DURATION_SEC}（60 秒）。
     *
     *   ⛔ 在此之前**一個數字管兩件事**，而「一個 30 秒的暈眩等於那個人這一場
     *   不用玩了」這句話**只對硬控成立** —— 它被套在每一種狀態上，於是一個
     *   24 秒的**計數視窗**（不動控制、不動數值，只是「這段時間內」）也被擋下來，
     *   而那正是 GH#299 量到的 7 支之一。放寬與收緊在這一次是同一件事：
     *   一般上界抬到 60，硬控那一格的護欄一格都沒動（見下面的 `superRefine`）。
     *
     *   它擋的仍然是**小數點打錯一位**：0.3 打成 3 沒有任何界擋得住（那是一個
     *   合法的設計值），但 0.3 打成 30 的**暈眩**、20 打成 200 的任何狀態，
     *   都會在 `pnpm content:build` 當場被擋下並指名檔案與欄位。
     *
     * ⭐ 逐階（GH#299 第 2 條）：填陣列 = 一階一格。見 {@link zRankScalar}。
     */
    duration: zRankScalar(z.number().min(0.034).max(STATUS_MAX_DURATION_SEC)),
    /** "self" puts it on the CASTER (combo windows); default "target" */
    applyTo: z.enum(["self", "target"]).optional(),
    /**
     * 移速倍率。1 = 不動，0.5 = 減速一半。
     *
     * ⭐ 2026-08-09（GH#299 第 1 條）：下界從 `.positive()`（> 0）改成 **0**。
     * `0 = 完全不能動`，而在此之前它**寫不出來** —— 唯一的替代品是 `root: true`，
     * 但那兩件事在引擎裡不一樣：`root` 是一筆**硬控**（吃免控、進 `ccAppliedTicks`
     * 戰績、被【淨化】的規則管），而「速度歸零」是一個純數值減益（例如「泥沼」
     * 這種可以被位移技掙脫的東西）。把它們折成同一格會讓免控對其中一個有效、
     * 對另一個無效，而畫面上看不出來。
     *
     * ⚠️ 上界仍然刻意沒有：加速也走這一格（`1.3` 的加速與 `0.7` 的減速在結構上
     * 長得一模一樣，見 `sim/components.ts`），而加速的天花板由 `Stat.MoveSpeed`
     * 的 `STAT_CLAMPS`／`config.stat-caps@1` 管，不是這裡。
     *
     * ⭐ 逐階（GH#299 第 2 條）：填陣列 = 一階一格。
     */
    moveSpeedMult: zRankScalar(z.number().min(0)).optional(),
    root: z.boolean().optional(),
    stun: z.boolean().optional(),
    /**
     * 失手率 (WC3 `Acrs` 詛咒) — 0..1, the chance a BASIC ATTACK made BY the
     * unit carrying this status misses. Bounded on BOTH ends (CLAUDE.md
     * 「欄位要有上界」): a ratio typed as 33 instead of 0.33 would otherwise
     * mean "every swing, forever" and read in-game as the champion being
     * unable to attack at all.
     *
     * Shipped user: 66-00 恐懼 (godie-e00t) at 0.33 — Blizzard's own
     * `Acrs.DataA1`, which the map's `A0IF` does not override.
     */
    missChance: zRankScalar(z.number().min(0).max(1)).optional(),
    /**
     * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機). While this status is live
     * the SEAT's own orders are dropped on the floor and the body auto-seeks:
     * see `sim/berserk.ts` for the whole model and for why it is a status
     * flag beside `root`/`stun` rather than a fourth CC or a new stat.
     *
     * ⚠️ NOT a CC and deliberately so: it is a **self-buff with a downside**,
     * and `refusesControl` therefore does NOT block it. A 魔法免疫 buff must
     * not make your own berserk refuse to land on you.
     */
    berserk: z.boolean().optional(),
    /**
     * 恐懼 —— 「嚇到轉頭就跑」。`berserk` 的**鏡像**：一樣丟掉座位的指令，
     * 但身體自己**遠離**此刻最近的敵人，而且**不攻擊**。
     * 整個模型與三個決策點寫在 `sim/fear.ts`。
     *
     * 出貨用戶（owner 2026-08-08 文案）：89-002 俄羅斯輪盤 2 秒 ·
     * 52-02 蹂躪編年史 3 秒 · 52-002 射殺百頭 3 秒；52-04 巨神一擊**讀**它。
     *
     * ⚠️ 它**是** CC，與 `berserk` 相反 —— 敵人施加的純減益，所以
     * `refusesControl`（免控）會拒絕它並發 `immuneControl`。
     *
     * ⚠️ 它只管**腳**，不管手上的技能。要做成「連技能都放不出來」的恐懼，
     * 配 `silenced: true` 一起寫（與 C2 混亂 `{berserk, targetsAllies}` 同一個
     * 先例）—— 「不能施法」在這個引擎裡只有 `silenced` 一個住處，多開第二個
     * 布林就等於讓免控對其中一個有效、對另一個無效而沒有人會發現。
     */
    feared: z.boolean().optional(),
    /**
     * C4 睡眠（#278）—— 受傷即提早解除**這一筆**。
     * ⛔ 只拔標了它的那一筆；身上的其他 status 一格不動。
     */
    /** 【沉默】C1（#278）。不能施放技能,但**可以走、可以普攻** —— 與暈眩不同。 */
    silenced: z.boolean().optional(),
    /**
     * ⭐【繳械】S8（92-01「無法移動與攻擊」的攻擊那一半）。
     * ⛔ 它**不是** `missChance` 的包裝：實測 `missChance:1` 的人照樣揮刀
     *（動畫、音效、破隱、攻擊冷卻全部照跑），只是傷害 0。「揮空刀」與
     * 「揮不出來」在畫面與聽覺上是兩件事。
     * ⚠️ 它在 {@link HARD_CC_FLAGS} 裡，所以吃較嚴的硬控秒數上界。
     */
    disarmed: z
      .boolean()
      .optional()
      .describe(
        "【繳械】打不出普通攻擊（連前搖都開不了）。⛔ 不擋技能 —— 要連技能一起封請同時勾【沉默】。" +
          "要做「打得到人但會失手」請改用失手率，那是另一件事。",
      ),
    /**
     * 【混亂】C2（#278）。⚠️ **要配 `berserk: true` 一起寫**：
     * `berserk` 負責「丟掉玩家的指令 + 自動尋敵」，這一格只多開「不分敵我」。
     * 單獨填它等於什麼都不會發生（人還是聽玩家的）。
     */
    targetsAllies: z.boolean().optional(),
    breakOnDamage: z.boolean().optional(),
    /**
     * 打醒門檻：這一發實際扣掉的傷害要 ≥ 它。省略 = 0 = 任何傷害都醒。
     * 上界 5000 ≈ 一個滿裝英雄的血量：再高就等於「打不醒」，
     * 而那應該用 `breakOnDamage: false` 表達，不是一個假裝有門檻的數字。
     */
    breakOnDamageMin: z.number().min(0).max(5000).optional(),
    /**
     * 【重創】A6（#278）。三格**獨立**，各自 0–1（0 = 完全禁掉，1 = 不打折）。
     * ⛔ 上界是 1：重創**只會**變弱不會變強。要做「治療加成」是另一個機制
     *（走 modifier），把它塞進同一格會讓一張卡同時是重創與增益。
     */
    healingTakenMult: z.number().min(0).max(1).optional(),
    lifestealMult: z.number().min(0).max(1).optional(),
    regenMult: z.number().min(0).max(1).optional(),
    /**
     * A4（#278 / GH#295）—— 這一筆狀態**可不可以被【淨化】拔掉**。
     *
     * 三值語意是刻意的：`true` / `false` / **省略**。省略 = 讀後台
     * `config.dispel@1` 的 `statusDefaultDispellable`（出貨 **true**）——
     * 「作者明講不可驅散」與「作者沒想過這件事」是兩種不同的狀態，而後者的
     * 答案應該是一個操作者調得到的全域預設，不是寫死在文件裡。
     *
     * ⚠️ 回合重置與復活**不看這一格**（`clearForFreshBody` 傳
     * `requireDispellable: false`）—— 那不是淨化，是重置：一個標了不可驅散的
     * 減速也不可以跨過墳墓活下來。
     */
    dispellable: z.boolean().optional(),
  })
  .strict();

export const refine = refineHardCcDuration;
