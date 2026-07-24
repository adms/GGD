/**
 * audio/spatial — the PURE geometry of the combat sound field. No WebAudio, no
 * Babylon, no AudioContext: world positions in, a `{volume, pan, lowpassHz,
 * priority}` mix out. That is what lets the design be asserted against KNOWN
 * GEOMETRY (a source 6 u to your left yields pan ≈ −0.476) instead of through a
 * mock of the audio graph.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO HRTF PannerNode HERE
 * ---------------------------------------------------------------------------
 * The combat camera (render/CameraRig) is pinned at CAMERA_PITCH_RAD = 68° and
 * its yaw is STRUCTURALLY ZERO — `apply()` places the eye at
 * `(target.x, dolly·sin68, target.z − dolly·cos68)` and there is no yaw term
 * anywhere in the file. Put a listener at that eye with the camera basis and the
 * three dot products for a GROUND source at offset (dx, dz) collapse exactly:
 *
 *     v·right   = dx
 *     v·forward = dolly + 0.3746·dz
 *     v·up      =         0.9272·dz
 *
 * `v·forward` only goes negative at `dz < −dolly/cos68` = −26.7 u at the default
 * (and minimum) dolly of 10, −106 u at dolly 40. A duel zone is 48 u across, so
 * NOTHING IN THE ARENA IS EVER IN THE LISTENER'S REAR HEMISPHERE at any zoom the
 * player can select. The front/back cone-of-confusion that HRTF exists to
 * resolve never arises. What the 68° camera actually does is convert the owner's
 * 前後 into ELEVATION (92.7 % of Δz lands on the up axis) — and elevation is the
 * one cue a generic, non-individualised HRIR renders worst (it lives in
 * listener-specific pinna notches) and the one laptop/TV/phone speakers cannot
 * reproduce at all. An HRTF PannerNode would spend a per-voice partitioned-FFT
 * convolution, 1–2 orders of magnitude more DSP than a StereoPanner, to deliver
 * the cue least likely to survive to the family's ears.
 *
 * So 前後 is rendered DELIBERATELY, as a timbre + level axis on world Z: sources
 * up-screen (away, +Z) get a falling low-pass and a small trim; sources
 * down-screen (toward the viewer) are never filtered. Say it plainly to anyone
 * who asks: on a fixed 68° camera 前後 is a near/far BRIGHTNESS cue, not a
 * behind-your-head cue, and no node graph will deliver the latter.
 *
 * The rejected alternative worth naming: fabricate a ground listener on the
 * champion's facing (`fx`/`fz` are on every snapshot). That makes front/back
 * geometrically real — and makes a sound BEHIND your champion render ABOVE it on
 * screen. On a non-rotating MOBA camera that reads as broken.
 *
 * ---------------------------------------------------------------------------
 * THE SPLIT LISTENER
 * ---------------------------------------------------------------------------
 * Two anchors, not one:
 *   • LEVEL anchor = the local champion's rendered body. "How much does this
 *     matter to me" is a question about where my body is; a camera panned away
 *     must never silence the hit landing on my own champion.
 *   • DIRECTION anchor = camera rig 0's UNSHAKEN target. "Where do I look" is a
 *     question about the frame; screen-left must always be audio-left.
 * Under followLock (all of normal combat) the two are the same point to within
 * the 90 ms follow lerp. They only diverge in free-pan and dead/spectating,
 * which are exactly the two cases where a single anchor is wrong.
 *
 * The direction anchor must come from the camera's `target`, NEVER from the eye
 * or `groundView()`: `apply()` writes the SHAKEN eye into both, and at dolly 10 a
 * SHAKE_SUM_MAX impulse swings the reported yaw by 25.7°. A soundfield lurching
 * 25° on every heavy hit is audible smearing exactly when legibility matters.
 */

// ---------------------------------------------------------------------------
// constants — every one of these is a tuning decision, stated
// ---------------------------------------------------------------------------

/**
 * Hard audibility cutoff for the loudest class, in world units of GROUND
 * distance from the listener's body. Beyond this a sound is NOT PLAYED AT ALL —
 * which is load-bearing, not an optimisation: `playSfx` gates per event key
 * globally (SfxGate), so a fight across the arena that is merely quiet still
 * steals the voice slot from the fight standing on top of you.
 *
 * It is ALSO the cross-zone filter. `apps/game-server/src/net/eventFanout.ts`
 * broadcasts every duel zone to every client unfiltered; the zones are centred
 * 80 u apart with boundaryRadius 24, so the minimum possible cross-zone distance
 * is 32 u. A 30 u cutoff silences the other duel by construction with 2 u of
 * margin, consistently with task #67 (「minimap shows ONLY the player's own duel
 * zone」). Raising this past 32 re-admits three other fights — see the property
 * test in spatial.test.ts, which will go red.
 */
export const SPATIAL_FAR = 30;

/** Pan never reaches ±1: see `panForOffset`. */
export const PAN_MAX = 0.75;
/** Lateral offset (world u) at which tanh has spent ~76 % of its range. */
export const PAN_REF = 8;

/** Δz (world u, away from the viewer) at which the depth tilt saturates. */
export const DEPTH_FULL = 16;
/** Low-pass cutoff at Δz ≤ 0 (i.e. "no filtering"). */
export const DEPTH_FC_NEAR = 20000;
/** Low-pass cutoff at Δz ≥ DEPTH_FULL. */
export const DEPTH_FC_FAR = 1600;
/**
 * Above this cutoff the filter node is SKIPPED entirely (a 15 kHz low-pass on a
 * 44.1 kHz clip is inaudible and still costs a node per one-shot). Corresponds
 * to Δz ≈ 1.82 u — i.e. most of your own melee allocates nothing extra.
 */
export const DEPTH_FILTER_SKIP_HZ = 15000;
/** Level trim at full depth (−3.5 dB). Deliberately small — see `depthTilt`. */
export const DEPTH_GAIN_MIN = 0.67;

/** "focus" = decisive events (hits, casts, knockdowns, explosions). */
export const FOCUS_NEAR = 4;
export const FOCUS_EXP = 1.0;
export const FOCUS_FAR = SPATIAL_FAR;
/** "texture" = chatter (footsteps, swings, windups, flower pops). */
export const TEXTURE_NEAR = 3;
export const TEXTURE_EXP = 1.8;
export const TEXTURE_FAR = 14;

/** Relation ducking. ALWAYS ≤ 1 — the spatial layer never amplifies. */
export const RELATION_GAIN = {
  victim: 1.0,
  self: 1.0,
  enemy: 0.8,
  ally: 0.6,
  third: 0.45,
} as const;

/** Rank band for the priority sort (higher wins the gate slot). */
export const RELATION_RANK = {
  victim: 4,
  self: 3,
  enemy: 2,
  ally: 1,
  third: 0,
} as const;

/**
 * |pan| below which NO StereoPannerNode is built. 0.02 on an equal-power panner
 * is an inter-channel level difference of 0.35 dB — under the ~1 dB JND, and
 * under the channel imbalance of every speaker the family owns. It is worth a
 * threshold rather than a rounding detail because a panner is a NODE PER VOICE
 * on the busiest path in the client, and by `panForOffset` this covers every
 * source within 0.21 u of the camera's ground target: your own body, which is
 * where the highest-rate sound in the game (your footsteps) comes from.
 */
export const PAN_SKIP = 0.02;

/**
 * Suffix that separates the WORLD gate band from the SELF one. NUL can never
 * appear in an authored event name (they are JSON object keys in
 * content/config/audio-map.json, all ASCII identifiers), so a banded gate key
 * can never collide with a real one.
 */
export const GATE_BAND_WORLD = "\u0000world";

/**
 * The SfxGate key a sound should be rate-limited under — the fix for the defect
 * that made this whole feature a net loss on its first build.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY BANDING IS NECESSARY, MEASURED
 * ═══════════════════════════════════════════════════════════════════════════
 * `SfxGate` rate-limits by the EVENT KEY ALONE, with a CROSS-FRAME cooldown:
 * `footstep` is `cooldownMs 170, maxConcurrent 2` for the whole arena. Until
 * remote footsteps existed, exactly one body fed that key and every one of your
 * ~224 steps per minute played.
 *
 * Adding eleven more feeders to the same key does not "share" it — it starves
 * the incumbent. `SpatialSfxQueue` sorts WITHIN one frame's batch, and your step
 * and a stranger's almost never land in the same 16 ms, so the sort cannot
 * defend you: whoever's step arrives while the cooldown is open wins, and with
 * twelve feeders that is usually not you. MEASURED on the real gate over a 60 s
 * walk: 224/224 own steps with nobody near, 48/224 (21 %) with three champions
 * nearby. The feature whose entire purpose is 「不知道是誰放了哪招」 was deleting
 * the one sound you were certain about.
 *
 * So `self`/`victim` — your own body and everything that lands on it — keep the
 * BARE key, i.e. exactly the budget they have today and had before this feature
 * existed. Everyone else competes in a parallel `key\0world` band with its own
 * independent cooldown and voice cap. Three consequences, all wanted:
 *   • nothing that was audible before this feature got quieter — the self band's
 *     gate state is untouched by any number of remote feeders;
 *   • the world band is still CAPPED (it gets one entry's worth of budget, not
 *     eleven), so twelve champions cannot machine-gun the mixer;
 *   • `abilityCast` (cooldown 1200 ms, maxConcurrent 1 — ONE cast per 1.2 s
 *     arena-wide) stops being a lottery your own R can lose. Your cast always
 *     sounds; the enemies share the other slot, and the priority sort decides
 *     which of them gets it.
 */
export function gateKeyFor(key: string, r: SfxRelation): string {
  return r === "self" || r === "victim" ? key : key + GATE_BAND_WORLD;
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/**
 * How aggressively a sound falls off with distance. `focus` carries the events
 * a player must not miss; `texture` is ambience that has to get out of the way
 * fast or 12 bodies of chatter bury the one hit that mattered.
 */
export type SfxClass = "focus" | "texture";

/**
 * How the sound relates to the local player. `victim` = it landed ON you;
 * `self` = YOU did it. Both stay at full level (they are also at distance 0, so
 * the distance curve leaves them alone); everyone else is DUCKED.
 */
export type SfxRelation = "self" | "victim" | "enemy" | "ally" | "third";

export interface SpatialListener {
  /** local champion's rendered body — drives volume + priority. */
  levelX: number;
  levelZ: number;
  /** camera rig 0's UNSHAKEN target — drives pan + low-pass. */
  dirX: number;
  dirZ: number;
}

export interface SpatialSource {
  x: number;
  z: number;
  cls: SfxClass;
  relation: SfxRelation;
}

export interface SpatialMix {
  /** ALWAYS in (0, 1] — feeds SfxPlayOptions.volume. Never amplifies. */
  volume: number;
  /** [-PAN_MAX, PAN_MAX]. */
  pan: number;
  /** null = do NOT create a filter node (near / effectively unfiltered). */
  lowpassHz: number | null;
  /** 0..500; higher wins the SfxGate slot. */
  priority: number;
}

// ---------------------------------------------------------------------------
// per-axis laws (exported individually so each can be pinned by a test)
// ---------------------------------------------------------------------------

function finite(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Lateral offset → stereo pan. World X **is** screen X because the camera's yaw
 * is structurally zero, so this needs no projection matrix and no per-frame
 * camera read beyond `target`.
 *
 * `PAN_MAX·tanh(dx / PAN_REF)` — two deliberate properties:
 *
 * 1. IT IS A LAW IN WORLD UNITS, so the field never breathes. A source parked
 *    7.5 u to your right reads 0.55 whether the player is at dolly 10 or dolly
 *    40. Screen-NDC panning (`render/menu/procedural/math.panFromScreenX`, which
 *    the login dragon uses and should keep using) would swing the entire
 *    soundfield on the mouse wheel.
 * 2. THE SCREEN EDGE IS 0.55, NOT 1.0. At the default zoom the camera frames a
 *    ~15 × 9.4 u patch of a 48 u zone, so most of a 12-body fight is OFF-SCREEN;
 *    the band 0.55 → 0.75 is reserved for "off-screen, that way". If the visible
 *    edge were ±1, everything you cannot see would collapse into two identical
 *    hard-panned blobs — losing direction for exactly the sources that need it
 *    most. And ±1 on an equal-power panner EMPTIES one channel, which reads as
 *    "inside my head" on headphones and destroys the inter-aural level
 *    difference the near/far read rides on. 0.75 gives L≈0.924 / R≈0.383.
 */
export function panForOffset(dx: number): number {
  if (!finite(dx)) return 0;
  return PAN_MAX * Math.tanh(dx / PAN_REF);
}

/**
 * Ground distance → level, per class. GROUND distance from the listener's body,
 * never eye distance: the camera sits 9.27 u above the ground at the CLOSEST
 * zoom, so eye distance is floored by a constant and compresses the whole 48 u
 * arena into 10.0 dB at dolly 10 and 3.2 dB at dolly 40 — i.e. a PannerNode fed
 * real positions gets LESS directional the more the player zooms out to see the
 * teamfight, which is precisely backwards.
 *
 * Worked, because the owner asked it directly — a footstep (texture, authored
 * gain 0.22) at your feet plays at full 0.22, the sound heard today; at 8 u
 * (just off the visible patch) it is −15.3 dB, a scuff that says someone is
 * flanking; at the 14 u cutoff it is GONE. A stranger's footsteps 20 u away are
 * not information anyone can act on — they would only steal the `footstep` gate
 * slot from the flanker who is about to reach you.
 */
export function distanceGain(d: number, cls: SfxClass): number {
  if (!finite(d) || d < 0) return 0;
  const near = cls === "focus" ? FOCUS_NEAR : TEXTURE_NEAR;
  const exp = cls === "focus" ? FOCUS_EXP : TEXTURE_EXP;
  return Math.pow(Math.min(1, near / Math.max(d, 1e-6)), exp);
}

/** The audibility cutoff for a class (ground u). Beyond it: do not play. */
export function farCutoff(cls: SfxClass): number {
  return cls === "focus" ? FOCUS_FAR : TEXTURE_FAR;
}

/**
 * Depth offset (world Z; + is up-screen / away) → the 前後 cue.
 *
 * The cutoff interpolates EXPONENTIALLY (musically) from 20 kHz to 1.6 kHz over
 * 16 u; below DEPTH_FILTER_SKIP_HZ ≈ 1.82 u it returns null so no node is built.
 * Sources at or below the direction anchor (toward the viewer) are NEVER
 * filtered — asymmetry is the whole point, it is what makes the axis readable.
 *
 * WHY THE LEVEL TRIM IS ONLY 3.5 dB when the true eye-distance asymmetry at
 * ±6 u is ~3.0 dB and this delivers only 1.0 dB there: deliberate
 * under-delivery. Level is already fully spent on distance and on relation;
 * spending it a third time on depth makes the depth cue read as a DISTANCE ERROR
 * ("that ult sounded far, but it's on top of me"). The depth information goes in
 * the FILTER, which is orthogonal to everything else in the mix and survives
 * small speakers far better than 3 dB does.
 */
export function depthTilt(dz: number): { gain: number; lowpassHz: number | null } {
  if (!finite(dz) || dz <= 0) return { gain: 1, lowpassHz: null };
  const t = Math.min(dz, DEPTH_FULL) / DEPTH_FULL;
  const fc = DEPTH_FC_NEAR * Math.pow(DEPTH_FC_FAR / DEPTH_FC_NEAR, t);
  const gain = 1 - (1 - DEPTH_GAIN_MIN) * t;
  return { gain, lowpassHz: fc >= DEPTH_FILTER_SKIP_HZ ? null : fc };
}

/**
 * Relation → level. ATTENUATION ONLY, and that is the point.
 *
 * Boosting "your" sounds was the obvious design and it is wrong: `guardBreak` is
 * authored at gain 1.0, `crit`/`knockdown` at 0.95, and `sfxVoiceMultiplier`
 * does not clamp above 1 — a 1.45× self-boost would clip the SFX bus on exactly
 * the loudest, most important events. Ducking everyone else buys the identical
 * RELATIVE legibility with zero headroom risk, and guarantees every existing
 * sound plays at or below today's level, so this feature cannot destabilise a
 * mix the owner has already tuned.
 */
export function relationGain(r: SfxRelation): number {
  return RELATION_GAIN[r] ?? RELATION_GAIN.third;
}

/** Width of one relation band in the priority scale. */
const PRIORITY_BAND = 100;
/**
 * Span of the within-band distance term. STRICTLY LESS THAN `PRIORITY_BAND`, and
 * that gap is the point: at a full-width span the bands touch, so a `victim`
 * event at the 30 u cutoff ties with your own action at 0 u and the tie is
 * broken by arrival order — reintroducing exactly the lottery this sort exists
 * to remove. 90 keeps every band strictly separated (victim 400..490, self
 * 300..390, enemy 200..290, ally 100..190, third 0..90).
 */
const PRIORITY_DISTANCE_SPAN = 90;

/**
 * Priority for the pre-gate sort: relation band first, nearer wins inside a
 * band. This is what actually answers 「不知道誰做了什麼」 — `SfxGate` is keyed on
 * the event string ALONE, so today the winner of a contested slot is whoever's
 * packet was drained first. Sorting the frame's batch by this before emitting
 * makes it whoever matters most, with no change to gate semantics.
 */
export function spatialPriority(r: SfxRelation, d: number): number {
  const rank = RELATION_RANK[r] ?? RELATION_RANK.third;
  const dd = finite(d) ? Math.min(Math.max(d, 0), SPATIAL_FAR) : SPATIAL_FAR;
  return rank * PRIORITY_BAND + PRIORITY_DISTANCE_SPAN * (1 - dd / SPATIAL_FAR);
}

// ---------------------------------------------------------------------------
// the whole mix
// ---------------------------------------------------------------------------

/**
 * The one entry point: listener frame + source → mix, or **null** meaning DO NOT
 * CALL `playSfx` AT ALL (out of range, cross-zone, or a non-finite coordinate).
 * Null is not "silent" — it is "never entered the mixer", which is what keeps a
 * distant fight from consuming the gate slot the near one needs.
 */
export function spatialMix(l: SpatialListener, s: SpatialSource): SpatialMix | null {
  if (!finite(s.x) || !finite(s.z)) return null;
  if (!finite(l.levelX) || !finite(l.levelZ) || !finite(l.dirX) || !finite(l.dirZ)) return null;

  const bx = s.x - l.levelX;
  const bz = s.z - l.levelZ;
  const d = Math.sqrt(bx * bx + bz * bz);
  if (d > farCutoff(s.cls)) return null;

  const dx = s.x - l.dirX;
  const dz = s.z - l.dirZ;
  const depth = depthTilt(dz);

  const volume = distanceGain(d, s.cls) * depth.gain * relationGain(s.relation);
  return {
    // the clamp is belt-and-braces: every factor above is already ≤ 1
    volume: Math.min(1, Math.max(0, volume)),
    pan: panForOffset(dx),
    lowpassHz: depth.lowpassHz,
    priority: spatialPriority(s.relation, d),
  };
}
