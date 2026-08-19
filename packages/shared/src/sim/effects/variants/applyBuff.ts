/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { StatusId } from "../../../ids";
import type { HookDef, StatModifier } from "../../stats/modifiers";
import type { Stat } from "../../stats/statTypes";

/**
 * `perRank` (index rank-1, clamped to the last entry) is the rank-indexed
 * variant: WC3 authors every buff column per ability LEVEL (`Oae1/Oae2`
 * 增加移動速度/攻擊速度, `adur` 持續 …), and a single `modifiers`+`duration`
 * pair can only carry one of them. When present it REPLACES the flat pair for
 * that rank; the flat pair stays as the rank-1 fallback so existing docs and
 * hook-fired buffs (rank 1) are untouched.
 */
export interface ApplyBuffVariant {
  kind: "applyBuff";
  modifiers: StatModifier[];
  /**
   * 這份增益掛多久（秒）。⭐ S4a 之後它是**選填**，與 {@link permanent}
   * **互斥且必填其一**（schema 的 `refineApplyBuff` 兩個方向都關死）。
   * ⛔ 「省略 duration」本身**不等於**永久 —— 那會讓一個打字漏填變成一份靜默
   * 的永久增益，而那正是這個 repo 反覆踩到的那一類。
   */
  duration?: number;
  /**
   * ⭐ S4a —— **永久**（80-00「每次擊殺 +1 層、永久」/ 92-03）。
   *
   * 引擎層從第一天就做得到：`ModifierSource.expiresAtTick` 缺席 = 永久
   *（`buffExpirySystem` 的 `s.expiresAtTick !== undefined &&` 那一半就是它活
   * 下來的原因）。缺的一直是 **authoring 面** —— 於是出貨已經有四份文件用
   * `duration: 99999` 假裝永久。
   *
   * 預設語意是**整場**（回合重置不清 buff 來源）；⭐ GH#354 / G3 之後
   * {@link permanentScope} 可以把它改成「只到這一回合結束」。
   */
  permanent?: boolean;
  /**
   * ⭐ GH#354 / G3 —— 這份**永久**增益的永久到哪裡為止。
   * 缺席 = `"match"` = 整場 = 今天。
   *
   * ⛔ `"round"` **不是**「幫你換算成一個到期 tick」：回合長度是 host 相位機
   * 決定的（決賽 180 秒 vs 平時 100 秒，火圈提前收場是常態），sim 端沒有那份帳。
   * 它變成 `ModifierSource.roundScoped` 一個旗標，由
   * `sim/clearPools.ts::clearRoundScoped` 在**下一回合開打前**拔掉。
   *
   * ⚠️ 這一格在 2026-08-17 之前的註解寫著「⛔ 不做」，理由是唯一的回合鉤子
   * `clearForFreshBody` 復活時也會跑。那個理由**已經過期**：#354 的
   * `roundStart` 落地之後，回合開始有了一個與復活無關的座標，
   * 所以 `"round"` 現在真的等於「這一回合」。（第三守則：註解會說謊。）
   */
  permanentScope?: "match" | "round";
  /**
   * ⭐ G10 —— 這份來源**同時是一個具名標記**（52-01 狂怒 / 破甲 / 破魔）。
   *
   * 缺席 = 不是任何標記 = 今天。⭐ 它把「標記」與「數值」變成**同一個物件**，
   * 所以兩本帳不可能再腐爛：`extendBuff` 改的就是那一份來源的 `expiresAtTick`
   *（實測缺陷：buff 361→573 而 status 停在 361，於是 52-02 的閘在玩家還在狂怒
   * 中時就關了）；淨化／回合重置／到期同理。
   *
   * ⚠️ 讀取端是 `effectCommon.ts` 的 `hasStatus` / `statusStacks`（已經是
   * `world.status` + `world.marks` 的統一讀取器，這是第三本帳）。
   * ⚠️ `stackKey` 路徑的 `stacks` 直接就是 `condition.status.minStacks` 讀得到
   * 的層數（「他身上疊了 3 層破甲嗎」）。
   */
  statusId?: StatusId;
  /**
   * ⭐ S9b —— 這一份增益落在誰身上：`"target"`（省略 = 這個，`ctx.targets`）
   * 或 `"self"`（施法者自己）。
   *
   * 它解鎖的是「**一條** hook 讀敵人狀態、增益自己」：拆成兩條 hook 不是一次
   * 判定 —— ICD 記在 `src.hookLastFired[hi]`（**逐 hook** 一格）、機率也是逐
   * hook 各抽一次，所以「30% 機率對帶恐懼的敵人追加傷害**並且**自己加攻速」
   * 寫成兩條 hook 會有 9% 的情況只發生一半，而畫面上看不出來。
   *
   * ⛔ 與其他九個 kind 用**同一格**語意（`applyStatus` / `restore` /
   * `spendMana` / `leap` / `cycleBuff` / `blink` / `evasion` / `invulnerable`
   * / `knockback`），`applyBuff` 是漏掉的那一個。
   */
  applyTo?: "self" | "target";
  /**
   * ⭐ G5（state.exclusive-group@1）—— 這份增益屬於哪一個**互斥組**。
   *
   * 缺席 = 不互斥 = 今天（實測：三個不同 origin 的形態 buff 同時掛著，攻速
   * 乘區逐位元等於 1.4³）。⚠️ `stackKey` **不是**這題的答案：實測同 key 的
   * 第二發會把 modifiers **整組丟掉**，只把 `stacks` 加一。
   *
   * 15-02/03/04 那種「身上永遠只有一種戰型」寫的就是這個。
   * ⛔ 它只做 gameplay 狀態互斥；3D 身體那一半仍然是 `championForm` 的地盤。
   */
  exclusiveGroup?: string;
  /**
   * ⭐ G5 —— 同組已經有一份時怎麼辦。省略 = `"replace"`（新的接手、舊的整份
   * 拔掉 —— 抄 `addShield.onExisting` 的預設，也是 owner「[變身]為唯一狀態
   * 不可疊加」讀起來的意思）；`"reject"` = 新的不生效、舊的原地不動。
   * ⛔ 沒有 `keepLonger`：形態不是一個量，「比較久的那個形態贏」對玩家無法解釋。
   * ⚠️ 沒有 `exclusiveGroup` 卻填了它 = PARSE ERROR（同 `shield.onExisting`
   * 需要 `stackKey`）。
   */
  exclusiveOnExisting?: "replace" | "reject";
  /**
   * ⭐ S4b —— 這條加成加到某個**絕對值**就停（80-00「上限到 10」）。
   *
   * 缺席 = 沒有絕對上限 = 今天（實測：同 stackKey 疊 21 次 +1 攻擊距離，
   * 11 → 32，沒有任何東西攔它）。授權契約（為什麼 `maxStacks` /
   * `ModOp.CapRaise` / `grantAttribute.maxAttribute` / `STAT_CLAMPS` 四個都
   * 不是答案）住在 `content/schema/effect.ts` 的 `applyBuff.maxStat`，
   * ⛔ 不在這裡重複一份（兩份會分岔）。
   *
   * · `basis` 省略 = `"final"` = 讀 `StatsComp.final[stat]`（玩家面板上那個數字）。
   * · `"thisSource"` = 只算這一份 `stackKey` 來源自己貢獻的量（需要 `stackKey`，
   *   載入時擋）。
   *
   * ⚠️ 語意是**只 refuse、不回收也不夾取**（同 `grantAttribute.maxAttribute`），
   * 所以最後一層可能小幅越線 —— 那是那條先例已經接受的行為。
   */
  maxStat?: { stat: Stat; value: number; basis?: "final" | "thisSource" };
  perRank?: { modifiers: StatModifier[]; duration?: number }[];
  /**
   * STACKING (task #244). Without it every application attaches a NEW
   * ModifierSource keyed `buff:<origin>#<tick>` — which has two defects for
   * a "permanent, once per kill" buff: 180 kills leave 180 live sources for
   * `recomputeStats` and `fireHooks` to rescan, and two kills on the SAME
   * TICK (one AoE, two mobs) collide on that id so only ONE lands.
   *
   * With `stackKey` the buff instead lands on ONE source with the fixed id
   * `buff:stack:<stackKey>` and bumps its `stacks` counter. `statPipeline`
   * already multiplies every flat/percent-add modifier by `stacks`, so the
   * arithmetic is identical while the source count stays O(1).
   */
  stackKey?: string;
  /** hard ceiling on `stacks` (absent = unbounded) */
  maxStacks?: number;
  /**
   * This stack is meant to be SEEN: the snapshot sums `stacks` over sources
   * flagged this way and sets the growth-tier ENTITY_FLAG bits, so a
   * champion-agnostic "visible growth" read costs zero new wire fields.
   */
  stackVisual?: boolean;
  /**
   * HOOKS this timed source carries — a buff that grants a temporary PROC,
   * not just temporary numbers.
   *
   * `ModifierSource.hooks` has always existed and `fireHooks` has always
   * walked it (that is how item passives and 天生技 fire), but until now the
   * ONLY way to attach one was a permanent source — an item, an augment, a
   * `passive.ranks[N]` block. Nothing could say 「接下來 5 秒，你的下一次 Q
   * 命中會多做一件事」, which is exactly what 揍敵客阿福 EX 絕.暗殺奧義 is.
   *
   * Expiry is the SAME `expiresAtTick` the modifiers use (an absolute tick),
   * and `fireHooks` already skips a source whose deadline has passed, so a
   * hook granted this way cannot outlive its buff. `hookLastFired` is
   * per-source-INSTANCE, so `internalCooldown` on one of these hooks reads
   * 「一次施放最多觸發幾次」 rather than a global clock.
   */
  hooks?: HookDef[];
  /**
   * A4（#278 / GH#295）—— 這一份增益可不可以被【淨化】拔掉。
   * 省略 = `world.dispelRules.buffDefaultDispellable`（出貨 **false**），
   * 所以出貨設定下只有明確填 true 的來源拔得走。寫進 `ModifierSource`。
   */
  dispellable?: boolean;
  /**
   * A4（#278 / GH#295）—— 增益還是減益。⛔ 施加時寫下，不推導（一個來源可以
   * 同時帶正負修飾詞）。省略 = 無極性 = **有方向的淨化拔不到它**。
   */
  polarity?: "buff" | "debuff";
  /**
   * ⭐ 限時授予**格擋 / 暴擊來源**（owner GH#299 第 2 · 6 條）。
   *
   * 這兩格是「主動技能」與「限時」兩個授權格的**同一個**答案：一支 Q 想給
   * 「接下來 5 秒內 30% 機率格擋」或「這段期間 20% 機率 3 倍暴擊」，寫的是
   * 一份 `applyBuff`，⛔ 不是一個新的 effect kind —— 新 kind 會變成第二套
   * 格擋 / 第二套暴擊，而 `blockCutFor` / `rankedGrants` 只認得
   * `StatsComp.sources` 上的這兩格。
   *
   * 到期由這份 buff 自己的 `expiresAtTick` 管（兩個讀取端都已經在跳過過期的
   * source），所以**沒有第二個時鐘**。`blockLastFired` 住在 source 實例上，
   * 而每次施放都是一份新的 source，所以掛在這裡的 `internalCooldown` 讀作
   * 「這一次施放最多擋幾次」—— 與 `hooks` 那一格逐字相同的語意。
   *
   * ⚠️ 疊層路徑（`stackKey`）也帶，理由與 `hooks` / `dispellable` 完全相同：
   * 一支技能一旦也填了 `stackKey`，這兩格就會靜默失效（失敗形態 ②）。
   */
  block?: import("../../combat/block").BlockGrant;
  critStrike?: import("../../combat/critStrike").CritStrikeGrant;
  /**
   * ⭐ 2026-08-09 (G7) —— 第三、第四格授予，語意與上面兩格逐字相同（同一份
   * `SourceGrantFields`、同一個 `sourceGrants()` 轉發、同一個 `expiresAtTick`
   * 當時鐘）。它們解鎖的是「這支大招期間力量 +30」與「接下來 5 秒你的普攻
   * 是真傷」—— 兩件在此之前**只有道具**寫得出來的事。
   *
   * ⛔ 這裡不能直接 `& SourceGrantFields`：`EffectDef` 是一個
   * `discriminatedUnion` 的鏡子，成員必須是純物件型別。加一格授予時這四行
   * 要跟 `SourceGrantFields` 一起改 —— 而 `content/compat.test.ts` 的
   * 型別鏡射斷言就是那道會紅的閘。
   */
  attributes?: import("../../stats/attributes").AttrGrant;
  damageTypeOverride?: import("../../combat/damageTypeOverride").DamageTypeOverride;
  /**
   * ⭐ 2026-08-09 (S11) —— 第五格授予：**限時飛行**。
   *
   * ⚠️ **這一行在 2026-08-10 之前漏了**，而上面那段註解逐字寫著「加一格授予時
   * 這四行要跟 `SourceGrantFields` 一起改」—— 也就是那份鏡像自己記錄了它會
   * 漂，然後它真的漂了：Zod 的 `SOURCE_GRANT_SHAPE` 有 `flight`、
   * `sourceGrants()` 有 `flight`、`fieldAdoption` 有
   * `field:abilities.effects[]#applyBuff.flight` 的豁免，只有這個型別鏡子沒有。
   * 後果是 `packages/shared/src/sim/effects/authGatesWave1.test.ts` 那條「限時
   * 飛行」的守衛**根本編譯不過**（`pnpm typecheck` 在 main 上就是紅的）。
   */
  flight?: import("../../stats/sourceGrants").SourceGrantFields["flight"];
  /**
   * ⭐ 2026-08-18 (GH#373) —— 第六格授予：**限時隱形 / 限時真視**。
   *
   * 53-00 空間穿梭「持續 20 秒」與 30-00 攝影機「可以看到隱形部隊」在此之前
   * 寫不出來：`vision` 只掛得到道具（永久佩戴）與天生技 rank（rank>0 之後
   * 永久），而這兩支是**主動**天生技。引擎那一半從 2026-07-30 就在
   * （`sim/stealth.ts::syncVisionGrants` 掃 `StatsComp.sources`、不問 `kind`、
   * 已經在跳過過期的 source），所以整條接線就是這一行 + `SOURCE_GRANT_SHAPE`
   * 那一格 + `sourceGrants()` 的轉發。
   */
  vision?: import("../../stats/sourceGrants").SourceGrantFields["vision"];
}
