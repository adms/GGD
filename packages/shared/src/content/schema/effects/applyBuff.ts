import { z } from "zod";
import { zHookDef } from "./_hook";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { STAT_CEILING_MAX } from "../../../sim/effects/kindLimits";
import { ModOp } from "../../../sim/stats/modifiers";
import { zRef, zStat, zStatModifier } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  SOURCE_GRANT_SHAPE,
  zApplyToSelfOrTarget,
  zEffectDef,
} from "./_shared";

/**
 * ⭐ `applyBuff` 的兩條跨欄位規則（Lane 3，2026-08-10）。
 *
 * ① **`permanent` 與 `duration` 互斥且必填其一。**
 *    ⛔ 刻意**不**讓「省略 duration」自己等於永久：那會讓一個打字漏填變成一份
 *    靜默的永久增益，而那正是這個 repo 反覆踩到的那一類。兩格都省略在這一格
 *    出現之前就是 `invalid_type@duration Required`，所以行為逐字不變。
 * ② **`exclusiveOnExisting` 需要 `exclusiveGroup`** —— 沒有組就沒有「已經有的
 *    那一份」可以比對，這一格永遠不會被讀到。與 `shield.onExisting` 需要
 *    `stackKey` 是同一條規矩、同一個訊息形狀。
 */
function refineApplyBuff(
  e: Extract<EffectDef, { kind: "applyBuff" }>,
  ctx: z.RefinementCtx,
): void {
  const perm = e.permanent === true;
  if (perm && e.duration !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["duration"],
      message:
        "永久與持續秒數只能填一格 —— 兩個都填時只有其中一個會被讀到，另一個是一個" +
        "看起來有設、沒有人讀的數字。",
    });
  }
  if (!perm && e.duration === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["duration"],
      message: "請填持續秒數，或勾選「永久」。⛔ 省略秒數本身**不等於**永久。",
    });
  }
  if (perm) {
    e.perRank?.forEach((r, i) => {
      if (r.duration === undefined) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["perRank", i, "duration"],
        message: "永久增益的逐階欄位不可以帶持續秒數 —— 那一格永遠不會被讀到。",
      });
    });
  }
  // ⭐ GH#354 / G3 —— 「永久有多久」需要先是永久。
  // 與 `exclusiveOnExisting` 需要 `exclusiveGroup`、`shield.onExisting` 需要
  // `stackKey` 是同一條規矩、同一個訊息形狀：一格永遠不會被讀到的設定，
  // 在編輯器裡看起來跟生效的一模一樣。
  if (!perm && e.permanentScope !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permanentScope"],
      message:
        "「永久有多久」只有在勾了「永久」時才會被讀到 —— 有持續秒數的增益本來就會" +
        "自己到期，這一格是一個看起來有設、沒有人讀的選項。",
    });
  }
  // ⭐ S4b —— 「只算這份增益自己」需要一個 key 才認得出「這份」。
  // 與 `shield.onExisting` 需要 `stackKey`、`grantAttribute.maxSourceTotal` 需要
  // `store:"source"`、`exclusiveOnExisting` 需要 `exclusiveGroup` 是同一條規矩、
  // 同一個訊息形狀。
  if (e.maxStat?.basis === "thisSource" && e.stackKey === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxStat", "basis"],
      message:
        "「只算這份增益自己」需要 stackKey —— 沒有 key 的話每一次施放都是一份全新的" +
        "來源，這個上限永遠不會咬到，而增益照樣一份一份疊上去。",
    });
  }
  // ⭐ S4b（2026-08-10）——「只算這份增益自己」配**純百分比**的加成 ⇒ 天花板恆為 0。
  //
  // `applyBuff.sourceStatAmount` 折的是 `flat × (1 + pctAdd) × pctMult`，也就是說
  // **沒有任何 `flat` 的那一條屬性算出來永遠是 0**（百分比疊出來的絕對量取決於底值，
  // 而底值正是 `basis:"final"` 讀的那個東西 —— 那一段推導寫在 `applyBuff.ts` 的
  // `sourceStatAmount` 檔頭）。於是 `now >= cap.value` 的左邊永遠是 0：
  //   · `value > 0` → 上限**永遠咬不到**，增益一層一層無限疊；
  //   · `value = 0` → 反過來**第一層就被拒**，整支技能安靜地不生效。
  // 兩種都是「作者設了上限、遊戲裡看不出來」（失敗形態②），所以擋在載入時。
  //
  // ⚠️ 讀的是 handler **真的會讀到**的那幾份清單：`perRank` 有填的時候 handler 走
  // `perRank[rank-1].modifiers`，`e.modifiers` 那一份就沒有人讀。
  if (e.maxStat?.basis === "thisSource") {
    const lists =
      e.perRank !== undefined && e.perRank.length > 0
        ? e.perRank.map((r) => r.modifiers)
        : [e.modifiers];
    const stat = e.maxStat.stat;
    const reachable = lists.some((ms) =>
      ms.some((m) => m.stat === stat && m.op === ModOp.Flat),
    );
    if (!reachable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxStat", "basis"],
        message:
          `「只算這份增益自己」是用這份來源的 ${stat} **絕對量**去比的，而這份增益的 ` +
          `modifiers 裡沒有任何一條是「${stat} + 固定值」——` +
          "純百分比的加成算出來永遠是 0，所以這個上限要嘛永遠咬不到、要嘛第一層就把" +
          "整發擋掉，兩種在遊戲裡都看不出來。請改成 basis:final（比角色面板上的最終值），" +
          `或替 ${stat} 補一條固定值加成。`,
      });
    }
  }
  if (e.exclusiveOnExisting !== undefined && e.exclusiveGroup === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exclusiveOnExisting"],
      message:
        "exclusiveOnExisting 需要 exclusiveGroup —— 沒有互斥組就沒有「已經有的那一份」" +
        "可以比對，這一格永遠不會被讀到，而增益照樣一份一份疊上去。",
    });
  }
}

export const zApplyBuff =
z
  .object({
    kind: z.literal("applyBuff"),
    ...EFFECT_COMMON_SHAPE,
    modifiers: z.array(zStatModifier),
    /**
     * 持續秒數。⭐ S4a 之後是**選填**，與 {@link permanent} **互斥且必填其一**
     *（`refineApplyBuff` 兩個方向都關死）。
     * ⛔ 「省略 duration」本身**不等於**永久：那會讓一個打字漏填變成一份靜默的
     * 永久增益。既有 240 份文件全部帶數字，所以放寬對它們是嚴格的 no-op。
     */
    duration: z.number().min(0).optional(),
    /**
     * ⭐ S4a —— **永久**（80-00 / 92-03「永久 +1 AP」）。
     *
     * 引擎層從第一天就做得到（`ModifierSource.expiresAtTick` 缺席 = 永久），
     * 缺的一直是這一格 —— 於是出貨已經有四份文件用 `duration: 99999` 假裝永久。
     * 預設語意是**整場**；⭐ GH#354 / G3 之後可以用 {@link permanentScope}
     * 改成「只到這一回合結束」。
     */
    permanent: z
      .boolean()
      .optional()
      .describe("永久生效（不會到期）。勾了就不要填持續秒數，兩者只能填一格。"),
    /**
     * ⭐ GH#354 / G3 —— 這份**永久**增益的永久到哪裡為止。
     *
     * 省略 = `"match"` = 整場 = 今天（既有的每一份 `permanent` 逐位元不變）。
     *
     * owner 2026-08-17 的 20 件 [EX解放] 裡有 5 件寫著「本回合內」而**沒有秒數**
     *（#52 王者之財 · #55 噬魂 · #62 破界 · #63 重力劍 · #68 終焉）。在這一格之前
     * 那一族只能二選一：填一個猜的秒數（回合長度是相位機決定的 ——
     * `combatMaxTicksForRound` 決賽 180 秒而平時 100 秒，火圈提前收場更是常態，
     * 所以猜長了跨進下一回合、猜短了在回合中途無聲消失），或填 `permanent` 讓它
     * **整場**留著（＝ 一件本來只有一回合的寶具變成滾雪球）。
     *
     * ⛔ 這一格**不是**「幫你算一個到期秒數」—— 引擎端記的是一個旗標，
     * 拆除點是 host 的回合開始（`sim/clearPools.ts::clearRoundScoped`）。
     * 把事件寫成數字正是上面那兩種失敗的來源。
     */
    permanentScope: z
      .enum(["match", "round"])
      .optional()
      .describe(
        "「永久」有多久：match（預設，整場都在）或 round（只到這一回合結束，" +
          "下一回合開打前會被拿掉）。⛔ 只有勾了「永久」才填得了。",
      ),
    /**
     * ⭐ G10 —— 這份增益**同時是一個具名標記**（52-01 的〔狂怒〕、破甲、破魔）。
     *
     * 省略 = 不是任何標記 = 今天。⭐ 它把「標記」與「數值」變成同一個物件，所以
     * 兩本帳不可能再腐爛：延長改的就是這一份來源的到期 tick（實測缺陷：buff 延長
     * 到 573 而 status 停在 361，於是讀〔狂怒〕的那個閘在玩家還在狂怒中就關了）。
     * ⛔ 因此**不需要**再開一格 `extendBuff.statusId` —— 那是替同一個問題做第二套機制。
     */
    statusId: zRef<StatusId>("status-effects", { soft: true })
      .optional()
      .describe(
        "讓這份增益同時掛上一個具名狀態（讓別的技能問得到「他身上有沒有〔狂怒〕」）。" +
          "⭐ 它與數值是**同一份**來源：延長／淨化／到期會一起發生，不會出現" +
          "「圖示還在但條件已經讀不到」。",
      ),
    /** ⭐ S9b —— 落在誰身上。省略 = target（＝今天）。見 {@link zApplyToSelfOrTarget}。 */
    applyTo: zApplyToSelfOrTarget,
    /**
     * ⭐ G5（state.exclusive-group@1）—— 這份增益屬於哪一個**互斥組**。
     *
     * 省略 = 不互斥 = 今天（實測：三份形態 buff 同時掛著，乘區逐位元等於 1.4³）。
     * ⚠️ `stackKey` **不是**這題的答案：實測同 key 的第二發會把 modifiers
     * **整組丟掉**，只把層數加一。
     */
    exclusiveGroup: z
      .string()
      .min(1)
      .max(48)
      .optional()
      .describe(
        "互斥組名：身上同一組只會有一份（15-02/03/04 那種「永遠只有一種戰型」）。" +
          "⛔ 它只管屬性狀態，不換 3D 模型 —— 換身體仍然是變身那條路。",
      ),
    /**
     * ⭐ G5 —— 同組已經有一份時怎麼辦。省略 = `"replace"`（抄
     * `shield.onExisting` 的預設）。⚠️ 沒有 `exclusiveGroup` 卻填了它 =
     * PARSE ERROR（同一條規矩、同一個訊息形狀）。
     */
    exclusiveOnExisting: z
      .enum(["replace", "reject"])
      .optional()
      .describe(
        "同一個互斥組已經有一份時：replace（預設，新的接手）或 reject（新的不生效）。",
      ),
    /**
     * ⭐ S4b —— 這條加成加到某個**絕對值**就停（80-00「上限到 10」那一族）。
     *
     * 整格省略 = 沒有絕對上限 = 今天（實測：同一個 stackKey 疊 21 次 +1 攻擊距離，
     * 11 一路長到 32，沒有任何東西攔它）。
     *
     * ⛔ 為什麼既有的四個都不是答案：
     *   · `maxStacks` 數的是**層數**，而層數→屬性的換算依賴基礎值，逐英雄不同；
     *   · `ModOp.CapRaise` 只把 `effectiveCap` **抬高**（是 max 不是 min，語意相反）；
     *   · `grantAttribute.maxAttribute` 只走 attributes 那條路、只給三圍；
     *   · `STAT_CLAMPS` / `config.stat-caps@1` 是**全域**天花板，不是「這一份增益的」。
     *
     * ⭐ `basis` 是第一守則的決策點：「上限到 10」有兩種都合理的讀法。
     *   · `final`（預設）—— 讀玩家面板上那個最終值（#125「顯示的就是拿到的」）。
     *   · `thisSource` —— 只管這一份 `stackKey` 來源自己貢獻了多少
     *     （「這個 buff 最多加 +10」）。一個基礎攻擊距離已經 11 的英雄在 `final`
     *     讀法下永遠疊不上第一層 —— 對某些卡是對的，對某些卡是荒謬的。
     * ⛔ 不做第三個值：同義詞是最貴的技術債。
     *
     * ⚠️ 語意是**只 refuse、不回收也不夾取**（逐字沿用
     * `grantAttribute.maxAttribute` 的既有先例），所以最後一層可能小幅越線。
     * ⚠️ `basis:"final"` 讀的是 clamp **之後**的值，所以 value 高過 `STAT_CLAMPS` /
     * `config.stat-caps@1` 上界的設定永遠不會咬到 —— 不是缺陷，是兩個天花板取低。
     */
    maxStat: z
      .object({
        stat: zStat,
        /** 兩端都有界；上界是打錯數字的護欄，見 `kindLimits.STAT_CEILING_MAX`。 */
        value: z.number().min(0).max(STAT_CEILING_MAX),
        basis: z.enum(["final", "thisSource"]).optional(),
      })
      .strict()
      .optional()
      .describe(
        "這條加成加到某個絕對值就停（「攻擊距離上限 10」）。basis 決定那個數字" +
          "比的是誰：final（預設＝角色面板上的最終值）或 thisSource（只算這一份" +
          "增益自己疊出來的量，需要 stackKey）。⚠️ 它只**拒絕**再疊，不會把已經" +
          "疊上去的收回來，所以最後一層可能小幅越線。",
      ),
    /** rank-indexed override (index rank-1, clamped) — WC3 buff columns are per level */
    perRank: z
      .array(
        z
          .object({
            modifiers: z.array(zStatModifier),
            /** ⭐ S4a：`permanent` 時整份不填秒數，所以這一格也要是選填。 */
            duration: z.number().min(0).optional(),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    /**
     * #244 — STACK instead of attaching a fresh source per application. All
     * applications carrying the same key share one source `buff:stack:<key>`
     * whose `stacks` counter the stat pipeline already multiplies by.
     */
    stackKey: z.string().min(1).optional(),
    /** #244 — hard ceiling on the stack count (absent = unbounded) */
    maxStacks: z.number().int().min(1).optional(),
    /** #244 — this stack drives the client's growth-tier flags (see snapshot) */
    stackVisual: z.boolean().optional(),
    /**
     * TEMPORARY PROCS granted by this buff. `z.lazy` because `zHookDef` is
     * declared below this union and a hook's `effects` are `zEffectDef` — the
     * same knot `spawnProjectile.onHit` already ties.
     *
     * See the `hooks` member of `sim/effects/effect.ts`: the source-level
     * field has always existed, this is the first way to attach one with a
     * DEADLINE. Expiry is the buff's own `expiresAtTick`, so a proc granted
     * here cannot outlive the buff that granted it.
     */
    hooks: z.array(z.lazy(() => zHookDef)).optional(),
    /**
     * A4（#278 / GH#295）—— 這一份增益**可不可以被【淨化】拔掉**。
     *
     * 省略 = 讀後台 `config.dispel@1` 的 `buffDefaultDispellable`，而出貨值是
     * **false**（「沒有人預期自己買的裝備效果可以被敵人剝掉 —— 打開它是一個
     * 設計決定，不是一個預設值」）。所以在出貨設定下，**只有明確填 `true` 的
     * 來源拔得走**：這一格就是那個「打開它」的動作。
     *
     * ⚠️ GH#295 之前這一格**不存在**，於是 `dispel.pools.buffs` 是一個死開關：
     * 兩道閘相乘為零（預設 false × 沒有任何 authoring 欄位能標 true）。
     */
    dispellable: z.boolean().optional(),
    /**
     * A4（#278 / GH#295）—— 這一份來源是**增益還是減益**（`dispel.polarity`
     * 的過濾讀它）。
     *
     * ⛔ 不可以事後推導：一個來源可以同時帶 `{ms,+0.3}` 與 `{armor,-0.5}`，
     * 任何「看修飾詞猜極性」的啟發式都會在某一張卡上錯，而且從編輯器修不掉。
     *
     * ⚠️ 省略 = 沒有極性，而**有方向的淨化拔不到沒有極性的來源**
     *（`clearPools.polarityPasses`：「不知道」不當成「是」）。也就是說要讓一發
     * 「淨化敵方增益」（`polarity: "buff"`）拔得到它，`dispellable: true` 與
     * `polarity: "buff"` **兩格都要填**。
     *
     * ⭐ GH#662 —— **省略有一個例外**：`modifiers` 解析後**每一條**都明確往下拉
     *（`flat`/`pctAdd`/`pctMult`/`percentOf` 且 value<0）時，引擎在**掛上去的
     * 那一刻**把它記成 `debuff` 並視為可驅散（旋鈕
     * `config.dispel@1.inferDebuffFromNegativeModifiers`，出貨 **true**）。
     * ⛔ 這**不是**「看修飾詞猜極性」：混了方向的（攻速 +100% 配回血 −10）
     * 一律不推論。判準住 `sim/negativePolarity.ts`。
     * ⚠️ 推論是**安全網**，⛔ 不是單一住處 —— 減益請照樣明寫這一格，
     * 閘 `content/negativeBuffPolarity.test.ts` 會叫沒寫的那些。
     */
    polarity: z.enum(["buff", "debuff"]).optional(),
    /**
     * ⭐ **限時授予格擋 / 暴擊來源**（owner #299 第 2 · 6 條）。
     *
     * 在這一格之前，`block` 只掛得到道具與天生技被動、`critStrike` 只掛得到
     * 道具 —— 所以「接下來 5 秒內格擋」與「這支大招期間 20% 機率 3 倍暴擊」
     * **完全沒有形狀**，而那正是 owner 說「授權格要放寬」的那一格。
     *
     * ⭐ 它同時也是**主動技能**那一格的答案：Q/W/E/R/EX 的效果清單裡不需要
     * 一個 `kind: "block"`，因為「暫時獲得格擋」本來就是一份增益。
     * ⛔ 開一個新的 effect kind 才是錯的形狀 —— 那會變成第二套格擋。
     *
     * 到期由這份增益自己的 `expiresAtTick` 管：`blockCutFor` 與
     * `rankedGrants` 都已經在跳過過期的 source，所以這裡**沒有第二個時鐘**。
     * ⚠️ 內部冷卻的記帳（`blockLastFired`）住在 source 實例上，而每一次施放
     * 都是一份新的 source，所以掛在這裡的 `internalCooldown` 讀作
     * 「這一次施放最多擋幾次」——與 `hooks` 那一格的 `internalCooldown`
     * 逐字相同的語意，不是全域冷卻。
     */
    ...SOURCE_GRANT_SHAPE,
  })
  .strict();

export const refine = refineApplyBuff;
