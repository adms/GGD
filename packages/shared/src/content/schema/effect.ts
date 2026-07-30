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
import { zEffectCondition } from "./condition";
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

/** Recursive knot: spawnProjectile.onHit is EffectDef[] again. */
export const zEffectDef: z.ZodType<EffectDef, z.ZodTypeDef, unknown> = z.lazy(
  () => zEffectDefUnion,
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
      duration: z.number().min(0),
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
]);

export const zHookDef = z
  .object({
    on: zHookEvent,
    /** restrict to one slot; "PASSIVE" is the level-1 天生技 (zCastableSlot). */
    abilitySlot: zCastableSlot.optional(),
    effects: z.array(zEffectDef),
    internalCooldown: z.number().min(0).optional(),
    /** proc probability 0..1 on the seeded rng (absent = always) */
    chance: z.number().min(0).max(1).optional(),
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
    /** who the effects resolve against: the event's entity (default) or the owner */
    target: z.enum(["self", "event"]).optional(),
    /**
     * #244 — WHAT the event's entity must be for the hook to fire. Absent =
     * "any" (every pre-#244 hook). Lets one `onKill` doc pay differently for a
     * 部隊 kill and a 英雄 kill.
     */
    victim: z.enum(["champion", "mob", "any"]).optional(),
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
