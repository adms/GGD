/**
 * FireRingSystem — the round-pacing accelerator (火圈 / 火環, task #132).
 *
 * Runs right after combatResolveSystem and BEFORE deathSystem: it directly
 * removes HP (a pure environmental burn — no attacker, so no kill credit, no
 * bounty, no lifesteal, and it bypasses armor/MR AND the combat-env damage
 * knob), then this tick's deathSystem picks up any champion it dropped to 0 and
 * resolves the death exactly like any other (killer = null → environmental).
 *
 * GATES (all must hold, else a pure no-op):
 *   - `world.fireRingRules` armed (host called beginCombatFireRing on entry)
 *   - `world.fireRingTicks >= 0`
 *   - `world.combatActive` — LIVE combat only. The instant a round settles
 *     (task #100 flips combatActive false) the ring stops burning, so it is a
 *     finish accelerator, never a post-settle grinder.
 *
 * The combat-elapsed counter (`fireRingTicks`) is incremented FIRST — mirroring
 * FlowerSystem — so the ring ignites exactly `startTicks` combat ticks in, and
 * the first damaging step lands exactly one `stepTicks` after that.
 */
import type { SimWorld } from "../SimWorld";
import { fireRingRatePerSec } from "../fireRing";

export function fireRingSystem(world: SimWorld): void {
  const rules = world.fireRingRules;
  if (!rules) return;
  if (world.fireRingTicks < 0) return;
  if (!world.combatActive) return; // live combat only (task #100 coordination)

  // combat-elapsed counter: incremented first so ignition lands exactly
  // startTicks into combat and step N lands exactly startTicks + N*stepTicks.
  world.fireRingTicks++;
  const elapsed = world.fireRingTicks;
  if (elapsed < rules.startTicks) return; // dormant — the ring has not closed in yet

  const ticksSinceStart = elapsed - rules.startTicks;
  // one-shot ignition beat (the 火圈 scene / BGM cue) exactly when it begins.
  if (ticksSinceStart === 0) world.emit("fireRingStart", { atTick: world.tick });

  const ratePerSec = fireRingRatePerSec(rules, ticksSinceStart);
  world.emit("fireRingTick", { ratePerSec, ticksSinceStart });
  if (ratePerSec <= 0) return; // grace second: telegraph only, no damage yet

  const dt = world.dt;
  // champion store iterates in ascending-id insertion order — deterministic.
  for (const [id, champ] of world.champion) {
    void champ;
    const hp = world.health.get(id);
    if (!hp || !hp.alive) continue;
    const dmg = hp.maxHp * ratePerSec * dt;
    if (dmg <= 0) continue;
    hp.hp -= dmg; // pure %-HP true burn: ignores armor/MR, shields and combat-env
    const t = world.transform.get(id);
    world.emit("fireRingDamage", {
      id,
      amount: dmg,
      dmgType: "true",
      origin: "fireRing",
      x: t?.pos.x ?? 0,
      z: t?.pos.z ?? 0,
    });
  }
}
