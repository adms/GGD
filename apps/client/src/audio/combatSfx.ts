/**
 * audio/combatSfx — the PURE event → SFX-key mapping for the per-frame combat
 * sound layer. The GameApp drains MSG.EVENT each frame and calls
 * `audioSystem.playSfx(combatSfxKey(ev))`; this function is the whole decision.
 *
 * Design:
 *   • The rich `damage` event drives the type-differentiated HIT voice —
 *     物理 (hit) / 魔法 (hitMagic) / true (hitTrue) — and the special reactions
 *     防禦 (block, a shield/DR-absorbed hit) and crit. This is the single hit
 *     voice, so `basicAttackHit` (a duplicate of the same moment) and the
 *     timing-only `hitImpact` map to nothing — no double-thud.
 *   • 破防 (guardBreak), knockdown and whiff each get their own distinct clip.
 *   • The pre-hit + utility events pass through by name (windup/swing/launch/
 *     cast/flower/heal) — the audio map already owns those keys.
 *   • `rankUp` (a skill point spent, QWER/EX rank raised) renames to the map's
 *     `abilityRankUp` cue: the sim event and the audio key disagree, so it is a
 *     rename rather than a passthrough. Wired off #51's staged `ability-rank-up`
 *     clip (task-#51 ledger, previously authored-but-silent).
 *   • `heal` (HP actually restored — flower / ability / lifesteal / item) plays
 *     the staged `magic-heal` cue. Deliberately quiet (map gain 0.41, 400 ms
 *     cooldown) because it can fire often; the flower's own spawn/burst chimes
 *     are a separate moment.
 *   • `death` / `levelUp` are intentionally NOT mapped: the AudioDirector fires
 *     those off the discrete K/D / level tally, so mapping them here too would
 *     double the sound.
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";

/** Events that keep their own name as the SFX key (already in the audio map). */
const PASSTHROUGH = new Set<string>([
  "attackWindup",
  "basicAttack",
  "projectileSpawn",
  "projectileHit",
  "castBegin",
  "castEnd",
  "castInterrupt",
  "abilityCast",
  "flowerSpawn",
  "flowerBurst",
  "heal", // 回復 — HP actually restored (map key == event name); #51 magic-heal
]);

/**
 * The SFX-map key an event should play, or null for silence. Reads the enriched
 * `damage` payload names from the contract (dmgType/blocked/crit/killingBlow),
 * falling back to the sim's raw `type` field if `dmgType` is absent.
 */
export function combatSfxKey(ev: EventMessage): string | null {
  const d = ev.data;
  switch (ev.type) {
    case "damage": {
      if (d.blocked) return "block"; // 防禦 — shield / damage-reduction absorbed
      if (d.crit || d.killingBlow) return "crit";
      const t = (d.dmgType ?? d.type) as string | undefined;
      if (t === "magic") return "hitMagic"; // 魔法
      if (t === "true") return "hitTrue";
      return "hit"; // 物理 (default)
    }
    case "guardBreak":
      return "guardBreak"; // 破防 — shield broke this frame
    case "knockdown":
      return "knockdown";
    case "whiff":
      return "whiff";
    case "rankUp":
      return "abilityRankUp"; // 技能升級 — sim event ≠ map key, so a rename

    default:
      return PASSTHROUGH.has(ev.type) ? ev.type : null;
  }
}
