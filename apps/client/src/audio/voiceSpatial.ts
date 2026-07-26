/**
 * audio/voiceSpatial — a champion's SPOKEN line placed in the same sound field
 * its hits already live in (task #259, owner verbatim:
 * 「角色語音、音效這些都要有遠近空間之分，只有自己的才是全播放」).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GAP THIS CLOSES
 * ═══════════════════════════════════════════════════════════════════════════
 * #223 built a complete relation + distance model for voices — `voiceAudience`
 * knows whether the speaker is you, the enemy you are trading blows with, or a
 * stranger, and how far away they are — and then spent all of it on ONE
 * question: 「要不要講」. `voiceProbScale` folded the distance into a probability
 * and `VoiceCandidate` did not even carry x/z, so every line that survived the
 * roll was played by `contextualVoice` at a hard-coded `volume: 1`, dead centre.
 * Twelve champions shouting skill names into the middle of your head.
 *
 * The numbers were all there. They had never become a MIX.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT REUSES `spatial.spatialMix`. THERE IS NO SECOND MODEL HERE
 * ═══════════════════════════════════════════════════════════════════════════
 * Every geometric decision — pan law, depth low-pass, relation ducking, the
 * 30 u cross-zone cutoff — comes from `audio/spatial`, unchanged, because the
 * reasoning in that file's header (why a fixed 68° camera makes 前後 a
 * BRIGHTNESS cue and an HRTF PannerNode the wrong tool) is about the CAMERA,
 * not about what kind of sound is playing. All this module adds is:
 *
 *   1. the `voice` distance CLASS (gentler than `focus` — see spatial.VOICE_*);
 *   2. the audience→relation translation, which is a real type gap, not a cast;
 *   3. the owner's SELF rule, as an early return that never reads the geometry.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT IS NOT ALLOWED TO TOUCH
 * ═══════════════════════════════════════════════════════════════════════════
 * Spatialisation is a PLAYBACK concern. Nothing here may change WHO is eligible
 * to speak: the 1.2 s arena-wide gap, the per-champion gap, the per-category
 * cooldown, the in-flight de-dup and the `probScale` bands are all upstream of
 * this file and stay exactly as the owner tuned them. If a band's line COUNT
 * changes after this feature, that is a bug, not a feature — with one stated
 * exception, `null` (see {@link voiceSpatialMix}), which is the same
 * out-of-range rule the SFX layer has always applied and which #223 already
 * applied to the unrelated bands via `voiceProbScale`.
 */
import {
  PAN_SKIP,
  relationGain,
  spatialMix,
  spatialPriority,
  VOICE_FAR,
  type SfxRelation,
  type SpatialListener,
  type SpatialMix,
} from "./spatial";
import { isNearAudience, type VoiceAudience } from "./voiceAudience";

/**
 * `VoiceAudience` → `SfxRelation`, written out rather than cast.
 *
 * The two enums differ by exactly one member and `voiceAudience`'s header says
 * why they are deliberately not the same type: `SfxRelation` answers "how does
 * this EVENT relate to me" (`victim` = it landed ON me) and `VoiceAudience`
 * answers "how does the champion who would SPEAK relate to me" (`engaged` = the
 * one on the other end of my own fight). For a `hurt` line the speaker IS the
 * victim, so conflating them silently would be right by accident here and wrong
 * the next time someone adds a category.
 *
 * `engaged → victim` is the load-bearing row: `RELATION_GAIN.victim` is 1.0,
 * which is what makes the owner's rule read correctly at the far end —
 * 「只有自己的才是全播放」 for YOUR line, and the enemy you are actually fighting
 * keeps a full relation weight while still being placed and distance-damped.
 */
export function audienceToRelation(a: VoiceAudience): SfxRelation {
  switch (a) {
    case "self":
      return "self";
    case "engaged":
      return "victim";
    case "enemy":
      return "enemy";
    case "ally":
      return "ally";
    default:
      return "third";
  }
}

/**
 * THE OWNER'S RULE, as a value: 「只有自己的才是全播放」.
 *
 * Not a coefficient that happens to land near 1.0 — a mix that is constructed
 * without ever looking at the listener or the source. Volume exactly 1, pan
 * exactly 0 (below `PAN_SKIP`, so `voicePlayOptions` omits the field and
 * `AudioSystem.makeSpatialChain` builds NO StereoPannerNode at all), and no
 * low-pass.
 *
 * WHY IT MUST BE DISTANCE-INDEPENDENT, concretely: the level anchor is the
 * local champion's rendered BODY, but a body can be a long way from where the
 * mix thinks it is for a whole frame — a leap in flight (#247), a dash, a
 * teleport, a reconcile snap, free-pan, the settlement freeze. Feed your own
 * voice through the distance curve and any of those makes YOU quieter than the
 * strangers around you, intermittently, in a way no test that asserts "volume
 * is a number" would ever catch.
 */
export const SELF_VOICE_MIX: Readonly<SpatialMix> = Object.freeze({
  volume: 1,
  pan: 0,
  lowpassHz: null,
  priority: spatialPriority("self", 0),
});

export interface VoiceSpatialInput {
  /** the band `voiceAudience.voiceAudienceOf` scored this line into. */
  audience: VoiceAudience;
  /** the SPEAKER's world position, or null when it was not resolvable. */
  pos: { x: number; z: number } | null;
  /**
   * true when the listener has NO body (dead, spectating, pre-spawn). It is not
   * the same question as "is there a camera": `audioListener` always returns a
   * frame, parking the ear on the camera target, so the geometry stays valid —
   * what is missing is the party the RELATION was measured against.
   */
  spectating?: boolean;
}

/**
 * Listener frame + a would-be voice line → the mix to play it with, or **null**
 * meaning DO NOT PLAY AT ALL.
 *
 * Four rules, in the order they are applied:
 *
 *  1. **`self` is flat and full.** Before any geometry is read. See
 *     {@link SELF_VOICE_MIX}.
 *  2. **No position (or no listener) ⇒ centred, relation-ducked.** A lookup that
 *     missed must never mute a line — the same 「a missing sound is a worse
 *     failure than an unplaced one」 rule `combatSfxSpatial` states. It is still
 *     ≤ 1, because this layer only ever attenuates.
 *  3. **`engaged` is never culled.** `isNearAudience` says your own fight is
 *     about YOU, not about where it happens (#223: 「a sniped enemy 40 u away is
 *     still your kill and must still cry out」), so past the cutoff the speaker
 *     is PULLED IN to the cutoff along the same bearing rather than dropped —
 *     direction preserved, level floored at the 30 u value (0.381).
 *  4. **Everyone else past 30 u is null.** Not "quiet": never played. That is
 *     the cross-zone rule `SPATIAL_FAR` exists for (duel zones are ≥ 32 u
 *     apart), and #223 already applied it to these bands — `voiceProbScale`
 *     returns 0 past `VOICE_FAR`, which drops the candidate before dispatch.
 *     The two cutoffs are the same number by construction.
 *
 * WHILE SPECTATING the relation duck is dropped (not the geometry). With no
 * body of your own, `voiceAudienceOf` demotes literally everyone to `third`, so
 * keeping the 0.45 duck would mute the entire arena at the one moment the
 * player has nothing to do but listen to it. The result is never louder than
 * today's behaviour — today every voice plays flat at 1.0 — it is that same
 * level with distance and direction finally applied to it.
 */
export function voiceSpatialMix(
  listener: SpatialListener | null,
  inp: VoiceSpatialInput,
): SpatialMix | null {
  const relation = audienceToRelation(inp.audience);
  // 1) the owner's rule — no listener read, no source read, no distance.
  if (relation === "self") return SELF_VOICE_MIX;

  // While spectating "how does this relate to me" has no answer, so the duck is
  // not information — the geometry is all that is left, and it must survive.
  const gainRelation: SfxRelation = inp.spectating === true ? "victim" : relation;

  // 2) unresolvable position (or no listener at all): centred, still ducked.
  if (!listener || !inp.pos || !Number.isFinite(inp.pos.x) || !Number.isFinite(inp.pos.z)) {
    return {
      volume: relationGain(gainRelation),
      pan: 0,
      lowpassHz: null,
      priority: spatialPriority(relation, VOICE_FAR),
    };
  }

  const mix = spatialMix(listener, {
    x: inp.pos.x,
    z: inp.pos.z,
    cls: "voice",
    relation: gainRelation,
  });
  if (mix) return mix;

  // 3) out of range. Only the near bands survive it, by being pulled in.
  if (!isNearAudience(inp.audience)) return null; // 4)
  const pulled = pullToCutoff(listener, inp.pos, VOICE_FAR);
  return spatialMix(listener, { x: pulled.x, z: pulled.z, cls: "voice", relation: gainRelation });
}

/**
 * Move a point onto the cutoff circle around the listener's LEVEL anchor,
 * keeping its bearing. Used only for the never-culled `engaged` band, so a duel
 * that somehow spans more than the arena still sounds like it is over there
 * rather than vanishing or jumping to the centre.
 */
function pullToCutoff(
  l: SpatialListener,
  p: { x: number; z: number },
  far: number,
): { x: number; z: number } {
  const dx = p.x - l.levelX;
  const dz = p.z - l.levelZ;
  const d = Math.hypot(dx, dz);
  if (!(d > far)) return p;
  // 0.999 keeps it strictly INSIDE the cutoff: `spatialMix` drops `d > far`, and
  // a float landing exactly on the boundary must not re-enter the null branch.
  const k = (far * 0.999) / d;
  return { x: l.levelX + dx * k, z: l.levelZ + dz * k };
}

/**
 * Mix → the fields `contextualVoice` hands to `AudioSystem.playClip`.
 *
 * Byte-identical in shape to `SpatialSfxQueue.flush`, and for the same reason:
 * a `pan` PRESENT AT ALL is what makes `makeSpatialChain` allocate a
 * StereoPannerNode, so an inaudible pan is OMITTED rather than rounded to zero,
 * and a cutoff above the audible ceiling omits the BiquadFilter. Your own lines
 * therefore cost exactly one node — the same as before this feature existed.
 */
export function voicePlayOptions(mix: SpatialMix): {
  volume: number;
  pan?: number;
  lowpassHz?: number;
} {
  return {
    volume: mix.volume,
    ...(Math.abs(mix.pan) >= PAN_SKIP ? { pan: mix.pan } : {}),
    ...(mix.lowpassHz !== null ? { lowpassHz: mix.lowpassHz } : {}),
  };
}
