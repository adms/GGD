/**
 * restore — the ONE path that puts HP or MANA back onto an entity, and the
 * only place the `heal` / `manaRestore` events are emitted.
 *
 * WHY THIS EXISTS (task #92). The request names four things that must show a
 * number: 造成傷害 / 受到傷害 / 補血 / 補魔. The first two ride the existing
 * `damage` event. The last two had **no event at all** — six sites mutated
 * `hp.hp` and five mutated `hp.mana` silently, so the client could not draw
 * them even in principle. Deriving them from snapshot deltas is lossy across
 * 30 Hz + interpolation and cannot attribute a source, so the honest fix is a
 * sim event, not a client heuristic.
 *
 * DETERMINISM. Pure arithmetic on world state: no wall-clock, no rng, no trig.
 * The mutation each helper performs is byte-identical to the inline code it
 * replaced (same clamp, same order, same `combatEnv` factor applied by the
 * CALLER), so the world digest is unchanged and same-seed replay still matches.
 * Events are not part of `SimWorld.digest()` — they are the presentation seam.
 *
 * SCOREBOARD PARITY. `recordHealing` is opt-in via `score`, because the sites
 * differ TODAY and this task must not move a stat: ability heals / `restore`
 * healthPct / lifesteal score, the flower burst deliberately does not (it is
 * counted as `flowersEaten`). Passing the wrong flag would change
 * `matchStats.healingDone`, which IS in the digest — hence an explicit,
 * non-defaulted field.
 *
 * WHAT DELIBERATELY DOES NOT COME THROUGH HERE:
 *   · `RegenSystem` — passive regen runs for every living entity EVERY tick.
 *     At 30 Hz × 12 champions that is 720 events/s of "+0.4 hp", which is
 *     spam on the wire and light pollution on screen. Regen is read from the
 *     bar, not from floating text.
 *   · `ReviveSystem` — a revive SETS hp/mana to a fraction of max (it is a
 *     respawn, not a restore). The revive circle + the `reviveComplete` event
 *     already carry that moment.
 *   · ability mana COST (`abilitySystem`) — spending is not 補魔.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { recordHealing } from "../stats/matchStats";
import { woundMult } from "../grievousWounds";

/**
 * Restores below this are not worth an event (and would otherwise let a
 * rounding crumb spawn a "0" on screen). Chosen well under 1 hp so no real
 * heal is ever swallowed.
 */
export const RESTORE_EPSILON = 0.05;

export interface RestoreOpts {
  /** who caused it (the healer / the lifestealer / the flower's killer) */
  source: EntityId;
  /** who receives it */
  target: EntityId;
  /** amount BEFORE the max clamp; the caller has already applied combatEnv */
  amount: number;
  /** provenance: "ability:sela.w" | "lifesteal" | "flower" | "item:..." */
  origin: string;
  /** credit `source` with healingDone — MUST mirror the pre-existing per-site behaviour */
  score: boolean;
}

/**
 * Add HP, clamped at maxHp. Returns the amount ACTUALLY restored (0 when the
 * target is dead/missing or already full). Emits `heal` with both the applied
 * amount and the `overheal` that was clamped away, so the client can show the
 * real number instead of the requested one.
 */
export function healTarget(world: SimWorld, opts: RestoreOpts): number {
  const hp = world.health.get(opts.target);
  if (!hp?.alive) return 0;
  // 【重創】A6（#278）—— 讀取點①。所有**治療**都經過這裡（heal / restore /
  // 治療花 / 守衛塔 / 吸血），所以打折一次就全部到位。
  // ⚠️ `restoreMana` 底下那一份**故意**不打折 —— 重創是治療軸，不是法力軸。
  // ⚠️ 吸血的**係數**在 `combat/damage.ts` 另外打折，那不是重複，見那一段。
  const requested = opts.amount * woundMult(world, opts.target, "healingTakenMult");
  if (!(requested > 0)) return 0;

  const before = hp.hp;
  hp.hp = Math.min(hp.maxHp, hp.hp + requested);
  const applied = hp.hp - before;
  if (opts.score) recordHealing(world, opts.source, applied);
  if (applied <= RESTORE_EPSILON) return applied;

  const t = world.transform.get(opts.target);
  world.emit("heal", {
    x: t?.pos.x ?? 0,
    z: t?.pos.z ?? 0,
    source: opts.source,
    target: opts.target,
    amount: applied,
    overheal: Math.max(0, requested - applied),
    origin: opts.origin,
  });
  return applied;
}

/**
 * Add mana, clamped at maxMana. Returns the amount ACTUALLY restored. Never
 * scores (mana restored is not a scoreboard column today) — the `score` field
 * is ignored here and kept off the signature on purpose.
 */
export function restoreMana(
  world: SimWorld,
  opts: Omit<RestoreOpts, "score">,
): number {
  const hp = world.health.get(opts.target);
  if (!hp?.alive) return 0;
  const requested = opts.amount;
  if (!(requested > 0)) return 0;

  const before = hp.mana;
  hp.mana = Math.min(hp.maxMana, hp.mana + requested);
  const applied = hp.mana - before;
  if (applied <= RESTORE_EPSILON) return applied;

  const t = world.transform.get(opts.target);
  world.emit("manaRestore", {
    x: t?.pos.x ?? 0,
    z: t?.pos.z ?? 0,
    source: opts.source,
    target: opts.target,
    amount: applied,
    overflow: Math.max(0, requested - applied),
    origin: opts.origin,
  });
  return applied;
}
