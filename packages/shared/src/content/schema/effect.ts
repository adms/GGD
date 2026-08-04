/**
 * EffectDef + HookDef schemas — mirror `sim/effects/effect.ts` and
 * `sim/stats/modifiers.ts` exactly (compile-time asserted in compat.test.ts).
 * The discriminated union is exported un-lazied too so the editor form walker
 * can render union cards keyed by "kind".
 */
import { z } from "zod";
import type { EffectDef } from "../../sim/effects/effect";
import type { ProjectileId, StatusId } from "../../ids";
import { zCastableSlot, zRef, zScaling, zStatModifier } from "./common";
import {
  SPREAD_MAX_FALLOFF,
  SPREAD_MAX_RADIUS,
  SPREAD_MAX_TARGETS,
  SPREAD_MIN_FALLOFF,
} from "../../sim/effects/spreadLimits";
import {
  KB_MAX_DISTANCE,
  KB_MAX_GETUP_TICKS,
  KB_MAX_IMPACT_POWER,
  KB_MAX_LAUNCH_HEIGHT,
  KB_MAX_SPEED,
} from "../../sim/effects/knockbackLimits";
import {
  INCOMING_PCT_MAX,
  INCOMING_PCT_MIN,
  REFLECT_MAX_CHAIN_DEPTH,
  REFLECT_MIN_CHAIN_DEPTH,
} from "../../sim/effects/reflectLimits";
import { zEffectCondition } from "./condition";
import {
  CHANCE_PER_ATTR_MAX,
  DAMAGE_REFUND_PCT_MAX,
  DISTANCE_SCALE_DAMAGE_MAX,
  DISTANCE_SCALE_RANGE_MAX,
  DOT_RESOURCE_PCT_POINTS_TOTAL_MAX,
  DOT_RESOURCE_PCT_RATIO_TOTAL_MAX,
  RESOURCE_PCT_POINTS_MAX,
  RESOURCE_PCT_RATIO_MAX,
} from "../../sim/effects/dynamicTerms";
import { TAUNT_MAX_DURATION_SEC, TAUNT_MAX_TARGETS } from "../../sim/taunt";
import { FLIGHT_MAX_HOVER_HEIGHT } from "../../sim/flight";

export const zDamageType = z.enum(["physical", "magic", "true"]);

/**
 * Ceiling on ONE rank column of `damage.hpPct` (a 0..1 ratio of the victim's
 * health). 0.35 is deliberately several times the strongest authored value
 * (揍敵客阿福 W 牙突 tops out at 0.12) — this is a MIS-PARSE guard in the spirit
 * of `damageArea`'s radius caps, not balance policy. The failure it prevents is
 * exact and has shipped before in other clothes (#277): 「12」 typed where
 * 「0.12」 was meant is not a strong ability, it is 1200 % of max health, i.e.
 * every cast one-shots every body it touches. Bounded on BOTH ends because
 * CLAUDE.md says 「欄位要有上界，不是只有下界」.
 */
export const HP_PCT_DAMAGE_MAX = 0.35;

/**
 * `damage.bankedBonus` 的三個上界(owner 2026-07-31 的「係數要是欄位 + 要有一個
 * 傷害上界當保險」)。
 *
 * ⚠️ 這三個數字是**護欄不是平衡值**,跟 `HP_PCT_DAMAGE_MAX` 同一個性質:它們的
 * 工作是讓打錯的數字**載不進來**,而不是替設計師決定強度。出貨的 13-002 用的是
 * coeff 0.20 / max 900,離每一個上界都很遠。
 *
 * MEASURED, not guessed（2026-07-31,揍敵客 godie-efur,用出貨的 combat-env）:
 *   maxMana = (baseStats.maxMana 100 + growth.maxMana 28×(lv−1) + INT×intToMaxMana 15)
 *             × multipliers.maxMana 1.0,  INT = 20 + 2.3×(lv−1)
 *   → lv1 ≈ 400、lv10 ≈ 962、lv15 ≈ 1,275(無法力裝)
 * 出貨的 coeff 0.20 因此換算成 lv10 滿魔約 **+192 點**,對照 maxHealth 倍率 9
 * 下的一條血(150 基礎 → 1,350 起跳)大約是 14%。合理,不是一擊必殺。
 *
 * 出貨卡的 `max` 是 400,對應法力池 2,000 —— 只有重度法力裝才碰得到,所以它
 * 是**保險絲**而不是隱形的平衡上限;下面這個 schema 上界(1200)又比它高三倍,
 * 因為 schema 的工作是擋住打錯的數字,不是替設計師決定強度。
 */
export const BANKED_COEFF_MAX = 1;
/** 單次存款加成的絕對傷害天花板。1200 ≈ 出貨生命倍率 9 下的一條滿血。 */
export const BANKED_BONUS_MAX = 1200;
/** 存款能活多久。跟 `applyBuff.duration` 的量級一致;超過就是設定錯了。 */
export const BANKED_LIFE_MAX_SEC = 60;

/**
 * Ceiling on `cycleBuff.steps`. A rotation is a READABLE thing — the player has
 * to be able to feel 「輪到防禦了」 — and past a handful of steps the ring is
 * indistinguishable from randomness while costing one live ModifierSource per
 * step on every rotating body. 8 matches `CONDITION_MAX_CHILDREN`, the other
 * "how many of these can a human hold in their head" bound in this codebase.
 */
export const CYCLE_BUFF_MAX_STEPS = 8;

/**
 * Ceiling on `HookDef.internalCooldown`, in SECONDS.
 *
 * The field had `.min(0)` and no upper bound at all until 2026-08-01, which is
 * exactly the half-bounded shape CLAUDE.md calls out (「欄位要有上界,不是只有
 * 下界」). What the ceiling catches is one specific, invisible mis-parse:
 * **milliseconds typed into a seconds field**. owner's 2026-08-01 rulings on
 * 炎神弩 godie-i06i and 熾天使之弓 godie-i012 are both 「冷卻1 秒」, and `1000`
 * typed where `1` was meant does not look wrong in a diff — it silently turns a
 * once-per-second proc into a once-per-match one, on a card that still advertises
 * the effect. `sim/effects/hooks.ts` would clamp nothing and report nothing; the
 * item would simply stop doing its job (失敗形態 ②).
 *
 * 300 s, matching `zItemBlockGrant.internalCooldown` in schema/item.ts so the two
 * cooldown fields do not disagree about what counts as a typo. It is a MIS-PARSE
 * guard, NOT balance policy: a combat round is ~3 min, the longest authored value
 * in content/ today is 45 s (godie-e00r.passive), and anything genuinely longer
 * than 300 s is a once-per-match effect that should say so in its own field.
 * The floor stays `.min(0)` — 0 is legal AND meaningful (= no cooldown, which is
 * what every hook authored before this field had).
 */
export const HOOK_INTERNAL_COOLDOWN_MAX_SEC = 300;

export const zHookEvent = z.enum([
  "onAbilityCast",
  "onAbilityHit",
  "onBasicAttack",
  "onDamageDealt",
  "onDamageTaken",
  "onKill",
  "onLevelUp",
  /** 被暈眩的那一刻 — 為什麼是新成員、為什麼纏繞/減速不算,見
   *  sim/stats/modifiers.ts 的 `HookEvent`。 */
  "onStunned",
  /** 週期 — 每 tick 發射,節奏寫在 `internalCooldown`(10 = 每 10 秒)。
   *  43-00 觀音大士「每 10 秒生成一個護盾」、03-00 相轉移裝甲的常駐魔免都是它。
   *  見 sim/stats/modifiers.ts 的 `HookEvent` 與 systems/IntervalHookSystem.ts。 */
  "onInterval",
]);

/**
 * CROSS-FIELD checks that a `z.discriminatedUnion` member cannot carry itself:
 * `.superRefine` turns an object into `ZodEffects`, and `discriminatedUnion`
 * only accepts `ZodObject`s. So the refinement rides {@link zEffectDef} — the
 * lazy wrapper every document actually validates through (`zHookDef.effects`,
 * `ability@1`, `item@1.passive`, `auras[].hooks`). `zEffectDefUnion` stays a
 * pure discriminated union so the editor's `walkZod` still sees the variant
 * list (apps/editor/src/form/walk.ts) and the three template tests that call
 * `zEffectDefUnion.parse` directly keep working.
 *
 * Today it enforces the two `grantAttribute.store` pairings — see the field.
 */
/**
 * 資源百分比項 —— `damage.resourcePct` 與 `dot.resourcePct` **共用同一份 schema**,
 * mirroring `ResourcePctTerm` in sim/effects/dynamicTerms.ts(那裡有完整推導:
 * 為什麼它不是 `Scaling` 的一部分、`scale` 的兩種讀法差在哪、兩個上界為什麼
 * 不同)。一份 schema 而不是兩份,理由跟 sim 端一樣:四支道具要的是同一個讀數,
 * 抄成兩份保證有一天只修到一邊。
 *
 * 每一格 `perRank` 的上界由 `scale` 決定,所以夾在 `superRefine` 裡而不是
 * `z.number().max(...)` 上 —— 兩種模式的自然量級差 100 倍以上,共用一個上界
 * 對其中一邊必然太鬆(擋不住打錯的數字)。
 */
export const zResourcePctTerm = z
  .object({
    /** 讀誰的條:施法者自己,還是這次事件的對象 */
    subject: z.enum(["self", "target"]),
    resource: z.enum(["health", "mana"]),
    /** 現存 / 最大 / 已損失(= 最大 − 現存) */
    basis: z.enum(["current", "max", "missing"]),
    /** 省略 = "ratio" = 係數 × 絕對量。"points" = 係數 × 百分比本身(0~100) */
    scale: z.enum(["ratio", "points"]).optional(),
    /**
     * `.min(1)`:同 `hpPct` / `incomingPct` 的反空欄位規則 —— 一個空陣列解算成 0,
     * 長得像功能、實際上什麼都不做。
     */
    perRank: z.array(z.number().min(0)).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    const cap =
      (t.scale ?? "ratio") === "points" ? RESOURCE_PCT_POINTS_MAX : RESOURCE_PCT_RATIO_MAX;
    t.perRank.forEach((v, i) => {
      if (v > cap) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["perRank", i],
          message:
            `scale:"${t.scale ?? "ratio"}" 的係數上限是 ${cap}(拿到 ${v})—— ` +
            "這是打錯數字的守衛:ratio 模式寫 5 而不是 0.05 是「對方整條的 500%」, " +
            "points 模式寫 100 而不是 1 是 10,000 點。兩種在 diff 裡都跟正確值長得一樣。",
        });
      }
    });
  });

/**
 * 一份 `dot` 的 `resourcePct` **整段燒完**的總量檢查。
 *
 * ⚠️ 為什麼守衛架在總量而不是單次:一次 `damage` 的百分比是**一下**,而 dot 會
 * 付 `duration/interval` 次。單次 3% 看起來無害,配一個 20 秒 / 每秒的燒傷就是
 * 60% 最大生命。完整推導與數字見 dynamicTerms.ts 的
 * `DOT_RESOURCE_PCT_RATIO_TOTAL_MAX`。
 *
 * ⚠️ 它住在 `refineEffectDef`(掛在 `zEffectDef` 的 lazy 上)而不是 `dot` 那個
 * 物件自己的 `.superRefine`,原因是 zod 的 `discriminatedUnion` 只收
 * `ZodObject`,收不了 `ZodEffects` —— 這跟 `zHookDef` / `zItemHookDef` 為什麼
 * 要拆成 base + refine 是同一個限制。
 */
function refineDotResourceBudget(
  e: Extract<EffectDef, { kind: "dot" }>,
  ctx: z.RefinementCtx,
): void {
  const term = e.resourcePct;
  if (term === undefined) return;
  const payouts =
    Math.max(1, Math.floor(e.durationSec / e.intervalSec)) + (e.tickOnApply === true ? 1 : 0);
  const peak = Math.max(...term.perRank);
  const points = (term.scale ?? "ratio") === "points";
  const total = points ? peak * 100 * payouts : peak * payouts;
  const cap = points ? DOT_RESOURCE_PCT_POINTS_TOTAL_MAX : DOT_RESOURCE_PCT_RATIO_TOTAL_MAX;
  if (total > cap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resourcePct", "perRank"],
      message:
        `整段燒完是 ${total}(${peak} × ${payouts} 次付款),上限 ${cap}。` +
        "dot 的百分比守衛架在總量上,因為單次看起來無害的數字乘上付款次數才是玩家吃到的量。",
    });
  }
}

function refineEffectDef(e: EffectDef, ctx: z.RefinementCtx): void {
  if (e.kind === "dot") return refineDotResourceBudget(e, ctx);
  if (e.kind !== "grantAttribute") return;
  if (e.store !== "source") {
    if (e.maxSourceTotal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSourceTotal"],
        message:
          'maxSourceTotal 只有 store:"source" 讀得到 —— 沒有 store 的話這個上限' +
          "永遠不會被檢查, 是一個看起來有設、其實無限疊的欄位",
      });
    }
    return;
  }
  // 「到期收回」與「記在來源上」是兩套互相看不見的帳: `attrGrantExpirySystem`
  // 只反轉 `ChampionComp.attrBonus`, 所以一筆 timed 的 source 存款永遠不會被收回。
  // 要限時, 把這個 hook 掛在一個帶 `expiresAtTick` 的 buff source 上。
  if (e.durationSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSec"],
      message:
        'store:"source" 不能配 durationSec —— 到期收回只認得 attrBonus, ' +
        "記在來源上的存款不會被收回(要限時就把 hook 掛在有期限的 buff 上)",
    });
  }
}

/** Recursive knot: spawnProjectile.onHit is EffectDef[] again. */
export const zEffectDef: z.ZodType<EffectDef, z.ZodTypeDef, unknown> = z.lazy(
  () => zEffectDefUnion.superRefine(refineEffectDef),
) as unknown as z.ZodType<EffectDef, z.ZodTypeDef, unknown>;

export const zEffectDefUnion = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("damage"),
      damageType: zDamageType,
      amount: zScaling,
      canCrit: z.boolean().optional(),
      /** combo-window bonus, added only while the CASTER holds `statusId` (j:34189) */
      comboBonus: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          amount: zScaling,
        })
        .strict()
        .optional(),
      /**
       * 百分比生命傷害 — a slice of the VICTIM's health. See the `hpPct` member
       * of `sim/effects/effect.ts` for why it cannot be a `ratios` entry
       * (`Scaling` reads the CASTER's stats) and why `basis` is a field.
       *
       * BOTH ENDS BOUNDED (CLAUDE.md 「欄位要有上界」): each rank column is a
       * 0..`HP_PCT_DAMAGE_MAX` RATIO, so 「12」 typed for 12 % fails to load
       * instead of one-shotting the arena. `.min(1)` on the array is the same
       * anti-vacuum rule `zEffectCondition`'s groups carry — an empty column
       * list resolves to 0 and would read as a feature that silently does
       * nothing.
       */
      hpPct: z
        .object({
          basis: z.enum(["max", "current"]),
          perRank: z.array(z.number().min(0).max(HP_PCT_DAMAGE_MAX)).min(1),
        })
        .strict()
        .optional(),
      /**
       * 存款加成 —— mirrors the `bankedBonus` member of `sim/effects/effect.ts`.
       * 額外傷害 = `min(標記帶的數字 × coeff, max)`,標記由 `spendMana.bankAs`
       * 開出。這是 owner 2026-07-31「揍敵客 EX 效果隨消耗 MP 放大 => 現存 MP 的
       * 20% 傷害」唯一能誠實表達的形狀(見那一段的 sim 註解:傷害落地時法力
       * 已經是 0)。
       *
       * BOTH ENDS BOUNDED, 而且**兩個上界的理由不同**:
       *   `coeff` ≤ `BANKED_COEFF_MAX` —— 係數本身是設計旋鈕,owner 明說要是欄位;
       *   `max`   ≤ `BANKED_BONUS_MAX` —— 這是**保險絲**。法力池會隨等級與裝備
       *   長大(揍敵客基礎 500,滿裝可以到四位數),一個沒有天花板的線性項在
       *   後期就是一擊必殺。少了它,這個機制的失敗形態不是「數字不好看」而是
       *   「回合在第一次暗步就結束」。
       */
      bankedBonus: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          coeff: z.number().positive().max(BANKED_COEFF_MAX),
          max: z.number().positive().max(BANKED_BONUS_MAX),
        })
        .strict()
        .optional(),
      /**
       * [反彈] —— mirrors the `incomingPct` member of `sim/effects/effect.ts`,
       * 也就是「反彈剛剛打中我的那一發的 N%」。反射之盾 (godie-i03m) 的
       * 「反彈普通攻擊傷害 200%」在這個欄位之前**寫不出來**:`zScaling` 只讀
       * CASTER 的屬性表,而 200% 的分母是一發封包。
       *
       * BOTH ENDS BOUNDED,兩個上界的理由不同,而且都不是平衡政策:
       *   `perRank[]`      ≤ `INCOMING_PCT_MAX` (=5) —— **打錯數字的守衛**。
       *                    「200」打進該寫「2.00」的格子 = 20,000% 反彈,任何人
       *                    普攻你一下就當場暴斃,而在 diff 裡跟正確值長得一樣。
       *   `maxChainDepth`  ≤ `REFLECT_MAX_CHAIN_DEPTH` (=2) —— **終止性的一半**。
       *                    ⚠️ 2026-08-01 更正:它是「鏈從第 0 輪起跳」時的
       *                    必要條件,**不是**「反彈一定在同一個 tick 落地」的
       *                    充分條件 —— hook 排出來的封包(每一件 [On-Hit])
       *                    最早第 1 輪才落地。那一半改由執行期閘門保證,見
       *                    `whenTooLate` 與 sim/effects/reflectLimits.ts。
       *
       * 另外兩個欄位都是**決策點**,所以是欄位而不是寫死的分支:
       *   `applyGlobalDamageMult` 預設 false —— 反彈**不**再吃一次
       *                    `combatEnv.damageDealt`。三個讀數已經在倍率之後了,
       *                    再乘一次反彈比就變成 `pct × k`(2026-08-01 的缺陷)。
       *                    false 讓 owner 的「反彈 200%」在任何 k 下字面為真。
       *   `whenTooLate`    預設 "drop" —— 一發塞不進這個 tick 剩餘排空輪數的
       *                    反彈不排進佇列。"spill" = 舊行為(晚一 tick 落地)。
       *
       * `.min(1)` on the array: 同 `hpPct`,一個空欄位會解算成 0,長得像功能、
       * 實際上什麼都不做。
       */
      incomingPct: z
        .object({
          /** 拿哪一個讀數當基數。省略 = `"mitigated"`(護甲/魔抗之後、護盾之前) */
          basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
          perRank: z.array(z.number().min(INCOMING_PCT_MIN).max(INCOMING_PCT_MAX)).min(1),
          /** 反彈可以再被反彈幾層。省略 = 0 = 反彈本身不可被反彈 */
          maxChainDepth: z
            .number()
            .int()
            .min(REFLECT_MIN_CHAIN_DEPTH)
            .max(REFLECT_MAX_CHAIN_DEPTH)
            .optional(),
          /**
           * 反彈封包要不要再吃一次全域傷害倍率 `combatEnv.damageDealt`。
           * 省略 = false = 不吃 = 反彈比剛好等於 `perRank`(文案字面為真)。
           */
          applyGlobalDamageMult: z.boolean().optional(),
          /**
           * 這個 tick 的排空輪數已經不夠讓反彈落地時怎麼辦。
           * 省略 = `"drop"`(不發) / `"spill"`(排進佇列,下一個 tick 才落地)。
           */
          whenTooLate: z.enum(["drop", "spill"]).optional(),
        })
        .strict()
        .optional(),
      /**
       * 資源百分比項 —— 「誰的哪一條血/魔的多少」。虛哭神去 godie-i007
       * 「自身已損失的生命百分比數值(0~100)」與 瑪那魔杖 godie-i020
       * 「敵方現存 MP 5% 傷害」都走這一個欄位。形狀、兩種 `scale` 讀法與上界
       * 見 {@link zResourcePctTerm} 與 sim/effects/dynamicTerms.ts。
       *
       * 它與 `hpPct` 不重複:`hpPct` 只讀受害者的生命、只有比例讀法、上界 0.35,
       * 已經出貨在 揍敵客 W 牙突 上,原封不動。
       */
      resourcePct: zResourcePctTerm.optional(),
      /**
       * 距離加成項 —— 炎神弩 godie-i06i 「攻擊額外造成 10-1000 傷害,敵我距離
       * 越遠傷害越高 (0~10)」。線性內插,`near` 在距離 0、`far` 在 `atRange` 之外。
       *
       * BOTH ENDS BOUNDED,而三個上界的理由不同:
       *   `atRange` ≤ `DISTANCE_SCALE_RANGE_MAX`(40) —— 跟 `zAuraDef.radius`
       *     同一個數字同一個理由:整個場地 `boundaryRadius` 是 24,超過 40 比較
       *     可能是一個沒換算的 WC3 原始值(500 ≈ 這裡的 9.17)漏進來。
       *   `near`/`far` ≤ `DISTANCE_SCALE_DAMAGE_MAX`(3000) —— ⚠️ 出貨的炎神弩
       *     `far` 就是 **1000**(owner 文案寫死的),已經接近一條血。這個上界的
       *     工作不是壓制它(壓制它等於竄改文案),是擋住多打一個零。
       *
       * ⚠️ **方向是資料**:`near > far` 就是「越近越痛」,一樣寫得出來。
       */
      distanceScale: z
        .object({
          atRange: z.number().positive().max(DISTANCE_SCALE_RANGE_MAX),
          near: z.number().min(0).max(DISTANCE_SCALE_DAMAGE_MAX),
          far: z.number().min(0).max(DISTANCE_SCALE_DAMAGE_MAX),
        })
        .strict()
        .optional(),
      /**
       * 把這一發**實際打出去的量**折回給施法者 —— 瑪那魔杖 godie-i020
       * 「回復己方 MP 該傷害量」。付款發生在 `combat/damage.ts` 的排空迴圈
       * (`DamagePacket.refund`),因為只有那裡知道減免之後真的掉了多少。
       *
       * `basis` 省略 = `"hpLost"` = 玩家看到的那個浮動數字,所以「該傷害量」
       * 在畫面上字面為真。`pct` 上界 `DAMAGE_REFUND_PCT_MAX`(2):出貨值是 1.0
       * (文案的字面值),上界留一格設計空間,同時擋住把 1 打成 100。
       */
      refund: z
        .object({
          resource: z.enum(["health", "mana"]),
          basis: z.enum(["hpLost", "mitigated"]).optional(),
          pct: z.number().positive().max(DAMAGE_REFUND_PCT_MAX),
        })
        .strict()
        .optional(),
    })
    .strict(),
  /**
   * damageArea (#210 近戰擴散) — mirrors the `damageArea` member of `EffectDef`.
   *
   * 三個旋鈕都有**上界**, 不是只有下界: CLAUDE.md 明說「欄位要有上界」, 而這裡
   * 的失敗形態很具體 —— w3x 的長度單位大約是 GGD 的 54.5 倍, 所以任何一個從
   * 原始資料直接貼過來的 `Area` 欄位 (200/300/450) 都會變成一個蓋滿整個決鬥區
   * 的圓。上界把那種貼上變成「檔案進不來」而不是「上線後某件武器一發清場」。
   * 數字與理由見 sim/effects/spreadLimits.ts —— 那裡是唯一的一份, 這裡只是
   * 把它接到 Zod 上, 兩邊不可能漂移。
   */
  z
    .object({
      kind: z.literal("damageArea"),
      damageType: zDamageType,
      amount: zScaling,
      /** GGD 單位。不經過 combatEnv.abilityRange — 見 sim/effects/effect.ts。 */
      radius: z.number().positive().max(SPREAD_MAX_RADIUS),
      /** 邊緣倍率: 1 = 不衰減 (預設), 0 = 邊緣歸零 */
      falloff: z.number().min(SPREAD_MIN_FALLOFF).max(SPREAD_MAX_FALLOFF).optional(),
      /** 一次最多濺到幾個人 (不含震央) */
      maxTargets: z.number().int().min(1).max(SPREAD_MAX_TARGETS).optional(),
      canCrit: z.boolean().optional(),
      /** 震央本人要不要再吃一次 (預設 false — 他已經吃過觸發這一擊了) */
      includeOrigin: z.boolean().optional(),
    })
    .strict(),
  /**
   * damageLine (18-00 薔薇荊棘之刃) — mirrors the `damageLine` member of
   * `EffectDef`. Both lengths share `damageArea`'s radius ceiling and for the
   * identical reason: the failure being guarded is a raw un-converted w3x
   * `Area` column (200/300/450), which at ~54.5 units per GGD unit would be a
   * lash longer than the entire 24-unit duel zone.
   */
  z
    .object({
      kind: z.literal("damageLine"),
      damageType: zDamageType,
      amount: zScaling,
      /** GGD 單位, 往前的長度。3 個身位 = 3 × 體寬 1.2 = 3.6 */
      length: z.number().positive().max(SPREAD_MAX_RADIUS),
      /** GGD 單位, 鞭子的**寬度** (不是半徑)。一個身位 = 1.2 */
      width: z.number().positive().max(SPREAD_MAX_RADIUS),
      /** 指向: 穿過這次事件的受害者 (預設) 或身體的面向 */
      aim: z.enum(["facing", "target"]).optional(),
      /** 從施法者自己身上出發 (預設 true =「面前」) 還是從受害者身上延伸 */
      fromCaster: z.boolean().optional(),
      maxTargets: z.number().int().min(1).max(SPREAD_MAX_TARGETS).optional(),
      canCrit: z.boolean().optional(),
      /** 觸發這一次的那個人要不要再吃一次 (預設 false —— 他已經吃過普攻了) */
      includeOrigin: z.boolean().optional(),
    })
    .strict(),
  /**
   * grantAttribute (07-00 獸化心靈) — mirrors the `grantAttribute` member of
   * `EffectDef`.
   *
   * BOTH counters are bounded ON TOP as well as below (CLAUDE.md
   * 「欄位要有上界」). `everyNth` at 1000 is not a slow passive, it is a passive
   * that never fires in a 3-minute round — indistinguishable in play from the
   * feature being broken, which is precisely the class of typo #277 is about.
   * `maxAttribute` is capped where `CONDITION_ABSOLUTE_MAX` caps an attribute
   * comparison, so 「敏捷 < 120」 written as a condition and 「敏捷上限 120」
   * written here cannot disagree about what an attribute may be.
   */
  z
    .object({
      kind: z.literal("grantAttribute"),
      attr: z.enum(["str", "agi", "int"]),
      /**
       * "flat" (預設) = 加 `amount` 點; "pctOfCurrent" = 加「現有屬性 × amount」,
       * 所以 1.0 就是 owner 說的「×2」。這是一個決策點, 不是實作細節 ——
       * 定值在 1 級大得離譜、在 9 級形同沒有。
       */
      mode: z.enum(["flat", "pctOfCurrent"]).optional(),
      /**
       * 每次**發放**的量 (不是每次觸發)。上界 100 對 flat 是「一次加 100 點三圍
       * 一定是打錯」; 對 pctOfCurrent 它是 100 倍, 同樣是 MIS-PARSE 護欄而不是
       * 平衡政策 —— 想要 ×2 就寫 1。
       */
      amount: z.number().positive().max(100),
      /**
       * 缺省 = **永久**(獸化心靈)。有值 = 到期自動收回(龍紋記憶 3 秒)。
       *
       * ⚠️ 下界 0.067 秒不是隨便挑的: `world.tick + Math.round(duration/dt)`
       * 在 dt=1/30 之下, 0.034 秒以下會變成 0 或 1 tick —— **兩個都是空包彈**。
       * 讓它變成存檔錯誤, 而不是一個上線後沒人看得出來為什麼沒作用的欄位。
       */
      durationSec: z.number().min(0.067).max(300).optional(),
      /** 每 N 次觸發才發一次。缺省/1 = 每次。獸化心靈 = 8 */
      everyNth: z.number().int().min(1).max(1000).optional(),
      /** 該屬性 (含成長與本場加成) 到這個值就不再發。獸化心靈 = 120 */
      maxAttribute: z.number().min(0).max(10000).optional(),
      /**
       * `maxAttribute` 量的是**哪一種**三圍 —— 決策點做成欄位 (第一守則),
       * 而且這個軸是**原始地圖自己就有的**, 不是這裡發明的:
       * `GetHeroStatBJ(stat, unit, includeBonuses)` 的第三個參數。
       * 傷害公式一律 `…,true)`(含裝備), 而獸化心靈的隱藏上限寫的是
       * `GetHeroStatBJ(1,GetKillingUnit(),false)`(**不**含裝備)。
       *
       *   · `"base"`(缺省)= 天生 + 成長 + 三選一 + 先前的 grantAttribute。
       *     這是獸化心靈 JASS 量的東西, 也是**保守**的那一個: 帶一把
       *     朗基努斯之槍(敏捷+12)不會偷偷把蒼月潮的天生技提早關掉, 而且與
       *     「道具還不能給三圍」的年代逐位元相同。
       *   · `"total"` = 含裝備, 給未來那種上限本來就該讀「總敏捷」的卡。
       */
      maxAttributeBasis: z.enum(["base", "total"]).optional(),
      /**
       * 點數存到哪裡 —— 決策點做成欄位, 而差別就是「賣掉之後還在不在」。
       *
       *   · `"champion"`(缺省, 與這個欄位出現之前的每一份文件逐位元相同)=
       *     `ChampionComp.attrBonus`, WC3 `ModifyHeroStat`。永久, 而且與造成它
       *     的東西無關 —— 蒼月潮 07-00 獸化心靈是自己打出來的, 那就是他的。
       *   · `"source"` = 記在**觸發這一次的那個來源**身上
       *     (`ModifierSource.attrEarned`)。甘豆腐之袍 godie-i03f「每殺死一名英雄
       *     可以額外獲得 10點智慧，上限 160」—— 道具疊出來的層數屬於道具, 賣掉
       *     袍子 160 點智慧就跟著走。
       *
       * ⚠️ `"source"` 只能掛在 **hook** 上(道具被動 / 靈氣投射的 hook / 增益),
       * 因為記帳的地方就是那個 source。掛在技能自己的 effects 上沒有來源可記,
       * 這時候**拒絕發放**(而不是偷偷改記進 `attrBonus` —— 那會是一個名字寫著
       * 「賣掉就沒」、行為卻是「永久帶著走」的欄位)。
       */
      store: z.enum(["champion", "source"]).optional(),
      /**
       * `store: "source"` 專用 —— **這一個來源自己一共發過多少**的上限, 逐屬性。
       * 甘豆腐之袍的「上限 160」= 16 層 × 10 點。
       *
       * ⚠️ 它**不是** `maxAttribute`。`maxAttribute` 封的是英雄那條三圍的
       * **絕對值**(獸化心靈的「敏捷 < 120」, 含等級成長), 所以掛在一件智慧裝上
       * 會在高等級法師身上直接把第一層就擋掉 —— 一張什麼都不做的卡。這一條只數
       * 這件裝備自己發出去的量。
       *
       * 上界 10000 與 `maxAttribute` 同一個數字, 理由也同一個: 它是 MIS-PARSE
       * 護欄(160 打成 16000), 不是平衡政策。下界 0 之外還有 `.positive()` 的
       * 意義: 0 是一件「疊層」卡片寫著、但第一層就被夾成 0 的裝備 —— 正是這一批
       * 要消滅的「描述承諾了、資料沒有付」。
       */
      maxSourceTotal: z.number().positive().max(10000).optional(),
    })
    .strict(),
  /**
   * revive (天生牙 godie-i031「[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄」)
   * —— mirrors the `revive` member of `EffectDef`.
   *
   * 「我方所有英雄」**不在這裡** —— 那是 hook 的 `target: "allies"` 作用域。這個
   * effect 只回答「站起來的時候是什麼狀態、要不要花額度、可不可以救敵人」。
   * 站起來這件事本身共用 `sim/revive.ts::reviveChampionAt`, 也就是復活圈
   * (#84/#206) 完成時走的同一個函式 —— 不是第二套復活。
   *
   * ⚠️ 兩個比例的上界 **1** 是 MIS-PARSE 護欄, 不是平衡意見: 文案想寫「50%」的人
   * 很容易填 50, 而沒有上界的 50 是「滿血滿魔復活全隊」。下界 0 合法(至少會給
   * 1 點 HP, 見 `reviveChampionAt`), 因為「只留一口氣的復活」是一個真的設計。
   */
  z
    .object({
      kind: z.literal("revive"),
      hpPct: z.number().min(0).max(1).optional(),
      manaPct: z.number().min(0).max(1).optional(),
      side: z.enum(["ally", "any"]).optional(),
      teamCharge: z.enum(["ignore", "requireAndSpend"]).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("heal"), amount: zScaling }).strict(),
  z
    .object({
      kind: z.literal("shield"),
      amount: zScaling,
      duration: z.number().min(0),
      /**
       * 護盾吸收哪一種傷害 (owner 2026-07-30: 「護盾的確有分吸收所有傷害跟吸收
       * AP 傷害 only」). ABSENT = "all" = 現行行為, 所以既有文件一份都沒有改變
       * 意思;"magic" 就是 owner 說的「只吸 AP 傷害」。
       *
       * 過濾在 combat/damage.ts 的**減傷之後**發生 (跟一直以來同一步), 所以
       * 「650 點護盾」的意思仍然是「擋掉 650 點玩家實際會吃到的傷害」。
       * 不吃這一型的池子對這一發**完全透明**: 不吸收, 也不被消耗。
       * 同一個單位身上有兩種池子時, **先花窄的再花全類型的** —— 理由寫在
       * combat/damage.ts 的 `absorbOrder`。
       */
      absorbs: z.enum(["all", "physical", "magic", "true"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("applyStatus"),
      statusId: zRef<StatusId>("status-effects", { soft: true }),
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
       * · 上界 20 秒。出貨最長的是 10 秒(59-00 暴走 `godie-e00r.passive`),所以
       *   20 給了一倍的空間;它擋的是**小數點打錯一位**:0.3 打成 3 沒有任何界擋
       *   得住(那是一個合法的設計值),但 0.3 打成 30、3 打成 30、20 打成 200
       *   都會在 `pnpm content:build` 當場被擋下並指名檔案與欄位。一個 30 秒的
       *   暈眩在一場三分鐘的回合裡等於「那個人這一場不用玩了」。
       */
      duration: z.number().min(0.034).max(20),
      /** "self" puts it on the CASTER (combo windows); default "target" */
      applyTo: z.enum(["self", "target"]).optional(),
      moveSpeedMult: z.number().positive().optional(),
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
      missChance: z.number().min(0).max(1).optional(),
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
    })
    .strict(),
  z
    .object({
      kind: z.literal("applyBuff"),
      modifiers: z.array(zStatModifier),
      duration: z.number().min(0),
      /** rank-indexed override (index rank-1, clamped) — WC3 buff columns are per level */
      perRank: z
        .array(
          z
            .object({ modifiers: z.array(zStatModifier), duration: z.number().min(0) })
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
    })
    .strict(),
  /**
   * cycleBuff — 輪替增益. See the `cycleBuff` member of `sim/effects/effect.ts`
   * for the model and `sim/effects/cycleBuff.ts` for why the rotation index is
   * DERIVED from absolute expiry ticks rather than kept in a counter.
   *
   * Both ends bounded, as always: `.min(2)` because a one-step "rotation" is
   * just `applyBuff` wearing a costume and authoring it here would hide a plain
   * buff behind a mechanic nobody would think to look at, and
   * `.max(CYCLE_BUFF_MAX_STEPS)` because every step is a live ModifierSource on
   * a rotating body.
   */
  z
    .object({
      kind: z.literal("cycleBuff"),
      /** namespace for the step source ids — two rings on one body must differ */
      cycleKey: z.string().min(1).max(48),
      applyTo: z.enum(["self", "target"]).optional(),
      steps: z
        .array(
          z
            .object({
              modifiers: z.array(zStatModifier).min(1),
              /**
               * ⚠️ FLOOR IS 0.067 s, NOT 0. `applyStatus`/`applyBuff` convert with
               * `Math.round(duration / dt)` at dt = 1/30, so anything at or under
               * 0.034 s rounds to 0 or 1 tick — both of which are blanks the
               * author cannot tell apart from a working buff. 0.067 s is the
               * shortest window the sim can actually deliver, the same floor
               * `tpl-teleport.travelSec` documents.
               */
              duration: z.number().min(0.067).max(60),
            })
            .strict(),
        )
        .min(2)
        .max(CYCLE_BUFF_MAX_STEPS),
    })
    .strict(),
  z
    .object({
      kind: z.literal("restore"),
      /** 0..1 of the TARGET's max health (WC3 SetUnitLifePercentBJ) */
      healthPct: z.number().min(0).max(1).optional(),
      /** 0..1 of the TARGET's max mana (WC3 SetUnitManaPercentBJ) */
      manaPct: z.number().min(0).max(1).optional(),
    })
    .strict(),
  /**
   * spendMana (20-01 風王結界 的法球扣魔) — mirrors the `spendMana` member of
   * `EffectDef`. See sim/effects/spendMana.ts for why it is not `manaCost` and
   * why it carries no threshold of its own.
   *
   * 上下界, not just a floor: `pctMaxMana` is a RATIO like `chance` and
   * `Stat.Lifesteal`, so 30 typed instead of 0.30 has to be a FORM ERROR rather
   * than an effect that empties the pool 30× over (#277 的形態).
   */
  z
    .object({
      kind: z.literal("spendMana"),
      amount: zScaling,
      pctMaxMana: z.number().min(0).max(1).optional(),
      /**
       * 付款人**現存**法力的一個比例,加在 `amount` 與 `pctMaxMana` 之上 ——
       * 熾天使之弓 godie-i012「每次削去敵方英雄現存 MP 3%」(owner 2026-08-01 裁定
       * 5%→3%)。ABSENT = 0。
       * 為什麼是第二個欄位而不是給 `pctMaxMana` 加一個 `basis`:名字寫著 Max
       * 的欄位不可以有時候是 current(見 sim/effects/effect.ts 的說明)。
       */
      pctCurrentMana: z.number().min(0).max(1).optional(),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 存下這一次**實際扣掉的**法力,給稍後的 `damage.bankedBonus` 讀。
       * ABSENT = 不存。`durationSec` 應該等於那張卡的效果視窗(絕。暗殺奧義是
       * 5 秒),上界跟 `applyBuff.duration` 同級 —— 一筆存款活得比視窗久,
       * 就會讓下一次不相干的攻擊莫名其妙變痛。
       */
      bankAs: z
        .object({
          statusId: zRef<StatusId>("status-effects", { soft: true }),
          durationSec: z.number().positive().max(BANKED_LIFE_MAX_SEC),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("dash"),
      mode: z.enum(["forward", "toPoint"]),
      speed: z.number().positive(),
      maxDistance: z.number().positive(),
    })
    .strict(),
  /**
   * leap (task #247) — mirrors the `leap` member of `EffectDef`. Ported from
   * the map's own parabola (see sim/movement/leap.ts); `apexHeight`/`landRadius`
   * arrive here in GGD units, converted from the JASS wc3 values by `toLen`
   * inside the template expander, so there is no second conversion constant.
   */
  z
    .object({
      kind: z.literal("leap"),
      applyTo: z.enum(["self", "target"]).optional(),
      mode: z.enum(["toPoint", "inPlace"]),
      apexHeight: z.number().min(0),
      durationSec: z.number().positive(),
      throwDistance: z.number().min(0).optional(),
      /** yank the flyer to the caster before the throw (j:51755-51767) */
      dragToCaster: z.boolean().optional(),
      landRadius: z.number().min(0).optional(),
      onLand: z.array(z.lazy(() => zEffectDef)).optional(),
    })
    .strict(),
  /**
   * championForm (task #249) — mirrors the `championForm` member of
   * `EffectDef`. There is deliberately NO champion-id field to validate: the
   * counterpart body is read from the champion doc's own
   * `transform.counterpartId` (already a hard `zRef<ChampionId>("champions")`
   * in schema/champion.ts), so the reference is checked exactly once, where the
   * w3x actually declares it, and an ability doc cannot name a body that its
   * hero has no link to.
   */
  z
    .object({
      kind: z.literal("championForm"),
      /** "alternate"/"base" force a direction; "toggle" is the w3x 風王結界/紮根 form */
      to: z.enum(["alternate", "base", "toggle"]),
      /** w3a `ahdu` at the cast rank; ABSENT = never times out (the toggles) */
      durationSec: z.number().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnProjectile"),
      projectileId: zRef<ProjectileId>("projectiles"),
      onHit: z.array(z.lazy(() => zEffectDef)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawnVfx"),
      /** vfx@1 doc id (SOFT ref — the doc may be imported/authored later). */
      vfxId: zRef("vfx", { soft: true }),
      /** where the one-shot plays: caster (default), first target, or the cast point. */
      at: z.enum(["self", "target", "point"]).optional(),
      /** seconds a continuous doc keeps emitting (client hint; optional). */
      durationSec: z.number().min(0).optional(),
    })
    .strict(),

  /* ═════════════════════════════════════════════════════════════════════════
   * RESERVED KINDS (GH#289) — mirrors the reserved block of `EffectDef`.
   *
   * They are in the schema BEFORE their handlers exist on purpose: the editor
   * card, the content docs and the ref-checking all come from here, so a lane
   * can author its documents while it builds. The safety net is on the other
   * side — `sim/effects/<kind>.ts` throws a named error, so a document that
   * reaches a live match without its handler fails LOUDLY instead of doing
   * nothing (CLAUDE.md 失敗形態 ②).
   *
   * ⚠️ EVERY numeric field carries an UPPER bound as well as a lower one
   * (CLAUDE.md: 「欄位要有上界，不是只有下界」). The failure these prevent is the
   * same one damageArea's caps above prevent — a raw WC3 number pasted in
   * (durations in the hundreds, distances in the thousands) has to make the
   * FILE fail to load, not make one ability lock a match down after release.
   * ═════════════════════════════════════════════════════════════════════════ */
  z
    .object({
      kind: z.literal("dot"),
      damageType: zDamageType,
      /** damage per PAYOUT, not per second */
      amountPerTick: zScaling,
      /**
       * 資源百分比項,加在**每一次付款**上 —— 熾天使之弓 godie-i012 的
       * 「每秒燃燒 3% 最大生命,持續 2 秒」。與 `damage.resourcePct` **同一份**
       * schema(見 {@link zResourcePctTerm}),per-target 解算並在 apply 當下
       * 凍進 `DotInstance.amountPerTick`。
       *
       * ⚠️ 除了每一格的 `scale` 上界之外,還有一道**整段燒完的總量**檢查
       * (`refineDotResourceBudget`)—— 一次 `damage` 的百分比是一下,dot 的
       * 是 `duration/interval` 下,守衛必須架在乘完之後。
       */
      resourcePct: zResourcePctTerm.optional(),
      /** seconds between payouts — one sim tick (1/30 s) is the floor */
      intervalSec: z.number().min(1 / 30).max(60),
      /** total seconds; the 60 s ceiling is the longest shipped combat round */
      durationSec: z.number().positive().max(60),
      /**
       * re-apply the same origin FROM THE SAME CASTER: extend the deadline
       * (default), run a second independent instance, or add a stack. See the
       * `dot` member of `sim/effects/effect.ts` for why each exists and which
       * one is the default.
       */
      stacking: z.enum(["refresh", "independent", "stack"]).optional(),
      /**
       * `"stack"` ceiling. Bounded on BOTH sides (CLAUDE.md 「欄位要有上界」):
       * the ceiling has to be finite or a 0.5 s re-cast turns into an unbounded
       * payout by the end of a round, and `DOT_MAX_STACKS` mirrors this number.
       */
      maxStacks: z.number().int().min(1).max(99).optional(),
      /** also pay on the cast tick (default false = wait one interval) */
      tickOnApply: z.boolean().optional(),
      /** does the burn outlive its caster? absent = "continue" (WC3's reading) */
      onCasterDeath: z.enum(["continue", "stop"]).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("summon"),
      /**
       * WHOSE BODY. `"self"` clones the CASTER's own champion (57-03 複製鏡,
       * 27-002 霧隱分身之術), so those docs need not name their own hero twice.
       * ABSENT = `"champion"`, i.e. `championId` below.
       */
      body: z.enum(["champion", "self"]).optional(),
      /**
       * SOFT ref: a summon's body is a champion doc, but an ability may be
       * authored before the body exists. Tighten to a hard ref once every
       * summoned unit ships. An unknown id summons NOTHING and emits
       * `summonFailed` (effects/summon.ts) — never a throw inside a tick.
       */
      championId: zRef("champions", { soft: true }),
      /** bodies per cast. The ceiling is an anti-typo guard, not balance. */
      count: z.number().int().min(1).max(20),
      /** seconds before despawn; ABSENT = permanent (WC3's 0-duration form) */
      durationSec: z.number().positive().max(600).optional(),
      level: z.number().int().min(1).max(30).optional(),
      /* ── 決策點 (owner 2026-07-30 「尤其是決策點」) ────────────────────────
       * Every enum below is a place the 52 「召喚代理」 in
       * docs/ability-templates.md disagree with each other, so none of them can
       * be a branch chosen in code. See the `summon` member of
       * sim/effects/effect.ts for the per-field evidence. */
      /** 歸屬: the summoner's team (default) or the hostile MONSTER sentinel */
      team: z.enum(["owner", "neutral"]).optional(),
      /** anchor for the formation: caster (default) / first target / cast point */
      at: z.enum(["self", "target", "point"]).optional(),
      /** 固定陣型 or 隨機散佈 — `"scatter"` draws from the world's SEEDED rng */
      formation: z.enum(["ring", "line", "scatter"]).optional(),
      /**
       * ring radius / line spacing / scatter radius, GGD units. UPPER-BOUNDED
       * (CLAUDE.md 「欄位要有上界，不是只有下界」): a duel zone is ~24 units
       * across, so a raw un-converted WC3 offset (400/450) pasted in here would
       * scatter the whole summon outside the arena and every body would be
       * silently clamped onto the rim.
       */
      spread: z.number().positive().max(12).optional(),
      /** 上限: most bodies alive at once in this cap group; ABSENT = DEFAULT_SUMMON_CAP (8) */
      maxAlive: z.number().int().min(0).max(20).optional(),
      /** what the cap counts: per caster PER ability (default) or per caster */
      capScope: z.enum(["caster", "casterAbility"]).optional(),
      /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
      onCap: z.enum(["skip", "replaceOldest"]).optional(),
      /** summoner dies → despawn (default) or fight on to the deadline */
      onOwnerDeath: z.enum(["despawn", "persist"]).optional(),
      /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
      hpMult: z.number().positive().max(10).optional(),
      /** ×the source champion's own attack damage */
      damageMult: z.number().positive().max(10).optional(),
      /**
       * Who is paid for the summon's kills. ABSENT/`"none"` = nobody, which is
       * what the sim does today by construction.
       *
       * ⚠️ `"owner"` is ACCEPTED BY THE SCHEMA AND REFUSED BY THE HANDLER — it
       * needs a killer-rewrite seam in systems/DeathSystem.ts. Kept in the enum
       * (rather than dropped) so the value the editor will eventually offer has
       * one spelling, and so the refusal is a LOUD error naming the missing
       * seam instead of a Zod message about an unknown string.
       */
      killCredit: z.enum(["none", "owner"]).optional(),
      /* ── 誰打得到它 —— 決策點。預設值與理由: sim/summonRules.ts ───────────
       * A summon is deliberately neither a `champion` nor a `mob`, and BOTH of
       * the sim's automatic target pickers used to be allow-lists over exactly
       * those two stores — so nothing in the game could acquire a summon. These
       * six are what turned that from a hard-coded fact into an authored one. */
      /**
       * 敵方**自動**索敵看不看得見它。ABSENT = true = WC3 (an ordinary unit).
       * `false` hides it from auto-acquisition ONLY — it stays in the collision
       * broad-phase, so ability AoE and skillshots still hit it. This is not
       * invulnerability and must not be authored as if it were.
       */
      autoTargetable: z.boolean().optional(),
      /**
       * 索敵優先級。ABSENT = `"summon"`, its own tier between hero and zombie.
       * `"champion"` makes it soak attacks like a hero (57-03 複製鏡, 27-002
       * 霧隱分身之術 — decoys whose whole job is to be shot at); `"mob"` drops
       * it below every hero so it never pulls autos off the real fight.
       */
      targetPriority: z.enum(["champion", "summon", "mob"]).optional(),
      /** #215 殭屍會不會改去咬它。ABSENT = true = WC3 (creeps fight summons). */
      mobTargetable: z.boolean().optional(),
      /** 玩家能不能手動點名它。ABSENT = true = WC3 (right-clickable). */
      manualTargetable: z.boolean().optional(),
      /**
       * 縮圈的火燒不燒它。ABSENT = true —— owner 2026-07-30 的 保底:「所有場上
       * 玩家、bot、各種殭屍都會百分比真實傷害燒死」。Author `false` only for a
       * body that is scenery rather than a combatant (37-03 災難之牆).
       */
      burnsInFireRing: z.boolean().optional(),
      /**
       * 打死它付給擊殺者的金幣。ABSENT = 0 = 今天的行為 = WC3 (a summoned unit
       * is not a gold-bearing unit, which is what stops 召喚 spam being a gold
       * farm). UPPER-BOUNDED (CLAUDE.md 「欄位要有上界」): the shipped kill
       * bounty for a whole enemy CHAMPION is far below 1,000, so anything past
       * that is a typo, and a typo here prints gold every cast.
       */
      bountyGold: z.number().min(0).max(1000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("invulnerable"),
      /** seconds. Capped hard: an unbounded immunity is an unwinnable round. */
      durationSec: z.number().positive().max(30),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * 傷害免疫的範圍。ABSENT = "all" = WC3 的 `Avul`。`"none"` 是**純免控**
       * (07-01 臨、兵、鬥「可抵擋對方負性魔法」),`"magic"` 是魔法免疫
       * (47-04 天翔龍閃 / 97-04 火產靈神 / 99-04)。
       */
      blocksDamage: z.enum(["all", "none", "physical", "magic"]).optional(),
      /** 真實傷害(火圈 #270)。ABSENT = 跟著 `blocksDamage === "all"` */
      blocksTrueDamage: z.boolean().optional(),
      /**
       * 免控(stun / root / 減速)。**ABSENT = false**,刻意與免傷分開 —— 見
       * sim/effects/invulnerable.ts 檔頭 ②。
       */
      blocksControl: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("knockback"),
      /**
       * GGD units **AT GAP 0** — the FLOOR, not a fixed length: the GH#193 gap
       * subtraction still runs on top (see sim/effects/knockback.ts). Bounds
       * live in `sim/effects/knockbackLimits.ts`, the same one-table-two-
       * consumers shape `spreadLimits` uses, so schema and sim cannot drift.
       */
      distance: z.number().positive().max(KB_MAX_DISTANCE),
      speed: z.number().positive().max(KB_MAX_SPEED),
      /** away from the caster (default), along the caster's facing, or a PULL */
      from: z.enum(["caster", "facing", "pull"]).optional(),
      /** each resolved target (default) or the caster (a recoil) */
      applyTo: z.enum(["target", "self"]).optional(),
      /**
       * 「這一擊的重量」in DAMAGE units, run through GH#193's own law against
       * the victim's health. Deals no damage. ABSENT = the flat floor only.
       */
      impactPower: z.number().positive().max(KB_MAX_IMPACT_POWER).optional(),
      /** percentage of MAX health (default, the shipped rule) or CURRENT health */
      hpBasis: z.enum(["max", "current"]).optional(),
      /** subtract the caster↔victim gap (GH#193). ABSENT = true. */
      subtractGap: z.boolean().optional(),
      /** 擊飛: apex height in GGD units; > 0 turns the shove into a parabola */
      launchHeight: z.number().min(0).max(KB_MAX_LAUNCH_HEIGHT).optional(),
      /** 期間不可控制 (world.knockdown). ABSENT = true. */
      uncontrollable: z.boolean().optional(),
      /** extra 不可控制 ticks after landing (the 爬起來 window) */
      getupTicks: z.number().int().min(0).max(KB_MAX_GETUP_TICKS).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("evasion"),
      /**
       * 0..1 BEFORE the ceiling. Both dodge channels are capped at
       * `effectiveCap(statCaps, Stat.Evasion)` — shipping 0.8, editable on the
       * 後台「屬性上限」page. Authoring 1 here does NOT buy invulnerability.
       * (It did until 2026-07-30 on the ability channel; see combat/evasion.ts.)
       */
      chance: z.number().min(0).max(1),
      durationSec: z.number().positive().max(60),
      applyTo: z.enum(["self", "target"]).optional(),
      /**
       * DECISION POINT — dodge ABILITY damage too? Default false = WC3
       * `Evasion` fidelity (basic attacks only), today's shipping behaviour.
       */
      dodgesAbilities: z.boolean().optional(),
      /**
       * DECISION POINT — dodge `type: "true"` damage too? Default false, so
       * the arena fire-ring burn (#270) stays undodgeable unless opted in.
       */
      dodgesTrueDamage: z.boolean().optional(),
    })
    .strict(),
  /**
   * taunt — 嘲弄 (鍊金術之盾 godie-i06q). Mirrors the `taunt` member of
   * `EffectDef`. The mechanic, the state model and every operator-facing
   * decision field live in `sim/taunt.ts`; this is only the authoring surface.
   *
   * BOTH ENDS BOUNDED, and the two ceilings guard DIFFERENT mis-parses:
   *   · `durationSec` ≤ TAUNT_MAX_DURATION_SEC — 0.5 typed as 50 is a taunt
   *     that outlives the round, i.e. one shield owning every enemy's targeting
   *     for the whole fight. The FLOOR is 0.034 s for the reason
   *     `grantAttribute.durationSec` has one: `Math.round(sec/dt)` at 30 Hz is
   *     0 ticks below that — a blank that reads exactly like a broken feature.
   *   · `radius` ≤ SPREAD_MAX_RADIUS — the SAME ceiling every other authored
   *     circle carries, and for the same reason: a w3x `Area` column pasted
   *     straight in (200/300/450) is ~54.5× too large and would taunt the whole
   *     duel zone. Reusing that constant rather than inventing a taunt-specific
   *     one is deliberate — two ceilings for 「一個圓有多大」 would drift.
   */
  z
    .object({
      kind: z.literal("taunt"),
      /** 持續幾秒 (乘上後台的 `tauntRules.durationMult` 之後換算成絕對 tick) */
      durationSec: z.number().min(0.034).max(TAUNT_MAX_DURATION_SEC),
      /**
       * 範圍 (GGD 單位), 圓心是**施法者自己**。省略 = 單體, 掛在這個效果自己
       * 解析出來的目標上。走 `combatEnv.abilityRange`, 和其它每一個 AoE 一樣。
       */
      radius: z.number().positive().max(SPREAD_MAX_RADIUS).optional(),
      /** 一次最多拉幾個人 (由近到遠)。省略 = TAUNT_MAX_TARGETS */
      maxTargets: z.number().int().min(1).max(TAUNT_MAX_TARGETS).optional(),
    })
    .strict(),
  /**
   * grantGold — 發放金幣. Mirrors the `grantGold` member of `EffectDef`.
   * 「黃金數量為敵方等級」 is `perTargetLevel: 1`.
   *
   * BOTH ENDS BOUNDED, and both ceilings are MIS-PARSE guards rather than
   * balance policy — the whole shipped economy is ~7,600 gold per match
   * (sim/economy/progression.ts), so:
   *   · `flat` ≤ 5000 — a single proc paying two thirds of a match's income is
   *     a typo, not a design.
   *   · `perTargetLevel` ≤ 100 — at the level cap (99) that is already 9,900,
   *     i.e. more than the entire economy from one hit. 「等級」 means 1.
   */
  z
    .object({
      kind: z.literal("grantGold"),
      /** 固定金額。省略 = 0（純按等級發放是合法的） */
      flat: z.number().min(0).max(5000).optional(),
      /** 每一級發多少金。「黃金數量為敵方等級」= 1。沒有目標時這一項是 0 */
      perTargetLevel: z.number().min(0).max(100).optional(),
      /**
       * **決策點**:小怪(殭屍)的「等級」從哪裡來。省略 = `"wave"`(波次等級,
       * 也就是那隻殭屍的血量/回血曲線本來就用的那個數字)。`"fallback"` =
       * 小怪沒有等級,值 `fallbackLevel`。
       *
       * ⚠️ 出貨是 `"wave"` 而不是舊行為的 0,因為 0 是一個缺陷不是一個設計:
       * 鍊金術之盾的「黃金數量為敵方等級」對全場每一隻殭屍付 0 金,而卡片上
       * 寫著另一回事(失敗形態 ②)。
       */
      mobLevelSource: z.enum(["wave", "fallback"]).optional(),
      /**
       * 完全沒有等級可讀的身體算幾級。省略 = 0。上界 99 = 英雄等級上限
       * (誤植守衛:填 990 等於一發付 990 金,那是整場經濟的八分之一)。
       */
      fallbackLevel: z.number().int().min(0).max(99).optional(),
      /** 誰收錢：施法者（預設）或每一個解析出來的目標 */
      to: z.enum(["self", "target"]).optional(),
    })
    .strict(),
]);

/**
 * 帶著一發傷害封包的事件 —— 也就是 `EffectContext.incoming` 唯一會被填的兩個。
 * 是 `combatResolveSystem` 那兩行 `fireHooks` 的**唯一**真實來源鏡像。
 */
const DAMAGE_BEARING_EVENTS: readonly string[] = ["onDamageTaken", "onDamageDealt"];

/**
 * 把「只有帶傷害的事件才談得上『那一發』」變成一個**載入時的解析錯誤**,
 * 而不是一句註解。
 *
 * 它擋的是失敗形態 ②(做了但玩家拿不到)的一個非常安靜的變體:把
 * `damageSource: "basic"` 或 `damage.incomingPct` 掛在 `onKill` / `onBasicAttack`
 * / `onInterval` 上。schema 收得下、後台存得起來、卡片上看得到,而 sim 永遠
 * 不會給那些事件一發封包 —— 於是那條 hook **一次都不會觸發**,或者反彈永遠是 0,
 * 沒有任何錯誤訊息。
 *
 * ⚠️ 只看 `effects` 的**第一層**。巢狀 payload(`spawnProjectile.onHit`、
 * `applyBuff.hooks[]`、`leap.onLand`)不在這裡檢查,因為那些 payload 在**另一個**
 * 時間點執行,那時 `ctx.incoming` 本來就已經沒有了 —— 那是一個不同的、更難的問
 * 題,而一個假裝檢查了的淺掃比誠實地只掃一層更糟。sim 那一側的
 * `damage.incomingPct` 對沒有 `incoming` 的情況是**整條不執行**,所以巢狀誤用的
 * 後果是「什麼都不做」,不是「付一半」。
 */
/**
 * 每一次評估都**要付一次代價**的條件葉子 —— `onInterval` 漏填
 * `internalCooldown` 時,這些是把「每秒 30 次」從一句註解變成一個問題的那些。
 *
 * ⚠️ **這張表是 refine 的全部**,所以加葉子的人要順手看一眼這裡。今天只有
 * 一個成員:
 *
 *   · `"chance"` —— 每一次評估**抽一次 `world.rng`**。掛在沒有 ICD 的
 *     `onInterval` 上就是每 tick 一抽 × 每個持有者,而抽籤是**亂數流**上的
 *     動作:一份這樣的文件不只是慢,它會讓那一場的 seed 以 30Hz 前進,
 *     任何人事後想從錄影推理都要先扣掉它。
 *
 * 批 10 的空間葉子(`enemyChampionWithinRange`:沒有敵人在範圍內時 ICD 閘
 * **不會**擋,因為 `hookLastFired` 只在成功發射後才寫,所以條件會每 tick 做
 * 一次網格查詢)加進這張表就自動被擋 —— 那正是決策點 1-5 選 A 的理由,
 * 而這張表就是它落地的地方。
 */
const INTERVAL_BUDGET_CONDITION_KINDS: readonly string[] = ["chance"];

/** 這棵條件樹裡有沒有任何一顆「每次評估都要付錢」的葉子。 */
function hasBudgetedLeaf(cond: unknown): boolean {
  if (!cond || typeof cond !== "object") return false;
  const c = cond as Record<string, unknown>;
  if (typeof c.kind === "string") return INTERVAL_BUDGET_CONDITION_KINDS.includes(c.kind);
  for (const key of ["all", "any"] as const) {
    const arr = c[key];
    if (Array.isArray(arr) && arr.some(hasBudgetedLeaf)) return true;
  }
  return hasBudgetedLeaf(c.not);
}

export function refineHookDamageContext(
  hook: {
    on: string;
    damageSource?: string | undefined;
    chance?: number | undefined;
    chanceFrom?: { min: number; max: number } | undefined;
    internalCooldown?: number | undefined;
    condition?: unknown;
    effects: readonly { kind: string; incomingPct?: unknown }[];
  },
  ctx: z.RefinementCtx,
): void {
  // ── `onInterval` 的節奏 (批 1, 決策點 1-5) ────────────────────────────────
  //
  // owner 的 TSV 把節奏寫成 `interval: 0.5`。引擎的欄位叫 `internalCooldown`,
  // 而 `zHookDefBase` 是 `.strict()`,所以 `interval` 這個 key 本身進不來 ——
  // 問題不在拼錯,在**漏填**:`onInterval` 沒有 `internalCooldown` = 每一 tick
  // 都發 = 30 次/秒,而那在畫面上跟「每 0.5 秒一次」長得一模一樣,只是更燙。
  //
  // ⚠️ 為什麼不是「一律要求 `internalCooldown`」:03-00 相轉移裝甲的常駐魔免
  // **就是**要每 tick 發,出貨的 7 條 `onInterval` 也全部有 ICD。所以這條只擋
  // 「每次評估都要付錢的條件 + 沒有節奏」這個組合 —— 見
  // {@link INTERVAL_BUDGET_CONDITION_KINDS}。
  //
  // CLAUDE.md 的 fail-loud 條款:錯誤要在**編輯發生的當下**響(載入這份文件
  // 就爆,訊息由 `SchemaValidationError` 冠上 collection + 文件 id),
  // 不是等到某條剛好跑到它的測試。
  if (
    hook.on === "onInterval" &&
    !hook.internalCooldown &&
    hasBudgetedLeaf(hook.condition)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["internalCooldown"],
      message:
        "onInterval + 需要每次評估付出代價的條件(" +
        `${INTERVAL_BUDGET_CONDITION_KINDS.join(" / ")})卻沒有 internalCooldown ——` +
        " 這條 hook 會**每一 tick**(30 次/秒)評估一次條件並抽一次亂數。" +
        "節奏就寫在 internalCooldown(0.5 = 每 0.5 秒),那個欄位本來就存在;" +
        "owner TSV 上的 `interval` 指的就是它,不是第二個欄位。",
    });
  }
  // ── 機率的兩個欄位:互斥,而且區間不可以顛倒 ──────────────────────────────
  // 這一段**在 DAMAGE_BEARING_EVENTS 的 early-return 之前**,因為機率跟事件
  // 帶不帶封包無關 —— 放在後面的話,`onDamageTaken` 上的一份壞文件會安靜地
  // 通過(而 [反彈] 那一族全都掛在那兩個事件上)。
  if (hook.chance !== undefined && hook.chanceFrom !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom"],
      message:
        "chance 與 chanceFrom 不能同時出現 —— 「相乘還是取代」這個問題沒有正確答案, " +
        "而任何一種選法都會在某一張卡上讀起來像 bug。要活的門檻就只留 chanceFrom。",
    });
  }
  if (hook.chanceFrom !== undefined && hook.chanceFrom.min > hook.chanceFrom.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom", "min"],
      message:
        `min ${hook.chanceFrom.min} > max ${hook.chanceFrom.max} —— 顛倒的區間會讓 clamp ` +
        "永遠回傳 min,也就是一件「機率性」道具安靜地卡在一個固定值上。",
    });
  }
  if (DAMAGE_BEARING_EVENTS.includes(hook.on)) return;
  if (hook.damageSource !== undefined && hook.damageSource !== "any") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["damageSource"],
      message:
        `「${hook.damageSource}」是對觸發傷害的過濾,只有 ${DAMAGE_BEARING_EVENTS.join(" / ")} ` +
        `帶得到那一發封包。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  hook.effects.forEach((e, i) => {
    if (e.kind === "damage" && e.incomingPct !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects", i, "incomingPct"],
        message:
          `[反彈] incomingPct 反彈的是「觸發這個 hook 的那一發傷害」,只有 ` +
          `${DAMAGE_BEARING_EVENTS.join(" / ")} 帶得到它。掛在 ${hook.on} 上永遠反彈 0。`,
      });
    }
  });
}

/**
 * `.strict()` OBJECT 版本,給 `schema/item.ts` 的 `.extend()` 用。
 *
 * 分成兩個名字的原因很實際:`zHookDef` 加了 `superRefine` 之後是 `ZodEffects`,
 * 而 `ZodEffects` 沒有 `.extend()`。`zAuraDef` / `zItemAuraDef` 已經踩過同一個
 * 坑(那邊用的是 `.innerType()`)。item.ts 會把同一個 refine 再套一次,兩邊共用
 * `refineHookDamageContext` 這一個函式,所以規則不可能只在一邊生效。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 寫卡片的人最常打錯的四個字 —— **它們都不是缺的功能,是拼寫**
 * ════════════════════════════════════════════════════════════════════════════
 * 稜彩增益卡的規格 TSV 用的是一套人話字彙,而其中四個字在引擎裡**已經有對應的
 * 欄位**。照 TSV 字面新增欄位的唯一產出是**同義詞**,而同義詞是最貴的一種技術
 * 債:兩個都填得起來、誰贏要靠註解解釋,而註解會過期(CLAUDE.md 第三守則)。
 *
 *   TSV 寫的            引擎已出貨的                        住在哪裡
 *   ──────────────────  ──────────────────────────────────  ─────────────────
 *   op: "conversion"    op: "percentOf" + from/fromResource  ModOp.PercentOf
 *                                                            (sim/stats/modifiers.ts)
 *   op: "set"           op: "override"                       ModOp.Override
 *   conditions: [ … ]   condition: { all: [ … ] }            本檔 `condition`
 *   interval: 0.5       internalCooldown: 0.5                本檔 `internalCooldown`
 *
 * 前三個由 `.strict()` 自動擋(未知的 key → 解析錯誤,而 `SchemaValidationError`
 * 會冠上 collection 與文件 id)。第四個擋得到「漏填」但擋不到「拼錯」,所以它
 * 另有一段 refine —— 見 `refineHookDamageContext` 的 `onInterval` 那一段。
 */
export const zHookDefBase = z
  .object({
    on: zHookEvent,
    /** restrict to one slot; "PASSIVE" is the level-1 天生技 (zCastableSlot). */
    abilitySlot: zCastableSlot.optional(),
    effects: z.array(zEffectDef),
    /**
     * 內部冷卻(**秒**):這條 hook 真的發動過一次之後,要隔多久才能再發動。
     * 留空 / 0 = 沒有冷卻(每一次事件都算)。抽輸 / 條件不成立**不燒冷卻**
     * (sim/effects/hooks.ts 的順序註解)。道具來源還會再乘後台 combat-env 的
     * `itemCooldown`。上界見 {@link HOOK_INTERNAL_COOLDOWN_MAX_SEC}。
     */
    internalCooldown: z.number().min(0).max(HOOK_INTERNAL_COOLDOWN_MAX_SEC).optional(),
    /** proc probability 0..1 on the seeded rng (absent = always) */
    chance: z.number().min(0).max(1).optional(),
    /**
     * 機率 = 一項三圍 × 係數,夾在 `[min, max]` —— 朗基努斯之槍 godie-i018
     * 「(總敏捷)% 機率」。mirrors `HookDef.chanceFrom` in sim/stats/modifiers.ts,
     * where the determinism argument (抽的次數與位置完全沒變,動的只有門檻)
     * and the 「為什麼 `chance` 不夠」 derivation live.
     *
     * `coeff` 上界 `CHANCE_PER_ATTR_MAX` 是**打錯數字的守衛**:寫 1 而不是
     * 0.01 等於「一點敏捷 = 100%」,而 clamp 會幫它藏起來 —— 一個永遠觸發的
     * 「機率性」道具在 diff 裡跟正確的長得一樣。
     *
     * `min`/`max` 兩端都是欄位:「(總敏捷)%」在後期無界(120 敏 = 120%),
     * 而要不要真的讓它變成必定觸發是 owner 的決定。`min <= max` 由
     * {@link refineHookDamageContext} 檢查(一個上下顛倒的區間會讓 clamp 回傳
     * `min`,也就是一個安靜地永遠不觸發的道具)。
     *
     * ⚠️ 2026-08-01 更正:這一段原本寫「在下面的 `refineHookChance` 檢查」,
     * 而**全樹沒有任何一個叫 `refineHookChance` 的東西**(第三守則)。那個檢查
     * 從一開始就住在 `refineHookDamageContext` 的最前面 —— 而且是刻意放在
     * `DAMAGE_BEARING_EVENTS` 的 early-return **之前**,那個順序本身有註解在守。
     * 名字指錯的註解比沒有註解更貴:它會讓下一個人去找一個不存在的函式,
     * 然後以為這條規則沒被實作。
     *
     * ⚠️ **沒有常數項**:門檻是 `clamp(三圍 × coeff, min, max)`,不是
     * `flat + 三圍 × coeff`。w3x 那一族 `(5 + 敏捷/15)%` 的技能因此**寫不進來**
     * (拿 `min` 當常數會得到 `max(0.05, agi×coeff)`,在 75 敏以下與文案差最多
     * 5 個百分點)。要移植那一族就是加一個 flat 欄位,不是在文件裡寫近似值 ——
     * 見 `content/fieldAdoption.test.ts` 對這個 key 的豁免。
     */
    chanceFrom: z
      .object({
        attr: z.enum(["str", "agi", "int"]),
        basis: z.enum(["base", "total"]).optional(),
        coeff: z.number().min(0).max(CHANCE_PER_ATTR_MAX),
        min: z.number().min(0).max(1),
        max: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    /**
     * 觸發條件 — the general 「什麼時候才觸發」 gate (owner 2026-07-30). Absent =
     * always, so every hook authored before this field is untouched.
     *
     * ⚠️ AUTHORED HERE, ON `zHookDef` ITSELF, AND NOT ON A PER-COLLECTION EXTEND
     * THE WAY `requires` IS. The two fields answer different questions and
     * therefore belong at different levels: `requires` is 「這位英雄配不配得上這
     * 張卡」, which only has meaning for a thing a champion EQUIPS, so item.ts
     * extends `zHookDef` to add it. A condition is 「這一下算不算數」, which is
     * meaningful for every hook carrier there is — ability passives, 天生技,
     * champion passives, augments, auras and items — and 獸矛 (an ability),
     * 僵屍王 A022 (an ability) and the 「X% 機率造成 Y」 item family all need it
     * at once. Putting it on the base is what stops this from becoming three
     * near-identical fields with three near-identical editors.
     */
    condition: zEffectCondition.optional(),
    /**
     * 效果打在誰身上:事件的那個實體(預設)、hook 的持有者("self"), 或**全隊**
     * ("allies")。
     *
     * `"allies"` 是 天生牙 godie-i031 的「我方所有英雄」/「我們全部英雄」——
     * 成員是「同隊、有 ChampionComp 的每一位, 含自己, **含死掉的**, 依實體 id 排序」,
     * 完整的理由與每一條的取捨寫在 sim/stats/modifiers.ts 的 `HookDef.target`。
     * 死人也在名單裡是 `revive` 的全部意義, 而對只作用在活人的 kind 是零成本:
     * `healTarget` / `restoreMana` 對屍體回 0。
     */
    target: z.enum(["self", "event", "allies"]).optional(),
    /**
     * #244 — WHAT the event's entity must be for the hook to fire. Absent =
     * "any" (every pre-#244 hook). Lets one `onKill` doc pay differently for a
     * 部隊 kill and a 英雄 kill.
     */
    victim: z
      .enum(["champion", "mob", "any", "enemyChampion", "allyChampion", "enemy"])
      .optional(),
    /**
     * {@link zHookDefBase.shape.internalCooldown} 的**作用域**(批 1,
     * 決策點 1-4)。`"source"`(省略 = 這一個)= 一份冷卻不分槽位,也就是這個
     * 欄位出現之前每一份文件的行為;`"perAbilitySlot"` = Q/W/E/R/EX/PASSIVE
     * 各記各的(末日預言的 `perAbilityCooldown`)。
     *
     * ⚠️ **只在 `onAbilityCast` / `onAbilityHit` 上真的分得開** —— 其餘事件
     * 發射時沒有槽位,`"perAbilitySlot"` 在那裡退化成一份全域冷卻。完整的
     * 理由與「為什麼是槽位不是技能 id」寫在 `sim/stats/modifiers.ts` 的
     * `HookDef.internalCooldownScope`。
     */
    internalCooldownScope: z.enum(["source", "perAbilitySlot"]).optional(),
    /**
     * [反彈] 觸發這個 hook 的那一發傷害**是不是普通攻擊** —— mirrors
     * `HookDef.damageSource` in sim/stats/modifiers.ts, where the naming
     * (`"nonBasic"` 而不是 `"ability"`)與「無封包 = 不通過」的不對稱都有交代。
     *
     * owner 給反射之盾寫的是「反彈**普通攻擊**傷害 200%」;在這之前
     * `onDamageTaken` 分不出普攻、技能與 DoT,那件道具只能被實作成「反彈所有
     * 傷害」—— 一件強得多的、不同的道具。
     */
    damageSource: z.enum(["any", "basic", "nonBasic", "ability", "other"]).optional(),
  })
  .strict();

/** `zHookDefBase` + 「只有帶傷害的事件談得上『那一發』」的載入時檢查。 */
export const zHookDef = zHookDefBase.superRefine(refineHookDamageContext);

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
  })
  .strict()
  .refine((a) => (a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) > 0, {
    message: "aura must carry at least one modifier or hook",
  });

/**
 * 隱形 / 真視 grant on a passive rank — mirrors `VisionGrant` in sim/stealth.ts.
 *
 * BOTH numbers are PORTED, not invented, and both have an upper bound because a
 * missing ceiling is how a mis-parse ships (#277):
 *
 *   · `stealthFadeDelaySec` — the w3x `Dur`/`HeroDur` column of WC3 Permanent
 *     Invisibility (`Apiv`), which for that ability is the FADE TIME. 27-00
 *     永久性的隱形術 ships 4.0, matching its own prose 「在4秒內不做任何攻擊或
 *     施法動作」. Cap 60 s: anything longer is a hero who never goes invisible
 *     inside a 3-minute round, i.e. a typo that would read as the feature being
 *     broken. 0 is legal and means "hidden the instant you stop acting".
 *   · `trueSightRadius` — sim units, so the w3x `cast_range` divided by the
 *     usual 54.5 (`Atru` 16-00 通靈能力: 500 → 9.17). Cap 40, the same
 *     mis-parse guard `zAuraDef.radius` uses and for the same reason: the whole
 *     zone is `boundaryRadius: 24`, so >40 is almost certainly a raw WC3 number
 *     that leaked through unconverted.
 */
export const zVisionGrant = z
  .object({
    stealthFadeDelaySec: z.number().min(0).max(60).optional(),
    trueSightRadius: z.number().positive().max(40).optional(),
  })
  .strict()
  .refine((v) => v.stealthFadeDelaySec !== undefined || v.trueSightRadius !== undefined, {
    message: "vision grant must carry at least one of stealthFadeDelaySec / trueSightRadius",
  });

/**
 * 飛行 (無視碰撞) grant on a passive rank — mirrors `FlightGrant` in
 * sim/flight.ts.
 *
 * ⚠️ `stayInsideBoundary` DEFAULTS TO TRUE and that default is the whole safety
 * story: without it 「無視碰撞」 walks 莉娜因巴斯 off the 24-unit arena disc, and
 * every zone-scoped mechanic (duel resolution, teamAliveInZone, the minimap)
 * then reasons about a champion who is nowhere. Turning it off is a deliberate
 * authoring act, not a default anybody falls into.
 *
 * `hoverHeight` is presentation only (it rides the existing `EntityState.h`
 * channel) and is bounded on BOTH ends: a champion floating 40 units up is off
 * the top of a fixed-pitch camera, i.e. invisible, which reads as the model
 * failing to load rather than as a feature.
 */
export const zFlightGrant = z
  .object({
    hoverHeight: z.number().min(0).max(FLIGHT_MAX_HOVER_HEIGHT).optional(),
    ignoreUnits: z.boolean().optional(),
    ignoreObstacles: z.boolean().optional(),
    stayInsideBoundary: z.boolean().optional(),
  })
  .strict();

/** One rank of `ability@1.passive` — mirrors `AbilityPassiveRank`. */
export const zAbilityPassiveRank = z
  .object({
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    auras: z.array(zAuraDef).optional(),
    vision: zVisionGrant.optional(),
    flight: zFlightGrant.optional(),
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
  })
  .strict();

/** `ability@1.passive` — mirrors `AbilityPassive` in sim/content/defs.ts. */
export const zAbilityPassive = z
  .object({
    name: z.string().min(1).optional(),
    ranks: z.array(zAbilityPassiveRank).min(1),
  })
  .strict();
