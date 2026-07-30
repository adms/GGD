/**
 * `spendMana` — 消耗法力. The mirror of `restore.manaPct`, and the half of the
 * vocabulary that was missing until 20-01 風王結界 needed it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT `AbilityDef.manaCost`
 * ---------------------------------------------------------------------------
 * `manaCost` is charged ONCE, by `castAbility`, BEFORE the effects run, and a
 * caster who cannot pay is REFUSED the cast (abilities/abilitySystem.ts). A WC3
 * ORB — 風王結界's 「每次攻擊消耗 30 法力」 — is none of those three things: the
 * toggle is cast once and the charge recurs on every SWING, the charge is paid
 * from a hook rather than from a cast, and an empty pool must NOT stop the
 * swing, only the bonus. Modelling it as `manaCost` would have made Saber
 * unable to auto-attack at 29 mana, which is a different (and much worse)
 * ability than the one the card promises.
 *
 * ---------------------------------------------------------------------------
 * IT SPENDS; IT DOES NOT DECIDE
 * ---------------------------------------------------------------------------
 * Whether there is enough to spend is asked ONCE, by the hook's `condition`
 * (「自身法力 >= 30」, sim/content/condition.ts), BEFORE any effect in the list
 * runs. This module deliberately carries no threshold of its own:
 *
 *   · a second copy of the number could drift out of sync with the visible one,
 *     and the visible one is what the tooltip renders;
 *   · a built-in "refuse when short" would make 「把剩下的法力全部燒掉」
 *     un-authorable;
 *   · the condition gate ALSO suppresses the sibling `damage` effect in the
 *     same list, which is what 「法力不足就不觸發」 actually means. A gate
 *     living in here could only ever skip the spend, leaving the bonus damage
 *     free.
 *
 * What it DOES guarantee is that the pool cannot go negative: the withdrawal is
 * clamped to what is actually there. A partial payment is still a payment — an
 * authored `condition` is what makes that case unreachable for cards that care.
 *
 * ---------------------------------------------------------------------------
 * VISIBILITY (失敗形態 ②)
 * ---------------------------------------------------------------------------
 * No new event is emitted, and that is not an omission: `Health.mana` is
 * projected every tick (`es.mana = hp.mana`, apps/game-server/src/net/
 * snapshot.ts), so the bar the player watches IS the read-back of this write —
 * the same channel `AbilityDef.manaCost` has always used, which likewise emits
 * nothing. A dedicated floating-number cue would be a `manaSpend` event next to
 * `manaRestore`; it is a presentation follow-up, not a correctness gap.
 *
 * PURITY: two float writes on an existing component. No rng, no clock, no trig.
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { casterStats } from "./effectCommon";

export const spendManaEffect: EffectKindSpec<"spendMana"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // `applyTo` defaults to "self": the overwhelming case is a cost the ability's
    // OWNER pays. `ctx.targets` on a hook is the EVENT's entity (the unit you
    // just hit), so defaulting the other way would have turned every orb into a
    // mana burn on the victim — a different mechanic that this field can also
    // express, deliberately, but only when asked for.
    const payers = e.applyTo === "target" ? ctx.targets : [ctx.caster];
    // Resolved against the CASTER's stats even when the TARGET pays: `Scaling
    // .ratios` is defined as "ratios of the caster" everywhere else in the
    // union (see the `Scaling` doc comment), and a mana burn that scaled off the
    // victim's own AP would be the only effect in the game that inverts it.
    const flat = resolveScaling(casterStats(ctx), e.amount, ctx.rank);
    for (const payer of payers) {
      const hp = world.health.get(payer);
      if (!hp?.alive) continue;
      // The percentage term reads the PAYER's own pool — that is the whole
      // point of a percentage cost, and it is the one number that cannot come
      // from the caster.
      const pct = (e.pctMaxMana ?? 0) * hp.maxMana;
      const want = flat + pct;
      if (!(want > 0)) continue;
      // Clamped BOTH ways: never below 0 (a negative pool desyncs every
      // 「法力 >= N」 condition downstream and renders as a broken bar), and
      // never more than is there.
      const before = hp.mana;
      hp.mana = Math.max(0, hp.mana - want);
      // 存款 (`bankAs`) —— 記下**實扣量**,不是 `want`。付不出全額的時候玩家
      // 只付了 `before`,而他買到的傷害必須對應他真的付出去的東西;寫 `want`
      // 會讓一個空魔的英雄按下 EX 就領到滿額加成。
      const bank = e.bankAs;
      if (bank !== undefined) {
        const spent = before - hp.mana;
        if (spent > 0) {
          const st = world.status.get(payer) ?? { effects: [] };
          const expiresAtTick = world.tick + Math.round(bank.durationSec / world.dt);
          // Keyed on statusId + origin, exactly like applyStatus's refresh rule:
          // two different cards banking under the same marker must not overwrite
          // each other's deposit.
          const existing = st.effects.find(
            (s) => s.statusId === bank.statusId && s.sourceId === ctx.origin,
          );
          if (existing) {
            existing.expiresAtTick = expiresAtTick;
            existing.magnitude = spent;
          } else {
            st.effects.push({
              statusId: bank.statusId,
              sourceId: ctx.origin,
              expiresAtTick,
              magnitude: spent,
            });
          }
          world.status.set(payer, st);
        }
      }
    }
  },
};
