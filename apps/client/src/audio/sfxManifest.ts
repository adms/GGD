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
 * Authored-but-not-yet-fired pools (mapFlavor*, the `lab/` settlementReveal /
 * matchEndGong / vsReveal set) are deliberately absent: nothing plays them yet,
 * so preloading them would re-introduce the eager cost this task removes.
 */
import type { AudioScene } from "./types";

/**
 * The always-on core: UI chrome fired from EVERY screen (SfxButton hover/click,
 * text-input type). Warmed once on unlock so the first button never waits on a
 * cold fetch. Kept deliberately tiny — these are the only cues with no single
 * home scene.
 */
export const SFX_CORE: readonly string[] = ["uiClick", "uiHover", "uiHoverCyber", "uiType"];

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
  champSelect: ["champSelectConfirm", "matchStart", ...COUNTDOWN_SFX],
  intermission: [
    "panelOpen",
    "uiCancel",
    "uiDenied",
    "shopPurchase",
    "goldGain",
    "draftConfirm",
    ...COUNTDOWN_SFX,
  ],
  battleStart: [],
  combat: COMBAT_SFX,
  fireRing: COMBAT_SFX,
  settlement: [],
  victory: [],
  defeat: [],
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
