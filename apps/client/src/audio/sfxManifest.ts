/**
 * audio/sfxManifest — WHICH SFX each scene actually uses, as plain data (task
 * #63).
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM
 * ---------------------------------------------------------------------------
 * Every SFX clip in `config/audio-map.json` (~82 files, ~2.5 MB) used to be
 * fetched+decoded at BOOT (`AudioSystem.prefetchSfx`), while models, champion
 * voices and BGM were already lazy. A player sitting on the login screen paid
 * for the whole combat + settlement + shop SFX set before ever seeing a match.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE FIX
 * ---------------------------------------------------------------------------
 * SFX are loaded PER SCENE instead: a small always-on {@link SFX_CORE} of UI
 * chrome (the click/hover/type cues every screen shares) is warmed once on the
 * autoplay unlock, and each BGM scene declares the cues it needs in
 * {@link SFX_BY_SCENE}, warmed when that scene is entered (see
 * `AudioSystem.preloadSceneSfx`). The scene key is the AudioScene the mixer
 * already switches beds on, so no new "scene" concept is invented.
 *
 * This is a PRELOAD manifest, never a gate: `AudioSystem.playSfx` still resolves
 * any event through the full audio map and lazy-fetches on demand, so a cue that
 * fires before its scene has finished preloading (or one this manifest simply
 * doesn't list) still plays — just with a one-time fetch latency instead of from
 * a warm buffer. Being missing here costs a little latency, never silence.
 *
 * ---------------------------------------------------------------------------
 * HOW THE LISTS WERE DERIVED (not guessed)
 * ---------------------------------------------------------------------------
 * Every event below is one the client actually FIRES, traced to its call site:
 *   • combat/fireRing — `combatSfx.combatSfxKey` outputs (GameApp per-frame
 *     MSG.EVENT drain) + `footstep` (GameApp) + the AudioDirector tally
 *     (kill/multiKill/death/allySlain/levelUp/exUnlock) + `roundStart` (fired on
 *     the intermission→combat edge, so warmed as combat is entered).
 *   • champSelect — champSelectConfirm, the prep countdown (countTick/countFinal),
 *     and `matchStart` (fired on the shell→match edge into champ select).
 *   • intermission — the shop cues (shopFeedback: panelOpen/uiCancel/uiDenied/
 *     shopPurchase/goldGain), the same prep countdown, and `draftConfirm`
 *     (SeatState.offers augment/legendary/gacha rounds arrive during prep).
 *   • menu — the login dragon roar (dragonRoar/dragonRoarBig).
 *
 * The #51 効果音ラボ cues are now FIRED (AudioDirector phase/tally/HP edges +
 * combatSfx `heal`/`rankUp` + the MatchEndPanel reveal). The FREQUENT ones are
 * warmed with the scene they play in — heal / abilityRankUp with `combat`, the
 * entry stingers (vsReveal / matchStartGong) with `champSelect`, and the end
 * stingers (matchEndGong / settlementReveal) with `victory` + `defeat`. The RARE
 * one-shots (lowHealth, levelUpJingle, exUnlockSting) are intentionally NOT
 * preloaded — a once-per-life fetch latency is inaudible on them, and warming
 * them would re-inflate boot.
 *
 * A later pass added the second wave of cues the emit agents fire: buffApply /
 * explosion (previously map-only, no emit source), the death→revive→respawn
 * flow (reviveChannel / reviveComplete / respawn, #84), the arena/market/fire-ring
 * ambience beds (arenaAmbience / fireRingLoop with `combat`, merchantAmbience with
 * `intermission`), the legendary-orb gacha roll (legendaryRoll with `intermission`,
 * #82) and the cross-screen UI chrome (uiTabSwitch / uiToggle in the core). The
 * looping beds among them are flagged in {@link SFX_LOOPABLE}. The per-weapon and
 * per-element lab clips (attack-sword-*, bow/arrow/gunshot, magicBolt,
 * magic-fire/ice/lightning) are BOUND in the audio map so combat can route to
 * them, but left to lazy-load: a champion uses only one or two, so preloading the
 * whole set would re-inflate the very boot cost #63 removes. `castCircle` is the
 * exception and IS warmed with combat — see its note in COMBAT_SFX. Only
 * `mapFlavor*` stays fully absent.
 *
 * `magicBolt` (the caster basic attack, added 2026-07-24) follows the per-weapon
 * rule rather than the `castCircle` exception ON PURPOSE, even though it is the
 * single most-fired weapon clip in the set (22 of 33 ranged champions, plus the
 * ranged default): it is still PER-CHAMPION — a katana champion never loads it —
 * and unlike `castCircle` it decorates nothing the victim must react to, so the
 * one-time fetch latency costs a single early auto, not a dodge window.
 *
 * A third wave added the cues whose emit sites had landed ahead of their clips:
 * the guardian tower's slam + last-hit payout (#89/#105) with `combat`, and the
 * intermission's recess bell (#124) plus the draft-reveal sparkle/jackpot
 * (#110/#82) with `intermission` — the latter two alongside `legendaryRoll`,
 * since `draftReveal.revealSchedule` fires all three from the same offer mount.
 * All five are ONE-SHOTS: none is added to {@link SFX_LOOPABLE}.
 */
import type { AudioScene } from "./types";

/**
 * The always-on core: UI chrome fired from EVERY screen (SfxButton hover/click,
 * text-input type). Warmed once on unlock so the first button never waits on a
 * cold fetch. Kept deliberately tiny — these are the only cues with no single
 * home scene.
 */
export const SFX_CORE: readonly string[] = [
  "uiClick",
  "uiHover",
  "uiHoverCyber",
  "uiType",
  // Cross-screen chrome with no single home scene: the segment/tab switch fired
  // from the shop/codex/settings tab strips and the on/off toggle that lives in
  // the global audio cluster shown on every screen. Both tiny; warmed on unlock.
  "uiTabSwitch",
  "uiToggle",
];

/** The combat sound layer, shared by `combat` and its late-round `fireRing` twin. */
const COMBAT_SFX: readonly string[] = [
  // combatSfxKey outputs (per-frame MSG.EVENT drain)
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
  "block",
  "crit",
  "hit",
  "hitMagic",
  "hitTrue",
  "guardBreak",
  "knockdown",
  "whiff",
  // GameApp local-mover footsteps
  "footstep",
  // AudioDirector discrete tally
  "kill",
  "multiKill",
  "death",
  "allySlain",
  "levelUp",
  "exUnlock",
  // #51 効果音ラボ combat cues now fired here. Only the two that fire OFTEN are
  // warmed: heal (combatSfx `heal` — flower/lifesteal, frequent) and abilityRankUp
  // (combatSfx `rankUp`). The rare one-shots — lowHealth, and the levelUpJingle /
  // exUnlockSting stingers layered under their VO — are left to lazy-load: a
  // once-per-life fetch latency is inaudible on a warning/celebration cue, and
  // preloading them would re-inflate the scene's boot cost this task (#63) removes.
  "heal",
  "abilityRankUp",
  // The two clips that had a map entry but no emit source until this pass now
  // fire in combat (buff-applied status cast + AoE/explosion blast), so warm them
  // here.
  "buffApply",
  "explosion",
  // Death→revive→respawn flow (#84). Deaths and revives happen repeatedly across a
  // match, so warm these with combat rather than paying a fetch on the first one:
  // the revive channel loop starts the instant a teammate steps into the circle,
  // its completion sting fires on the resurrect, and respawn plays on re-entry.
  "reviveChannel",
  "reviveComplete",
  "respawn",
  // Continuous combat beds. arenaAmbience is the arena environment floor that
  // starts with the round; fireRingLoop (#132) is the closing-ring bed that comes
  // in during the fireRing phase — and since fireRing shares this exact combat
  // layer, warming it here covers both. Loop-flagged in SFX_LOOPABLE.
  "arenaAmbience",
  "fireRingLoop",
  // Neutral guardian tower (#89, per-arena faces in #105). Both fire repeatedly
  // across a match — the AoE slam every punish cycle, the payout on every
  // last hit — so they are warmed with combat rather than paying a cold fetch
  // on the first tower fight of the round.
  "guardianSlam",
  "guardianLastHit",
  // 魔法陣 wind-up (combatSfx `castBegin` → castCircle, castTimeSec ≥ 0.5 s).
  // The other lab weapon/element clips stay lazy because they are PER-CHAMPION
  // — a bow champion never loads the katana slash. This one is not: it is
  // keyed on cast LENGTH, so ~a quarter of every champion's abilities in the
  // game reach it, and it is the sound on the cast-telegraph pillar the victim
  // is meant to react to. A cold fetch on the first big cast of the round would
  // land the warning after the window it warns about, so warm it with combat.
  "castCircle",
  // fired on the intermission→combat edge, so warm it as combat begins
  "roundStart",
];

/** The prep-window countdown, shared by champ select and the intermission shop. */
const COUNTDOWN_SFX: readonly string[] = ["countTick", "countFinal"];

/**
 * The SFX each BGM scene warms on entry. A scene not listed here (or listed with
 * an empty set) rides on {@link SFX_CORE} alone; anything else it happens to fire
 * lazy-loads. `fireRing` intentionally mirrors `combat`.
 */
export const SFX_BY_SCENE: Readonly<Record<AudioScene, readonly string[]>> = {
  menu: ["dragonRoar", "dragonRoarBig"],
  menuNocturne: [],
  lobby: [],
  room: [],
  // vsReveal fires on the champ-select entry edge; matchStartGong layers under
  // the matchStart VO on the same shell→match entry (#51).
  champSelect: ["champSelectConfirm", "matchStart", "matchStartGong", "vsReveal", ...COUNTDOWN_SFX],
  intermission: [
    "panelOpen",
    "uiCancel",
    "uiDenied",
    "shopPurchase",
    "goldGain",
    "draftConfirm",
    // legendaryRoll (#82) is the gacha/legendary-orb roll build-up; the
    // augment/legendary/gacha draft rounds arrive during this prep window.
    // merchantAmbience (#38) is the market crowd bed that plays through the
    // intermission scene. Both loop-flagged in SFX_LOOPABLE.
    "legendaryRoll",
    "merchantAmbience",
    // The draft REVEAL cues that ride the same offer panel as legendaryRoll
    // (draftReveal.revealSchedule): a per-card sparkle as each of the three
    // cards flips face-up, and the jackpot flourish a beat after a legendary
    // lands. Warmed here for the same reason legendaryRoll is — the whole
    // schedule fires within ~1.5 s of the offer mounting, so a cold fetch on
    // the first card would land the sparkle after the flip it decorates.
    "draftCardReveal",
    "legendaryWin",
    // recessBell (#124) — the 下課打鐘 school-recess chime rung ONCE as the
    // 中場/備戦 window opens (intermissionAudio.RECESS_BELL). It fires on the
    // scene-entry edge itself, so warming it with the scene is the only way it
    // is ready in time; it is also the heaviest clip in this bucket (~26 s).
    "recessBell",
    ...COUNTDOWN_SFX,
  ],
  battleStart: [],
  combat: COMBAT_SFX,
  fireRing: COMBAT_SFX,
  settlement: [],
  // matchEndGong fires on the → matchEnd phase edge and settlementReveal when the
  // ranking card is revealed; matchEnd resolves the bed to victory/defeat, so warm
  // both stingers with both outcomes (#51).
  victory: ["matchEndGong", "settlementReveal"],
  defeat: ["matchEndGong", "settlementReveal"],
};

/**
 * The SFX events a scene should warm on entry (empty when the scene is unknown
 * or rides on the core alone). Pure lookup — the AudioSystem resolves these to
 * files through the live audio map and dedupes against its buffer cache.
 */
export function sfxEventsForScene(scene: AudioScene | null | undefined): readonly string[] {
  if (!scene) return [];
  return SFX_BY_SCENE[scene] ?? [];
}

/**
 * SFX events whose clip is a LOOPING bed rather than a one-shot, so the emit
 * layer must start it as a sustained voice (`AudioBufferSourceNode.loop = true`)
 * and hold a handle to stop it, instead of the fire-and-forget `playSfx` a
 * transient uses. These are the ambience floors and the two channelled
 * build-ups: the arena/market environment beds, the fire-ring closing bed
 * (#132), the death-revive channel (#84) and the legendary-orb roll (#82).
 *
 * This is metadata for the emit agents ONLY — `sfxManifest` itself just warms
 * buffers; nothing here changes preload. The map entries carry no `loop` field
 * (the `config.audio-map@1` SfxEntry schema is strict and has none — looping is
 * a playback decision, exactly like the BGM beds), so this set is where the
 * loop intent is recorded on the client side.
 */
export const SFX_LOOPABLE: ReadonlySet<string> = new Set([
  "arenaAmbience",
  "merchantAmbience",
  "fireRingLoop",
  "reviveChannel",
  "legendaryRoll",
]);

/** True when an SFX event should be played as a sustained loop (see SFX_LOOPABLE). */
export function isLoopableSfx(event: string): boolean {
  return SFX_LOOPABLE.has(event);
}
