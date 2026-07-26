/**
 * audio/spatialPolicy — the ONE list that says which sounds are allowed to move
 * and which must stay dead centre (task #259).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A TABLE AND NOT A JUDGEMENT AT EACH CALL SITE
 * ═══════════════════════════════════════════════════════════════════════════
 * The boundary is not obvious and it is not local. `coinPickedUp` carries a
 * world x/z and must NEVER be panned (it is the 「你拿到錢了」 scoreboard beat);
 * `crowdCheer` is a world event with no direction at all (the stand is AROUND
 * you); a shop button has a position ON SCREEN which is not a world coordinate.
 * Spread that reasoning across forty call sites and the next UI sound someone
 * adds gets panned by accident — silently, because nothing goes red.
 *
 * So the boundary is DECLARED here, one row per sound, with the reason on the
 * row, and `spatialPolicy.test.ts` proves the table is EXHAUSTIVE against two
 * generated inventories that nobody maintains by hand:
 *   • `sfxReachability.SFX_REACHABILITY` — one row per audio-map SFX key, itself
 *     already pinned to the map's key set by `sfxReachability.test.ts`;
 *   • the champion voice pack manifest's own category list (46 of them).
 * A new sound in either inventory is UNCLASSIFIED and the suite goes red until
 * somebody writes down which side of the line it is on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TEST, IN ONE QUESTION
 * ═══════════════════════════════════════════════════════════════════════════
 *   → Does this sound have a place IN THE WORLD that the player should hunt for
 *     with their ears?
 * BOTH halves are required. A coordinate alone is not enough — that is exactly
 * what `guardianSlain` and `coinPickedUp` prove — and the owner's own rule is
 * the other end of it: 「只有自己的才是全播放」, so anything that is YOURS (your
 * score, your gold, your cooldown, your interface, the ambience wrapped around
 * you) is centred no matter where its coordinate says it happened.
 */
import { CENTRED_EVENTS, EVENT_SPATIAL } from "./combatSfxSpatial";

/**
 * Where a sound is allowed to be placed.
 *
 * `screen` is a real third state, not a hedge: the login dragons are panned from
 * their NDC position on screen (`render/menu/procedural/math.panFromScreenX`)
 * because the login scene has no world listener and the dragon IS a visible
 * object in the frame. It obeys a different law from combat and must not be
 * migrated onto the world engine — nor removed for being "not flat".
 */
export type SpatialPolicy =
  /** placed by world geometry: volume + pan + depth low-pass via audio/spatial. */
  | "world"
  /** the local player's own voice or clock: full level, dead centre, never moved. */
  | "self"
  /** panned by SCREEN position (login scene only — no world listener exists there). */
  | "screen"
  /** chrome / HUD / announcer / ambience: no placement, ever. */
  | "flat";

export interface PolicyRow {
  readonly policy: SpatialPolicy;
  /** why — in one line, and it must survive being read out loud to the owner. */
  readonly reason: string;
}

/**
 * SFX keys that reach `playSfx` from a CLIENT module (UI, HUD, phase edges,
 * tallies) — i.e. everything `sfxReachability` marks `kind: "client"`.
 *
 * Combat-driven keys are NOT in here: they are classified per EVENT TYPE in
 * `combatSfxSpatial` (`EVENT_SPATIAL` = placed, `CENTRED_EVENTS` = deliberately
 * centred, each with its own reason), and the test below checks that side too so
 * the two tables cannot drift into disagreeing.
 */
export const CLIENT_SFX_POLICY: Readonly<Record<string, PolicyRow>> = {
  // ── the one client-side key that IS a world sound ────────────────────────
  footstep: {
    policy: "world",
    reason: "eleven other bodies walk around you; your own step is pushed centred (source null)",
  },

  // ── login scene: screen-space, deliberately its own law ──────────────────
  dragonRoar: { policy: "screen", reason: "login boss is a VISIBLE object; pan from NDC (no world listener on that scene)" },
  dragonRoarBig: { policy: "screen", reason: "the same login dragon law — near/far roar pair" },

  // ── your score / your body / your clock: HUD beats ───────────────────────
  kill: { policy: "flat", reason: "YOUR kill tally — a scoreboard beat, not a place" },
  multiKill: { policy: "flat", reason: "YOUR multi-kill tally — a scoreboard beat" },
  death: { policy: "flat", reason: "YOUR death — the most centred thing that can happen" },
  allySlain: { policy: "flat", reason: "your team's scoreboard, not the corpse's location" },
  levelUp: { policy: "flat", reason: "your own progression, not an event in the world" },
  levelUpJingle: { policy: "flat", reason: "your own progression sting" },
  exUnlock: { policy: "flat", reason: "your own EX becoming available to press" },
  exUnlockSting: { policy: "flat", reason: "your own EX unlock sting" },
  lowHealth: { policy: "flat", reason: "your own hp state — a warning to YOU" },
  respawn: { policy: "flat", reason: "you are back on your feet — the sound is about you" },

  // ── surrounds you / has no direction by nature ───────────────────────────
  crowdCheer: { policy: "flat", reason: "#234 「周圍觀眾歡呼」 — the stand is AROUND you; panning it puts the whole crowd in one ear" },
  crowdCheerBig: { policy: "flat", reason: "the same surrounding crowd, bigger moment" },
  arenaAmbience: { policy: "flat", reason: "arena room tone — it IS the room around you" },
  merchantAmbience: { policy: "flat", reason: "intermission room tone — the shop is around you" },

  // ── broadcast / announcer (the JP system voice) ──────────────────────────
  matchStart: { policy: "flat", reason: "announcer — spoken to you, from nowhere" },
  matchStartGong: { policy: "flat", reason: "broadcast stinger over the whole arena" },
  roundStart: { policy: "flat", reason: "announcer — spoken to you, from nowhere" },
  vsReveal: { policy: "flat", reason: "broadcast presentation, before anyone has a position" },
  matchEndGong: { policy: "flat", reason: "broadcast stinger over the whole arena" },
  champSelectConfirm: { policy: "flat", reason: "champ-select confirm — there is no arena yet" },
  settlementReveal: { policy: "flat", reason: "settlement presentation — the match is already over" },

  // ── countdown ────────────────────────────────────────────────────────────
  countTick: { policy: "flat", reason: "a countdown clock, and the clock is yours" },
  countFinal: { policy: "flat", reason: "the same clock, on its last beat" },

  // ── chrome: buttons, shop, draft ─────────────────────────────────────────
  uiClick: { policy: "flat", reason: "UI has screen position, not world position — judgement test fails at step one" },
  uiHover: { policy: "flat", reason: "UI focus tick — it follows the cursor, not a body" },
  uiHoverCyber: { policy: "flat", reason: "UI focus tick, cyber variant — same argument" },
  uiTabSwitch: { policy: "flat", reason: "UI navigation — a panel change, not a place" },
  uiToggle: { policy: "flat", reason: "UI switch — an answer to YOUR press" },
  uiType: { policy: "flat", reason: "keystroke tick — it happens under your fingers" },
  uiDenied: { policy: "flat", reason: "UI refusal — an answer to YOUR press" },
  uiCancel: { policy: "flat", reason: "UI dismissal — an answer to YOUR press" },
  panelOpen: { policy: "flat", reason: "a panel opening on screen, not in the arena" },
  shopPurchase: { policy: "flat", reason: "shop cards live on screen; a moving buy sound is the fastest way to ruin this feature" },
  goldGain: { policy: "flat", reason: "your wallet ticking up — a HUD beat" },
  draftConfirm: { policy: "flat", reason: "draft UI — the card is on screen, not on the ground" },
  draftCardReveal: { policy: "flat", reason: "draft card flip — screen position is not world position" },
  legendaryRoll: { policy: "flat", reason: "legendary orb roll — a ceremony about your wallet" },
  legendaryWin: { policy: "flat", reason: "legendary orb payout — your reward, centred" },
};

/**
 * Every category in the champion voice pack (`content/assets/audio/voices/
 * champions/MANIFEST.json`), classified.
 *
 * `dispatched: false` means NOTHING in the client fires it today (the dormant
 * half of voice-binding-design.md). Those rows still carry a policy on purpose:
 * the day one of them is wired, the decision is already written down and the
 * wiring cannot quietly default to centre — which is precisely how the whole
 * voice channel ended up unspatialised in the first place.
 */
export interface VoicePolicyRow extends PolicyRow {
  /** does any client code path fire this category today? */
  readonly dispatched: boolean;
}

/** `skill-name.<slot>` is one policy for all five slots (matched by prefix). */
export const SKILL_NAME_PREFIX = "skill-name.";

export const VOICE_CATEGORY_POLICY: Readonly<Record<string, VoicePolicyRow>> = {
  // ── placed: ANY champion may speak these, so they carry a body ───────────
  "hurt": { policy: "world", reason: "#223 fans it out to every victim — 「誰在痛」 is the information", dispatched: true },
  "hurt-heavy": { policy: "world", reason: "same, at the heavy threshold", dispatched: true },
  "defeat": { policy: "world", reason: "#223 — 「誰死了」, and where", dispatched: true },
  "crit": { policy: "world", reason: "spoken by the ATTACKER, who may be anyone on the field", dispatched: true },
  "attack-heavy": { policy: "world", reason: "二擇一 with crit at the same call site, same speaker", dispatched: true },
  "skill-name.q": { policy: "world", reason: "any caster shouts it — twelve of these is the loudest hole in the old build", dispatched: true },
  "skill-name.w": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.e": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.r": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.ex": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "stun": { policy: "world", reason: "the CC edge fires for every champion, including the other duel", dispatched: true },
  "slow": { policy: "world", reason: "same CC edge detector, same fan-out as stun", dispatched: true },
  "bind": { policy: "world", reason: "same CC edge detector, same fan-out as stun", dispatched: true },

  // ── yours: full level, dead centre (owner: 只有自己的才是全播放) ──────────
  "curse": { policy: "self", reason: "LOCAL hard-CC 怒罵 — 二擇一 with stun/bind, only ever your own hero", dispatched: true },
  "block": { policy: "self", reason: "an answer to YOUR guard", dispatched: true },
  "dodge": { policy: "self", reason: "an answer to YOUR evade", dispatched: true },
  "healed": { policy: "self", reason: "your own restore", dispatched: true },
  "attack-light": { policy: "self", reason: "your own windup (owner hard rule: local only)", dispatched: true },
  "sprint": { policy: "self", reason: "your own dash", dispatched: true },
  "hum": { policy: "self", reason: "your own idle", dispatched: true },
  "quote": { policy: "self", reason: "you clicked your own hero / your own settlement card", dispatched: true },
  "select": { policy: "self", reason: "champ-select click — no arena exists yet", dispatched: true },
  "victory": { policy: "self", reason: "your round/match win", dispatched: true },
  "first-blood": { policy: "self", reason: "YOUR first blood (AudioDirector reads your own tally)", dispatched: true },
  "kill-1": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-2": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-3": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-4": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-5": { policy: "self", reason: "your kill streak", dispatched: true },
  "unstoppable": { policy: "self", reason: "your streak", dispatched: true },

  // ── dormant: no dispatch site yet; the decision is pre-made ──────────────
  "knockdown": { policy: "world", reason: "would be spoken by the floored champion", dispatched: false },
  "taunt": { policy: "world", reason: "would be spoken by a champion standing somewhere", dispatched: false },
  "charge": { policy: "world", reason: "would be a champion's own charge-up", dispatched: false },
  "jump": { policy: "world", reason: "#247 leapStart has no sound at all yet; it belongs to a body", dispatched: false },
  "poison": { policy: "world", reason: "status line — same family as stun/slow/bind", dispatched: false },
  "blind": { policy: "world", reason: "status line", dispatched: false },
  "paralyzed": { policy: "world", reason: "status line", dispatched: false },
  "confused": { policy: "world", reason: "status line", dispatched: false },
  "retreat": { policy: "self", reason: "a call YOU make", dispatched: false },
  "free-move": { policy: "self", reason: "your own movement barks", dispatched: false },
  "love": { policy: "self", reason: "emote — yours", dispatched: false },
  "puzzled": { policy: "self", reason: "emote — yours", dispatched: false },
  "thanks": { policy: "self", reason: "emote — yours", dispatched: false },
  "thumbs-up": { policy: "self", reason: "emote — yours", dispatched: false },
  "watch": { policy: "self", reason: "emote — yours", dispatched: false },
  "respond.ok": { policy: "self", reason: "ping response — yours", dispatched: false },
  "respond.no": { policy: "self", reason: "ping response — yours", dispatched: false },
};

/** Policy for a voice category (skill-name.* collapses to one rule). */
export function voicePolicyFor(category: string): VoicePolicyRow | null {
  return VOICE_CATEGORY_POLICY[category] ?? null;
}

/** Is this voice category placed in the world? (false ⇒ centred + full level.) */
export function isWorldVoice(category: string): boolean {
  return voicePolicyFor(category)?.policy === "world";
}

/**
 * Combat SFX event types classified as PLACED, from the table that actually
 * drives the mixer — re-exported here only so the boundary can be enumerated in
 * one place. `combatSfxSpatial` stays the authority.
 */
export function combatEventPolicy(eventType: string): SpatialPolicy | null {
  if (EVENT_SPATIAL[eventType]) return "world";
  if (CENTRED_EVENTS[eventType]) return "flat";
  return null;
}
