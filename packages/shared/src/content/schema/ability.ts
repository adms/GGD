/** ability@1 — mirrors `AbilityDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AbilityId } from "../../ids";
import { zChampionAbilitySlot, zIdFor, zInnateKind, zRef, zStat, zTintRgb } from "./common";
import { zEffectCondition } from "./condition";
import { hasBudgetedLeaf, zAbilityPassive, zEffectDef, zHookEvent } from "./effect";
import { zMarkSpec } from "./mark";
import { zAbilityTemplateBinding } from "./template";
import { zAbilityVfxLayers } from "./abilityVfx";
// 五個級別名（極小/小/中/大/極大，GH#463）。⛔ 不要在這裡重打一份字串陣列 ——
// 後台下拉、級距表、文件都讀同一個常數，抄第二份就是 drift 的起點。
import { AOE_TIER_NAMES } from "../aoeTiers";
import { RANGE_TIER_NAMES } from "../rangeTiers";
import { COOLDOWN_SHAPES, COOLDOWN_TIER_NAMES } from "../cooldownTiers";
import { MANA_TIER_NAMES } from "../manaTiers";

export const zCastType = z.enum(["targeted", "skillshot", "ground", "self", "dash"]);

/**
 * Optional per-source HIT-FEEL override (task #133). Additive & ALL-OPTIONAL:
 * a champion basic-attack or an ability may set any subset to override the
 * damage-derived default that `applyImpact` (sim/combat/damage.ts) otherwise
 * computes for that hit; unset fields fall back to the default (scaled by the
 * hit's damage tier). MIRRORS `HitFeelInput` in `sim/combat/hitFeel.ts` — keep
 * the two in sync (same discipline as defs.ts mirroring the schemas). The
 * gameplay trio (hitstop/hitstun/knockbackMag) tunes the deterministic sim
 * reaction; the rest are cosmetic hints the client consumes. Bounds match the
 * sim's override caps so authored content can't stall the match.
 */
export const zHitFeel = z
  .object({
    /** freeze ticks for BOTH fighters (default: impact-derived). */
    hitstopTicks: z.number().int().min(0).max(20).optional(),
    /** victim-only action-lock ticks (clamped >= the resolved hitstop). */
    hitstunTicks: z.number().int().min(0).max(30).optional(),
    /** push distance in GGD units (default: impact/type-derived). */
    knockbackMag: z.number().min(0).max(8).optional(),
    /** camera shake amplitude hint (default scales with tier). */
    shakeMag: z.number().min(0).max(2).optional(),
    /** shake character (default: directional, omni on crit/EX). */
    shakeStyle: z.enum(["directional", "omni"]).optional(),
    /** hit-spark identity (default derived from tier/type/block). */
    sparkKind: z.enum(["hit", "heavy", "counter", "block", "magic", "ice"]).optional(),
    /**
     * Victim body-flash colour [r,g,b] 0..1 — the ability's ELEMENT tint
     * (holy gold, ice blue, fire orange…). Unset = the client's measured
     * damage-type palette (physical/true red, magic magenta), which is what
     * every basic attack uses.
     *
     * AUTHORING NOTE: pale/near-white values are automatically saturated by
     * the client (`legibleFlashColor` in render/combatFeedback.ts) before they
     * are drawn. The overlay blends with ALPHA_COMBINE, so a washed-out colour
     * is literally invisible on a pale model — the guard keeps your HUE and
     * deepens it. Author the hue you want; don't pre-brighten it.
     */
    flashColor: zTintRgb.optional(),
    /**
     * Victim body-flash duration ms (default scales with tier: 110–185).
     * Ceiling is 260, not "some big number": the flash MUST clear before the
     * next hit or back-to-back autos strobe (收尾精準). Was max 1000, which
     * let content author a value the channel could not honour — and, until
     * this was wired up, could not honour anything at all.
     */
    flashMs: z.number().min(30).max(260).optional(),
    /** one-shot directional camera kick magnitude (default scales with tier). */
    camKick: z.number().min(0).max(2).optional(),
    /** cosmetic client-side EX freeze ticks (default: EX hits only). */
    exFreeze: z.number().int().min(0).max(30).optional(),
  })
  .strict();

/**
 * 維持成本的上界。50 打成 500 會過後台、然後在下游被靜默夾掉（#277 的形狀），
 * 所以每一格都要有**上界不只下界**（CLAUDE.md 第一守則）。
 *
 * 500 不是平衡政策，是**打錯字的閘**：出貨最貴的一支是 20-01 風王結界的
 * 90（rank 4），而一個真的超過 500 的維持成本代表「按一下就空魔」——
 * 那不是切換技，那是一發技能，應該用 `manaCost` 表達。
 */
export const TOGGLE_UPKEEP_MAX = 500;
/** `perSecond` 節奏的週期上界（秒）。超過一場戰鬥長度 = 這一格沒有意義。 */
export const TOGGLE_INTERVAL_MAX_SEC = 60;

/**
 * 【切換】—— 同一顆按鈕的開／關兩態（20-01 風王結界 · 70-00 紮根）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼「開關成本」與「維持成本」是**兩個**欄位
 *
 * 20-01 的文案逐字寫著兩組不同的數字：
 *   「每次[開關]耗[MP] 50/100/150/200」          ← 這是 `ability@1.manaCost`
 *   「開啟時[每次攻擊][消耗]MP30/50/70/90」      ← 這是 `upkeepCost`
 * 用同一格表達的話，20-01 的兩個數列必須二選一，而**兩個都是文案上印出來的**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ `onExit` 是必要欄位，不是選配
 *
 * 一個沒有 `onExit` 的切換技只是一個開關；20-01 的傷害**有一半在關閉那一刻**
 * （「關閉時，凝聚的風能一次釋放『風王鐵槌』」）。做成選填的話，忘了填的那一支
 * 在畫面上跟正常一模一樣 —— 玩家只會覺得「這招怎麼沒傷害」（失敗形態 ②）。
 * 空陣列是合法的，但那是作者**明說**「關掉時什麼都不發生」。
 *
 * ⛔ 而且手動關閉與資源耗盡自動關閉走的是**同一個 onExit**，見
 * `sim/abilities/toggle.ts` 的 `exitToggle` —— 兩條路 = 兩份會各自腐爛的實作。
 */
export const zAbilityToggle = z
  .object({
    /**
     * 維持成本的**節奏**。這是一個決策點，所以它是一格而不是一個 if：
     * 20-01 是「每次攻擊」，70-00 紮根**完全沒有維持成本**。
     *
     * · `"none"`      —— 開著不花錢（70-00 紮根）。`upkeepCost` 被忽略。
     * · `"perAttack"` —— 每一次普攻揮出時扣一次（20-01 風王結界）。
     *                    ⚠️ 依據是「揮出」不是「打中」：`basicAttack` 事件在
     *                    迴避／失手判定**之前**發射，而文案寫的是「每次攻擊」。
     * · `"perSecond"` —— 每 `upkeepIntervalSec` 秒扣一次。
     */
    upkeepCadence: z.enum(["none", "perAttack", "perSecond"]),
    /**
     * 每一次維持扣多少（per rank，index = rank-1）。20-01 是 30/50/70/90。
     * ⚠️ 與 `ability@1.manaCost`（開關成本）是**不同的數列**，見檔頭。
     */
    upkeepCost: z.array(z.number().min(0).max(TOGGLE_UPKEEP_MAX)).min(1),
    /**
     * 維持成本扣哪一種資源。省略 = `"mana"`（【燒魔】）。
     * `"health"` 是留給【燒血】型切換技的那一半 —— 它今天沒有客戶，但它是
     * 一個決策點，寫死成 mana 就等於替下一支燒血技決定了它不存在。
     */
    upkeepResource: z.enum(["mana", "health"]).optional(),
    /** `perSecond` 的週期（秒）。省略 = 1 秒。其他節奏下**不得填**（見 refine）。 */
    upkeepIntervalSec: z.number().min(0.1).max(TOGGLE_INTERVAL_MAX_SEC).optional(),
    /**
     * 關閉那一刻跑的效果 —— 20-01 的「風王鐵槌」住在這裡。
     * 手動關閉與資源耗盡自動關閉**共用這一份**（`exitToggle` 是唯一出口）。
     */
    onExit: z.array(zEffectDef),
    /**
     * ⭐ G13-2 —— 這顆按鈕**開著的期間**，持有者身上多了什麼（20-01 風王結界的
     * 防禦、70-00 紮根的光環）。缺席 = 開著什麼都不多 = **今天的行為逐字**
     *（`enterToggle` 在這一格之前一次 `attachSource` 都不做）。
     *
     * ⭐ **刻意重用 {@link zAbilityPassive}**（`{ name?, ranks: [...] }`），
     * ⛔ 不是寫第二份 `EffectDef[]`。三個理由，每一個都是硬的：
     *   ① `EffectDef[]` 表達不出「開著期間」—— effect 是一次性的；要維持
     *      「防禦×2」得寫一個 `applyBuff` 加一個 `duration`，而那個 duration
     *      必須等於**沒有人知道多長**的切換時間。作者只能猜一個大數字，於是
     *      關掉之後 buff 還在（失敗形態②，畫面上看不出來）。
     *   ② `zAbilityPassiveRank` **已經是**「一段期間身上有什麼」的完整詞彙
     *     （modifiers / hooks / auras / vision / flight / block / critStrike /
     *      attributes / damageTypeOverride 九種 payload + `whileForm` 形態閘）。
     *      重用它 = 這九種當天全部對切換技開放，schema 一格、handler 一支
     *     （第零守則⑨）。
     *   ③ rank 索引免費拿到：20-01 有 4 個 rank、四組不同的數字，而 `ranks[]`
     *      的語意與 passive 逐字相同 —— 作者不用學第二套。
     *
     * ⚠️ 已知邊界（**不是**漏掉）：`syncAbilityPassives` 不碰這條來源，所以
     * **開著的時候升級不會換 rank**。今天沒有客戶（0 份文件帶 `toggle`），
     * ⛔ 不要為它現在就加第三格欄位。
     *
     * ⚠️ 它與 `champion@1.transform` 是兩件事：這一格只給**屬性與觸發器**，
     * ⛔ 不換 3D 身體。要換身體仍然走 `championForm`。
     */
    whileOn: zAbilityPassive.optional(),
    /**
     * ⭐ G13-2 —— 關閉那一刻，`onExit` 的效果**吃不吃得到** `whileOn` 自己的
     * 加成。省略 = `false` = 先卸下再跑 `onExit`。
     *
     * 這是一個會直接改變傷害數字、而且**兩邊都有人想要**的決策：
     * 「凝聚的風能一次釋放」讀起來像是應該吃到風王結界自己的加成（`true`），
     * 但「開著時 AP +50%、關閉時放一發吃 AP 的大招」寫成 `true` 就是一個很容易
     * 被忽略的雙重收益（`false`）。⛔ 我不挑一邊然後在註解裡辯護；預設選
     * 「不吃」，因為那是今天沒有這個功能時的等價行為。
     */
    whileOnDuringExit: z
      .boolean()
      .optional()
      .describe(
        "關閉時的效果要不要吃到「開著期間」的加成。留空＝不吃（先卸下加成，再跑關閉效果）。" +
          "打開它，關閉那一發爆發就會用開著時的強化數值結算。",
      ),
    /**
     * 資源不足以支付維持成本時，要不要自動關閉。省略 = `true`
     * （20-01 文案：「[MP]不足則自動關閉」）。
     *
     * 填 `false` 的讀法是「付不出來就那一次不扣，但繼續開著」—— 那是一個
     * 真的有人會想要的設計（免費維持的儀式型切換），所以它是一格而不是一個
     * 寫死的 true。
     */
    exitOnResourceEmpty: z.boolean().optional(),
    /**
     * 手動關閉要不要再付一次 `ability@1.manaCost`。省略 = `true`
     * （20-01 文案：「每次**開關**耗[MP]」—— 開一次、關一次，各付一次）。
     *
     * ⚠️ **自動關閉永遠不付**，而且那不是這一格能改的：自動關閉的觸發條件
     * 就是「付不出維持成本」，再要求它付一筆更貴的開關成本是自相矛盾的。
     */
    costOnExit: z.boolean().optional(),
    /**
     * 關閉要不要讓這支技能重新進冷卻。省略 = `false`。
     *
     * 預設 false 的理由：20-01 的 60 秒冷卻是**擋重新開啟**的，開一次就轉一次
     * 已經夠了；關閉再轉一次等於同一次使用被收兩次租。填 true 就變成
     * 「關掉之後還要再等 60 秒才能再開」的另一種設計。
     */
    cooldownOnExit: z.boolean().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    // 填了但永遠不會發生 = 失敗形態 ②，而且它在後台看起來完全正常。
    if (t.upkeepCadence !== "perSecond" && t.upkeepIntervalSec !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["upkeepIntervalSec"],
        message: 'upkeepIntervalSec 只在 upkeepCadence: "perSecond" 下有意義',
      });
    }
  });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 【跨技能強化】`ability-augment@1` —— 一支技能**指名改寫另一支技能的數字**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 覆蓋矩陣（`docs/legacy/_skill-mechanics-coverage-20260808.md`）的第二名，擋著四支，
 * 而且**未來每一隻英雄的 EX 大多長這樣**：
 *
 *   · 59-001 完全暴走 —— 改寫 59-00 暴走的**門檻**（降為最大生命 20%）
 *   · 70-002 樹海降臨 —— 對 70-04 千年練成**追加 500% AP**
 *   · 77-002 御雷劍   —— 77-02 雷鳴劍**機率**上升至 50%、
 *                        77-03 GLADIARIA ALAT **持續時間**增加至 30 秒
 *   · 92-002 最終戈壁 —— 強化 92-04 馬勒戈壁
 *
 * 這四支要的操作剛好就是四種：**改機率 · 改持續時間 · 加傷害係數 · 改門檻**，
 * 所以 {@link AUGMENT_OPS} 就是這四個 —— ⛔ 沒有第五個「以後可能會用到」的成員。
 * 一個沒有客戶的操作在後台看起來完全正常，而它什麼都不會做（失敗形態 ②）。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼「操作」是一個 enum，不是一條 JSON Pointer
 *
 * `main_load_editor_plan.md` §4.4 明列禁止兩件事，而它們是同一個東西的兩面：
 *
 *   ① **不可從技能名稱文字反推**目標 —— 所以 {@link zAbilityAugmentTarget}
 *      的 `abilityId` 是 `zRef("abilities")`，一個**硬參照**：打錯字在
 *      `validateReferences` 就被擋下（見 `content/refs.ts` 的 `abilityRefs`），
 *      不是在某一場比賽裡靜默地什麼都沒發生。
 *   ② **不可用位置 JSON Pointer**（`/effects/2/amount/ratios/0/coeff`）——
 *      因為目標技能被重排一次，那條路徑就會安靜地指到**相鄰的另一個效果**。
 *      計畫 §13 對這件事的要求逐字是「刪除、改名或重排 target 的 stable edge 時
 *      **fail closed**，不得套到相鄰效果」。
 *
 * 這裡的解法是：操作**指名一種數字**（機率／持續時間／AP 係數／門檻），
 * 而不是指名一個位置。重排 hooks 不會改變「哪一格是機率」，所以這條邊
 * 天生對重排免疫 —— 不需要一個會過期的索引。
 *
 * ⚠️ 語意是明講的：一個操作套用在目標技能裡**每一個同名數字**上。
 * 「雷鳴劍發動機率上升至 50%」講的就是那一支技能的機率，不是「第 0 個 hook 的」。
 * 要更窄就填 {@link zAbilityAugmentOp} 的兩格選擇器（`hookOn` / `nodeKind`），
 * 它們一樣是**具名的**，不是位置。
 */
export const AUGMENT_OPS = [
  "procChance",
  "durationSec",
  "damageCoeffAp",
  "thresholdPct",
  /**
   * ⭐ G6-2（2026-08-10）—— 改寫目標技能**某一條 `StatModifier` 的數值**
   *（「把那支技能的護甲加成從 +10 改成 +100」）。
   *
   * 在它之前這一族只能靠「複製一整份技能文件再改一個數字」表達，而那正是
   * 第〇·五守則說的「為某支技能寫一份程式」的內容版。
   * ⚠️ 它**必須**指名 {@link zAbilityAugmentOp} 的 `stat`（superRefine 擋）：
   * 一個 passive 區塊的 `modifiers` 通常不只一條（護甲 +10、力量 +10、
   * 攻速 +0.2），沒有那一格的話「改加成量」會把三條一起改成同一個數字，
   * 而**後台看起來完全正常**。
   */
  "modifierValue",
] as const;
export type AugmentOpName = (typeof AUGMENT_OPS)[number];

/**
 * 每一種操作的 `value` 兩端界 —— **上界不只下界**（CLAUDE.md 第一守則）。
 *
 * 上界不是平衡政策，是**打錯字的閘**：`procChance` 把 50% 抄成 `50` 而不是
 * `0.5` 等於「永遠觸發」，而那在後台跟正確的值長得一模一樣。
 */
export const AUGMENT_OP_BOUNDS: Readonly<Record<AugmentOpName, readonly [number, number]>> = {
  /** 機率是比例。77-002 的「上升至 50%」= `set 0.5`。 */
  procChance: [0, 1],
  /** 秒。77-002 的「增加至 30 秒」= `set 30`；上界 600 秒遠超一場戰鬥。 */
  durationSec: [0, 600],
  /** AP 係數。70-002 的「追加 500% [AP]」= `add 5`。負值 = 減益向的強化。 */
  damageCoeffAp: [-10, 10],
  /** 門檻比例。59-001 的「降為低於最大生命 20%」= `set 0.2`。 */
  thresholdPct: [0, 1],
  /**
   * ⭐ G6-2 —— 一條 `StatModifier` 的 `value`。
   *
   * ⚠️ 這一格必須**同時**容納兩種量綱：`ModOp.Flat` 的絕對值（出貨最大的道具
   * 加成量級是幾百）與 `ModOp.PercentAdd` 的比例（0.5 = +50%）。10000 不是
   * 平衡政策，是**打錯字的閘** —— 一個真的超過 10000 的 flat 加成代表有人把
   * w3x 原始數字直接抄進來沒換算（與 `zAuraDef.radius` 的 40 上界同一種理由）。
   *
   * ⚠️ 副作用寫在明處：{@link AUGMENT_VALUE_MIN}/{@link AUGMENT_VALUE_MAX} 是
   * 整張表的 min/max，所以加這一列會把 `zAbilityAugmentOp.value` 的**外層**界
   * 從 [-10, 600] 撐到 [-10000, 10000]。這是既有設計（外層是聯集、內層
   * superRefine 逐 op 收緊，同 `refineModifyCooldown` 的形狀）——
   * `procChance: 5000` 仍會被 superRefine 擋在 [0, 1]。
   */
  modifierValue: [-10000, 10000],
};

const AUGMENT_VALUE_MIN = Math.min(...Object.values(AUGMENT_OP_BOUNDS).map((b) => b[0]));
const AUGMENT_VALUE_MAX = Math.max(...Object.values(AUGMENT_OP_BOUNDS).map((b) => b[1]));

/** 一個目標最多幾條操作 —— 打錯字的閘，不是設計上限。 */
export const AUGMENT_MAX_OPS = 8;
/** 一支技能最多強化幾支 —— 同上。77-002 是目前最多的那一支（兩支）。 */
export const AUGMENT_MAX_TARGETS = 8;

export const zAbilityAugmentOp = z
  .object({
    /** ⭐ allowlist。⛔ 不是路徑、不是欄位名、不是名稱文字。 */
    op: z.enum(AUGMENT_OPS),
    /**
     * 怎麼改。**兩個成員，因為四支文案剛好用到兩種**：
     * · `"set"` —— 「上升**至** 50%」「增加**至** 30 秒」「降**為** 20%」（77-002 / 59-001）
     * · `"add"` —— 「**追加** 500% [AP]」（70-002）
     *
     * ⛔ 沒有 `"mult"`：四支沒有一支要它，而一個沒有客戶的模式只會在後台
     * 多一個選項、在遊戲裡什麼都不做。加它的成本是**一行**，等有卡再加。
     */
    mode: z.enum(["set", "add"]),
    /** 界依 `op` 而定，見 {@link AUGMENT_OP_BOUNDS}（superRefine 逐條驗）。 */
    value: z.number().min(AUGMENT_VALUE_MIN).max(AUGMENT_VALUE_MAX),
    /**
     * 只套用在**這個事件**的 hook 上。省略 = 目標技能的全部 hook。
     * 具名（`zHookEvent` 的 allowlist），所以重排 hooks 不影響它。
     */
    hookOn: zHookEvent.optional(),
    /**
     * 只套用在 `kind` 等於這個字串的節點上（effect kind 或 condition kind）。
     * 省略 = 那一種數字的每一個出現位置。
     *
     * ⭐ `op: "thresholdPct"` **必填**（superRefine 擋）—— 這就是計畫 §13
     * 「不得套到相鄰效果」的閘：一棵 condition 樹裡可以有好幾個 `value`
     * （機率、層數、距離…），沒有這一格的話「改門檻」會順手改掉它們。
     * ⚠️ 它是一個字串而不是 enum，因為 condition 的 kind 表住在另一份 schema；
     * 把它抄過來就是第二份會過期的真相。打錯字 = 這條操作**匹配不到任何節點**，
     * 語意上等於沒填 —— 這是這一版已知的軟點，寫在 `editorCapabilities` 的
     * `ability-augment@1` caveat 裡，⛔ 不要假裝它會紅。
     */
    nodeKind: z.string().min(1).optional(),
    /**
     * ⭐ G6-1 / G6-4 —— 這條操作**打得到目標技能的哪幾個地方**。
     *
     * 省略 = `"all"` = 目標技能裡每一個同名數字：hook 上的（`chance` /
     * hook 效果裡的持續與係數）、主動施放的 `effects[]` 上的，以及來源授予
     *（`critStrike.chance`）上的。
     *
     * ⚠️ 這**與「今天的行為」不完全相同**（今天只有 hooks 那一條線接上了），
     * 而它是刻意且**可觀測等價**的：全 repo 帶 `augment` 的技能文件是 **0 份**，
     * 所以兩種預設在今天逐位元相同。選 `"all"` 是因為它等於這個檔頭已經寫死的
     * 語意「一個操作套用在目標技能裡**每一個**同名數字上」；選 `"hooks"` 反而會
     * 讓作者寫出一份看起來對、只生效一半的強化（失敗形態②）。
     *
     * ⭐ 一格收**兩個**決策（第零守則⑨，⛔ 不是兩個 boolean）：
     *   ① 一條 `durationSec` 到底打 hook 裡的效果、主動技的 `effects`，還是兩者。
     *   ② 一條 `procChance` 要不要順手改到 `critStrike.chance`（一支技能可能
     *      同時有一個 15% 的 on-hit proc 與一個 6% 的暴擊來源，而作者說
     *      「機率上升至 50%」時心裡想的通常只有其中一個）。
     */
    scope: z
      .enum(["all", "hooks", "effects", "grants"])
      .optional()
      .describe(
        "這條強化改到哪裡：all（預設，目標技能裡每一個同名數字）／" +
          "hooks（只改觸發器上的）／effects（只改主動施放的效果）／" +
          "grants（只改來源授予的，例如暴擊來源的機率）。",
      ),
    /**
     * ⭐ G6-2 —— `op: "modifierValue"` 指名**哪一條屬性**的加成量。
     * 該 op 下**必填**，其餘 op 下**不得填**（superRefine 兩個方向都關）。
     */
    stat: zStat.optional().describe(
      "只有「改加成量」這種強化要填：指名要改哪一條屬性的加成（護甲／力量／攻速…）。" +
        "不填的話一份被動上的三條加成會被一起改成同一個數字，而後台看起來完全正常。",
    ),
  })
  .strict()
  .superRefine((o, ctx) => {
    const [lo, hi] = AUGMENT_OP_BOUNDS[o.op];
    if (o.value < lo || o.value > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `op "${o.op}" 的 value 必須落在 [${lo}, ${hi}]（拿到 ${o.value}）`,
      });
    }
    if (o.mode === "set" && o.value < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: 'mode "set" 不接受負值 —— 負的機率/持續時間/門檻沒有意義；要減請用 "add"',
      });
    }
    if (o.op === "procChance" && o.nodeKind !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeKind"],
        message:
          'op "procChance" 改的是 hook 自己的 chance 與暴擊來源的 chance,' +
          "兩者都不是 effect 節點,所以沒有 nodeKind 可以挑 —— 要縮小範圍請用 " +
          "hookOn 或 scope。填了 nodeKind 會是一格永遠不被讀的設定(失敗形態 ②)",
      });
    }
    // ⭐ G6-2 —— `stat` 兩個方向都關死：必填那一邊擋「一次改掉三條加成」，
    // 禁填那一邊擋「op 打錯字」（留著會讓下一次稽核讀成「設定過了」，
    // 同 refineStatModifierFrom 的第二個方向）。
    if (o.op === "modifierValue" && o.stat === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stat"],
        message:
          'op "modifierValue" 必須指名 stat —— 一份被動的 modifiers 通常不只一條' +
          "（護甲 +10、力量 +10、攻速 +0.2），沒有這一格會把它們一起改成同一個數字，" +
          "而後台看起來完全正常（計畫 §13：不得套到相鄰效果）",
      });
    }
    if (o.op !== "modifierValue" && o.stat !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stat"],
        message: `stat 只有 op "modifierValue" 讀得到 —— 掛在 "${o.op}" 上是一格永遠不被讀的設定`,
      });
    }
    if (o.op === "thresholdPct" && o.nodeKind === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeKind"],
        message:
          'op "thresholdPct" 必須指名 nodeKind —— 一棵 condition 樹裡通常不只一個 value，' +
          "沒有這一格就會套到相鄰的條件上（計畫 §13：不得套到相鄰效果）",
      });
    }
  });

/** 一個被強化的目標 —— **exact ability ref** + 一組操作。 */
export const zAbilityAugmentTarget = z
  .object({
    /**
     * 被強化的那一支。**硬參照**：`validateReferences` 在**載入時**擋下
     * 指不到的 id（fail closed），而不是在執行期靜默跳過。
     *
     * ⭐ 為什麼不做 `slot`（「強化我自己的 R」）：計畫要的是 exact ref，
     * 而四支文案每一支都指名了一支具體的技能。多一種目標形式 = 多一條今天
     * 沒有客戶的解析路徑。要加是 schema 一格 + 收集器三行，等真的有卡再加。
     */
    abilityId: zRef<AbilityId>("abilities"),
    ops: z.array(zAbilityAugmentOp).min(1).max(AUGMENT_MAX_OPS),
    /**
     * ⭐ G6-3（77-002 御雷劍：「[裝備了某類道具時] 其雷鳴劍發動機率上升至 50%」）
     * —— 這個目標的所有操作要不要生效的**前提**。
     *
     * 省略 = 無條件生效 = 這一格出現之前 `collectAugmentOps` 的行為逐字。
     *
     * ⭐ 為什麼掛在 **target** 而不是 augment 頂層或每一條 op：77-002 一張卡同時
     * 強化 77-02（機率）與 77-03（持續時間），而**兩者共用同一個前提**（拿著御雷
     * 劍）。掛在頂層就表達不出「同一支 EX 的兩個強化各有各的前提」（下一張卡一定
     * 會出現）；掛在每條 op 上則是把同一句話抄 N 遍、N 份會分岔。target 是「一個
     * 被強化的對象 + 它的一組操作」，前提是這個**對象層級**的性質。
     */
    condition: zEffectCondition.optional().describe(
      "這個強化的前提：條件成立時這一組改寫才生效（例如「裝備了某類道具時」）。" +
        "留空＝一直生效。⚠️ 這裡**不可以**用機率類條件，理由見錯誤訊息。",
    ),
  })
  .strict()
  .superRefine((t, ctx) => {
    // ⭐ 這不是潔癖：`evaluateCondition` 每一顆機率葉都**抽一次 `world.rng`**，
    // 而這一格的求值點在 `syncAbilityPassives` 裡 —— 那支是**冪等、會被重跑很多
    // 次**的（spawn／升級／EX 解鎖／變身都重跑）。把一個會抽 rng 的東西放進去 =
    // `sim/purity.test.ts` 抓不到（它不是 Math.random）、測試全綠，而兩個 replica
    // 在第一次升級就分岔。CLAUDE.md 的 fail-loud 條款：在**載入時**擋下。
    if (t.condition !== undefined && hasBudgetedLeaf(t.condition)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["condition"],
        message:
          "強化的前提**不可以**含機率條件：它在 syncAbilityPassives 裡求值，而那支在" +
          "spawn／升級／EX 解鎖／變身都會重跑 —— 每一次都會抽一次亂數，直接把錄影打散。" +
          "要「有機率的強化」請把機率寫在被強化技能自己的觸發器上。",
      });
    }
  });

/**
 * `ability@1.augment` —— 缺席 = 這支技能不強化任何東西，整條管線在它身上
 * **結構性不存在**（`sim/abilities/abilityAugment.ts` 的入口先問這一格）。
 */
export const zAbilityAugment = z
  .object({ targets: z.array(zAbilityAugmentTarget).min(1).max(AUGMENT_MAX_TARGETS) })
  .strict();

/**
 * 【常駐特效】的**掛點預設值**。WC3 的 `"origin"` 就是**腳底那一點**，所以
 * 「莉娜有 EX 的時候腳底下有魔法陣」在原作 JASS 裡逐字就是
 * `AddSpecialEffectTargetUnitBJ("origin", …)`（`war3map.j:8350`）。
 *
 * ⭐ 匯出而不是在兩邊各打一個 `"origin"` 字面值：schema 用它當預設、客戶端
 * 的 `persistentVfx.ts` 用它補空缺，⛔ 兩個住處會漂到不同的掛點而畫面上只是
 * 「魔法陣長在胸口」——一個看得見卻查不出來的錯（第〇·四守則）。
 */
export const PERSISTENT_VFX_DEFAULT_ATTACH = "origin";

/** 一支技能最多掛幾個常駐特效。與 `attachment@1.points` 同一個量級。 */
export const PERSISTENT_VFX_MAX = 4;

/**
 * 【常駐特效】—— 這支技能**在身上的期間一直掛著**的特效（GH#539）。
 *
 * owner 2026-08-22：
 * > 「莉娜有 EX 的時候**腳底下有魔法陣**這種 你也要記得還原
 * >  你最好**開一張票去掃 EX 常駐特效** 有可能試用**等級或是技能已學習的 JASS**
 * >  來判斷之類」
 *
 * ⚠️ **這一格不是 `vfxKey` 的變體。** `vfxKey` / `vfxLayers` 是**施法的那一瞬間**
 * 播一次然後消失；這一格是「**只要條件成立就存在**」。兩者在客戶端走的是不同的
 * 生命週期（一次性 vs attach/detach），把常駐特效寫成一個 duration 很大的
 * `vfxKey` 會在條件消失時**留下**它 —— 那正是 #262 的特效洩漏形狀。
 *
 * ### ⛔ 為什麼不是 `config.ambient-vfx@1.bindings`（既有的那張表）
 *
 * 那張表是**無條件**的，而且鍵是 modelKey / championId：「這具身體永遠戴著」。
 * 它表達不了「**EX 解鎖之後**才戴」，因為條件根本不在它的形狀裡。
 * ⭐ 而這一格把常駐特效掛在**技能**上，於是「這支技能在不在身上」**自己就是條件**
 * —— 那正是原作 JASS 用 `GetUnitAbilityLevel` 問的那句話，⛔ 不需要第二張表。
 *
 * ### 條件：⛔ 沒有新的條件葉
 *
 * | `when` | 意思 | 對應的 JASS |
 * |---|---|---|
 * | **缺席**（多數情況） | 這支技能**在身上／已解鎖**就掛著 | `GetUnitAbilityLevel(u, 'A0xx') > 0` |
 * | 填了 | 上面那條**再 AND 一個** `condition@1` 樹 | `GetUnitLevel(u) >= 30`、`udg_EX_Mode[..] == true` … |
 *
 * ⭐ `when` 復用 {@link zEffectCondition} **原封不動** —— 「等級 ≥ N」寫成
 * `{kind:"stat", subject:"self", stat:"level", op:">=", value:N, mode:"absolute"}`
 * （`level` 早就在 `PLAIN_STATS` 裡），「在某形態」寫 `status`，「拿著某件裝備」
 * 寫 `equipment`。⛔ 為 EX 另造一族 `condition.ex-mode@1` 會讓同一個問題有兩種
 * 問法，而其中一種不會被 `conditionRng` / 深度上限 / 編輯器渲染器認得。
 *
 * ⚠️ **這一格刻意沒有 `durationSec`。** 常駐特效的終點是「條件變 false」，
 * ⛔ 不是一個時鐘 —— 給它一個秒數就是允許「條件還成立但特效已經沒了」這種
 * 兩個真相打架的狀態。
 */
export const zPersistentVfx = z
  .object({
    /**
     * 掛什麼。`vfx` 集合的文件 id —— 粒子（`vfx@1`）、緞帶（`ribbon@1`）
     * 或**穿在骨頭上的模型**（`attachment@1`）都可以，魔法陣這一族是後者
     * （原作是一顆 `.mdx`，已經匯入成 `imported.midchildernanohaaura`）。
     * SOFT ref：內容可以先寫名字、美術後補（與 `ability.vfxKey` 同一個規矩）。
     */
    vfxKey: zRef("vfx", { soft: true }),
    /**
     * WC3 掛點字串，**逐字**（`"origin"` / `"chest"` / `"right,hand"`）。
     * 缺席 = {@link PERSISTENT_VFX_DEFAULT_ATTACH}（腳下），因為地面魔法陣是
     * 這一族最常見的樣子。解析共用 `render/vfx/attachment.ts`。
     */
    attach: z.string().min(1).max(32).optional(),
    /** 額外的條件。缺席 = 只要這支技能在身上就掛著（見上表）。 */
    when: zEffectCondition.optional(),
    /** 掛件／粒子的縮放。缺席 = 1 = 照 vfx 文件自己的大小。 */
    scale: z.number().min(0.05).max(10).optional(),
    /**
     * 透明度。缺席 = 照 vfx 文件自己的值。
     *
     * ⚠️ **下界刻意是 0.05 而不是 0**：`alpha: 0` 是一個「看不見但還在算粒子」的
     * 狀態，而「用 alpha 0 假裝移除」正是這張票要禁止的那件事（#262 特效洩漏）。
     * 要它消失就讓 `when` 變成 false —— 客戶端會**真的把它拆掉**。
     */
    alpha: z.number().min(0.05).max(1).optional(),
  })
  .strict();

export type PersistentVfx = z.infer<typeof zPersistentVfx>;

/** Embedded form (champion.abilities[slot]) — no schema discriminator. */
export const zAbilityDef = z
  .object({
    id: zIdFor<AbilityId>(),
    name: z.string().min(1),
    /**
     * ⭐【這一份文件的說明是**哪一層**的】—— 2026-08-13 事故的直接修法。
     *
     * owner 給了 70-002 樹海降臨的裁決，而助手把它套到 70-00 的 w3x 遺留光環上，
     * 因為它讀了那支技能 JSON 裡**舊的** description。owner 的話是
     *   「你不是有做一個最新版本的英雄的技能列表及說明(JSON & MD)? **怎麼會搞混呢?**」
     *
     * ⛔ 根因不是不小心：461 份 ability 文件的 **29 個頂層欄位裡沒有任何一個**
     *    說得出「這段字是階梯的第幾層」。兩種來源的文件長得一模一樣權威。
     *
     * 第〇·六守則的階梯：
     *   `"owner-spec"`  第 1 層 —— owner 新版技能說明（90 支重製，`batch1.py` 產生）
     *   `"w3x-import"`  第 4 層 —— 從 w3x 匯入的文案。⛔ **它不是規格，是考古**
     *
     * ⛔ 這裡**沒有** `"authored"`（GGD 自己從零寫的）。第一版有，而
     *    `fieldAdoption.test.ts` 當場擋下來：**0 份文件用它**。
     *    一個沒有人用的枚舉成員就是 S8（機制上架、內容零採用）——
     *    真的有人從零寫一支技能時再加，那時它會有第一份證據。
     *
     * ⚠️ 它描述的是**這份文件的出身**，⛔ 不是「每一個字都逐字未改」——
     *    一份 `w3x-import` 的文件後來被人手改過，它仍然不是 owner 新版規格。
     *
     * ⚠️ optional 是為了讓舊文件載得進來（fail-open），但**有一條會紅的守衛**
     *    要求每一份出貨文件都宣告它：`content/abilityProvenance.test.ts`。
     *    ——「選擇 fail-open 的同時，必須有一個會回非零的東西說出來」。
     */
    provenance: z.enum(["owner-spec", "w3x-import"]).optional(),
    /**
     * Human-readable ability tooltip. ⚠️ **哪一層由 `provenance` 說**，⛔ 不要
     * 假設它是 w3x 的（這一行以前寫著 "recovered from the w3x source"，而那對
     * 90 支重製技能是假的 —— 第三守則：註解會說謊）。
     * WC3 color codes stripped, line breaks normalized. Optional metadata.
     * Not consumed by the sim; drives editor/UI display.
     */
    description: z.string().optional(),
    /**
     * Same tooltip text as `description`, but with the w3x inline colour codes
     * recovered as SEMANTIC ROLE markup — `[c=role]…[/c]`, role ∈
     * damage|physical|duration|heal|mana|magic|generic (task #114). The
     * importer classifies each `|cAARRGGBB…|r` span into a role and the client
     * renders role→one normalised colour, so the inconsistent source colouring
     * reads uniformly across game tooltips / codex / editor. Additive and
     * optional: absent until the importer re-runs, and the render path treats a
     * plain string (no markup) as an un-tagged paragraph, so nothing breaks in
     * the interim. `description` stays the colour-STRIPPED plain text (kept so
     * the economy tooltip regexes keep matching bare numbers).
     */
    descriptionRoles: z.string().optional(),
    slot: zChampionAbilitySlot,
    /**
     * ONLY on `slot: "PASSIVE"` docs — whether this level-1 innate (天生技) is a
     * permanent self-buff ("passive") or a real cast with a cooldown
     * ("active"). See `zInnateKind`. Required when slot is "PASSIVE", rejected
     * otherwise (enforced by `zAbilityDoc`'s superRefine below), so a consumer
     * can branch on it without also having to re-derive the slot.
     */
    innateKind: zInnateKind.optional(),
    /**
     * ⭐ G13-1 —— 一支**主動型天生技**（`slot:"PASSIVE"` + `innateKind:"active"`）
     * 的 `passive` 區塊要不要真的掛上去。
     *
     * 省略 = `"skip"` = **今天的行為逐字**（`syncAbilityPassives` 對主動型天生技
     * `continue`，所以那個區塊的 modifiers/hooks/vision/flight/block/critStrike
     * 一格都不生效）。1,900 份既有技能文件一份都不帶它 → 全樹零變化。
     *
     * ⛔ 那個 `continue` 是一個**寫死在程式裡的決策**，而它的理由（「不讓一份寫錯
     * 的文件把一支 40 秒的大招變成免費光環」）是對的 —— 但那是「預設值該選哪一個」
     * 的理由，不是「這裡不該有欄位」的理由（第一守則）。WC3 裡「一支有冷卻的 D 槽
     * 主動技，同時掛著一個常駐光環／被動」是一整族（70-00 紮根：15 秒冷卻 +
     * 芬多精光環），而引擎今天為了其中**一種** payload（auras）養了一支 387 行的
     * 替身系統（`sim/auraCarrier.ts`）。這一格的價值是把那個決策從程式搬到文件上。
     *
     * ⚠️ **生命週期不一樣，而且要說在明處**：`syncAbilityPassives` 掛上去的來源是
     * **永久**的（rank>0 就在），而 `auraCarrier` 的替身只在**戰鬥期 + 變身中**
     * 存在。所以「只有紮根形態才有的光環」正確寫法是**同時**在那個 rank 區塊填
     * `whileForm: "alternate"`（那一格已經存在、`rankBlock` 已經在讀），
     * ⛔ 不要靠這一格自己表達形態。
     */
    innateActivePassive: z
      .enum(["skip", "attach"])
      .optional()
      .describe(
        "主動型天生技（有冷卻、要按的那種）的「被動區塊」要不要一直掛在身上。" +
          "留空＝不掛（安全的預設）。attach＝掛上去，用來做「一支主動技同時帶一個常駐光環／被動」。" +
          "⚠️ 掛上去是**整場常駐**的；只想在某個形態下生效請在那一階填 whileForm。",
      ),
    castType: zCastType,
    maxRank: z.number().int().min(1).max(6),
    /** per rank (index rank-1), seconds */
    cooldown: z.array(z.number().min(0)).min(1),
    manaCost: z.array(z.number().min(0)).min(1),
    /**
     * ⭐ 耗魔級別（2026-08-21，五軸裡**最後補上**的那一軸）。
     *
     * 與 `radiusTier` / `rangeTier` / `cooldownTier` 完全同一個形態：填了這一格就
     * **不要**填 `manaCost` —— 註冊時由 `config.mana-tiers@1` 翻成點數
     * （`content/manaTiers.ts` 的 `resolveManaCostTier`，全專案唯一的查表處）。
     * 兩格都填 → **級別贏**，而且**每一階都寫同一個值**（級距是一支技能一格）。
     *
     * ⚠️ 「每一階同一個值」是 owner 2026-08-21 ① 的直接推論：
     * 「除了冷卻以外 **傷害跟耗魔是一起變動的**」＋「B 全轉，接受升階只剩 ratios 成長」
     * ⇒ 傷害的 `perRank` 交出去之後，耗魔的 `perRank` 就不可以留著自己漲 ——
     * 留著＝「升一階只多花錢、不多傷害」，那是把他的連動關係**弄反**。
     *
     * ⚠️ 免費技（`manaCost` 全 0）**不要**填這一格：下界是 1，填了級別就一定
     * 收得到錢。owner 2026-08-21 ④「那就不要調耗魔阿」講的正是那 78 支。
     */
    manaCostTier: z.enum(MANA_TIER_NAMES).optional(),
    range: z.number().min(0),
    /** skillshot width or AoE radius */
    radius: z.number().positive().optional(),
    /**
     * ⭐ AoE 級別（owner 2026-08-11：「**原則上不寫範圍數字**」）。
     *
     * 填了這一格就**不要**填 `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑
     * （`content/aoeTiers.ts` 的 `resolveRadiusTier`，全專案唯一的查表處）。
     * 兩格都填 → **級別贏**（理由寫在那支檔案：讓手寫值蓋過去等於這個機制
     * 對那支技能靜默失效）。要留特例就不要填級別。
     *
     * 極小 ≈ 3 ／ 小 ≈ 5 人 ／ 中 ≈ 10 人（＝ 1/4 競技場）／ 大 ≈ 1/3 競技場
     * ／ 極大 ≈ 1/2 競技場。⚠️ owner 2026-08-11 那句話裡的「大／超大」是**四級**
     * 時代的用詞；GH#463 換成他 08-19 的五個字之後名字整體左移一格（值不變）。
     */
    radiusTier: z.enum(AOE_TIER_NAMES).optional(),
    /**
     * ⭐ 施法距離級別（GH#414，owner 2026-08-19：「可施展技能的距離普遍超遠」）。
     *
     * 與 `radiusTier` 完全同一個形態：填了這一格就**不要**填 `range` ——
     * 註冊時由 `config.range-tiers@1` 翻成距離（`content/rangeTiers.ts` 的
     * `resolveRangeTier`，全專案唯一的查表處）。兩格都填 → **級別贏**。
     *
     * ⚠️ 級距值與 AoE **同一條梯子**（決鬥區半徑 24 的 1/8…1/2）：
     * 極小 3 ／ 小 4.5 ／ 中 6 ／ 大 8 ／ 極大 12。
     * 一支「中」的技能打得到 6，炸開也是 6 —— 那是 owner 的「統一」。
     */
    rangeTier: z.enum(RANGE_TIER_NAMES).optional(),
    /**
     * ⭐ 冷卻級別（GH#445，owner 2026-08-19 親自給了三張表）。
     *
     * 與 `radiusTier` / `rangeTier` 完全同一個形態：填了這一格就**不要**填
     * `cooldown` —— 註冊時由 `config.cooldown-tiers@1` 翻成秒數
     * （`content/cooldownTiers.ts` 的 `resolveCooldownTier`，全專案唯一的查表處）。
     * 兩格都填 → **級別贏**，而且**每一階都寫同一個值**（級距是一支技能一格）。
     * 要做「升階冷卻下降」就**不要**填級別，手寫陣列一直都合法。
     *
     * ⚠️ 秒數取決於 {@link cooldownShape}：單體 6/15/30/45/60，
     * 範圍與變身 30/45/60/90/120。⚠️ 這些是**卡面秒**，實際等待要再乘
     * `combatEnv.cooldown`（出貨 0.2）—— 單體·極小 6 卡面秒 = 1.2 實際秒。
     */
    cooldownTier: z.enum(COOLDOWN_TIER_NAMES).optional(),
    /**
     * 這支技能查冷卻表的哪一張。**留空 = 從技能內容推**
     * （`championForm` → 變身；`radius`/`radiusTier` → 範圍；其餘 → 單體），
     * 那是 `config.cooldown-tiers@1` 的 `autoShape` 出貨開著的原因。
     *
     * ⭐ 只有**推錯**的時候才填它 —— 例如一支沒有 `radius` 卻是範圍定位的技能
     * （靠投射物碰撞打到很多人），或一支帶 AoE 但定位是單體的技能。
     */
    cooldownShape: z.enum(COOLDOWN_SHAPES).optional(),
    targetsEnemies: z.boolean().optional(),
    effects: z.array(zEffectDef),
    /**
     * PERMANENT passive granted while this ability's rank > 0, rank-indexed
     * (WC3 authors passive columns per ability level). An ability with a
     * `passive` and an EMPTY `effects` array is passive-only and can never be
     * cast — which is what the native `Cool = 0` family (Critical Strike
     * `AOcr`, Bash `AHbh`, the aura family, the `Aamk` attribute buttons)
     * actually is. Before this field existed every one of them shipped as an
     * activated `self` + `applyBuff` with an invented cooldown and mana cost.
     */
    passive: zAbilityPassive.optional(),
    /**
     * 這支技能**進場時**要在持有者身上安裝哪些具名標記（【試煉】【風王結界】
     * 【縮地】共用同一個機制，見 `sim/marks.ts`）。
     *
     * 和上面的 `passive` 是兩件事：`passive` 給的是「rank>0 就一直在」的屬性
     * 加成，這裡給的是**一個有層數、會被消耗、可以跨回合的計數器**，而且它
     * 可以掛一張免死牌（`lethal`）。海克力斯的【十二道試煉】是第一個使用者。
     *
     * ⚠️ **optional**：1,900 份既有技能文件一份都不帶它，缺席 = 這支技能不發
     * 任何標記，傷害管線上完全不存在（`lethalSaveFor` 的 ZERO GUARANTEE）。
     */
    marks: z.array(zMarkSpec).optional(),
    vfxKey: zRef("vfx", { soft: true }).optional(),
    /**
     * 多層特效模板 (#205 / #230). Present = this array IS the ability's cast
     * VFX stack, played top to bottom with per-layer parameter overrides and
     * per-layer delays. Absent = the single `vfxKey` above, unchanged — see
     * `./abilityVfx.ts` for the authoring contract, the paste-able JSON
     * example, and why a layer may NOT carry `anchor`.
     */
    vfxLayers: zAbilityVfxLayers.optional(),
    /**
     * 【常駐特效】（GH#539）—— 施法**之外**的那一種特效：只要條件成立就掛在
     * 持有者身上，條件消失就**真的被拆掉**。莉娜腳下的魔法陣、EX 解鎖後的光環。
     * 缺席 = 這支技能沒有任何常駐特效（1,900 份既有文件一份都不帶它）。
     * 完整語意與「為什麼不是 `config.ambient-vfx@1`」見 {@link zPersistentVfx}。
     */
    persistentVfx: z.array(zPersistentVfx).min(1).max(PERSISTENT_VFX_MAX).optional(),
    /**
     * WC3-derived per-ability cast sound cue — an audio-map SFX key (e.g.
     * "wc3.nocute"), recovered from the source map's gg_snd bindings
     * (tools/w3x-import SFX_BINDINGS.json). The sim stamps it on the
     * `abilityCast` event and the client plays it INSTEAD of the generic cast
     * voice. Absent = generic castBegin/abilityCast handling. Plain string,
     * not a zRef: the audio map is client config, not a content collection.
     */
    sfxKey: z.string().min(1).optional(),
    /** cast time (seconds) before effects fire; default 0 = instant */
    castTimeSec: z.number().min(0).optional(),
    /** root the caster for the cast duration (default true) */
    rootWhileCasting: z.boolean().optional(),
    /**
     * 被打會不會中斷施法 — a DECISION POINT, therefore a field (CLAUDE.md
     * 第一守則), not a branch somebody picked inside CastResolveSystem.
     *
     * ABSENT = `"none"` = today's rule EXACTLY, so all 650-odd shipped abilities
     * are untouched: a cast already dies to death / stun / knockdown and nothing
     * else. `"damage"` adds 「而且掉血就斷」, which is what 揍敵客阿福 R 龍星群
     * 「ct 需要 2 秒，被攻擊會中斷施法」 asks for and what nothing in the sim could
     * express before — a 2-second channel that cannot be punished is a different
     * ability from the one the owner described.
     *
     * WHAT COUNTS AS 「被打」 IS STATED, NOT GUESSED: the caster's HP is lower
     * than it was on the tick the cast began. A shield that eats the whole hit
     * therefore does NOT interrupt (you were not hurt), and the arena fire-ring
     * burn DOES (you were). Both readings are consequences of one rule rather
     * than special cases, and the knob to switch the whole thing off is this
     * field.
     */
    interruptOn: z.enum(["none", "damage"]).optional(),
    /**
     * RECOVERY (後搖) — seconds of commitment AFTER the ability resolves, during
     * which the caster may not cast or basic-attack. Absent = the sim's
     * `DEFAULT_RECOVERY_SEC` (0.6 s), NOT zero — see sim/abilities/
     * abilityRecovery.ts for why the default is live rather than opt-in.
     *
     * A LANDED HIT CANCELS IT: damage on >= 1 enemy from this ability frees the
     * caster on the same tick, so combos flow off a connect and a whiff is the
     * only thing that costs. Abilities that cannot whiff (self-casts, dashes)
     * never observe it. Capped at MAX_RECOVERY_SEC (2 s) by the sim.
     */
    recoverySec: z.number().min(0).max(2).optional(),
    /**
     * Whether the recovery also ROOTS the caster (default false). Startup
     * already hard-roots, so the default deliberately locks OUTPUT only (the
     * DOTA/LoL cast-backswing shape): the opponent buys "he can't answer",
     * not "he's a statue". A heavy ultimate can opt into the full lock.
     */
    recoveryRoots: z.boolean().optional(),
    /**
     * w3x button icon extracted from the map archive (task #33), path relative
     * to content/, e.g. "assets/icons/abilities/godie-e001.q.png". Absent =
     * the source used Blizzard STOCK art — client keeps its letter-tile
     * fallback rendering. Applies embedded (Q/W/E/R) AND standalone (.ex).
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    /**
     * Optional per-ability hit-feel override (task #133). Absent = the sim's
     * damage-derived default. Applies to every hit this ability lands.
     */
    hitFeel: zHitFeel.optional(),
    /**
     * 鑄技工坊 (Skill Forge, #141/#205) — this ability's BEHAVIOUR is authored by
     * template@1 doc(s) rather than hand-written `effects`. Stores template ids
     * + filled param slots ONLY; the pure `expandStack()` (content/templates/
     * expand.ts) fills castType/effects/radius/… at registry time. On disk the
     * doc still carries the skeleton (name/slot/cooldown/manaCost/range/icon/
     * description) and an EMPTY `effects: []` (expanded at load) — which passes
     * `zAbilityDoc` because `effects` has no min and `refineInnate` only
     * constrains PASSIVE slots. WITHOUT this optional field a templated doc is
     * rejected (zAbilityDef is `.strict()`), so this edit is mandatory to the
     * template system.
     *
     * 複數套用 (owner 2026-07-31): this is a STACK, not a single link — see
     * `zAbilityTemplateBinding`. `{ref,params}` (one card, the shape every doc
     * written before 2026-07-31 uses), `[{ref,params},…]` (ordered) and
     * `{cards:[…], onConflict}` (ordered + the collision policy) are all
     * accepted, and all three normalise to the same ordered card list.
     */
    template: zAbilityTemplateBinding.optional(),
    /**
     * 【切換】—— 這支技能是一顆開／關兩態的按鈕（20-01 風王結界 · 70-00 紮根）。
     * 缺席 = 一般的一次性施放，整條切換管線在這支技能上**結構性不存在**
     * （`sim/abilities/toggle.ts` 的每一個入口都先問這一格）。
     * 完整語意見 {@link zAbilityToggle}。
     */
    toggle: zAbilityToggle.optional(),
    /**
     * 【跨技能強化】—— 這支技能**指名改寫另一支技能的數字**（59-001 / 70-002 /
     * 77-002 / 92-002）。缺席 = 不強化任何東西。完整語意見 {@link zAbilityAugment}。
     */
    augment: zAbilityAugment.optional(),
  })
  .strict();

/**
 * `innateKind` and `slot: "PASSIVE"` are two halves of the same fact, so they
 * must never disagree: a PASSIVE doc without a kind leaves the sim and the HUD
 * guessing, and a kind on a Q/W/E/R/EX doc is a mis-edit that would read as an
 * innate. Enforced on the STANDALONE doc only — the embedded champion copies
 * are already pinned to Q/W/E/R by `zChampionDoc`.
 */
function refineInnate(
  doc: {
    slot: string;
    innateKind?: string;
    effects: unknown[];
    innateActivePassive?: string;
    passive?: unknown;
  },
  ctx: z.RefinementCtx,
): void {
  // ⭐ G13-1 —— 兩個方向都關死，形狀與下面 `innateKind` 那一條逐字相同：
  // 一格填得下、永遠不會被讀到的設定就是失敗形態②，而它在後台看起來完全正常。
  if (doc.innateActivePassive !== undefined) {
    if (!(doc.slot === "PASSIVE" && doc.innateKind === "active")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["innateActivePassive"],
        message:
          'innateActivePassive 只在 slot "PASSIVE" + innateKind "active" 上有意義 —— ' +
          "其他情形下 passive 區塊本來就會掛上，這一格會是一格永遠不被讀的設定",
      });
    } else if (doc.innateActivePassive === "attach" && doc.passive === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passive"],
        message:
          'innateActivePassive: "attach" 要掛的是 passive 區塊，而這支技能沒有 passive —— ' +
          "沒有東西可以掛上去",
      });
    }
  }
  if (doc.slot === "PASSIVE") {
    if (doc.innateKind === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["innateKind"],
        message: 'slot "PASSIVE" requires innateKind ("passive" | "active")',
      });
    } else if (doc.innateKind === "active" && doc.effects.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects"],
        message: 'innateKind "active" means a real cast — it must declare effects',
      });
    }
  } else if (doc.innateKind !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["innateKind"],
      message: 'innateKind is only meaningful on slot "PASSIVE"',
    });
  }
}

export const zAbilityDoc = zAbilityDef
  .extend({ schema: z.literal("ability@1") })
  .strict()
  .superRefine(refineInnate);

export type AbilityDoc = z.infer<typeof zAbilityDoc>;
