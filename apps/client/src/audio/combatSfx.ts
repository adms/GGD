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
 *     timing-only `hitImpact` map to nothing — no double-thud. The ONE
 *     exception is a tracked bow arrow (see `arrowPierce` below).
 *   • 破防 (guardBreak), knockdown and whiff each get their own distinct clip.
 *   • PER-WEAPON / PER-ELEMENT ROUTING (全用). A `basicAttack` plays its
 *     WEAPON-class voice (sword / greatsword / katana / bow / gun / magic /
 *     thrown) derived from
 *     the `weaponClass` the sim now stamps on the event (BasicAttackSystem); an
 *     `abilityCast` plays its ELEMENT whoosh (fire / ice / lightning) derived
 *     from the ability `vfxKey` the sim now forwards (fx.prim.<element>.<shape>).
 *     Both ALWAYS fall back to the generic `basicAttack` / `abilityCast` clip
 *     when the routing data is absent or unrecognised — never silence, never a
 *     crash on a malformed payload.
 *   • The other pre-hit + utility events pass through by name (windup/swing/
 *     launch/cast/flower/heal) — the audio map already owns those keys.
 *   • ARCHERY + 魔法陣 (the three shipped 効果音ラボ clips that had no emit site).
 *     All three are SUBSTITUTIONS on an event that already sounds, never a new
 *     voice: `arrowRelease` replaces the generic `projectileSpawn` launch for a
 *     bow auto's missile, `castCircle` replaces the generic `castBegin` tick for
 *     a LONG wind-up, and `arrowPierce` is the one added layer (a quiet transient
 *     under the thud that already plays). See ARROW TRACKING and
 *     {@link CAST_CIRCLE_MIN_SEC} below.
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
import { hudStore } from "../net/RoomStore";
import { noteFireRingIgnition } from "./fireRingWindow";

/** Events that keep their own name as the SFX key (already in the audio map). */
const PASSTHROUGH = new Set<string>([
  "attackWindup",
  // `projectileSpawn` and `castBegin` are NOT here: both now have their own
  // case in the switch, because each can resolve to either its generic clip or
  // an archery / 魔法陣 substitute. Their generic key is still the event name.
  "projectileHit",
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
 * The generic swing (`assets/audio/sfx/fx/swing.mp3`) — a neutral whoosh with no
 * material in it. It is BOTH the fallback for an unrecognised class and the
 * deliberate answer for `thrown`; see WEAPON_SFX.
 */
const GENERIC_SWING = "basicAttack";

/**
 * WEAPON class → basic-attack clip. The class rides on the `basicAttack` event's
 * `weaponClass` field (stamped by BasicAttackSystem from the champion's data).
 * `sword` owns TWO clips: the heavier `attackSword2` doubles as the crit swing,
 * so both authored slashes are used and the pick stays fully deterministic
 * (keyed on the event's own `crit` flag — no rng, no wall clock).
 *
 * EVERY member of `sim/systems/BasicAttackSystem.WEAPON_TAGS` must appear here
 * (`sword` via the branch below). That is the point of the two-file contract
 * written up in that file: a class with no row falls back to the generic swing
 * by ACCIDENT, and the whole reason `magic` had to be added is that the wrong
 * fallback is indistinguishable from a decision when nothing states the decision.
 *
 *   • `magic` → `magicBolt`, the 効果音ラボ 気弾 (energy-bolt) clip. Until
 *     2026-07-24 there was no caster class at all, so all 22 of the roster's
 *     conjuring champions defaulted to `bow` and answered a spell with a
 *     BOWSTRING CREAK. One class covers all of them on purpose: the WC3 missile
 *     art distinguishes the bolt's ELEMENT (fireball / farseer / shadow-hunter /
 *     serpent-ward), not the implement, so splitting into staff/orb/beam would be
 *     inventing a distinction the source does not make — and each split would
 *     need its own clip to not be an empty class.
 *   • `thrown` → the generic swing, ON PURPOSE and stated rather than defaulted.
 *     The two hurled-object heroes (Warden glaive, Brewmaster keg) have no
 *     bespoke clip in the pack, and the honest sound for a hurled object is the
 *     neutral whoosh — NOT a bow draw, which is what they got before. If a
 *     dedicated 投擲 clip is ever acquired, this row is where it lands.
 */
const WEAPON_SFX: Readonly<Record<string, string>> = {
  greatsword: "attackGreatsword",
  katana: "attackKatana",
  bow: "bowDraw",
  gun: "gunshot",
  magic: "magicBolt",
  thrown: GENERIC_SWING,
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

// ---------------------------------------------------------------------------
// ARROW TRACKING — 放箭 / 箭矢命中, entirely client-side
// ---------------------------------------------------------------------------
/**
 * WHY THERE IS STATE HERE AT ALL. The two archery clips need to know that a
 * given projectile is an ARROW, and the sim never says so: `projectileSpawn`
 * ships `{ id, owner, projectileId }` and `basicAttackHit` ships
 * `{ id, owner, target, crit, projectileId }` — neither carries `weaponClass`.
 * The information IS already on the wire, one event earlier: BasicAttackSystem
 * emits `basicAttack { source, ranged: true, weaponClass }` and then, with no
 * other emit in between, `projectileSpawn { id, owner: source }` for the very
 * same shot. So the client can join them itself. That is why this is NOT a
 * request for a new sim field or a fan-out whitelist entry — it costs zero
 * bytes on the wire and depends on nothing another lane has to ship.
 *
 * The join is deliberately narrow:
 *   • ONE pending slot, not a map. The two emits are adjacent by construction
 *     (BasicAttackSystem `return`s immediately after the pair), and the slot is
 *     only consumed when `owner` matches the `source` that armed it — so an
 *     interleaving we did not predict makes the arrow fall back to the generic
 *     launch, never mis-fires on someone else's projectile.
 *   • The in-flight id set is a bounded FIFO. A basic-attack arrow that expires
 *     at max range emits NO hit event, so entries would otherwise leak for the
 *     whole match; past {@link ARROW_TRACK_CAP} the oldest id is evicted. An
 *     arrow lives well under a second and 12 champions cannot have 64 autos in
 *     the air, so eviction never reaches a live shot.
 */
const ARROW_TRACK_CAP = 64;

/** `basicAttack.source` of a bow auto awaiting its `projectileSpawn`, or null. */
let pendingBowShot: number | null = null;
/** Entity ids of bow-auto missiles currently in flight (insertion-ordered). */
const arrowIds: number[] = [];
const arrowInFlight = new Set<number>();

/** Remember a missile as an arrow, evicting the oldest once the cap is hit. */
function noteArrow(id: number): void {
  if (arrowInFlight.has(id)) return;
  arrowInFlight.add(id);
  arrowIds.push(id);
  while (arrowIds.length > ARROW_TRACK_CAP) {
    const evicted = arrowIds.shift();
    if (evicted !== undefined) arrowInFlight.delete(evicted);
  }
}

/** Consume a tracked arrow id (true = this missile was a bow auto). */
function takeArrow(id: unknown): boolean {
  if (typeof id !== "number" || !arrowInFlight.has(id)) return false;
  arrowInFlight.delete(id);
  const at = arrowIds.indexOf(id);
  if (at >= 0) arrowIds.splice(at, 1);
  return true;
}

/** Number of missiles currently tracked as arrows (test/debug read-back). */
export function arrowsInFlight(): number {
  return arrowInFlight.size;
}

/** Drop all arrow/cast tracking. Called on match teardown, and by every test. */
export function resetProjectileSfx(): void {
  pendingBowShot = null;
  arrowIds.length = 0;
  arrowInFlight.clear();
}

/**
 * 詠唱起手 (#181's cast-feedback beat, heard): the cast wind-up long enough to
 * deserve the 魔法陣 whoosh instead of the generic `castBegin` tick.
 *
 * `castBegin` is ONLY emitted when the ability has a real cast time (an instant
 * cast never fires it at all), and it is the same authoritative window the
 * client's 0.6 s cast-telegraph light pillar rides — so this sound lands exactly
 * on the visual telegraph the victim is supposed to react to.
 *
 * The line sits at 0.5 s because that is where the content actually splits: of
 * the authored `castTimeSec` values, 0.3/0.4 s are the common snappy casts (417
 * of 584) and 0.5 s+ are the committed ones (167). So roughly the top quarter of
 * casts — the ones worth a "something big is winding up" — get the circle, and
 * the clip (~1 s) is never longer than the window it decorates by much. Short
 * casts keep the dry tick they have today.
 */
export const CAST_CIRCLE_MIN_SEC = 0.5;

/** The wind-up key for a `castBegin`: the 魔法陣 whoosh, or the generic tick. */
export function castTelegraphKey(castTimeSec: unknown): string {
  return typeof castTimeSec === "number" && castTimeSec >= CAST_CIRCLE_MIN_SEC
    ? "castCircle"
    : "castBegin";
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

/**
 * Publish the local seat id for the seat-gated cues (AudioDirector owns this).
 *
 * A CHANGED seat also re-baselines the arrow tracking, exactly as `sfxEdges`
 * re-baselines its tally on a seat change: entity ids restart with each match,
 * so an arrow still "in flight" from the previous one could otherwise collide
 * with a fresh id and put a pierce under someone else's melee swing.
 */
export function setCombatSfxSeat(seatId: number | null): void {
  if (seatId !== localSeatId) resetProjectileSfx();
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
      // ARM the archery join: a RANGED bow auto is about to emit its
      // `projectileSpawn` with no weapon information of its own. Any other
      // basic attack disarms it, so the slot never survives to a later shot.
      pendingBowShot =
        d.ranged === true && d.weaponClass === "bow" && typeof d.source === "number"
          ? d.source
          : null;
      // per-weapon slash, generic swing when the class is unknown/malformed
      return weaponAttackKey(d.weaponClass, d.crit) ?? "basicAttack";
    case "projectileSpawn": {
      // 放箭 — the missile leaving the bow. REPLACES the generic launch clip for
      // this one shot (it is not layered on top of it), so a ranged auto still
      // makes exactly the two sounds it makes today: the draw and the release.
      const owner = d.owner;
      const armed = pendingBowShot !== null && owner === pendingBowShot;
      pendingBowShot = null;
      if (!armed || d.projectileId !== "basic-attack") return "projectileSpawn";
      if (typeof d.id === "number") noteArrow(d.id);
      return "arrowRelease";
    }
    case "basicAttackHit": {
      // 箭矢命中 — the ranged auto's arrival. `basicAttackHit` is otherwise
      // SILENT on purpose (the `damage` event owns the hit voice, and sounding
      // both would double-thud), and that stays true for every other weapon:
      // only a tracked ARROW speaks here, and the map keeps it quiet and
      // narrow (gain 0.34, maxConcurrent 2) so it reads as a transient on top
      // of the existing thud — "that thud was an arrow" — not a second event.
      // A dodged shot emits no `basicAttackHit` at all, so a miss stays silent;
      // the id simply ages out of the FIFO.
      return takeArrow(d.id) ? "arrowPierce" : null;
    }
    case "castBegin":
      // 魔法陣展開 — long wind-ups get the circle, short ones the dry tick
      return castTelegraphKey(d.castTimeSec);
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
      // 火環收縮 (#132) — sim event ≠ map key, so a rename.
      //
      // ALSO the S3 tripwire, and the ONE side effect in this otherwise pure
      // mapper. This event is the authority telling us the exact instant the
      // ring began to burn; `audio/fireRingWindow` has independently DERIVED
      // that instant from config.match@1 to drive the tension bed and the
      // minimap danger rim. If the two ever disagree again — they were 30 s
      // apart from #132 landing until 2026-07-24 — the very first round played
      // prints both numbers. Deleting this call restores the silence that let
      // the drift live for months. See fireRingWindow.noteFireRingIgnition.
      noteFireRingIgnition(hudStore.getState().phaseSecondsLeft);
      return "fireRingLoop";
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
