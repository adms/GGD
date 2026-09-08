/**
 * `onStunned` DISPATCH — 「被暈眩時」 as a hook event (勇者小呆 08-00 龍紋記憶).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SYSTEM AND NOT A `fireHooks` CALL INSIDE `applyStatus`
 *
 * The obvious place to fire this is the line in `effects/applyStatus.ts` that
 * pushes the stun marker. That import would close a ring:
 *
 *     applyStatus → effects/hooks → effectRunner → effectRegistry → applyStatus
 *
 * `effectRegistry.ts`'s own header names this hazard and says the bite is not a
 * compile error (there isn't one) but a runtime `undefined` handler when a
 * bundler picks the wrong initialisation order — i.e. the whole effect table
 * silently missing for one build. So `applyStatus` does the one thing that
 * costs nothing and imports nothing (a push onto `world.pendingStunHooks`) and
 * this module turns that into the hook.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE IT SITS IN THE TICK, AND WHY THAT EXACT SLOT
 *
 * Immediately AFTER `combatResolveSystem` (step 8) and before `deathSystem`.
 * That is the first point in a tick by which every stun source has already run:
 *
 *   · 2b `castResolveSystem` / 3 `commandSystem` — a cast that lands a stun
 *   · 8  `combatResolveSystem`                   — a stun applied by an
 *                                                  on-damage hook (they fire
 *                                                  inside the queue drain)
 *
 * Running it earlier would push a same-tick stun into the NEXT tick's dispatch,
 * which for a 3-second awakening is not a rounding detail — it is the
 * difference between the buff covering the stun and trailing it. Running it
 * after `deathSystem` would fire the hook for a champion who died on the same
 * tick he was stunned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Drains `world.pendingStunHooks` in PUSH ORDER (an array, identical on every
 * replica — NOT `world.events`, which `step()` clears on its first line and
 * which would therefore lose a stun applied between two ticks). No map
 * iteration, no clock and no rng of its own. `fireHooks` may
 * draw from `world.rng` if the authored hook carries `chance`/`condition`, at
 * the same fixed point in the tick on every replica. A world in which nobody
 * was stunned does exactly one array scan and nothing else, so no existing
 * recording changes.
 *
 * ⚠️ THE VICTIM IS THE HOOK OWNER, THE STUNNER IS THE HOOK TARGET. That is the
 * opposite of every other event in the enum and it is the only ordering that
 * makes the feature expressible: 小呆's payload has to land on 小呆
 * (`target: "self"`), and 「對暈我的人做點什麼」 has to stay reachable as the
 * default. Getting this backwards would put the ×2 attributes on the enemy.
 */
import type { SimWorld } from "../SimWorld";
import { fireHooks } from "../effects/hooks";

export function ccHookSystem(world: SimWorld): void {
  const queue = world.pendingStunHooks;
  if (queue.length === 0) return;
  // Drain by SPLICING the whole queue out first: `fireHooks` can run effects
  // that apply further stuns, and those must be dispatched on the NEXT tick
  // rather than appended to the array being walked (an unbounded loop and a
  // same-tick re-entry that no author could reason about).
  const batch = queue.splice(0, queue.length);
  for (const ev of batch) {
    // `fireHooks` already refuses a dead owner; the explicit guard here is for
    // the ORDERING claim above — this system runs before `deathSystem`, so a
    // champion killed by the same packet that stunned him is still `alive` and
    // would otherwise awaken on the tick he dies.
    const hp = world.health.get(ev.victim);
    if (hp && !hp.alive) continue;
    fireHooks(world, ev.victim, "onStunned", ev.source);
  }
}
