/**
 * EffectDef — the serializable effect union. Abilities, item actives/passives,
 * augment hooks, and status DoTs all execute the SAME ordered EffectDef[] via
 * one interpreter (effectRunner). Data, not code → JSON-authorable.
 */
import type { EntityId, ProjectileId, StatusId } from "../../ids";
import type { Stat } from "../stats/statTypes";
import type { StatModifier } from "../stats/modifiers";
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
  | { kind: "heal"; amount: Scaling }
  | { kind: "shield"; amount: Scaling; duration: number }
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
    }
  /**
   * restore — WC3's `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ` idiom: set a
   * FRACTION of the target's own maximum, not a flat amount. `heal` cannot
   * express it because `Scaling.ratios` reads the CASTER's stats, so a "restore
   * this ally to full" ultimate (初音's `MikuEX`) had nowhere to go and shipped
   * as a damage nuke. 0..1 of the TARGET's max; absent = untouched.
   */
  | { kind: "restore"; healthPct?: number; manaPct?: number }
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
  | { kind: "spawnVfx"; vfxId: string; at?: "self" | "target" | "point"; durationSec?: number };

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
