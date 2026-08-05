/**
 * `dot` — 持續傷害 (lane P1, GH#289). Periodic damage on an absolute deadline:
 * the WC3 中毒 / 燃燒 / 腐蝕 family, and the thing 57 shipped hero descriptions
 * have been promising with nothing behind them.
 *
 * WHY THIS IS THE ONE NEW KIND THAT NEEDS ITS OWN COMPONENT STORE. A DoT is the
 * only one of the six reserved primitives whose state is not already
 * expressible: it has to remember WHO is burning, FROM WHAT, HOW HARD, WHEN THE
 * NEXT TICK LANDS and WHEN IT STOPS. `StatusComp` carries an expiry and the CC
 * flags but no damage payload and no periodic cadence, and `StatsComp` carries
 * modifiers, not scheduled damage. Hence {@link SimWorld.dot}.
 *
 * ── THE TWO HALVES ─────────────────────────────────────────────────────────
 * This file only APPLIES the burn (writes the instance). The PAYOUT lives in
 * `dotTick.ts` (`dotTickSystem`, step slot 7c), because a DoT is the one effect
 * kind whose damage does not happen at the moment the effect runs.
 *
 * ── DAMAGE GOES THROUGH THE QUEUE, NOT STRAIGHT INTO hp ────────────────────
 * `dotTickSystem` pushes a real {@link DamagePacket}. That is what makes
 * `damageType` mean something (armour for physical, MR for magic, neither for
 * true — `combat/damage.ts`'s `mitigate`), lets shields eat it, feeds
 * `recordDamage` for the scoreboard, and routes the killing blow through
 * `deathSystem` so a burn that finishes someone pays the bounty to the caster.
 * The fire ring deliberately does the OPPOSITE (`hp.hp -= dmg`) because it is
 * environmental round pacing with no attacker; a DoT has one, so it must not
 * copy that shortcut.
 *
 * ── EVERY DECISION IS A FIELD (CLAUDE.md 第一守則) ──────────────────────────
 * owner 2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，尤其是決策點」.
 * Writing this handler surfaced five 「A 還是 B?」 moments and every one of them
 * is an authored field with a stated default, not a branch picked in code:
 *   · `damageType`     — armour / MR / neither
 *   · `stacking`       — refresh | independent | stack  (+ `maxStacks`)
 *   · `tickOnApply`    — pay at cast, or wait for the first interval
 *   · `onCasterDeath`  — the burn outlives its caster, or dies with him
 * See each field's note on `EffectDef`'s `dot` member for the default and why.
 *
 * ── PURITY (sim/purity.test.ts) ────────────────────────────────────────────
 * Seconds→ticks is converted ONCE, here, at apply. Both deadlines are ABSOLUTE
 * ticks (`world.tick + N`), never countdowns: a decrementing counter is a
 * function of tick HISTORY, so a replay seek or a host resync silently
 * resurrects a burn that should already be over (guarded in dot.test.ts).
 */
import type { EntityId } from "../../ids";
import type { DamageType } from "./effect";
import { resolveScaling } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { casterAttrs, casterStats } from "./effectCommon";
import { resourcePctAmount } from "./dynamicTerms";

/** Re-applying the same burn from the same caster. See `EffectDef.dot.stacking`. */
export type DotStacking = "refresh" | "independent" | "stack";
/** What happens to a live burn when the entity that applied it dies. */
export type DotOnCasterDeath = "continue" | "stop";

/**
 * The stack ceiling used when a `"stack"` DoT authors none. It is the SCHEMA's
 * own `maxStacks` ceiling, not a balance number: 「absent」 has to mean 「as many
 * as the editor would ever let you type」 rather than `Infinity`, because a
 * genuinely unbounded counter is the one value that can turn a 0.5 s re-cast
 * into an unbounded number by the end of a round — and because a finite bound
 * keeps `amountPerTick` (which IS hashed into `world.digest()`) finite too.
 */
export const DOT_MAX_STACKS = 99;

/**
 * One live damage-over-time instance on one entity.
 *
 * ⚠️ ABSOLUTE TICKS ONLY (`world.tick + N`), never a decrementing counter —
 * CLAUDE.md's determinism rule: a countdown drifts across save/replay, an
 * absolute deadline cannot.
 */
export interface DotInstance {
  /** who applied it — the damage packet's `source`, so kills credit correctly */
  sourceId: EntityId;
  /** provenance string, e.g. "ability:godie-u01u.q" (also the refresh key) */
  origin: string;
  damageType: DamageType;
  /**
   * EFFECTIVE damage paid on each payout = `baseAmountPerTick × stacks`.
   *
   * Stored PRE-MULTIPLIED rather than derived at payout for one concrete
   * reason: `SimWorld.digest()` hashes THIS field and not `stacks`, so folding
   * the stack count into it is what makes 「one replica counted three stacks,
   * the other two」 surface on the tick it happens instead of as an unexplained
   * HP divergence later (#198's open non-determinism hunt).
   */
  amountPerTick: number;
  /**
   * ONE stack's worth, resolved against the caster's stats at apply time.
   * ABSENT = the same as `amountPerTick`, i.e. a single-stack burn.
   */
  baseAmountPerTick?: number;
  /** live stack count; always 1 unless `stacking === "stack"`. ABSENT = 1. */
  stacks?: number;
  /** ABSOLUTE tick of the next payout */
  nextTick: number;
  /** whole ticks between payouts (>= 1) */
  intervalTicks: number;
  /**
   * ABSOLUTE tick of the LAST tick this instance may pay on, INCLUSIVE.
   *
   * ⚠️ Inclusive, and deliberately so — 「持續 5 秒、每 1 秒扣一次」 has to be
   * FIVE payouts. With an exclusive deadline the payout due at exactly
   * `apply + 150` (the 5th) lands on the tick the instance is already gone and
   * the ability quietly pays 4/5 of its authored damage. The reserved draft of
   * this interface said "exclusive"; that was a draft, and this is the shape
   * that makes the authored number true.
   */
  expiresAtTick: number;
  /**
   * Re-application rule, carried so the payout side never re-reads content.
   * ABSENT = `"refresh"`, the authored default.
   */
  stacking?: DotStacking;
  /**
   * Ceiling on `stacks` (finite by construction — see {@link DOT_MAX_STACKS}).
   * ABSENT = `DOT_MAX_STACKS`.
   */
  maxStacks?: number;
  /** does this burn outlive the entity that applied it? ABSENT = `"continue"`. */
  onCasterDeath?: DotOnCasterDeath;
  /**
   * A4(#278) —— 這一筆延燒可不可以被淨化拔掉。缺席 = 讀
   * `world.dispelRules.dotDefaultDispellable`（出貨 true）。
   *
   * ⚠️ 它單獨一格而不是跟 status 共用一個預設,因為 `world.dot` 在 A4 之前
   * **完全沒有任何移除路徑** —— 把它打開是一次真的能力增加,值得有自己的閥。
   */
  dispellable?: boolean;
  /** A4(#278) —— 極性。缺席時 `clearPools` 當 `"debuff"`（這一池只出現過那一種）。 */
  polarity?: "buff" | "debuff";
}

/*
 * ⚠️ EXACTLY SEVEN FIELDS ARE REQUIRED — `sourceId`, `origin`, `damageType`,
 * `amountPerTick`, `nextTick`, `intervalTicks`, `expiresAtTick` — and that is
 * deliberate: they are precisely the shape the GH#289 seam reserved, so a
 * `DotInstance` built by hand (`sim/reservedStores.test.ts`, any fixture) still
 * compiles AND still behaves. The other **seven** are optional and each documents
 * what its absence means, the same 「缺席 = 今天的行為」 rule the rest of #289
 * follows. `dotEffect.apply` always writes all fourteen.
 *
 * ⚠️ 「其餘五個 / 十二個」是 2026-08-05 之前的計數 —— A4(#278) 加了
 * `dispellable` 與 `polarity` 兩格。這一段自己就是「註解會說謊」的候選人：
 * 一個寫死的數量在下一次加欄位的時候不會有人記得改
 */

export const dotEffect: EffectKindSpec<"dot"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // ONE resolution of the caster's sheet for the whole cast, exactly like the
    // `damage` handler: every victim of one cast burns for the same number, and
    // the number is frozen at APPLY. A DoT that re-read the caster's AP on each
    // payout would be a different (and un-authorable) spell — and would keep
    // changing after the caster died.
    const base = resolveScaling(casterStats(ctx), e.amountPerTick, ctx.rank, casterAttrs(ctx));
    // Seconds→ticks ONCE, here. Never per payout: a per-tick division could
    // round differently on a different host, which is a desync in the one place
    // that decides who dies.
    const intervalTicks = Math.max(1, Math.round(e.intervalSec / world.dt));
    const durationTicks = Math.max(1, Math.round(e.durationSec / world.dt));
    const stacking: DotStacking = e.stacking ?? "refresh";
    const maxStacks =
      stacking === "stack" ? Math.max(1, Math.floor(e.maxStacks ?? DOT_MAX_STACKS)) : 1;
    const onCasterDeath: DotOnCasterDeath = e.onCasterDeath ?? "continue";
    const expiresAtTick = world.tick + durationTicks;
    // FIRST PAYOUT. `tickOnApply` pays on the cast tick itself and then keeps
    // the same cadence, i.e. it ADDS a payout rather than re-phasing the
    // schedule — turning the flag on must not also be a stealth nerf.
    const firstTick = e.tickOnApply === true ? world.tick : world.tick + intervalTicks;

    for (const target of ctx.targets) {
      // No health component = nothing to burn (revive circles, dropped coins,
      // aura carriers). Writing an instance there would be a store entry that
      // can never pay and never expires against anything.
      if (!world.health.has(target)) continue;

      // 資源百分比項 —— PER TARGET(分母是這一個身體的條),而且**在這裡就凍住**,
      // 折進這個實例的 `amountPerTick`。跟 `base` 完全同一個語意與同一個時機,
      // 所以 `effects/dotTick.ts` 一行都不用改,而一個施法者死掉之後燒傷也不會
      // 突然跟著對方的裝備變動。熾天使之弓「每秒 3% 最大生命」走這一條。
      const perTick =
        e.resourcePct === undefined
          ? base
          : base + resourcePctAmount(world, ctx.caster, target, e.resourcePct, ctx.rank);

      const list = world.dot.get(target);
      // `independent` never merges — that is the whole point of the mode.
      // Everything else keys on (origin, caster): two DIFFERENT casters' poisons
      // must stay separate instances or the second one silently steals the
      // first one's kill credit.
      const existing =
        stacking === "independent" || list === undefined
          ? undefined
          : list.find((d) => d.origin === ctx.origin && d.sourceId === ctx.caster);

      if (existing === undefined) {
        const inst: DotInstance = {
          sourceId: ctx.caster,
          origin: ctx.origin,
          // 省略 = 後台「傷害規則」頁的預設（出貨 magic）。
          damageType: e.damageType ?? world.damageRules.defaultAbilityDamageType,
          amountPerTick: perTick,
          baseAmountPerTick: perTick,
          stacks: 1,
          nextTick: firstTick,
          intervalTicks,
          expiresAtTick,
          stacking,
          maxStacks,
          onCasterDeath,
        };
        if (list === undefined) world.dot.set(target, [inst]);
        else list.push(inst);
        continue;
      }

      // ⚠️ `nextTick` IS DELIBERATELY NOT TOUCHED. Re-phasing the cadence on
      // every re-application is the classic 「refresh 的 DoT 永遠不跳傷害」 bug:
      // a 1 s poison re-applied every 0.8 s would have its next payout pushed
      // back before it ever arrives, so the ability's whole damage budget is
      // silently zero. Only the DEADLINE moves.
      existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
      existing.baseAmountPerTick = perTick;
      existing.damageType = e.damageType ?? world.damageRules.defaultAbilityDamageType;
      existing.intervalTicks = intervalTicks;
      existing.stacking = stacking;
      existing.maxStacks = maxStacks;
      existing.onCasterDeath = onCasterDeath;
      const held = existing.stacks ?? 1;
      existing.stacks = stacking === "stack" ? Math.min(maxStacks, held + 1) : 1;
      existing.amountPerTick = perTick * existing.stacks;
    }
  },
};
