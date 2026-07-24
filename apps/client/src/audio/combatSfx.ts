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
 *   • PER-WEAPON / PER-ELEMENT ROUTING (全用). A `basicAttack` plays its
 *     WEAPON-class slash (sword / greatsword / katana / bow / gun) derived from
 *     the `weaponClass` the sim now stamps on the event (BasicAttackSystem); an
 *     `abilityCast` plays its ELEMENT whoosh (fire / ice / lightning) derived
 *     from the ability `vfxKey` the sim now forwards (fx.prim.<element>.<shape>).
 *     Both ALWAYS fall back to the generic `basicAttack` / `abilityCast` clip
 *     when the routing data is absent or unrecognised — never silence, never a
 *     crash on a malformed payload.
 *   • The other pre-hit + utility events pass through by name (windup/swing/
 *     launch/cast/flower/heal) — the audio map already owns those keys.
 *   • `rankUp` (a skill point spent, QWER/EX rank raised) renames to the map's
 *     `abilityRankUp` cue: the sim event and the audio key disagree, so it is a
 *     rename rather than a passthrough. Wired off #51's staged `ability-rank-up`
 *     clip (task-#51 ledger, previously authored-but-silent).
 *   • `fireRingStart` (#132) renames to the `fireRingLoop` closing-ring bed: the
 *     FireRingSystem emits the event once as the ring begins to tighten, and the
 *     long crackle-burn clip plays under the accelerating finish. (No true SFX
 *     loop exists on the client, so the ~60 s clip is fired as one long one-shot
 *     at the start edge — see also reviveChannel/arenaAmbience.)
 *   • The death→revive→respawn flow (#84): `reviveChannel` fires when a teammate
 *     first begins channelling a revive circle, `reviveComplete` on the resurrect
 *     itself (both are sim events with the same name as their clip → passthrough).
 *     `respawn` (round re-entry) and `arenaAmbience` are DISCRETE, local/phase
 *     edges owned by the AudioDirector, not this per-frame path.
 *   • `buffApply` (a stat buff / status-up applied) and `explosion` (a ground
 *     AoE detonating at a point) had a map entry but no emit source until the sim
 *     began firing them; they pass through by name.
 *   • `heal` (HP actually restored — flower / ability / lifesteal / item) plays
 *     the staged `magic-heal` cue. Deliberately quiet (map gain 0.41, 400 ms
 *     cooldown) because it can fire often; the flower's own spawn/burst chimes
 *     are a separate moment.
 *   • NEUTRAL GUARDIAN (#89, per-arena faces 樹人/石頭人/巨獸人 in #105). The
 *     tower's telegraphed AoE punish LANDS as `guardianImpact` (one per resolved
 *     mark, all on the same tick), which renames to the heavy stone-shatter
 *     `guardianSlam`. The pre-land `guardianMark` telegraph stays SILENT — it is
 *     the dodge window the VfxSystem draws, and sounding it would pre-announce
 *     the same beat twice. `guardianWake` / `guardianSleep` / `guardianSpawn` /
 *     `guardianHeirPulse` are likewise unmapped (no clip authored for them).
 *   • `guardianSlain` → `guardianLastHit` is the ONE seat-gated decision in this
 *     file. The event is fanned out to every client (eventFanout), so mapping it
 *     unconditionally would ring the gold chime in all six players' ears for a
 *     bounty exactly one of them was paid. It therefore resolves through
 *     `guardianRewardKey(ev, seatId)` against the local seat the AudioDirector
 *     publishes here (see `setCombatSfxSeat`) — once per kill, for the last
 *     hitter only, and never on the void payout (killerSeatId -1 / gold 0).
 *   • `death` / `levelUp` are intentionally NOT mapped: the AudioDirector fires
 *     those off the discrete K/D / level tally, so mapping them here too would
 *     double the sound.
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";

/** Events that keep their own name as the SFX key (already in the audio map). */
const PASSTHROUGH = new Set<string>([
  "attackWindup",
  "projectileSpawn",
  "projectileHit",
  "castBegin",
  "castEnd",
  "castInterrupt",
  "flowerSpawn",
  "flowerBurst",
  "heal", // 回復 — HP actually restored (map key == event name); #51 magic-heal
  // Previously map-only, now fired by the sim (their key == the event name):
  "buffApply", // 增益/狀態提升 — a stat buff was attached to a target
  "explosion", // AoE 爆裂 — a ground-targeted ability detonated at a point
  // Death→revive→respawn flow (#84). Both are sim events named like their clip.
  "reviveChannel", // 復活詠唱進行中 — a teammate began channelling a revive circle
  "reviveComplete", // 復活完成 — the resurrect landed
]);

/**
 * WEAPON class → basic-attack clip. The class rides on the `basicAttack` event's
 * `weaponClass` field (stamped by BasicAttackSystem from the champion's data).
 * `sword` owns TWO clips: the heavier `attackSword2` doubles as the crit swing,
 * so both authored slashes are used and the pick stays fully deterministic
 * (keyed on the event's own `crit` flag — no rng, no wall clock).
 */
const WEAPON_SFX: Readonly<Record<string, string>> = {
  greatsword: "attackGreatsword",
  katana: "attackKatana",
  bow: "bowDraw",
  gun: "gunshot",
};

/**
 * The clip for a basic attack, or null to fall back to the generic swing.
 * `sword` resolves to attackSword1 / attackSword2 (crit); every other known
 * class maps straight through; anything else (or a non-string) → null.
 */
export function weaponAttackKey(weaponClass: unknown, crit: unknown): string | null {
  if (typeof weaponClass !== "string") return null;
  if (weaponClass === "sword") return crit === true ? "attackSword2" : "attackSword1";
  return WEAPON_SFX[weaponClass] ?? null;
}

/** ELEMENT (the `<element>` of a `fx.prim.<element>.<shape>` vfxKey) → cast whoosh. */
const ELEMENT_SFX: Readonly<Record<string, string>> = {
  fire: "magicFire",
  ice: "magicIce",
  lightning: "magicLightning",
};

/**
 * The element whoosh for an ability cast, or null to fall back to the generic
 * cast. Reads the element out of an `fx.prim.<element>.<shape>` vfxKey; a vfxKey
 * in any other shape, an unrouted element, or a non-string all yield null.
 */
export function castElementKey(vfxKey: unknown): string | null {
  if (typeof vfxKey !== "string") return null;
  const parts = vfxKey.split(".");
  const element = parts[2];
  if (parts[0] !== "fx" || parts[1] !== "prim" || element === undefined) return null;
  return ELEMENT_SFX[element] ?? null;
}

/**
 * WHO AM I — the local seat id, published by the AudioDirector (the one place
 * that already subscribes to `hudStore.localSeatId`) and read back by the
 * per-frame drain.
 *
 * WHY A REGISTERED VALUE RATHER THAN A PARAMETER. `guardianSlain` is broadcast
 * to every client, but its reward chime belongs to exactly one of them, so the
 * mapping needs to know which seat is listening. The per-frame caller (GameApp)
 * is a hot loop with no business reaching into the HUD store for audio, and the
 * decision itself must stay unit-testable without a store — so the pure rule
 * lives in `guardianRewardKey(ev, seatId)` and this holder is only how the
 * conductor hands it the answer. Null (no seat yet / AudioDirector unmounted) is
 * a legal state and simply keeps the chime silent.
 */
let localSeatId: number | null = null;

/** Publish the local seat id for the seat-gated cues (AudioDirector owns this). */
export function setCombatSfxSeat(seatId: number | null): void {
  localSeatId = seatId;
}

/** The seat id currently published (test/debug read-back). */
export function combatSfxSeat(): number | null {
  return localSeatId;
}

/**
 * 守衛塔最後一擊的金幣獎勵 (#89): the `guardianLastHit` reward chime, or null.
 *
 * Fires ONLY for the seat that landed the killing blow and was actually paid.
 * A void payout (the killer died / left the zone in the same tick) ships
 * `killerSeatId: -1, gold: 0` and must stay silent — nobody got the gold.
 * Total on a malformed payload.
 */
export function guardianRewardKey(ev: EventMessage, seatId: number | null): string | null {
  if (seatId === null || seatId < 0) return null;
  const killer = ev.data.killerSeatId;
  if (typeof killer !== "number" || killer !== seatId) return null;
  const gold = ev.data.gold;
  if (typeof gold === "number" && gold <= 0) return null; // void payout
  return "guardianLastHit";
}

/**
 * The SFX-map key an event should play, or null for silence. Reads the enriched
 * `damage` payload names from the contract (dmgType/blocked/crit/killingBlow),
 * falling back to the sim's raw `type` field if `dmgType` is absent.
 *
 * `seatId` defaults to the seat the AudioDirector published, so the hot-path
 * caller keeps its one-argument shape; tests pass it explicitly.
 */
export function combatSfxKey(ev: EventMessage, seatId: number | null = localSeatId): string | null {
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
    case "basicAttack":
      // per-weapon slash, generic swing when the class is unknown/malformed
      return weaponAttackKey(d.weaponClass, d.crit) ?? "basicAttack";
    case "abilityCast":
      // per-element whoosh, generic cast when the vfxKey carries no known element
      return castElementKey(d.vfxKey) ?? "abilityCast";
    case "guardBreak":
      return "guardBreak"; // 破防 — shield broke this frame
    case "knockdown":
      return "knockdown";
    case "whiff":
      return "whiff";
    case "rankUp":
      return "abilityRankUp"; // 技能升級 — sim event ≠ map key, so a rename
    case "fireRingStart":
      return "fireRingLoop"; // 火環收縮 (#132) — sim event ≠ map key, so a rename
    case "guardianImpact":
      // 守衛塔範圍重擊 (#89/#105) — the telegraphed volley LANDS. One event per
      // resolved mark, all on the same tick, so the map's 300 ms cooldown /
      // maxConcurrent 2 collapse a multi-mark volley into a single slam.
      return "guardianSlam";
    case "guardianSlain":
      // 最後一擊的金幣獎勵 — the only seat-gated cue here (see guardianRewardKey)
      return guardianRewardKey(ev, seatId);

    default:
      return PASSTHROUGH.has(ev.type) ? ev.type : null;
  }
}
