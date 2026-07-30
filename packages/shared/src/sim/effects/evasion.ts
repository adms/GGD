/**
 * `evasion` — 閃避 (lane P5). Grant a TIMED dodge chance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It is a thin, deliberate wrapper over the EXISTING machinery: a timed
 * `ModifierSource` carrying `{ stat: evasion, op: flat }` on `world.stats`, i.e.
 * exactly the shape `applyBuff` writes and exactly the shape the 13 already-
 * authored evasion content files use. It adds no SimWorld field and no second
 * dodge number — `Stat.Evasion` stays THE one place a dodge chance lives, so the
 * HUD stat panel keeps telling the truth (#125) for free.
 *
 * ⚠️ THE WARNING THE STUB LEFT HERE WAS RIGHT, AND IT IS NOW DISCHARGED. The
 * stub said: "the STAT existing is not the same as the stat being CONSUMED …
 * a handler that only attaches the modifier would ship failure shape ② — the
 * number moves, the player still gets hit". That was TRUE of the stub's own
 * era and is FALSE now, but only because it was checked rather than assumed:
 * `combat/evasion.ts::rollEvade` is called from `BasicAttackSystem.ts:435`
 * (melee damage point) and `ProjectileSystem.ts:79` (missile impact). Both call
 * sites are live on `main`. The guard in `effects/evasion.test.ts` still proves
 * consumption end-to-end by stepping a real `SimWorld` and reading
 * `world.health` — never by asserting that a source got attached.
 *
 * (The stub also said "nothing in combat/damage.ts reads Stat.Evasion" — that
 * remained true for ABILITY damage until DECISION 5; see below.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION POINTS ARE FIELDS (owner 2026-07-30: 尤其是決策點)
 *
 * · `chance`      — how much dodge, 0..1, before the ceiling.
 *
 *   ⚠️ 2026-07-30 CORRECTION. What stood here was 「`Stat.Evasion`'s [0, 0.8]
 *   clamp still applies downstream, so 100% dodge is not reachable from here」.
 *   That was written without being run, and it was HALF FALSE:
 *
 *     measured, `chance: 1` ─┬─ basic-attack channel  → 0.8 ✅ (clamp bound it)
 *                            └─ ability channel       → 1.0 ❌ INVULNERABLE
 *                                 2,000 × 50 magic packets cost 0 hp
 *
 *   `evasionOf` reads `sc.final`, which `finalizeStat` clamps. `abilityEvasionOf`
 *   read a source's RAW authored `chance`, which never touches that pipeline, so
 *   `{ chance: 1, dodgesAbilities: true }` DID mint exactly the total immunity
 *   this comment promised it could not — overlapping P3's `invulnerable` with
 *   none of its 「a refused packet is BLOCKED damage」 scoreboard semantics.
 *
 *   Now true of BOTH channels: `combat/evasion.ts::evasionCeiling` folds the
 *   same `effectiveCap(world.statCaps, Stat.Evasion, …)` into the ability path.
 *   Shipping ceiling 0.8, and it is a FIELD — `config.stat-caps@1` (後台「屬性
 *   上限」) can move it, because 「evasion may reach 100%」 is the owner's
 *   decision to make, not a constant for this file to assert.
 *   Guarded by 「THE CEILING BINDS ON BOTH CHANNELS」 in `evasion.test.ts`.
 * · `durationSec` — how long.
 * · `applyTo`     — the caster (default) or each resolved target. A dodge buff
 *                   is normally a self-buff, but "grant your ally 20% dodge" is
 *                   a real WC3 shape, so it is not hard-coded.
 * · `dodgesAbilities`  — DECISION 5. Default FALSE = WC3 `Aevd` fidelity:
 *                   attacks only. True also arms the ability channel.
 * · `dodgesTrueDamage` — DECISION 5. Default FALSE. Only meaningful together
 *                   with `dodgesAbilities` (the basic-attack channel is always
 *                   physical), and deliberately off so the arena fire-ring burn
 *                   (#270, true damage) can never be dodged by accident.
 *
 * STACKING. One source id per `origin`, so re-casting the same ability REPLACES
 * its own buff (refresh) instead of stacking a second copy — two 20% sources
 * would otherwise add to 40% through the pipeline's Σflat, which is not what
 * "refresh a dodge buff" means in any of the source abilities. Different
 * abilities still stack, which is the pipeline's normal behaviour.
 */
import type { EffectKindSpec } from "./effectKind";
import { attachSource, detachSource } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";

export const evasionEffect: EffectKindSpec<"evasion"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // Absolute expiry tick — never a decrementing counter (sim purity rule:
    // a countdown drifts across save/replay boundaries).
    const expiresAtTick = world.tick + Math.round(e.durationSec / world.dt);
    const targets = e.applyTo === "target" ? ctx.targets : [ctx.caster];
    // `evasionScope` is omitted entirely when both flags are off, so a default
    // buff is byte-identical in shape to what content already authors and the
    // ability-channel scan in combat/evasion.ts skips it without a branch.
    const scope =
      e.dodgesAbilities || e.dodgesTrueDamage
        ? {
            ...(e.dodgesAbilities ? { abilities: true } : {}),
            ...(e.dodgesTrueDamage ? { trueDamage: true } : {}),
          }
        : undefined;

    for (const target of targets) {
      // REFRESH, don't stack: drop this origin's previous grant first.
      const id = `buff:evasion:${ctx.origin}`;
      detachSource(world, target, id);
      attachSource(world, target, {
        id,
        kind: "buff",
        modifiers: [{ stat: Stat.Evasion, op: ModOp.Flat, value: e.chance }],
        expiresAtTick,
        ...(scope ? { evasionScope: scope } : {}),
      });
    }

    // Same discrete status-up cue `applyBuff` fires, so the client's 增益 sound
    // and aura visuals need no new event type. Only when a buff landed.
    if (targets.length > 0) {
      world.emit("buffApply", {
        source: ctx.caster,
        target: targets[0]!,
        origin: ctx.origin,
      });
    }
  },
};
