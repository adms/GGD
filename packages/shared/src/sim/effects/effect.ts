/**
 * EffectDef — the serializable effect union. Abilities, item actives/passives,
 * augment hooks, and status DoTs all execute the SAME ordered EffectDef[] via
 * one interpreter (effectRunner). Data, not code → JSON-authorable.
 */
import type { EntityId, ProjectileId, StatusId } from "../../ids";
import type { Stat } from "../stats/statTypes";
import type { HookDef, StatModifier } from "../stats/modifiers";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import type { Rng } from "../math/rng";
import type { CastableSlot } from "../intents";

export type DamageType = "physical" | "magic" | "true";

/** Rank-aware scaling: flat + per-rank + stat ratios of the caster. */
export interface Scaling {
  flat?: number;
  perRank?: number[];
  ratios?: { stat: Stat; coeff: number }[];
}

export type EffectDef =
  | {
      kind: "damage";
      damageType: DamageType;
      amount: Scaling;
      canCrit?: boolean;
      /**
       * COMBO WINDOW bonus — extra damage added ONLY while the CASTER still
       * carries `statusId`. The WC3 idiom this ports is a global integer the
       * map flips for exactly one second: 蒼月潮's `udg_MoonCombo` is set to 2
       * at the end of 07-02 者、皆、陣 (war3map.j:34438) and cleared 1.00 s
       * later (j:34440); 07-03 列、在、前 reads `udg_MoonCombo == 2` at
       * j:34189 and, when true, adds `5.00 × AGI` to its damage (j:34210).
       *
       * Expressed as a Scaling so the bonus scales exactly like the base term.
       * NOT consumed on use — the JASS marker only ever expires, it is never
       * cleared by the follow-up cast.
       */
      comboBonus?: { statusId: StatusId; amount: Scaling };
      /**
       * 存款加成 —— 額外傷害 = `min(標記帶的數字 × coeff, max)`,只在 CASTER
       * 身上還有 `statusId` 時計入。標記由 `spendMana.bankAs` 開出。
       *
       * 13-002 絕。暗殺奧義用它表達 owner 2026-07-31 的裁決「現存 MP 的 20%
       * 傷害」:coeff = 0.20,存款 = 那一刻被燒掉的法力。
       *
       * ⚠️ `coeff` 與 `max` 都是**欄位**,而且兩端都有界(Zod 那一半)。
       *    owner 明說「係數 0.20 要是欄位,不是寫死」,而 `max` 是保險:法力池
       *    會隨等級與裝備長大,一個沒有天花板的線性項在後期會變成一擊必殺。
       * ⚠️ 它是**額外**傷害,加在 `amount` 與 `hpPct` 之上,不是取代任何一項。
       * ⚠️ 跟 `comboBonus` 一樣讀 CASTER 的標記,但**不**走 `bake`:存款是在
       *    cast 當下就已經凍結的數字,所以晚讀早讀都是同一個值,沒有
       *    「問了一個原始碼從來沒問過的問題」的風險。
       */
      bankedBonus?: { statusId: StatusId; coeff: number; max: number };
      /**
       * 百分比生命傷害 —— a slice of the **VICTIM's** health, added on top of
       * `amount`.
       *
       * WHY IT CANNOT BE A `ratios` ENTRY. `resolveScaling` reads the CASTER's
       * `final` stat table, so `{stat: MaxHealth, coeff: 0.12}` is 12 % of the
       * ATTACKER's own health — a completely different (and, on a squishy
       * assassin, laughably small) number. 揍敵客阿福 W 龍頭戲畫.牙突 is written
       * as 「目標最大生命的 6/9/12 %」, and before this field there was no way to
       * author that at all: it would have shipped as a flat number that lies in
       * the tooltip (失敗形態 ②).
       *
       * `basis` is a DECISION POINT and therefore a field, not a branch picked
       * here (CLAUDE.md 第一守則): 「最大生命」 is predictable and is the shipped
       * default the owner's wording implies, 「當前生命」 is the execute-flavoured
       * reading. Both are one dropdown apart.
       *
       * `perRank` is indexed rank-1 and CLAMPED to the last entry, exactly like
       * `Scaling.perRank`'s neighbours, so a rank beyond the authored column
       * keeps the top row instead of silently paying 0. Every entry is bounded
       * 0..`HP_PCT_DAMAGE_MAX` by the Zod mirror — an un-normalised 12 (meaning
       * 12 %) would otherwise delete a full-health champion in one cast.
       */
      hpPct?: { basis: "max" | "current"; perRank: number[] };
    }
  /**
   * damageArea (task #210 近戰擴散) — 傷害一個**圓**, 圓心是這次事件的受害者。
   *
   * -------------------------------------------------------------------------
   * 為什麼需要一個新的 kind, 而不是給 `HookDef` 加一個 `spread`
   * -------------------------------------------------------------------------
   * 技能之所以打得到多人, 是因為**技能的 targeting 先解出一組受害者**
   * (CastResolveSystem 的 AoE re-query), 再讓每個 effect 對每個人各跑一次。
   * `radius` 從來就掛在 ability 上 (schema/ability.ts:「skillshot width or AoE
   * radius」), 不在 effect 上。
   *
   * 於是 `onBasicAttack` 這種 hook 完全沒有辦法表達「順便打到旁邊的」——
   * `fireHooks` 把 `targets` 寫死成 `[event 的那一個實體]`, 而 effect 只認
   * `ctx.targets`。丈八蛇矛的「擴散傷害60%」、霸王槍的「40%機率造成225點範圍
   * 傷害」、熾天使之弓的「火焰擴散傷害44」在文案上承諾了三年, 在 sim 裡從來
   * 沒有一行程式碼實作過 (七種失敗形態的第 ② 種)。
   *
   * 給 HookDef 加 `spread` 只能修 hook 這一條路; 把圓做成 EFFECT 之後,
   * 小怪、守衛塔、status DoT、augment —— 任何跑 `runEffects` 的東西都同時拿到
   * 了「打一個圈」的能力, 而且是同一個 runner、同一組決定性規則。
   *
   * -------------------------------------------------------------------------
   * 決定性 (sim/purity.test.ts 在守)
   * -------------------------------------------------------------------------
   * 命中集合來自 `queryOverlap` (保證回傳**遞增的 entity id**), 然後用
   * 「(距離平方, id)」這個 TOTAL ORDER 排序才套 `maxTargets`。沒有任何一步吃
   * Map 的插入順序, 所以同一顆 seed 的兩次重播命中順序逐字相同 —— `canCrit`
   * 每個受害者各擲一次 rng, 順序一變傷害就會變, 這是必須排序的真正理由。
   */
  | {
      kind: "damageArea";
      damageType: DamageType;
      /** 每個受害者在**圓心**吃到的量 (再乘 falloff 的距離衰減) */
      amount: Scaling;
      /**
       * 半徑, GGD 單位。⚠️ 不經過 combatEnv.abilityRange —— 那顆旋鈕的定義是
       * 「技能的施法距離 / AoE 半徑」(#136), 而這是一件**道具**掛在普攻上的
       * 濺射。把它偷偷乘上 0.6 會讓後台顯示的半徑不是實際半徑, 也就是 #125
       * 「顯示值 == 實際值」被打破。要調就調 item 文件裡的這個數字本身。
       */
      radius: number;
      /**
       * 邊緣倍率 0..1: 圓心吃滿額, 半徑處吃 `falloff` 倍, 中間線性內插。
       * 省略 = 1 = 不衰減。月牙魔杖「距離越遠流星傷害越低」就是這個欄位。
       */
      falloff?: number;
      /** 這一次最多濺到幾個人 (預設 `SPREAD_MAX_TARGETS`, 由近到遠取) */
      maxTargets?: number;
      canCrit?: boolean;
      /**
       * 震央 (`ctx.targets`, 也就是被普攻打中的那個人) 要不要**再吃一次**。
       * 預設 false: `onBasicAttack` 的情境下他已經吃過普攻本身了, 再算一次
       * 就是雙重計費。技能想用同一個 kind 打「以自己為圓心的爆炸」時才開。
       */
      includeOrigin?: boolean;
    }
  /**
   * damageLine — 面前的一條直線範圍傷害 (18-00 薔薇荊棘之刃). A CAPSULE, not a
   * circle: see `effects/damageLine.ts` for why the shape difference is the
   * whole play pattern and for the 「3 個身位」 → 3.6 GGD units derivation.
   */
  | {
      kind: "damageLine";
      damageType: DamageType;
      amount: Scaling;
      /** how far forward the lash reaches, GGD units (3 身位 = 3 × 1.2 = 3.6) */
      length: number;
      /** how WIDE the lash is, GGD units (one body = 1.2). Not a radius. */
      width: number;
      /** where it points: through the event victim (default) or the body facing */
      aim?: "facing" | "target";
      /** start at the caster's body (default true = 「面前」) or at the victim */
      fromCaster?: boolean;
      maxTargets?: number;
      canCrit?: boolean;
      /** does the entity that TRIGGERED this eat it again? default false */
      includeOrigin?: boolean;
    }
  /**
   * grantAttribute — PERMANENTLY add 力/敏/智, with a 「每 N 次」 gate and a
   * ceiling on the resulting attribute (07-00 獸化心靈). See
   * `effects/grantAttribute.ts` for why an attribute is not a StatModifier and
   * why the tally advances even when the ceiling refuses the payout.
   */
  | {
      kind: "grantAttribute";
      attr: "str" | "agi" | "int";
      /**
       * "flat" (default) = `amount` points. "pctOfCurrent" = `amount` × the
       * LIVE attribute, so 1.0 is 「×2」. A real decision: a flat number is
       * enormous at level 1 and irrelevant at level 9.
       */
      mode?: "flat" | "pctOfCurrent";
      /** points (flat) or ratio of the live attribute (pctOfCurrent) per PAYOUT */
      amount: number;
      /**
       * ABSENT = PERMANENT (獸化心靈's WC3 `ModifyHeroStat`). Present = the
       * grant is reversed at an absolute tick (龍紋記憶's 3 秒). Refreshes per
       * `<origin>|<attr>` rather than stacking, so a chain-stun cannot reach ×8.
       */
      durationSec?: number;
      /** pay only on every Nth trigger. absent/1 = every time. 獸化心靈 = 8 */
      everyNth?: number;
      /** refuse the payout once the LIVE attribute reaches this. 獸化心靈 = 120 */
      maxAttribute?: number;
    }
  | { kind: "heal"; amount: Scaling }
  | {
      kind: "shield";
      amount: Scaling;
      duration: number;
      /**
       * WHICH damage the pool eats. owner 2026-07-30: 「護盾的確有分**吸收所有
       * 傷害**跟**吸收 AP 傷害 only**」 — that is a DECISION POINT, so it is a
       * content field rather than a branch somebody picked in code (CLAUDE.md
       * 第一守則).
       *
       * ABSENT = `"all"` = today's behaviour exactly, so no shipped document
       * changes meaning. `"magic"` is the AP-only shield owner named; the
       * physical/true rows exist because the enum would be arbitrary without
       * them, not because a doc asks for them yet.
       *
       * The filter runs in `combat/damage.ts`, at the step shields always ate at
       * (POST-mitigation), so the authored number keeps meaning "damage as the
       * victim actually feels it". A pool that does not eat the incoming type is
       * fully TRANSPARENT to it — no absorb, no consumption. Two pools on one
       * target: narrow before broad (`absorbOrder`).
       */
      absorbs?: "all" | DamageType;
    }
  | {
      kind: "applyStatus";
      statusId: StatusId;
      duration: number;
      /**
       * Who receives it: each resolved target (default), or the CASTER. The
       * self form is how a combo WINDOW is opened — 者、皆、陣 is a
       * unit-targeted strike whose JASS also sets the caster-side marker
       * (j:34438), so without `applyTo` the marker would land on the victim.
       */
      applyTo?: "self" | "target";
      moveSpeedMult?: number;
      root?: boolean;
      stun?: boolean;
      /**
       * 失手率 0..1 — WC3 `Acrs` 詛咒. THE CARRIER's own basic attacks miss this
       * often, at anybody. It is NOT evasion: evasion protects the body it is
       * on, this one sabotages it. See `components.ts::StatusEffect.missChance`
       * for why the direction matters and why it lives on the status.
       */
      missChance?: number;
      /**
       * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機 暴走). The carrier loses the
       * wheel: `orderSystem` drops that seat's orders and the body hunts on its
       * own. Model + decisions: `sim/berserk.ts`.
       */
      berserk?: boolean;
    }
  /**
   * `perRank` (index rank-1, clamped to the last entry) is the rank-indexed
   * variant: WC3 authors every buff column per ability LEVEL (`Oae1/Oae2`
   * 增加移動速度/攻擊速度, `adur` 持續 …), and a single `modifiers`+`duration`
   * pair can only carry one of them. When present it REPLACES the flat pair for
   * that rank; the flat pair stays as the rank-1 fallback so existing docs and
   * hook-fired buffs (rank 1) are untouched.
   */
  | {
      kind: "applyBuff";
      modifiers: StatModifier[];
      duration: number;
      perRank?: { modifiers: StatModifier[]; duration: number }[];
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
    }
  /**
   * cycleBuff (揍敵客阿福 13-00 念。攻防轉換) — 輪替增益: apply the NEXT step of a
   * fixed rotation, where 「next」 is derived from the world's own absolute
   * expiry ticks instead of from a counter.
   *
   * ── WHY THIS IS NOT `applyBuff` WITH A COUNTER ───────────────────────────
   * The ability owner asked for is 「每次攻擊會帶來 AP/AD/防禦/魔抗 +10% **輪流**
   * 四個 buff，**可同時存在**，持續 1 秒」. Four independent 1-second buffs that
   * arrive one per swing in a fixed order. Written with `applyBuff` it needs a
   * per-entity 「which one is next」 integer — mutable, un-derivable state that a
   * replay has to carry and that nothing else in `sim/**` keeps.
   *
   * ── HOW THE INDEX IS DERIVED (ABSOLUTE TICKS, NO COUNTER) ────────────────
   * Each step owns a source id `buff:cycle:<cycleKey>:<i>`, so the world ALREADY
   * remembers, for every step, the absolute tick it expires on. The next step is
   * therefore a pure read:
   *
   *     1. the FIRST step (authored order) with no live source  → that one
   *     2. all four live                                        → the one whose
   *                                                               `expiresAtTick`
   *                                                               is SMALLEST
   *                                                               (ties: authored
   *                                                                order)
   *
   * Swing 1 finds AP absent → AP. Swing 2 finds AD absent → AD. … Swing 5 finds
   * all four live and AP closest to expiry → AP. That is a perfect round-robin,
   * and 「可同時存在」 falls out for free because each step is its own source with
   * its own deadline. No counter, no `world` field, no wire field; two replicas
   * that agree on the tick agree on the pick.
   *
   * ── WHAT IS A FIELD AND WHY ──────────────────────────────────────────────
   * `steps` is the whole rotation — count, order, per-step modifiers AND per-step
   * duration are all authored, so 「輪流四個」 is content, not a constant. An
   * operator can make it three steps, or give the armour step a longer window,
   * without a code change (CLAUDE.md 第一守則).
   */
  | {
      kind: "cycleBuff";
      /**
       * Namespace for this rotation's source ids. TWO DIFFERENT cycles on one
       * body (阿福's own 10 % ring and the EX's +40 % ring) must not share a
       * key or they would take turns with each other.
       */
      cycleKey: string;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /** the rotation, in order. One entry = a degenerate 1-step refresh. */
      steps: { modifiers: StatModifier[]; duration: number }[];
    }
  /**
   * restore — WC3's `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ` idiom: set a
   * FRACTION of the target's own maximum, not a flat amount. `heal` cannot
   * express it because `Scaling.ratios` reads the CASTER's stats, so a "restore
   * this ally to full" ultimate (初音's `MikuEX`) had nowhere to go and shipped
   * as a damage nuke. 0..1 of the TARGET's max; absent = untouched.
   */
  | { kind: "restore"; healthPct?: number; manaPct?: number }
  /**
   * spendMana — 消耗法力. The MIRROR of `restore.manaPct`, and the missing half
   * of the vocabulary: every path that could move mana before this only ever
   * moved it UPWARDS (`restore`, `Stat.ManaRegen`) or charged it as an
   * ABILITY's own `manaCost` at cast time (abilities/abilitySystem.ts).
   *
   * WHY IT HAD TO EXIST — a real card the old vocabulary could only lie about.
   * 20-01 風王結界 (`godie-e002.w`, w3a `A0DZ`) is a WC3 ORB: while the barrier
   * is up, EVERY BASIC ATTACK spends 30 mana and adds bonus damage. That cost
   * is not the ability's `manaCost` — the toggle is cast once and the charge is
   * paid per SWING, from a hook, and the swing still lands when the pool is
   * empty (the orb simply does not fire). `manaCost` charges once, at cast, and
   * REFUSES the cast when short; those are different rules, so this is a
   * different mechanism, not a re-use of that one.
   *
   * ⚠️ IT DOES NOT GATE ITSELF. This effect SPENDS; deciding whether there was
   * enough to spend is the hook's `condition` (sim/content/condition.ts —
   * 「自身法力 >= 30」). Folding a threshold in here would have built a second,
   * invisible copy of the condition system whose number could drift out of sync
   * with the visible one, and would have made the same effect un-authorable for
   * 「花光剩下的法力」 cards. What it DOES guarantee is that the pool never goes
   * negative: the spend is clamped at 0 (see effects/spendMana.ts).
   */
  | {
      kind: "spendMana";
      /** flat mana to burn, per application. Resolved against the CASTER's stats. */
      amount: Scaling;
      /**
       * ADDITIONAL 0..1 fraction of the payer's OWN max mana, added to `amount`.
       * Both terms exist because WC3 authors both forms (`Ncl6`-style flat costs
       * and the percentage drains); absent = 0, so a flat-only card is unchanged.
       */
      pctMaxMana?: number;
      /** who pays: the hook/ability owner (default) or each resolved target (mana burn) */
      applyTo?: "self" | "target";
      /**
       * 把**這一次實際扣掉的法力**存進一個標記,讓稍後的 `damage.bankedBonus`
       * 讀得到。ABSENT = 不存(今天五支 spendMana 有四支不需要)。
       *
       * WHY IT EXISTS AT ALL — owner 2026-07-31 對 13-002 絕。暗殺奧義:
       * 「現存 MP 的 20% 傷害」。那一招把法力燒到 0,而送傷害的免費牙突是
       * hook 上的 `onAbilityHit`,幾秒後才可能打中人。那時 `hp.mana` 已經是 0,
       * 所以「在傷害那一刻讀法力」永遠算出 0 —— 失敗形態②。存款是唯一能
       * 表達「在消耗全魔的那一刻結算」的形狀。
       *
       * ⚠️ 存的是**實扣量**不是 `want`:法力不夠時 spendMana 會夾到剩下的量,
       * 而玩家買到的傷害必須對應他真的付出去的東西。
       */
      bankAs?: { statusId: StatusId; durationSec: number };
    }
  | { kind: "dash"; mode: "forward" | "toPoint"; speed: number; maxDistance: number }
  /**
   * leap (task #247) — the map's own parabolic jump, ported from the nine
   * `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` sites in war3map.j. A SEPARATE kind
   * from `dash` because it needs a different integrator: no per-tick collision
   * (terrain crossing IS the point), an absolute parametric position so the arc
   * cannot drift, a height channel, an integer tick budget and a deferred
   * effect payload. See sim/movement/leap.ts for the arc math and the
   * blocked-landing rule.
   */
  | {
      kind: "leap";
      /** who flies: the caster (default), or each resolved target (thrown arcs) */
      applyTo?: "self" | "target";
      /** "toPoint" = the snapshotted cast point; "inPlace" = vertical, distance 0 */
      mode: "toPoint" | "inPlace";
      /** apex height in GGD units (JASS peak × 11/600) */
      apexHeight: number;
      /** flight time; converted to an INTEGER tick count exactly once, at takeoff */
      durationSec: number;
      /**
       * How far a THROWN body travels when there is no cast point to aim at —
       * i.e. `applyTo: "target"` on a unit-targeted ability (52-02 蹂躪編年史
       * hurls its victim 400 wc3 units along the caster's facing, j:51767).
       * GGD units; ignored for `applyTo: "self"` and for `mode: "inPlace"`.
       */
      throwDistance?: number;
      /**
       * DRAG PHASE (52-02 蹂躪編年史「迅速將目標抓回」). When true the flyer is
       * yanked to the CASTER before the throw, so the arc runs
       * caster.pos → caster.pos + facing × throwDistance instead of starting
       * where the victim happened to be standing.
       *
       * That is what the JASS does: `Trig_Trample_Effect` pulls the victim 50
       * wc3 units per 0.05 s tick toward the caster until it is within 50
       * (war3map.j:51755-51763), and only THEN is the throw aimed —
       * `PolarProjectionBJ(casterLoc, 400.00, GetUnitFacing(caster))` at
       * j:51765-51767. Without this flag the landing point is off by the
       * original caster→victim distance, which on a 5.5-unit cast range is up
       * to 75 % of the throw itself.
       */
      dragToCaster?: boolean;
      /** landing burst radius, GGD units (0/absent = the flyer alone) */
      landRadius?: number;
      /** effects run on the LANDING tick, centred on the landing point */
      onLand?: EffectDef[];
    }
  /**
   * championForm (task #249 變身) — the map's own WC3 **Metamorphosis** pair,
   * `Eme1` (normal unit) ⇄ `Emeu` (alternate unit), as a sim primitive.
   *
   * WHY IT IS A BODY SWAP AND NOT A BUFF. All 26 transforms in
   * `src_gogodieEX227s.w3x` are a COMPLETE second unit definition in
   * `war3map.w3u` — its own hp/armor/attack speed/range/model/ability list —
   * never a modifier stack on the first (see content/championForms.ts). An
   * `applyBuff` could not express 40萬解's melee→ranged change or 30變態紳士's
   * ground→flying body at all, so the primitive swaps WHICH CHAMPION DOC the
   * entity resolves through, in place, keeping the entity id, HP, level, items
   * and cooldowns (see systems/ChampionFormSystem.ts for the swap contract).
   *
   * `to` is a DIRECTION, not an id: the counterpart is read from the champion
   * doc's own `transform.counterpartId`, so one authored effect works for every
   * hero and the id can never be typo'd into a body that does not exist.
   *
   * `durationSec` is the w3a `ahdu` (HERO duration) of the transform ability.
   * ABSENT = the form does not time out — 20-01 風王結界 and 70-00 紮根 are
   * TOGGLES and 61-00 百連我殺 is a death-state morph. Three of 26; an absent
   * duration is a recovered fact, not missing data.
   */
  | { kind: "championForm"; to: "alternate" | "base" | "toggle"; durationSec?: number }
  | { kind: "spawnProjectile"; projectileId: ProjectileId; onHit: EffectDef[] }
  /**
   * spawnVfx — the WC3 "dummy effect unit" idiom (化繁為簡): a Locust/invuln
   * unit that only carries a MODEL and expires is NOT gameplay, it's a one-shot
   * visual at a position. Emits a `vfxSpawn` sim event carrying a vfx@1 doc id
   * and a world point; the client's VfxSystem plays the doc there. Purely
   * cosmetic — mutates no world state, keeps the sim deterministic.
   */
  | { kind: "spawnVfx"; vfxId: string; at?: "self" | "target" | "point"; durationSec?: number }
  /* ═══════════════════════════════════════════════════════════════════════
   * RESERVED KINDS (GH#289) — the schema and the registry know them, the
   * handlers throw. Each is one parallel lane's landing pad; see the header of
   * effects/effectRegistry.ts for the three-file recipe, and the kind's own
   * module for why it does or does not need a new SimWorld store.
   *
   * They are declared HERE, up front and all at once, so that six lanes never
   * have to edit this union (or SimWorld's class body) concurrently — the
   * merge conflict this whole split exists to prevent. The FIELDS are a
   * first draft: a lane may reshape its own member, and only its own.
   * ═══════════════════════════════════════════════════════════════════════ */
  /**
   * dot — 持續傷害 (lane P1). Periodic damage on a deadline, the WC3
   * 中毒/燃燒/腐蝕 family. A separate kind from `damage` because it needs
   * SCHEDULING: `world.dot` remembers who is burning and when the next payout
   * lands (see effects/dot.ts).
   */
  | {
      kind: "dot";
      /**
       * Armour (physical) / MR (magic) / neither (true). Payouts go through the
       * damage QUEUE, so this is the same knob and the same mitigation curve as
       * the `damage` kind — a 「中毒」 that ignored armour would be `"true"` on
       * purpose, not by accident.
       */
      damageType: DamageType;
      /** damage per PAYOUT (not per second) — resolved against the caster at apply */
      amountPerTick: Scaling;
      /** seconds between payouts; converted to whole ticks once, at apply */
      intervalSec: number;
      /** total seconds the effect lasts */
      durationSec: number;
      /**
       * Re-applying the SAME `origin` from the SAME caster. THE decision point
       * of this primitive — all three behaviours are shippable and the owner
       * will want to move between them, so it is a field, not a branch.
       *
       *   · `"refresh"` (DEFAULT) — one instance; the deadline is extended and
       *     the payload re-resolved, the cadence is untouched. Chosen as the
       *     default because it is the WC3 buff idiom (re-casting replaces the
       *     buff) and because it is the only one of the three where spamming a
       *     button cannot multiply your damage — the conservative reading of an
       *     authored 「每秒 N 點、持續 M 秒」.
       *   · `"independent"` — every application is its own instance with its own
       *     cadence and deadline. Two casts = double damage.
       *   · `"stack"` — one instance whose payout is `N × stacks`, capped by
       *     {@link maxStacks}; the deadline refreshes with each application.
       *
       * Two DIFFERENT casters never merge under any mode: merging would hand
       * the second caster the first one's kill credit.
       */
      stacking?: "refresh" | "independent" | "stack";
      /** ceiling on the stack count (`"stack"` only). Absent = the schema's own ceiling. */
      maxStacks?: number;
      /**
       * Pay once on the CAST tick as well as on every interval boundary
       * (default false = the first payout is one interval away).
       *
       * Default false because a DoT is usually authored NEXT TO a direct
       * `damage` effect in the same list, and an immediate payout would make
       * the two land on the same tick and read as one double-strength hit. It
       * ADDS a payout rather than re-phasing the schedule, so turning it on is
       * never also a stealth nerf.
       */
      tickOnApply?: boolean;
      /**
       * What happens to a live burn when its caster dies.
       *
       *   · `"continue"` (DEFAULT) — it keeps ticking and keeps crediting the
       *     dead caster, so a poison that finishes someone still pays that
       *     caster the kill and the bounty. This is WC3's behaviour (the buff
       *     lives on the VICTIM) and the reading every 「中毒」 description
       *     implies.
       *   · `"stop"` — the burn dies with its caster, and does NOT resume if he
       *     is revived (a revive is not a re-cast).
       */
      onCasterDeath?: "continue" | "stop";
    }
  /**
   * summon — 召喚物 (GH#289 lane P2). Spawns one or more bodies that fight for
   * the caster and despawn on a deadline. `world.summon` carries owner + expiry
   * + the cap group; the tick lifecycle lives in `sim/summons.ts`.
   *
   * ── EVERY FIELD BELOW EXCEPT `championId`/`count` IS A DECISION POINT ──────
   * owner 2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，**尤其是決策點**」.
   * The 52 「召喚代理」 in docs/ability-templates.md disagree with each other on
   * literally every one of them, so a branch picked in code would be wrong for
   * most of them:
   *
   *   · COUNT + SHAPE  — 96-04 獨孤九劍 puts 9 sword spirits ON the target point,
   *     91-002 亡靈大軍 rings 8 ghouls at 450u, 37-03 災難之牆 lays 9 wall units
   *     in a LINE 100u apart, 21-002 天破壤碎 scatters 40 points at random inside
   *     a rect. → `count` / `formation` / `spread` / `at`.
   *   · LIFETIME       — 18-04 億年樹 lives `9s × level`, 96-04 lives 10s,
   *     35-00 召喚佩 is a PET that persists until replaced. → `durationSec`
   *     ABSENT = permanent, which is WC3's own 0-duration form.
   *   · CAP            — 37-02 黑核晶 caps concurrent crystals at 7 and 「超過殺
   *     最舊」. That is where BOTH `maxAlive` and `onCap: "replaceOldest"` come
   *     from; they are not invented ceilings.
   *   · OWNER DEATH    — nothing in the JASS states it, so it must not be
   *     stated in code either. → `onOwnerDeath`.
   *
   * ⚠️ A summon is deliberately NOT a `mob` and NOT a `champion`:
   *   · no MobComp — the #215 wave scheduler counts `mob` entries against its
   *     own alive cap and pays 20 gold per kill from that ledger, and its AI
   *     targets 「every champion」 with no team notion, i.e. a summon wearing a
   *     MobComp would attack its own summoner;
   *   · no ChampionComp — `deathSystem` pays kill gold + the once-per-victim
   *     kill BOUNTY for anything `world.champion.has()`, so a champion-bodied
   *     summon would be a gold printer, and the scoreboard / duel resolution /
   *     placement all key off that same store.
   * It carries Transform + Health + Nav + Team + Stats + Abilities + Status, so
   * it walks (`orderSystem` chase → `movementSystem`) and swings
   * (`basicAttackSystem`) through the SHIPPED systems with no new AI.
   */
  | {
      kind: "summon";
      /**
       * WHOSE BODY. `"champion"` (default) = the named doc. `"self"` = a copy
       * of the CASTER's own champion — 57-03 複製鏡 and 27-002 霧隱分身之術 are
       * clones, and naming the hero twice in their own ability doc is the kind
       * of duplication that goes stale on the next 變身 pair.
       */
      body?: "champion" | "self";
      /** which body to spawn — a champion doc id, resolved through the registry */
      championId: string;
      /** how many bodies this cast creates */
      count: number;
      /** seconds before despawn; ABSENT = permanent (the WC3 0-duration form) */
      durationSec?: number;
      /** level of the summoned body (WC3 summons scale off the ability level) */
      level?: number;
      /**
       * 歸屬 — whose side it fights on. `"owner"` (default) = the summoner's
       * team. `"neutral"` = the sentinel MONSTER team, i.e. hostile to
       * EVERYONE including the summoner (the WC3 「敵對召喚」 / 變異 form).
       */
      team?: "owner" | "neutral";
      /** anchor point: the caster (default), the first resolved target, or the cast point */
      at?: "self" | "target" | "point";
      /**
       * 固定陣型 or 隨機散佈. `"ring"` (default) spaces the bodies evenly around
       * the anchor, `"line"` lays them perpendicular to the caster's facing,
       * `"scatter"` draws from the world's SEEDED rng (never `Math.random`).
       */
      formation?: "ring" | "line" | "scatter";
      /** ring radius / line spacing / scatter radius, in GGD units */
      spread?: number;
      /**
       * 上限 — the most bodies this cap GROUP may hold at once. ABSENT =
       * {@link DEFAULT_SUMMON_CAP}: an uncapped summon is one content typo away
       * from filling the arena, which is a server-side entity leak, not a
       * balance question.
       */
      maxAlive?: number;
      /**
       * What the cap counts. `"casterAbility"` (default) = per caster PER
       * ability, so a hero's pet and its ultimate's swarm do not evict each
       * other; `"caster"` = one budget for everything that hero summons.
       */
      capScope?: "caster" | "casterAbility";
      /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
      onCap?: "skip" | "replaceOldest";
      /** summoner dies → the body despawns (default) or fights on to its deadline */
      onOwnerDeath?: "despawn" | "persist";
      /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
      hpMult?: number;
      /** ×the source champion's own attack damage */
      damageMult?: number;
      /**
       * Who is paid when the SUMMON lands a killing blow.
       *
       * ABSENT / `"none"` = nobody, which is what the sim does today by
       * construction: `deathSystem` gates every payout on
       * `world.champion.has(killer)` and a summon is not a champion.
       *
       * ⚠️ `"owner"` is NOT IMPLEMENTED and the handler REFUSES it out loud
       * (the `shield.absorbs` precedent). Paying the owner needs a killer-
       * rewrite seam inside `systems/DeathSystem.ts`, which is another lane's
       * file; re-deriving the gold/xp/bounty/assist/killCombo ladder over here
       * would be a SECOND payout path that drifts from the first one silently.
       */
      killCredit?: "none" | "owner";
      /* ── 誰打得到它 —— 決策點。解析器/預設值/理由: sim/summonRules.ts ─────
       * A summon is deliberately neither `champion` nor `mob`, and BOTH of the
       * sim's automatic target pickers were allow-lists over exactly those two
       * stores (`targeting.isAutoTargetable`, `MobSystem`'s aggro scan), so on
       * the shipped path NOTHING could ever auto-acquire one: measured at 300
       * ticks with a summon standing ON an enemy champion, `attackTarget` never
       * left `null` and the body took 0 damage. These six fields are what turned
       * that from a hard-coded fact into an authored one. */
      /** 敵方自動索敵看不看得見它; ABSENT = true (WC3: an ordinary unit) */
      autoTargetable?: boolean;
      /** 索敵比較器的第一鍵; ABSENT = `"summon"` (its own tier, hero > it > mob) */
      targetPriority?: "champion" | "summon" | "mob";
      /** #215 殭屍咬不咬它; ABSENT = true (WC3: creeps fight summoned units) */
      mobTargetable?: boolean;
      /** 玩家點不點得到它; ABSENT = true (WC3: right-clickable) */
      manualTargetable?: boolean;
      /** 火圈燒不燒它; ABSENT = true (owner 2026-07-30 的 保底 —— 見 summonRules.ts) */
      burnsInFireRing?: boolean;
      /** 打死它給擊殺者多少金幣; ABSENT = 0 (WC3: 召喚物不是給錢的單位) */
      bountyGold?: number;
    }
  /**
   * invulnerable — 無敵 / 免疫 (lane P3, LANDED). Timed immunity.
   * `world.invulnerable` holds one ABSOLUTE expiry tick PER AXIS.
   *
   * 無敵與免疫**不是同一件事**,原作也不是:`Avul` 擋所有東西,魔法免疫只擋
   * 魔法,而 07-01 臨、兵、鬥「可抵擋對方負性魔法」只擋負面狀態、完全不擋
   * 傷害。所以這裡是三個正交的決策點欄位,不是一個 boolean。
   * 完整的考證與理由在 sim/effects/invulnerable.ts 的檔頭。
   */
  | {
      kind: "invulnerable";
      durationSec: number;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /**
       * 傷害免疫的**範圍**。ABSENT = `"all"` = WC3 的 `Avul`。
       *
       *  · `"all"` —— 41-002 絕對屏障、29-03 有功夫無懦夫,以及 JASS 裡
       *    30+ 個 `SetUnitInvulnerable` / `'Avul'` 站點(天翔龍閃、ExcaliburMAX、
       *    百連我殺、蹂躪、蒼月潮 07-02 的衝刺…)。
       *  · `"magic"` —— 魔法免疫:47-04 天翔龍閃、97-04/97-002 火產靈神、
       *    99-04「不受任何魔法傷害」、道具 黃昏公主的血脈。
       *  · `"none"` —— **純免控**:07-01 臨、兵、鬥「可抵擋對方負性魔法」。
       *    這一支就是「免傷與免控必須能分開」的存在證明。
       *  · `"physical"` —— 對稱補完(目前沒有出貨文件用到)。
       */
      blocksDamage?: "all" | "none" | "physical" | "magic";
      /**
       * 真實傷害這一根軸。ABSENT = 跟著 `blocksDamage === "all"` 走
       * (WC3 `Avul` 擋所有東西)。
       *
       * ⚠️ 火圈是 #270 明確的**真實傷害**,而「無敵要不要免疫縮圈」是 owner 的
       * 平衡決定,所以它是欄位而不是程式裡的分支。⚠️ 但**今天它還管不到火圈**:
       * champion 的燒傷直接寫 `hp.hp -=`(systems/FireRingSystem.ts),沒有走
       * 傷害佇列 —— 見 effects/invulnerable.ts 檔頭 ⑤。
       */
      blocksTrueDamage?: boolean;
      /**
       * 免控:拒絕敵方施加的 stun / root / 減速。**預設 false,而且是刻意的**
       * —— 讓它跟著免傷自動打開,等於把 14 支技能的免控變成後台看不見的隱性
       * 效果。想要 `Avul` 的完整語意就明寫 `true`。
       */
      blocksControl?: boolean;
    }
  /**
   * knockback — 擊退 (lane P4). Shoves the target along a direction. Writes
   * the EXISTING `nav.override` (`DashOverride` with `kind: "knockback"`), so
   * it adds no SimWorld field — see effects/knockback.ts.
   */
  | {
      kind: "knockback";
      /**
       * GGD units of displacement **AT GAP 0** — a FLOOR, not a fixed length.
       * The gap subtraction (GH#193) still runs on top of it, exactly as it
       * does for the author's `hitFeel.knockbackMag` in combat/damage.ts. See
       * effects/knockback.ts for why "the author's number is what you get at
       * touching distance" is the one semantic the whole game shares.
       */
      distance: number;
      /** units per second the body travels while shoved */
      speed: number;
      /**
       * Direction source: away from the caster (default), along the caster's
       * facing, or toward the caster (a PULL). A DECISION POINT.
       */
      from?: "caster" | "facing" | "pull";
      /** who gets shoved: each resolved target (default) or the caster (a recoil) */
      applyTo?: "target" | "self";
      /**
       * 「這一擊的重量」in DAMAGE units, fed through GH#193's own law
       * (`combatFeel.knockbackRaw`) against the victim's health, so an authored
       * shove obeys 「傷害佔受傷者生命百分比」 and the operator's live
       * `minPct` / `maxBodies` / `bodyUnit` knobs. It deals NO damage — pair it
       * with a `damage` effect if the ability also hurts.
       *
       * ABSENT = the flat `distance` floor only.
       */
      impactPower?: number;
      /**
       * Which health `impactPower` is a percentage OF. A DECISION POINT.
       *
       * "max" (default) = the shipped global rule — 打脆皮飛得遠、打坦克推不動。
       * "current" = 殘血更容易被擊飛. combat/damage.ts rejected "current" for
       * the GLOBAL rule (an invisible execute mechanic nobody asked for); as an
       * opt-in on ONE authored ability it is a visible design choice, which is
       * why it is a field with the owner-stated default rather than a branch.
       */
      hpBasis?: "max" | "current";
      /**
       * Subtract the caster↔victim gap (GH#193). DEFAULT TRUE — owner:
       * 「並減去雙方距離」. false exists only so an operator can author a pull
       * or a fixed-length launcher, where "the further away, the less you move"
       * is backwards. Never flip the default: see combatFeel.ts's
       * 「這個減法不是 bug」.
       */
      subtractGap?: boolean;
      /**
       * 擊飛 — apex height in GGD units. > 0 makes the shove a PARABOLA
       * (`LeapOverride`, the #247 integrator) instead of a ground slide, so the
       * body crosses walls, leaves the planar physics world and is rendered in
       * the air. 0 / absent = the ground slide.
       */
      launchHeight?: number;
      /**
       * 期間不可控制. DEFAULT TRUE. Writes `world.knockdown` for the flight, the
       * one channel every actor already reads (abilitySystem rejects the cast,
       * BasicAttackSystem the swing, CastResolveSystem interrupts, movementHold
       * roots AND freezes turning). The override alone only takes the FEET.
       */
      uncontrollable?: boolean;
      /** extra 不可控制 ticks AFTER landing (the 爬起來 window). Needs `uncontrollable`. */
      getupTicks?: number;
    }
  /**
   * evasion — 閃避 (lane P5). Timed miss-chance. Rides the EXISTING
   * `Stat.Evasion` on `world.stats`, so it adds no SimWorld field — but see
   * effects/evasion.ts for the reason that is not the same as "it works".
   */
  | {
      kind: "evasion";
      /**
       * 0..1 dodge chance granted, BEFORE the ceiling. Both the basic-attack
       * and the ability channel clamp to `effectiveCap(statCaps, Stat.Evasion)`
       * (ships 0.8, 後台可調), so `1` is not a route to invulnerability.
       */
      chance: number;
      durationSec: number;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /**
       * DECISION POINT — may this dodge apply to ABILITY damage, or only to
       * basic attacks? Default (absent) = basic attacks only, which is WC3
       * `Evasion` fidelity and today's shipping behaviour.
       */
      dodgesAbilities?: boolean;
      /**
       * DECISION POINT — may this dodge apply to `type: "true"` damage?
       * Default (absent) = no. Only meaningful with `dodgesAbilities`; kept off
       * by default so the arena fire-ring burn (#270) stays undodgeable.
       */
      dodgesTrueDamage?: boolean;
    };

export interface EffectContext {
  world: SimWorld;
  caster: EntityId;
  /** rank of the source ability (1 for items/augments/hooks) */
  rank: number;
  targets: EntityId[];
  point?: Vec2;
  direction?: Vec2;
  /** provenance, e.g. "ability:sela.q", "item:serrated-edge" */
  origin: string;
  /** slot of the casting ability (threads through projectiles into hooks) */
  abilitySlot?: CastableSlot;
  rng: Rng;
}

/** Resolve a Scaling against the caster's current final stats. */
export function resolveScaling(
  finalStats: Record<Stat, number>,
  sc: Scaling,
  rank: number,
): number {
  let v = (sc.flat ?? 0) + (sc.perRank?.[Math.max(0, rank - 1)] ?? 0);
  for (const r of sc.ratios ?? []) v += (finalStats[r.stat] ?? 0) * r.coeff;
  return v;
}
