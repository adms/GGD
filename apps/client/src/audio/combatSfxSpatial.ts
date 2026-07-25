/**
 * audio/combatSfxSpatial — WHERE a combat event's sound is, and WHOSE it is.
 *
 * Deliberately separate from `combatSfx.ts` and keyed by **`ev.type`**, never by
 * SFX key. Two reasons:
 *
 *  1. `audio/sfxReachability.ts` declares, per SFX key, the one file that decides
 *     it, and `sfxReachability.test.ts` asserts that file contains the key as a
 *     literal. Moving a key out of `combatSfx.ts` would turn the 効果音ラボ
 *     attribution page's 「使用中」 column red. Nothing here mentions an SFX key.
 *  2. Twenty-odd SFX keys collapse onto a dozen event types (six weapon swings
 *     are all `basicAttack`), so the event type is the natural unit for
 *     "where did this happen".
 *
 * Position resolution follows the SAME rule as `vfx/VfxSystem.posFromEvent`:
 * the payload's own `x`/`z` first — WITH the #131 non-finite reject — else the
 * rendered position of a referenced entity, else null. If audio used a different
 * rule the sound would end up where the sparks are not.
 *
 * ---------------------------------------------------------------------------
 * ON 衝刺 (DASH) — A SURVEY CLAIM THAT WAS WRONG, CORRECTED BY THE OWNER
 * ---------------------------------------------------------------------------
 * An earlier audio survey reported that "dashes do not exist at all — no event,
 * no key, no row", and filed it as a gap this table would have to grow for. The
 * owner corrected it: 「衝刺 在某些人的技能會實作，例如蒼月潮」. He is right, and
 * the content agrees — FIFTEEN abilities carry `castType: "dash"` (13 of them
 * pure movement, per `sim/abilities/abilityRecovery`), among them 電光一閃,
 * 神出鬼沒, 瞬間移動, 虛空瞬動 and 快步, and `sim/abilities/abilitySystem` has a
 * real `case "dash"`.
 *
 * A dash is therefore an ABILITY, not a movement system, and it already crosses
 * this table as `abilityCast` / `castBegin` / `castEnd` — placed at the caster,
 * `focus` class. Nothing needs adding here for it. What a dash still lacks is a
 * DISTINCT CLIP: it plays the generic cast pool. That is content work
 * (audio-map + `combatSfx`), not a spatialisation gap, and it must not be
 * re-filed as one.
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { SfxClass, SfxRelation, SpatialSource } from "./spatial";

/** Payload fields that may carry an entity id we can look a position up from. */
export type EntityField = "source" | "target" | "caster" | "owner" | "id" | "channeller" | "ownerId";

export interface EventSpatialSpec {
  /** distance falloff class — see audio/spatial. */
  cls: SfxClass;
  /**
   * Entity-id fields to try IN ORDER when the payload carries no usable x/z.
   * The first one that resolves also defines the sound's SUBJECT for the
   * ally/enemy decision, so the order is a content decision, not a lookup
   * optimisation: a `damage` sound belongs to the victim, a `basicAttack` sound
   * belongs to the swinger.
   */
  entityFallback: readonly EntityField[];
  /** payload field naming who DID it (→ relation "self" when that is you). */
  actorField: EntityField | null;
  /** payload field naming who it HAPPENED TO (→ relation "victim"). */
  victimField: EntityField | null;
}

/**
 * The 22 positioned event types. Everything `combatSfx.combatSfxKey` can voice
 * is either in here or in {@link CENTRED_EVENTS} — `combatSfxSpatial.test.ts`
 * scrapes `combatSfx.ts` and goes red on a new case that is in neither, so a
 * future event cannot ship silently unspatialised.
 *
 * CLASS ASSIGNMENT, stated: `texture` is the chatter that must clear out of the
 * way in a 12-body fight (swings, wind-ups, launches, whiffs, buff ticks, flower
 * pops); `focus` is everything a player must not miss (anything that DAMAGES,
 * heals, breaks guard, floors, detonates, casts, or revives).
 */
export const EVENT_SPATIAL: Readonly<Record<string, EventSpatialSpec>> = {
  // --- things that land on a body ------------------------------------------
  // payload x/z is the VICTIM's transform (sim/combat/damage.ts)
  damage: { cls: "focus", entityFallback: ["target", "source"], actorField: "source", victimField: "target" },
  guardBreak: { cls: "focus", entityFallback: ["target", "source"], actorField: "source", victimField: "target" },
  knockdown: { cls: "focus", entityFallback: ["target", "source"], actorField: "source", victimField: "target" },
  heal: { cls: "focus", entityFallback: ["target", "source"], actorField: "source", victimField: "target" },
  // buffApply carries NO position at all — { source, target, origin }
  buffApply: { cls: "texture", entityFallback: ["target", "source"], actorField: "source", victimField: "target" },

  // --- basic attacks --------------------------------------------------------
  basicAttack: { cls: "texture", entityFallback: ["source", "target"], actorField: "source", victimField: "target" },
  attackWindup: { cls: "texture", entityFallback: ["source", "target"], actorField: "source", victimField: "target" },
  // `whiff` carries the TARGET's position but only names `source` — the x/z wins
  whiff: { cls: "texture", entityFallback: ["source"], actorField: "source", victimField: null },

  // --- projectiles ----------------------------------------------------------
  projectileSpawn: { cls: "texture", entityFallback: ["owner"], actorField: "owner", victimField: null },
  projectileHit: { cls: "focus", entityFallback: ["target", "owner"], actorField: "owner", victimField: "target" },
  basicAttackHit: { cls: "focus", entityFallback: ["target", "owner"], actorField: "owner", victimField: "target" },

  // --- casting --------------------------------------------------------------
  // NOTE: `abilityCast` carries `point` (nullable) rather than x/z, so ground
  // targeted casts resolve through the caster. That is deliberate: the caster is
  // where the animation and the voice are, and it is never null.
  castBegin: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },
  castEnd: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },
  castInterrupt: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },
  abilityCast: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },
  // explosion DOES carry x/z — the AoE detonation point, not the caster
  explosion: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },

  // --- neutrals -------------------------------------------------------------
  // no team → relation resolves to "third", which is the correct low band
  flowerSpawn: { cls: "texture", entityFallback: ["id"], actorField: null, victimField: null },
  flowerBurst: { cls: "texture", entityFallback: ["id"], actorField: null, victimField: null },
  guardianImpact: { cls: "focus", entityFallback: ["id"], actorField: null, victimField: null },

  // --- revive (#84) ---------------------------------------------------------
  reviveChannel: { cls: "focus", entityFallback: ["channeller", "id"], actorField: "channeller", victimField: "ownerId" },
  // ownerId is the player being brought back: if that is you, this is the most
  // important sound on the field, so it takes the top (victim) band.
  reviveComplete: { cls: "focus", entityFallback: ["ownerId", "id", "channeller"], actorField: "channeller", victimField: "ownerId" },

  // --- 陣亡投幣 (#191) ------------------------------------------------------
  // payload x/z is where the coin lands; `id` is the COIN entity. The thrower
  // is named only by `seatId`, which is not an entity id — so like the flowers
  // this is a neutral: no actor, no victim, relation demotes to "third". It is
  // a lootable world ping, not a damage-class beat, hence `texture`.
  coinDropped: { cls: "texture", entityFallback: ["id"], actorField: null, victimField: null },
};

/**
 * In-world events that `combatSfxKey` voices and that must stay CENTRED, each
 * with the reason. These are not oversights — a directional version of any of
 * them would be worse than the centred one. A `case` that deliberately maps to
 * NULL also lands here: the coverage scrape counts every case, and rightly so —
 * if it ever starts voicing, somebody must re-decide where the sound is.
 */
export const CENTRED_EVENTS: Readonly<Record<string, string>> = {
  // a GOLD REWARD chime for the local seat (guardianRewardKey gates it on
  // killerSeatId === yours). It is a scoreboard beat, not a world sound.
  guardianSlain: "seat-gated gold reward chime — a HUD beat, not a world event",
  // your own ability rank-up. The event carries the entity id, so it COULD be
  // placed; it should not be — it is your own progression UI.
  rankUp: "local progression cue",
  // the fire ring is the whole arena boundary closing in. It has no direction
  // by nature, and panning it would imply one.
  fireRingStart: "non-directional by nature — the ring surrounds you",
  // the collector's own LOUD jingle, seat-gated by coinRewardKey to exactly one
  // player — the same shape as guardianSlain, for the same reason. The payload
  // carries x/z, so it COULD be placed; it must not be: your own banked reward
  // is a HUD beat, and panning it would place "you got paid" somewhere else.
  coinPickedUp: "seat-gated coin reward jingle — a HUD beat, not a world event",
  // combatSfxKey maps this to NULL — `ui/castFeedback` owns the 拒絕 cue, and
  // there is nothing in the world to place anyway (payload is {seatId, reason}).
  coinDropRejected: "voiced as silence — ui/castFeedback owns the refusal cue",
};

// ---------------------------------------------------------------------------

function finiteNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function idAt(ev: EventMessage, field: EntityField | null): number | null {
  if (!field) return null;
  return finiteNum(ev.data[field]);
}

/**
 * The event's world position, by the VfxSystem rule.
 *
 * The `x`/`z` branch RETURNS NULL rather than falling through when the payload
 * carries a non-finite coordinate: that is the #131 fix (a NaN position parked a
 * particle emitter off-world and rendered as a stuck bright burst in a screen
 * corner). The audio equivalent would be a NaN reaching a pan AudioParam.
 */
function posFromEvent(
  ev: EventMessage,
  spec: EventSpatialSpec,
  entityPos: (id: number) => { x: number; z: number } | null,
): { x: number; z: number } | null {
  const rawX = ev.data.x;
  const rawZ = ev.data.z;
  if (typeof rawX === "number" && typeof rawZ === "number") {
    return Number.isFinite(rawX) && Number.isFinite(rawZ) ? { x: rawX, z: rawZ } : null;
  }
  for (const field of spec.entityFallback) {
    const id = finiteNum(ev.data[field]);
    if (id === null) continue;
    const p = entityPos(id);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
  }
  return null;
}

/** The entity the sound BELONGS to — first resolvable id in the spec's order. */
export function subjectOf(ev: EventMessage, spec: EventSpatialSpec): number | null {
  for (const field of spec.entityFallback) {
    const id = finiteNum(ev.data[field]);
    if (id !== null) return id;
  }
  return null;
}

/**
 * How the event relates to the local player. `victim` (it landed on you) beats
 * `self` (you did it) beats team membership; anything unresolvable falls to
 * `third`, which is the quiet band — the same deliberate demotion the floating
 * combat text makes rather than guessing (see VfxSystem.relationOf).
 */
export function relationOf(
  ev: EventMessage,
  spec: EventSpatialSpec,
  localEntityId: number | null,
  teamOf: (id: number) => number | null,
): SfxRelation {
  if (localEntityId === null) return "third";
  if (idAt(ev, spec.victimField) === localEntityId) return "victim";
  if (idAt(ev, spec.actorField) === localEntityId) return "self";
  const subject = subjectOf(ev, spec);
  if (subject === null) return "third";
  if (subject === localEntityId) return "self"; // e.g. a cue about your own body
  const mine = teamOf(localEntityId);
  const theirs = teamOf(subject);
  if (mine === null || theirs === null) return "third";
  return mine === theirs ? "ally" : "enemy";
}

/**
 * Event → `SpatialSource`, or **null**.
 *
 * Null means "not spatialised" and has TWO causes the caller must not conflate
 * with each other, nor with `spatialMix` returning null:
 *   • the event type is deliberately centred ({@link CENTRED_EVENTS}) or has no
 *     spec — the sound should still PLAY, centred;
 *   • the position could not be resolved (a mid-spawn entity on its very first
 *     frame) — also play centred rather than dropping the cue, because a missing
 *     hit is a worse failure than an unplaced one.
 * `spatialMix` returning null is the opposite instruction: do not play at all.
 */
export function resolveSpatial(
  ev: EventMessage,
  entityPos: (id: number) => { x: number; z: number } | null,
  localEntityId: number | null,
  teamOf: (id: number) => number | null,
): SpatialSource | null {
  const spec = EVENT_SPATIAL[ev.type];
  if (!spec) return null;
  const pos = posFromEvent(ev, spec, entityPos);
  if (!pos) return null;
  return {
    x: pos.x,
    z: pos.z,
    cls: spec.cls,
    relation: relationOf(ev, spec, localEntityId, teamOf),
  };
}
