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
 *     cast/flower) — the audio map already owns those keys.
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
    default:
      return PASSTHROUGH.has(ev.type) ? ev.type : null;
  }
}
