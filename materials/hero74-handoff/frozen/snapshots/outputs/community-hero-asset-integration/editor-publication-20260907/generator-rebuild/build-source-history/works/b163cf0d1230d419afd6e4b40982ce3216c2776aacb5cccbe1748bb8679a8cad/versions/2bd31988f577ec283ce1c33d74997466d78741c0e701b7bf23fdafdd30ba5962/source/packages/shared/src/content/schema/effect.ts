/**
 * EffectDef + HookDef schemas — mirror `sim/effects/effect.ts` and
 * `sim/stats/modifiers.ts` exactly (compile-time asserted in compat.test.ts).
 * The discriminated union is exported un-lazied too so the editor form walker
 * can render union cards keyed by "kind".
 *
 * ⭐ 2026-08-20（#467 ②）—— **這一支不再裝 40 個 kind**。
 * 在此之前它是 4,754 行、一個 `discriminatedUnion` 塞 40 個成員，於是**任何**新機制
 * 都要碰同一個檔（GH#451 加 `chainLightning` 時另外三條 lane 全被擋在外面）。
 * 現在的形狀：
 *
 *   `schema/effects/<kind>.ts`  一個 kind 一檔（欄位 + 它自己的界 + 它自己的跨欄位檢查）
 *   `schema/effects/_shared.ts` 兩支以上共用的地基（`EFFECT_COMMON_SHAPE` / 授權格 / 遞迴的結）
 *   `schema/effects/index.ts`   匯總成聯集 + 派發表
 *   `schema/effect.ts`（這一支） **hook / aura / 天生技** 那一半 + 完整的對外 re-export
 *
 * ⚠️ **對外 import 路徑一個字都沒變**：分片前從這裡 import 得到的每一個名字，
 * 分片後從這裡 import 還是拿得到同一個東西。四向閘（檔案／聯集／註冊表／TS union）
 * 在 `effectShardWiring.test.ts`。
 */
import { z } from "zod";
import type { StatusId } from "../../ids";
import { CHANCE_PER_ATTR_MAX } from "../../sim/effects/dynamicTerms";
import { AURA_COUNT_MAX, HOOK_MAX_TRIGGERS } from "../../sim/effects/kindLimits";
import { zCastableSlot, zRef, zStatModifier } from "./common";
import { zEffectCondition } from "./condition";
import {
  SOURCE_GRANT_SHAPE,
} from "./effects/_shared";
import { zHookDef } from "./effects/_hook";
import { zEffectDef, zEffectDefUnion } from "./effects/index";

/**
 * ⭐ G4 —— **拿不到技能階級的載體**上，多欄 `perRank` 是一格謊。
 *
 * `fireHooks` 給 hook payload 的 `rank` 來自那一份 `ModifierSource` 的
 * `grantRank`；而**道具 / 增益卡 / 道具靈氣**三種載體結構上沒有階級可言
 * （`economy/itemSource.ts` 與 `economy/draft.ts` 建來源時都沒有 rank 可帶）。
 * 所以掛在它們身上的 payload 永遠只讀得到 `perRank` 的**第 1 欄**。
 *
 * ⛔ **不可以寫成執行期 fallback**：靜默付第 1 欄正是這個缺陷的本體 ——
 * 作者填了三欄、看到的永遠是第一欄，而畫面上跟「這支技能就是這麼弱」一模一樣
 * （失敗形態②）。CLAUDE.md 的 fail-open 條款要求「選擇退回安全值的同時，
 * 要有一個會回非零、或畫面上擋不掉的東西說出來」—— 載入期拒絕就是那個東西，
 * 而且 `SchemaValidationError` 會冠上 collection + 文件 id，**響在編輯發生的
 * 當下**而不是下游某條剛好跑到它的測試。
 *
 * ⚠️ 只填 1 欄（或不填）不會被擋：那是「不分階」，逐份既有文件不變。實測全樹
 * 113 條 hook 一條都不會被它擋下來（帶多欄 `perRank` 的 hook effect：0 條）。
 */
export function refineUnrankedHookPerRank(
  hook: { effects: readonly unknown[] },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<object>();
  const hit = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return false;
    if (seen.has(node as object)) return false;
    seen.add(node as object);
    if (Array.isArray(node)) return node.some(hit);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "perRank" && Array.isArray(v) && v.length > 1) return true;
      if (hit(v)) return true;
    }
    return false;
  };
  if (!hook.effects.some(hit)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["effects"],
    message:
      "這條觸發器掛在**拿不到技能階級**的載體上（道具／增益卡／道具靈氣），" +
      "它的 payload 只會永遠讀第 1 欄。要分階就把它掛到 ability.passive.ranks[] " +
      "或 applyBuff 上；只想要一個固定值就把 perRank 收成一欄。",
  });
}

/**
 * 靈氣的**人數縮放** —— mirrors `AuraCountScale` in `sim/aura/aura.ts`。
 *
 * ⚠️ 它是一個 plain `.strict()` ZodObject，⛔ **刻意不掛 `.superRefine`**：
 * `schema/item.ts` 的 `zItemAuraDef` 走 `zAuraDef.innerType().extend()`，
 * 而 `.innerType()` 會**靜默丟掉** `zAuraDef` 上的 refine。跨欄位規則
 *（min ≤ max）因此寫在 `zAuraDef` 的 refine 鏈上，並且在 item.ts **再寫一次**
 * —— 兩處都有，才不會出現「道具版的圈沒有被檢查」這個安靜的洞。
 */
export const zAuraCountScale = z
  .object({
    /**
     * **數誰**。⛔ 不給預設，也 ⛔ 不與 `zAuraDef.affects`（這圈打誰）共用：
     * 「打敵人、但強度看我方人數」是一個完全合法的設計，共用一格就寫不出來。
     */
    count: z.enum(["ally", "enemy", "all"]),
    /**
     * 數人的半徑。省略 = **同這圈的半徑**（＝直接沿用 auraSystem 已經跑完的
     * 那一次 `queryOverlap`，零額外成本）。
     */
    radius: z.number().positive().max(40).optional(),
    /**
     * 持有者算不算一個人頭。省略 = `false`。
     *
     * ⚠️ 與 `zAuraDef.includeSelf`（持有者**吃不吃得到**這圈）是**兩件事**，
     * ⛔ 不可共用一格。
     */
    includeSelf: z.boolean().optional(),
    /** 人數低於它 ⇒ 這一圈整份不掛（「離開範圍則失去該增幅」）。省略 = 1。 */
    min: z.number().int().min(1).max(AURA_COUNT_MAX).optional(),
    /**
     * ⭐ **承重、必填**：`stacks` 是**線性**乘數
     *（`stats/statPipeline.ts` 的 `pctMult *= 1 + m.value * stacks`），
     * 所以一條 `pctMult -0.5` 配 stacks 2 就是把對方那條屬性歸零。
     * 一個沒有上界的人數縮放不是平衡問題，是一個回合結束不了的問題。
     */
    max: z.number().int().min(1).max(AURA_COUNT_MAX),
  })
  .strict();

/**
 * One AURA (靈氣) projected by a passive — mirrors `AuraDef` in
 * sim/aura/aura.ts. The 「範圍 R 內的敵人/隊友」 half of the WC3 aura family;
 * `modifiers` above only ever reach the unit carrying the passive.
 */
export const zAuraDef = z
  .object({
    /** stable name, unique within the passive; defaults to the array index */
    key: z.string().min(1).optional(),
    /**
     * BASE radius in sim units, BEFORE the combat-env `abilityRange` factor
     * (#136). The w3x `Area` column converts at the usual rate — 靈壓's 500 WC3
     * units is 9.17 here. The ceiling is a MIS-PARSE guard in the spirit of
     * `ITEM_MODIFIER_LIMITS`, not balance policy: the whole skeleton zone is
     * `boundaryRadius: 24`, so anything past 40 is a map-wide aura and is far
     * more likely to be a raw un-converted WC3 number that leaked through.
     */
    radius: z.number().positive().max(40),
    affects: z.enum(["enemy", "ally", "all"]),
    /**
     * Default: true for ally/all, false for enemy — MEASURED off the retail
     * MPQs (war3 + War3x + War3Patch merged, `Units\AbilityData.slk`), so
     * "WC3 auras buff the caster" is the right default for FRIENDLY auras.
     *
     * ⚠️ An earlier version of this comment said 「25 of the 32 stock aura rows
     * list `self`; the exceptions are exactly Aoar and Aabr」. The second half
     * was false as written: `Aap1`–`Aap4` and `Aasl` also lack `self` — but
     * they are ENEMY auras (`ground,enemy,…`) where `self` is meaningless.
     * Among FRIENDLY auras the exceptions really are the two below. The 25/32
     * count is dropped rather than restated: it was never re-measured.
     *
     * The exceptions are what this field is for. `Aoar` "Aura - Regeneration
     * (Ward)" and `Aabr` "(Statue)" omit `self` (`…,friend,neutral`) while
     * `AIgx`, the same aura on a hero's item, keeps it. 70-00 芬多精 (`A0GM`)
     * inherits `Aoar` and does not override `targets_allowed`, so it heals
     * 白木卡迪那's allies and NOT 白木 — `abilities/godie-e010.passive.json`
     * writes `false` for exactly that.
     */
    includeSelf: z.boolean().optional(),
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    /**
     * WC3 aura-buff tail: seconds it lingers after leaving. Default 0.
     *
     * There is NO number to port. `Dur`/`HeroDur` is 0 on all 32 stock aura
     * rows and on both imported auras (`A0GM`, `A0ID`) — WC3's tail is engine
     * behaviour, not ability data — so an authored value here is a design
     * choice (or the anti-flicker knob), never a fidelity restoration.
     */
    lingerSec: z.number().min(0).max(10).optional(),
    /**
     * ⭐ [靈氣人數縮放]（討伐叉「周圍每有一名隊友就更強」）——
     * 這一圈的強度隨**範圍內的人數**變化。
     *
     * ⛔ 掛在**圈**上，不掛在 `zStatModifier` 上：後者會同時開放給四個沒有
     * 「範圍」概念的授權面（道具本體 / 天生技 rank / 增益卡 / applyBuff），
     * 而那四個地方填了它什麼都不會發生（失敗形態②）。
     */
    scaleByNearby: zAuraCountScale.optional(),
  })
  .strict()
  // ⚠️ **一層 refine，⛔ 不是兩層**：`schema/item.ts` 的 `zItemAuraDef` 走
  // `zAuraDef.innerType().extend()`，而 `.innerType()` 只剝**一層** ZodEffects
  // —— 鏈成兩個 `.refine` 的那一刻 `.innerType()` 回的是另一個 ZodEffects，
  // 而 `ZodEffects` 沒有 `.extend`，於是整個 `schema/index.ts` 在 import 時
  // **當場 TypeError**（實測，2026-08-18）。兩條規則因此合在同一個 refine 裡。
  .superRefine((a, ctx) => {
    if ((a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "aura must carry at least one modifier or hook",
      });
    }
    if (a.scaleByNearby !== undefined && (a.scaleByNearby.min ?? 1) > a.scaleByNearby.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scaleByNearby", "min"],
        message: "scaleByNearby.min 不可以大於 max —— 那是一個永遠掛不上去的靈氣",
      });
    }
  });



/** One rank of `ability@1.passive` — mirrors `AbilityPassiveRank`. */
export const zAbilityPassiveRank = z
  .object({
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    auras: z.array(zAuraDef).optional(),
    // ⭐ 2026-08-09：`flight`、⭐ 2026-08-18（GH#373）：`vision` —— 兩者都改由
    // {@link SOURCE_GRANT_SHAPE} 展開（見那裡的說明），所以這裡**不再**單獨列
    // 一格 —— 兩處同名會被後展開的那份靜默蓋掉（`tsc` 的 TS2783 會叫）。
    /**
     * 格擋 this rank grants — see {@link zBlockGrant} and `sim/combat/block.ts`.
     *
     * A FIFTH payload kind, and it is here for the same reason `vision` and
     * `flight` became the third and fourth: 「擋不擋得下這一發」 is not a number
     * on a stat table (型別過濾 + `lethalOnly` disappear the moment you sum it
     * into a `Stat`) and it is not projected onto anybody else.
     *
     * ⭐ 它是**同一個** `ModifierSource.block` 欄位,不是第二套機制 ——
     * `sim/combat/block.ts::blockCutFor` 走 `StatsComp.sources` 而**不看
     * `kind`**,所以一支技能授予的格擋跟一件裝備授予的格擋在鏈式獨立判定、
     * 型別過濾、致死判定與內部冷卻上逐條相同。這一格的整條接線就是
     * `abilities/abilityPassives.ts::rankBlock` 把它轉發到 source 上。
     *
     * 出貨用它的兩支都是招牌被動:20-00 銀色甲胄(Saber 天生技,
     * 「30%機率格擋 100% 魔法傷害」)與 79-002 虛化(卍解狀態下的物理格擋,
     * 配 `whileForm: "alternate"`)。
     *
     * ⭐ 2026-08-09:它與 `critStrike` 一起改由 {@link SOURCE_GRANT_SHAPE} 展開
     * (⛔ 一份,不是四份)。**`block` 這一格一個字都沒變** —— 同一個
     * `zBlockGrant` 實例、同一個鍵名;變的只是它現在跟另外三個授權面共用一份
     * 定義,所以下一個「騎在來源上的授予」不會又出現四份。
     * 而 `critStrike` 是**新的**:owner #299 第 2 條的「一條自己的機率 + 自己的
     * 倍率」在此之前只有道具寫得出來,配 `whileForm` 就寫得出
     * 「只有變身之後才有的暴擊」。
     */
    ...SOURCE_GRANT_SHAPE,
    /**
     * 形態閘 — WHICH BODY this rank's payload is attached to (task #249 變身).
     * ABSENT = `"any"` = attached in both bodies, which is every passive
     * authored before this field existed, so arming it changes nothing until a
     * doc opts in.
     *
     * The hole it fills is stated verbatim in sim/auraCarrier.ts:「There is
     * today NO seam that can make a modifier or an aura exist only while in
     * form X」. 20-01 風王結界 is exactly that card — a TOGGLE whose entire
     * payload is an on-attack orb that must be OFF in the base body — and it
     * could not be authored at all before this.
     *
     * Which form is a DECISION POINT and therefore a dropdown, not a branch
     * picked in code (CLAUDE.md 第一守則): 「只在變身時」 (`alternate`) is
     * 風王結界 / 龍魔人, 「只在本體」 (`base`) is the shape a 變身後失去的天賦
     * needs, and 「都算」 (`any`) is the default.
     *
     * See sim/abilities/abilityPassives.ts for the evaluation and
     * sim/systems/ChampionFormSystem.ts for the re-sync that makes it live.
     */
    whileForm: z.enum(["any", "base", "alternate"]).optional(),
    /**
     * ⭐ M2(2026-08-23) 狀態閘 —— 「我**帶著這個具名狀態**的時候才掛上」。
     * 完整語意與「為什麼它不是第二套 `whileForm`」寫在
     * `sim/content/defs.ts` 的 `AbilityPassiveRank.whileStatus` 上。
     *
     * ⭐ 它讓「這一階只在某個狀態下存在」不必再**換一整份英雄卡**。
     * 在它之前，`whileForm` 是唯一的寫法，於是 20-01 風王結界的 100% 暴擊、
     * 79-002 虛化的 AD 翻倍、70-00 紮根的力量 +10 三者的**全部強度**都住在
     * 一個在畫面上逐位元零差別的變身態裡 —— 那個變身態因此永遠退不了場。
     *
     * ⚠️ 兩格都填就是 **AND**（`rankBlock` 逐格問過去），⛔ 不是 OR。
     * `soft: true` 與 `applyStatus.statusId` / 條件葉的 `statusId` 逐字相同：
     * 狀態文件只給顯示身分，缺一份不該讓整棵內容樹載入失敗。
     */
    whileStatus: zRef<StatusId>("status-effects", { soft: true })
      .describe(
        "只有在持有者**身上帶著這個具名狀態**時，這一階才掛得上去（例：卍解狀態下才有的格擋）。" +
          "留空 = 不問。與「形態閘」同時填 = 兩個條件都要成立。",
      )
      .optional(),
  })
  .strict();

/** `ability@1.passive` — mirrors `AbilityPassive` in sim/content/defs.ts. */
export const zAbilityPassive = z
  .object({
    name: z.string().min(1).optional(),
    ranks: z.array(zAbilityPassiveRank).min(1),
  })
  .strict();

// ── 對外表面：分片前這一支 export 的每一個名字，逐字還在這裡 ─────────────────
//    ⛔ 不要叫呼叫端改 import 路徑：分片是搬家，不是介面變更。
export { zEffectDef, zEffectDefUnion };
export {
  BANKED_BONUS_MAX,
  BANKED_COEFF_MAX,
  BANKED_LIFE_MAX_SEC,
  CYCLE_BUFF_MAX_STEPS,
  HARD_CC_MAX_DURATION_SEC,
  HP_PCT_DAMAGE_MAX,
  SOURCE_GRANT_SHAPE,
  STATUS_MAX_DURATION_SEC,
  zAttrGrant,
  zBlockGrant,
  zCritStrikeGrant,
  zDamageType,
  zDamageTypeOverrideGrant,
  zDeathWardGrant,
  zFlightGrant,
  zResourcePctTerm,
  zTypeStreakImmunityGrant,
  zVisionGrant,
} from "./effects/_shared";
export {
  HOOK_INTERNAL_COOLDOWN_MAX_SEC,
  hasBudgetedLeaf,
  refineHookDamageContext,
  zHookDef,
  zHookDefBase,
  zHookEvent,
} from "./effects/_hook";
