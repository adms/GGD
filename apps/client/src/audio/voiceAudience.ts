/**
 * audio/voiceAudience — WHO is allowed to be heard, and HOW LOUDLY the dice are
 * loaded for them (task #223, owner playtest 2026-07-26
 * 「語音綁定似乎沒有落實，例如敵人被我攻擊沒發出受傷或死亡等語音」).
 *
 * THE BUG THIS EXISTS TO FIX. `hurt` / `hurt-heavy` / `defeat` used to be hard
 * gated to `target === localId` in GameApp, so hitting an enemy produced no
 * grunt and killing one produced no death cry — the arena only ever spoke in
 * YOUR voice. That gate was defensible before the anti-pollution layer landed
 * (audio/contextualVoice: in-flight de-dup + global/champ/category throttle);
 * it is not defensible now, because the throttle already caps the channel.
 *
 * WHY A SEPARATE PURE MODULE. GameApp cannot be instantiated headlessly (Babylon
 * engine, sockets, render seam — see GameApp.batch1Wiring.test.ts), so a policy
 * living inside it can only ever be proven by a source scan, which proves a
 * branch EXISTS and not that it FIRES. Everything decidable without a renderer
 * lives here instead and is tested for real behaviour; GameApp keeps only the
 * lookups (seat table, schema, event drain) and a source-scan wiring guard.
 *
 * THE POLICY, in one sentence: widening the audience must not widen the amount
 * of noise, so instead of firing everything we RANK the frame's candidates and
 * let the existing one-voice-per-1.2 s lock spend its slot on the most
 * meaningful one.
 *
 *   (a) SELF     — your own champion reacting. Full probability, top band.
 *   (b) ENGAGED  — the champion on the OTHER end of an event you are part of:
 *                  the enemy you just hit, or the one who just hit you, or the
 *                  one you just killed. This is the band the owner actually
 *                  filed for, and it is nearly full probability because it is
 *                  combat FEEDBACK, not chatter — it tells you your blow landed.
 *   (c) ENEMY / ALLY / THIRD — unrelated champions elsewhere in the arena. Kept
 *                  audible (a teamfight should sound populated) but heavily
 *                  de-weighted AND distance-damped, and dropped outright past
 *                  the same far cutoff the spatial SFX layer uses, so a duel on
 *                  the far side of the map cannot talk over your own.
 *
 * WHY THAT STAYS LEGIBLE WITH 12 BODIES. Three independent limits compose:
 *   1. the arena-wide GLOBAL_MIN_GAP_MS (1.2 s) means at most ~50 voice lines a
 *      minute no matter how many champions exist — widening the audience cannot
 *      change that ceiling, only WHO spends the slot;
 *   2. {@link voicePriority} sorts the frame's candidates before any of them is
 *      handed to the player, so the slot goes to self > engaged > enemy > ally >
 *      third (nearer first inside a band) rather than to whoever's packet was
 *      drained first — the same fix, and the same band layout, that
 *      audio/SpatialSfxQueue applies to combat SFX;
 *   3. {@link voiceProbScale} multiplies the per-category probability, so the
 *      unrelated-champion bands only occasionally take a slot they contest.
 *
 * CLIENT-ONLY, and nothing here imports packages/shared/src/sim.
 */
import { SPATIAL_FAR, VOICE_FAR as SPATIAL_VOICE_FAR } from "./spatial";

/**
 * How a would-be voice line relates to the local player. Deliberately NOT
 * `SfxRelation`: that type answers "how does this EVENT relate to me" (victim /
 * self / …), whereas a voice asks "how does the champion who would SPEAK relate
 * to me" — and for `hurt` the speaker is the victim, i.e. the exact party the
 * SFX axis calls the other side. Keeping the two names separate is what stops
 * the two questions being silently conflated at the call site.
 */
export type VoiceAudience = "self" | "engaged" | "enemy" | "ally" | "third";

/**
 * Probability multiplier per band, applied on top of the category's own `prob`
 * in contextualVoice.policyFor. ALWAYS ≤ 1 — this layer only ever de-weights, so
 * it can never make an existing line more frequent than the tuning the owner
 * already signed off (the same "duck everyone else, never boost yourself"
 * discipline as spatial.RELATION_GAIN).
 */
export const AUDIENCE_PROB_SCALE: Record<VoiceAudience, number> = {
  self: 1,
  // Combat feedback, not chatter: when you land a blow the victim should almost
  // always answer. Slightly under 1 so two enemies you are cleaving do not both
  // fight for the same beat every single time.
  engaged: 0.85,
  // Unrelated champions. An enemy elsewhere is worth more than a teammate
  // elsewhere (it is information about a threat), and an unresolvable team is
  // the quiet band — the same demotion the floating combat text makes.
  enemy: 0.3,
  ally: 0.2,
  third: 0.12,
};

/** Rank band for the pre-dispatch sort (higher wins the global voice slot). */
export const AUDIENCE_RANK: Record<VoiceAudience, number> = {
  self: 4,
  engaged: 3,
  enemy: 2,
  ally: 1,
  third: 0,
};

/**
 * Bands that are never distance-damped or distance-culled. Your own reaction and
 * the reaction of whoever you are fighting are about YOU, not about where they
 * happen: a sniped enemy 40 u away is still your kill and must still cry out.
 */
export function isNearAudience(a: VoiceAudience): boolean {
  return a === "self" || a === "engaged";
}

/**
 * Far cutoff for the unrelated bands. Reuses the spatial layer's own voice
 * cutoff rather than inventing a second distance law, so a voice you can hear is
 * a voice whose hit you could also hear. Beyond it the line is not merely quiet,
 * it is NOT DISPATCHED — which is the point: a dropped candidate cannot contest
 * the global slot at all.
 *
 * #259 made this identity load-bearing rather than incidental: the MIX drops an
 * unrelated speaker past `spatial.VOICE_FAR` and this layer drops the candidate
 * past `VOICE_FAR`. They must be the same number or one of the two silently
 * becomes dead code — see the equality assertion in voiceSpatial.test.ts.
 */
export const VOICE_FAR = SPATIAL_VOICE_FAR;

/** Width of one audience band in the priority scale (mirrors spatial.ts). */
const PRIORITY_BAND = 100;
/**
 * Within-band distance span, strictly less than {@link PRIORITY_BAND} so the
 * bands never touch — a far `engaged` line must still outrank a point-blank
 * `enemy` one, or the sort reintroduces the packet-order lottery it exists to
 * remove. Same 90 the SFX priority uses, for the same reason.
 */
const PRIORITY_DISTANCE_SPAN = 90;

function finite(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (!finite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export interface AudienceInput {
  /** entity whose champion would SPEAK (the victim for hurt, the corpse for defeat). */
  speaker: number;
  /** the other party in the same event (the attacker for hurt, the killer for defeat). */
  counterpart: number | null;
  /** local player's entity id, or null while dead/spectating/pre-spawn. */
  localId: number | null;
  /** team lookup; null for neutrals or before the seat table is up. */
  teamOf: (id: number) => number | null;
}

/**
 * Classify a would-be line. Precedence is speaker-first then counterpart, and
 * that order matters: if you somehow hit yourself, it is `self`, not `engaged`.
 * A null localId (dead / spectating) demotes EVERYTHING to `third` rather than
 * guessing — a spectator hears a quiet, evenly-sampled arena.
 */
export function voiceAudienceOf(inp: AudienceInput): VoiceAudience {
  const { speaker, counterpart, localId, teamOf } = inp;
  if (localId === null || !finite(speaker)) return "third";
  if (speaker === localId) return "self";
  if (counterpart !== null && counterpart === localId) return "engaged";
  const mine = teamOf(localId);
  const theirs = teamOf(speaker);
  if (mine === null || theirs === null) return "third";
  return mine === theirs ? "ally" : "enemy";
}

/**
 * Probability multiplier for a band at a distance, or 0 meaning DO NOT DISPATCH.
 * Zero is not "quiet": a candidate scored 0 is dropped before the player sees
 * it, so it can neither play nor contest the arena-wide gap.
 */
export function voiceProbScale(a: VoiceAudience, distance: number | null): number {
  const base = AUDIENCE_PROB_SCALE[a] ?? AUDIENCE_PROB_SCALE.third;
  if (isNearAudience(a)) return base;
  // Unknown distance (an entity whose transform we could not resolve this frame)
  // is treated as present-but-far rather than dropped, so a lookup miss cannot
  // silently mute a whole band.
  if (distance === null || !finite(distance)) return base * 0.5;
  if (distance > VOICE_FAR) return 0;
  // Linear falloff to the cutoff. Deliberately gentler than the SFX gain curve:
  // this scales a PROBABILITY (how often you hear it at all), not a level, and a
  // sharp curve here would make the mid-field silent rather than sparse.
  return base * (1 - distance / VOICE_FAR);
}

/**
 * Sort key for the frame's candidates: band first, nearer wins inside a band.
 * This is the piece that keeps widening from REGRESSING legibility — without it
 * the 1.2 s global slot goes to whichever packet drained first, so a stranger's
 * grunt could eat the beat your own grunt needed.
 */
export function voicePriority(a: VoiceAudience, distance: number | null): number {
  const rank = AUDIENCE_RANK[a] ?? AUDIENCE_RANK.third;
  const d = distance === null || !finite(distance) ? SPATIAL_FAR : Math.min(Math.max(distance, 0), SPATIAL_FAR);
  return rank * PRIORITY_BAND + PRIORITY_DISTANCE_SPAN * (1 - d / SPATIAL_FAR);
}

/** One resolved voice line waiting for its turn at the global slot. */
export interface VoiceCandidate {
  champId: string;
  category: string;
  audience: VoiceAudience;
  /** multiplies the category probability (0 < scale ≤ 1). */
  probScale: number;
  /** bypasses the global + per-champion gaps (only for once-per-death lines). */
  preempt: boolean;
  /** higher dispatches first within the frame. */
  priority: number;
  /**
   * WHERE THE SPEAKER IS (#259), or null when the position was not resolvable.
   *
   * This is the field whose absence was the whole defect: #223 measured a
   * distance, folded it into `probScale`, and threw the coordinates away — so a
   * complete relation + distance model could only ever answer 「要不要講」 and
   * never 「多大聲、從哪邊來」. It is carried RAW, not pre-mixed, because the
   * listener frame is only current after the camera update (`GameApp.frame`
   * step 5) and this candidate is built during the event drain (step 1).
   */
  pos: { x: number; z: number } | null;
}

/** Fraction of the VICTIM'S OWN max hp that makes a blow a heavy grunt. */
export const HURT_HEAVY_FRACTION = 0.18;

export interface DamageVoiceInput extends AudienceInput {
  /** champion id of the speaker, or null for a mob / guardian / unspawned seat. */
  champId: string | null;
  amount: number;
  /** the VICTIM's max hp — never the local player's (see below). */
  victimMaxHp: number;
  killingBlow: boolean;
  /** victim-to-listener distance in world units, or null when unresolvable. */
  distance: number | null;
  /** victim's world position (#259) — the `damage` packet carries it verbatim. */
  pos?: { x: number; z: number } | null;
}

/**
 * `damage` → the victim's hurt / hurt-heavy line, for ANY champion.
 *
 * The heavy/light split measures the blow against the VICTIM'S own max hp. The
 * old local-only code read `hudStore.localMaxHp`, which is correct exactly while
 * the victim is you and nonsense the moment it is not: judged against your hp
 * pool, a 300-damage chip on a 3000-hp bruiser would scream heavy and the same
 * blow on a squishy would never scream at all.
 *
 * Returns null when there is nothing to say (no champion, no damage, or an
 * out-of-range unrelated body).
 */
export function damageVoiceCandidate(inp: DamageVoiceInput): VoiceCandidate | null {
  if (!inp.champId) return null; // mobs / guardians / flowers have no voice pack
  if (!(inp.amount > 0) && !inp.killingBlow) return null;
  const audience = voiceAudienceOf(inp);
  const probScale = voiceProbScale(audience, inp.distance);
  if (probScale <= 0) return null;
  const maxHp = inp.victimMaxHp > 0 ? inp.victimMaxHp : 0;
  const heavy =
    inp.killingBlow || (maxHp > 0 && inp.amount / maxHp >= HURT_HEAVY_FRACTION);
  return {
    champId: inp.champId,
    category: heavy ? "hurt-heavy" : "hurt",
    audience,
    probScale,
    preempt: false, // a grunt NEVER preempts; only the death cry may
    priority: voicePriority(audience, inp.distance),
    pos: inp.pos ?? null,
  };
}

export interface DeathVoiceInput extends AudienceInput {
  champId: string | null;
  distance: number | null;
  /** corpse's world position (#259), resolved from the authoritative schema. */
  pos?: { x: number; z: number } | null;
}

/**
 * `death` → the dying champion's defeat cry, for ANY champion.
 *
 * PREEMPT for self + engaged. `defeat` is prob 1 / cooldown 0 and self-latching
 * (one death event per death), but it does NOT preempt by default, so with the
 * audience widened it now competes with every grunt in the teamfight for the
 * same 1.2 s slot — and the very kill the owner filed about could go unvoiced.
 * Letting only the two bands that are ABOUT the local player jump the queue
 * costs at most two extra lines per death (yours, and the one you killed) while
 * making the two moments that matter unmissable.
 */
export function deathVoiceCandidate(inp: DeathVoiceInput): VoiceCandidate | null {
  if (!inp.champId) return null;
  const audience = voiceAudienceOf(inp);
  const probScale = voiceProbScale(audience, inp.distance);
  if (probScale <= 0) return null;
  return {
    champId: inp.champId,
    category: "defeat",
    audience,
    probScale,
    preempt: isNearAudience(audience),
    priority: voicePriority(audience, inp.distance),
    pos: inp.pos ?? null,
  };
}

export interface PlainVoiceInput extends AudienceInput {
  champId: string | null;
  category: string;
  /** speaker-to-listener distance in world units, or null when unresolvable. */
  distance: number | null;
  /** speaker's world position (#259). */
  pos?: { x: number; z: number } | null;
}

/**
 * A candidate whose ELIGIBILITY is deliberately unchanged — `probScale` is a
 * hard 1 — that exists only so the line can be PLACED (#259).
 *
 * `skill-name.*`, `crit`/`attack-heavy` and the CC lines used to call
 * `playContextualVoice` inline during the event drain. Two things follow from
 * that, and both are defects the mix cannot fix from where they stood:
 *
 *   1. THE LISTENER IS NOT CURRENT YET. The drain is frame step 1; the camera
 *      moves in step 5. A pan computed inline uses LAST frame's direction anchor
 *      — the exact staleness `SpatialSfxQueue` exists to avoid. Placing them
 *      therefore REQUIRES deferring them to the same post-camera flush.
 *   2. THEY SPENT THE 1.2 s SLOT BEFORE ANYONE WAS RANKED. Firing inline meant a
 *      stranger's skill name, drained early, could take the global slot that
 *      your own hurt line then could not have.
 *
 * WHAT THIS FACTORY MUST NOT DO is change how often they fire. `probScale: 1`
 * and `preempt: false` reproduce today's call exactly (`playContextualVoice
 * (champ, cat)` with no options), so the category's own owner-tuned `prob` and
 * cooldown remain the only things deciding whether the line happens. The only
 * new way one of these can be lost is the geometric one every other sound in the
 * game already obeys: an unrelated speaker more than `VOICE_FAR` away — i.e. the
 * OTHER duel zone, which is ≥ 32 u out and was never meant to be audible.
 */
export function plainVoiceCandidate(inp: PlainVoiceInput): VoiceCandidate | null {
  if (!inp.champId || !inp.category) return null;
  const audience = voiceAudienceOf(inp);
  return {
    champId: inp.champId,
    category: inp.category,
    audience,
    probScale: 1, // UNCHANGED eligibility — see the doc comment
    preempt: false,
    priority: voicePriority(audience, inp.distance),
    pos: inp.pos ?? null,
  };
}

/**
 * Order a frame's candidates for dispatch: highest priority first, and at most
 * ONE candidate per (champion, category) — a champion caught by three
 * simultaneous damage packets says one thing, and the one it says is the one
 * scored highest, not the one that arrived first.
 *
 * Stable for equal priorities (Array.prototype.sort is stable per spec), so a
 * genuine tie keeps arrival order rather than shuffling frame to frame.
 */
export function orderVoiceCandidates(cands: readonly VoiceCandidate[]): VoiceCandidate[] {
  const best = new Map<string, VoiceCandidate>();
  for (const c of cands) {
    const key = `${c.champId}:${c.category}`;
    const prev = best.get(key);
    if (!prev || c.priority > prev.priority) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => b.priority - a.priority);
}
