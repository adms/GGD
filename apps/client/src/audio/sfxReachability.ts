/**
 * audio/sfxReachability — WHICH SFX keys some code path can actually play.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT DEFECT THIS EXISTS TO CLOSE (audit class S10)
 * ---------------------------------------------------------------------------
 * The 版權聲明 page states, per 効果音ラボ clip, whether the clip is 「使用中」—
 * whether the game will actually play it. Until now that claim was computed from
 * `content/config/audio-map.json` alone: a clip counted as BOUND when the map
 * gave it an event key. But an audio-map entry is only half a binding. A key
 * plays a sound iff:
 *
 *   1. the map resolves the key to a file (audio-map.json), AND
 *   2. some client code path calls `playSfx` with that key, AND
 *   3. for a key driven by a sim event, that event actually crosses the wire —
 *      i.e. it is in `FANNED_OUT_EVENT_TYPES` (apps/game-server/src/net/
 *      eventFanout.ts), AND the payload fields the routing reads are on it.
 *
 * Condition 1 alone was being reported as all three, so the page claimed clips
 * were audible that no code could reach — including three (arrowRelease /
 * arrowPierce / castCircle) that had a map entry and no emit site at all, and a
 * further five whose sim event was silently filtered out by the fan-out
 * whitelist. The page was measuring itself: the denominator (the map) was
 * produced by the same lane as the claim.
 *
 * That matters beyond a wrong number. The 効果音ラボ clips ship under a STANDING
 * authorisation from the project owner whose one condition is that every clip is
 * properly listed on the attribution page. A ledger that misstates its own
 * contents is exactly the thing that authorisation depends on being true.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------
 * One row per audio-map SFX key, each row carrying WHERE the key is played (and
 * for event-driven keys, WHICH sim events and payload fields it rides), or an
 * explicit reason it cannot sound. {@link PLAYABLE_SFX_KEYS} is the derived set,
 * and `ui/platform/sfxLabCredits` computes its `boundKeys` as
 * `mapKeys ∩ PLAYABLE_SFX_KEYS` — nobody hand-maintains an "is it wired" list
 * any more.
 *
 * ---------------------------------------------------------------------------
 * WHY A DECLARED REGISTRY RATHER THAN STATIC ANALYSIS
 * ---------------------------------------------------------------------------
 * Keys reach `playSfx` through pure mappers (`combatSfx.combatSfxKey`,
 * `sfxEdges.diffTally`, `draftReveal.revealSchedule`, `countdownCue.stepCountdown`),
 * so "does anything play X" is not answerable by looking at the call sites — the
 * call sites all pass a variable. So the claim is DECLARED here and PROVEN by
 * `sfxReachability.test.ts`, which anchors every row to files on disk:
 *
 *   • the row set must equal the audio map's key set exactly — a key added to
 *     the map is unclassified, and the test goes red rather than the page
 *     quietly counting it either way;
 *   • every `site` must exist and contain the key as a literal, so deleting or
 *     renaming an emit site turns the page red instead of leaving a stale claim;
 *   • every `events` name must be in the game-server's `FANNED_OUT_EVENT_TYPES`,
 *     which is what the original 19 silent keys actually tripped on;
 *   • every `payload` field must appear at the sim emit site for that event.
 *
 * THE ASYMMETRY IS DELIBERATE. The positive claim ("this clip is audible") is
 * the one the page makes and the one the owner's condition rests on, so it is
 * machine-proven. The negative claim ("shipped but not wired") only has to carry
 * a stated `reason`: it understates, and a false negative costs a clip an
 * unearned 「收錄未啟用」 badge rather than an unearned credit.
 */

/** How an SFX key reaches `AudioSystem.playSfx`. */
export type SfxReachKind =
  /** Played from a client module directly (UI, HUD, phase edges, tallies). */
  | "client"
  /** Played by the per-frame combat drain — needs its sim event on the wire. */
  | "combat"
  /** Nothing can play it today; `reason` says why. */
  | "unreachable";

export interface SfxReachRow {
  /** The audio-map SFX key. */
  readonly key: string;
  readonly kind: SfxReachKind;
  /**
   * Repo-relative file that decides this key. For `combat` rows this is always
   * `combatSfx.ts` (the whole decision lives there); for `client` rows it is the
   * module that names the key, which may be a pure mapper rather than the
   * `playSfx` caller itself. Required for `client`/`combat`, absent otherwise.
   */
  readonly site?: string;
  /**
   * Sim events the key rides. EVERY name here must be fanned out, or the cue is
   * silent in a real match no matter how correct the client code is.
   */
  readonly events?: readonly string[];
  /**
   * Payload fields the routing reads, PER EVENT — `{ basicAttack: ["weaponClass"] }`.
   * Keyed by event because a multi-event join reads a different field from each
   * leg, and each field must exist at that event's own sim emit site. A payload
   * field that quietly disappears is the second way a "wired" cue goes silent:
   * the event still arrives, the routing just never recognises it.
   */
  readonly payload?: Readonly<Record<string, readonly string[]>>;
  /** Why it cannot sound (`unreachable` only) — never blank. */
  readonly reason?: string;
  /** Optional prose for a row that needs it. */
  readonly note?: string;
}

const COMBAT_SFX_SITE = "apps/client/src/audio/combatSfx.ts";
/** 特效自帶音效的**決定點是 config**，⛔ 不是某一支 .ts —— 見下面那一批。 */
const VFX_SOUND_SITE = "content/config/vfx-families.json";
const AUDIO_DIRECTOR = "apps/client/src/ui/AudioDirector.tsx";
const SHOP_FEEDBACK = "apps/client/src/ui/panels/shopFeedback.ts";
const BUTTON_SFX = "apps/client/src/ui/buttonSfx.ts";
const DRAFT_REVEAL = "apps/client/src/ui/panels/draftReveal.ts";
const INTERMISSION_AUDIO = "apps/client/src/render/intermission/intermissionAudio.ts";

/** One row per key in `content/config/audio-map.json`'s `sfx` block. */
export const SFX_REACHABILITY: readonly SfxReachRow[] = [
  // ── per-frame combat layer (combatSfx.combatSfxKey) ──────────────────────
  { key: "attackWindup", kind: "combat", site: COMBAT_SFX_SITE, events: ["attackWindup"] },
  { key: "basicAttack", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"] },
  // Per-weapon slashes: the class is stamped on the event, so a missing/unknown
  // `weaponClass` falls back to the generic `basicAttack` clip above.
  { key: "attackSword1", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass"] } },
  { key: "attackSword2", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass", "crit"] } },
  { key: "attackGreatsword", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass"] } },
  { key: "attackKatana", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass"] } },
  { key: "bowDraw", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass"] } },
  { key: "gunshot", kind: "combat", site: COMBAT_SFX_SITE, events: ["basicAttack"], payload: { basicAttack: ["weaponClass"] } },
  {
    key: "magicBolt",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["basicAttack"],
    payload: { basicAttack: ["weaponClass"] },
    // The caster auto. Reachable BOTH ways on purpose: 21 champion docs carry the
    // `magic` tag, AND it is the ranged default in weaponClassOf — so a mage can
    // never fall back to a bow draw again, tagged or not.
    note: "weaponClass 'magic' — replaces the bow draw every caster used to get.",
  },
  { key: "projectileSpawn", kind: "combat", site: COMBAT_SFX_SITE, events: ["projectileSpawn"] },
  {
    key: "arrowRelease",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    // TWO events, joined client-side: the sim never labels a projectile as an
    // arrow, so the `weaponClass` on the preceding `basicAttack` arms the join
    // and the adjacent `projectileSpawn` consumes it. Both must cross the wire.
    events: ["basicAttack", "projectileSpawn"],
    payload: { basicAttack: ["weaponClass"], projectileSpawn: ["projectileId"] },
    note: "REPLACES the generic launch for a bow auto — not an added voice.",
  },
  {
    key: "arrowPierce",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    // Rides `basicAttackHit`, NOT `projectileHit`: ProjectileSystem routes
    // basic-attack missiles to the former, so the latter would never fire.
    events: ["basicAttack", "projectileSpawn", "basicAttackHit"],
    payload: {
      basicAttack: ["weaponClass"],
      projectileSpawn: ["projectileId"],
      // the arrival carries the missile id the spawn registered
      basicAttackHit: ["id"],
    },
  },
  { key: "projectileHit", kind: "combat", site: COMBAT_SFX_SITE, events: ["projectileHit"] },
  { key: "castBegin", kind: "combat", site: COMBAT_SFX_SITE, events: ["castBegin"] },
  {
    key: "castCircle",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["castBegin"],
    payload: { castBegin: ["castTimeSec"] },
    note: "REPLACES the generic castBegin tick on a long wind-up (≥0.5 s).",
  },
  { key: "castEnd", kind: "combat", site: COMBAT_SFX_SITE, events: ["castEnd"] },
  { key: "castInterrupt", kind: "combat", site: COMBAT_SFX_SITE, events: ["castInterrupt"] },
  { key: "abilityCast", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"] },
  // Per-ability WC3 cast voices: content `ability@1.sfxKey` rides the
  // `abilityCast` event and REPLACES the element/generic cast voice for that
  // one cast (combatSfx.wc3CastKey — specific beats generic, not a new voice).
  { key: "wc3.moongo", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.moonjump", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.nocute", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  // The stock-MPQ wave of the same surface (combatSfx.WC3_OVERLAY_ABILITY_SFX).
  // Same ride, one extra gate: the clips are Blizzard-owned and live in the
  // dev-only assets/blizzard-local/ mount, so combatSfx.wc3CastKey answers these
  // keys only on full-asset builds (config/fullAssets) — a public bundle routes
  // the cast to the element/generic voice instead of a URL prod never serves.
  { key: "wc3.akamapissed8", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.altarofelderswhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.axemissilelaunch1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.chickenwhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.darksummoninglaunch1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.defendcaster", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.demonhuntermissilehit3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.dragonroostwhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.dragonyes2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.druidofthetalonmissilelaunch2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.eggsackdeath1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.flaretarget2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.flaretarget3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.gluescreenmeteorhit1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.gruntpissed3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.gruntyesattack1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.gruntyesattack3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.hcancelbuilding", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.headhunteryes4", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.kaelyesattack3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.markofchaos", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.mercenarywhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.mortarimpact", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.mortarteampissed9", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.nazgrelyes2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.necropolisupgrade2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.pandarenbrewmasterpissed8", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.pandarenbrewmasterwarcry1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.pandarenbrewmasteryes1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.parasite", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.peasantpissed3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.peondeath", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.rokhanwhat2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.sealwhat2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.shadowhunterready1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.shamanready1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.snapdragonmissilelaunch1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.soulgem", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.soulpreservation", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.spellbreakerpissed4", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.spiritofvengeanceyes3", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.stampedecaster1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.taunt", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.thunderboltmissiledeath", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.thunderclapcaster", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.treantready1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.trollbatriderpissed2", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.trollwoodworkswhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "wc3.waygatewhat1", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["sfxKey"] } },
  { key: "magicFire", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["vfxKey"] } },
  { key: "magicIce", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["vfxKey"] } },
  { key: "magicLightning", kind: "combat", site: COMBAT_SFX_SITE, events: ["abilityCast"], payload: { abilityCast: ["vfxKey"] } },
  { key: "hit", kind: "combat", site: COMBAT_SFX_SITE, events: ["damage"] },
  { key: "hitMagic", kind: "combat", site: COMBAT_SFX_SITE, events: ["damage"], payload: { damage: ["dmgType"] } },
  { key: "hitTrue", kind: "combat", site: COMBAT_SFX_SITE, events: ["damage"], payload: { damage: ["dmgType"] } },
  { key: "block", kind: "combat", site: COMBAT_SFX_SITE, events: ["damage"], payload: { damage: ["blocked"] } },
  { key: "crit", kind: "combat", site: COMBAT_SFX_SITE, events: ["damage"], payload: { damage: ["crit"] } },
  { key: "guardBreak", kind: "combat", site: COMBAT_SFX_SITE, events: ["guardBreak"] },
  { key: "knockdown", kind: "combat", site: COMBAT_SFX_SITE, events: ["knockdown"] },
  { key: "whiff", kind: "combat", site: COMBAT_SFX_SITE, events: ["whiff"] },
  { key: "flowerSpawn", kind: "combat", site: COMBAT_SFX_SITE, events: ["flowerSpawn"] },
  { key: "flowerBurst", kind: "combat", site: COMBAT_SFX_SITE, events: ["flowerBurst"] },
  { key: "heal", kind: "combat", site: COMBAT_SFX_SITE, events: ["heal"] },
  {
    key: "buffApply",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    // ⭐ GH#406 —— 第二個乘客：44-002 交換筆記本的 `resourceSwap`。這一列必須
    // 記下來，因為 `events` 是這份登錄表唯一在證明的東西（每一個名字都得在
    // `FANNED_OUT_EVENT_TYPES` 裡），而一個沒有列出來的乘客等於一個沒有被驗過的
    // 「這顆事件真的過得了線」宣稱。
    events: ["buffApply", "resourceSwap"],
  },
  { key: "explosion", kind: "combat", site: COMBAT_SFX_SITE, events: ["explosion"] },
  { key: "reviveChannel", kind: "combat", site: COMBAT_SFX_SITE, events: ["reviveChannel"] },
  { key: "reviveComplete", kind: "combat", site: COMBAT_SFX_SITE, events: ["reviveComplete"] },
  { key: "abilityRankUp", kind: "combat", site: COMBAT_SFX_SITE, events: ["rankUp"] },
  { key: "fireRingLoop", kind: "combat", site: COMBAT_SFX_SITE, events: ["fireRingStart"] },
  { key: "guardianSlam", kind: "combat", site: COMBAT_SFX_SITE, events: ["guardianImpact"] },
  {
    key: "guardianLastHit",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["guardianSlain"],
    payload: { guardianSlain: ["killerSeatId", "gold"] },
    note: "Seat-gated: only the client that landed the last hit and was paid.",
  },
  // 陣亡投幣 (task #191). Two NEW keys rather than a second population of
  // `goldGain`/`guardianLastHit`: `SfxGate`'s cooldown is cross-frame and keyed
  // on the string, so pouring combat traffic into the shop's key would starve
  // the purchase cue for 300 ms every time somebody threw a coin.
  {
    key: "coinPickup",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["coinPickedUp"],
    payload: { coinPickedUp: ["seatId", "value"] },
    note: "Seat-gated: only the client whose champion actually banked the coin.",
  },
  { key: "coinDrop", kind: "combat", site: COMBAT_SFX_SITE, events: ["coinDropped"], payload: { coinDropped: ["seatId", "x", "z"] } },
  // 殭屍王 (#262 / GH #190). The owner asked for these two by LENGTH — a 3-5 s
  // horror cue on the summon and a 5-7 s 中獎 fanfare on the payout — and both
  // are new PROCEDURAL clips (content/assets/audio/sfx/fx/boss-*.mp3), not
  // 効果音ラボ downloads, so they are own work and carry no attribution row.
  //
  // The `payload` fields below are what makes these rows worth anything: both
  // cues are GATED, and a gate reading a field the sim stopped emitting fails
  // CLOSED — the cue simply never plays, with no error anywhere. `zone` is what
  // keeps the horror drone out of the other arena's ears, and `shares` is what
  // limits the jackpot to champions who were actually paid.
  {
    key: "bossHorror",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["mobBossSpawn"],
    payload: { mobBossSpawn: ["zone"] },
    note: "Zone-gated: only the duel the king was summoned into (combatSfx.bossHorrorKey).",
  },
  {
    key: "bossJackpot",
    kind: "combat",
    site: COMBAT_SFX_SITE,
    events: ["mobBossSlain"],
    payload: { mobBossSlain: ["shares"] },
    note: "Paid-gated: only clients whose seat appears in shares[] with gold/xp (combatSfx.bossJackpotKey).",
  },

  // ── client-side emit sites ───────────────────────────────────────────────
  { key: "footstep", kind: "client", site: "apps/client/src/GameApp.ts" },
  // The consolidated K/D/level tally. `diffTally` names the keys; AudioDirector
  // is the imperative shell that plays whatever it returns.
  { key: "kill", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  { key: "multiKill", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  { key: "death", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  { key: "allySlain", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  { key: "levelUp", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  { key: "exUnlock", kind: "client", site: "apps/client/src/audio/sfxEdges.ts" },
  // 周圍觀眾歡呼 on a LOCAL kill (#234). The tier and the per-call volume are
  // decided by the pure `crowdCheer` — which is why the key literals live there
  // and not in the AudioDirector shell that calls playSfx with them.
  { key: "crowdCheer", kind: "client", site: "apps/client/src/audio/crowdCheer.ts" },
  { key: "crowdCheerBig", kind: "client", site: "apps/client/src/audio/crowdCheer.ts" },
  { key: "levelUpJingle", kind: "client", site: AUDIO_DIRECTOR },
  { key: "exUnlockSting", kind: "client", site: AUDIO_DIRECTOR },
  { key: "lowHealth", kind: "client", site: AUDIO_DIRECTOR },
  { key: "matchStart", kind: "client", site: AUDIO_DIRECTOR },
  { key: "matchStartGong", kind: "client", site: AUDIO_DIRECTOR },
  { key: "roundStart", kind: "client", site: AUDIO_DIRECTOR },
  { key: "arenaAmbience", kind: "client", site: AUDIO_DIRECTOR },
  { key: "respawn", kind: "client", site: AUDIO_DIRECTOR },
  { key: "vsReveal", kind: "client", site: AUDIO_DIRECTOR },
  { key: "matchEndGong", kind: "client", site: AUDIO_DIRECTOR },
  { key: "champSelectConfirm", kind: "client", site: AUDIO_DIRECTOR },
  { key: "countTick", kind: "client", site: "apps/client/src/audio/countdownCue.ts" },
  { key: "countFinal", kind: "client", site: "apps/client/src/audio/countdownCue.ts" },
  { key: "dragonRoar", kind: "client", site: "apps/client/src/render/menu/roarSfx.ts" },
  { key: "dragonRoarBig", kind: "client", site: "apps/client/src/render/menu/roarSfx.ts" },
  { key: "uiClick", kind: "client", site: BUTTON_SFX },
  { key: "uiHover", kind: "client", site: BUTTON_SFX },
  { key: "uiHoverCyber", kind: "client", site: BUTTON_SFX },
  { key: "uiTabSwitch", kind: "client", site: BUTTON_SFX },
  { key: "uiToggle", kind: "client", site: BUTTON_SFX },
  { key: "uiType", kind: "client", site: "apps/client/src/ui/platform/AuthScreen.tsx" },
  { key: "uiDenied", kind: "client", site: SHOP_FEEDBACK, note: "Also the ability bar's refusal cue (ui/abilityCue, ui/castFeedback)." },
  { key: "uiCancel", kind: "client", site: SHOP_FEEDBACK },
  { key: "panelOpen", kind: "client", site: SHOP_FEEDBACK },
  { key: "shopPurchase", kind: "client", site: SHOP_FEEDBACK },
  { key: "goldGain", kind: "client", site: SHOP_FEEDBACK },
  { key: "settlementReveal", kind: "client", site: "apps/client/src/ui/panels/MatchEndPanel.tsx" },
  { key: "draftConfirm", kind: "client", site: "apps/client/src/ui/panels/AugmentDraftPanel.tsx" },
  { key: "draftCardReveal", kind: "client", site: DRAFT_REVEAL },
  { key: "legendaryRoll", kind: "client", site: DRAFT_REVEAL },
  { key: "legendaryWin", kind: "client", site: DRAFT_REVEAL },
  { key: "merchantAmbience", kind: "client", site: INTERMISSION_AUDIO },

  // ── cannot sound today ───────────────────────────────────────────────────
  // SHADOWED: the event arrives, but the routing deliberately answers with a
  // different key, so the map entry under the event's own name is dead weight.
  {
    key: "damage",
    kind: "unreachable",
    reason:
      "Shadowed. combatSfxKey routes the `damage` event to hit / hitMagic / hitTrue / block / crit — the type-differentiated hit voice — and never returns the bare key.",
  },
  {
    key: "basicAttackHit",
    kind: "unreachable",
    reason:
      "Shadowed on purpose. `damage` owns the single hit voice, so sounding basicAttackHit too would double-thud; the case returns arrowPierce for a tracked arrow, otherwise silence.",
  },
  // #3-ERA ORPHANS: authored for a hit-weight model that was replaced by the
  // damage-driven hit voice. No caller anywhere in the client.
  {
    key: "hit-light",
    kind: "unreachable",
    reason: "#3-era orphan: the weight-tiered hit model was replaced by the dmgType-driven hit / hitMagic / hitTrue voice. No caller.",
  },
  {
    key: "hit-medium",
    kind: "unreachable",
    reason: "#3-era orphan: superseded by the dmgType-driven hit voice. No caller.",
  },
  {
    key: "hit-heavy",
    kind: "unreachable",
    reason: "#3-era orphan: superseded by the dmgType-driven hit voice. No caller.",
  },
  {
    key: "hit-crit",
    kind: "unreachable",
    reason: "#3-era orphan: the `crit` key superseded it. No caller.",
  },
  {
    key: "block-hit",
    kind: "unreachable",
    reason:
      "#3-era orphan as a KEY — though its FILE is not orphaned: block-hit.mp3 is the second clip in the `block` entry's pool, so the sound still ships and still plays, just never under this name.",
  },
  // NOTE — `recessBell` used to sit in this file as a `client` row. It is not
  // here in EITHER bucket any more, and that is correct: #190 withdrew the emit
  // (「商店音樂播放 BGM 就好，不要變成鐘聲」) AND dropped the audio-map entry,
  // because sfxLabCredits' "no clip is mapped but silent" alarm says in so many
  // words to wire the cue or drop the map entry and never to relax the rule.
  // This file's row set must EQUAL the map's key set, so an unmapped key must
  // have no row. The clip still ships and stays on the 版權聲明 page as 備而未用,
  // exactly like block-clash / block-shield / impact-heavy.
  //
  // AUTHORED, WAITING ON A UI SEAM (see audio/types.ts).
  {
    key: "taunt",
    kind: "unreachable",
    reason:
      "No caller. The victory taunt VO that finally shipped (#93) plays through audio/victoryTaunt off content/config/victory-taunts.json with its own element, not this map key.",
  },
  {
    key: "mapFlavorIntro",
    kind: "unreachable",
    reason:
      "Opt-in 地圖原聲 pool (#40): authored and test-covered but deliberately not fired — it needs the settings toggle that gates the map's zh announcer quips.",
  },
  {
    key: "mapFlavorAnnounce",
    kind: "unreachable",
    reason: "Opt-in 地圖原聲 pool (#40): same settings toggle as mapFlavorIntro. Not fired.",
  },

  // ── GH#390/#402 —— **特效自帶**的音效 ─────────────────────────────────────
  // ⚠️ 這一批走的是**另一條路**，⛔ 不是 combatSfx 的 `sfxKey`：
  // `families[].soundLaunch / soundImpact` → `vfxSoundLayer.cue()` →
  // `GameApp.pushVfxSound()`。同一顆 abilityCast 兩條路都會出聲，那是原作的樣子。
  // 決定它的檔案是 **config**（⛔ 不是某一支 .ts），所以 site 指向那份 config ——
  // 後台把綁定拿掉，這一列就會紅。
  { key: "wc3.blademasterwhirlwind", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.blinkbirth1", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.coldarrow1", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.flaretarget1", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.flashback1second", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.fountainoflifewhat1", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.gluescreenmeteorhit2", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.gruntwhat2", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.invisibilitytarget", kind: "combat", site: VFX_SOUND_SITE, events: ["abilityCast"], payload: { abilityCast: ["abilityId", "caster"] } },
  { key: "wc3.keeperofthegrovemissilehit1", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.shimmeringportaldeath", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.stasistotem", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.wandofneutralization", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.waterelementalmissile3", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  { key: "wc3.witchdoctorcastattack1", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },
  // GH#439 —— `shockwaveRing` 家族的**落地那一下**（原作 `Units\Orc\Tauren\Warstomp.wav`）。
  // ⭐ 綁在 `families[]` 上,所以它替**整個家族**出聲(出貨 91 筆綁定,其中 66 筆原本
  // 指向 `warstompcaster`),⛔ 不是逐支技能各填一次。
  { key: "wc3.warstomp", kind: "combat", site: VFX_SOUND_SITE, events: ["damage", "projectileHit"], payload: { damage: ["origin"], projectileHit: ["origin"] } },

  // ⚠️ **收錄了但沒有人引用**的 68 個。owner 2026-08-19 把 133 個原作音效搬進版控
  // （出處帳本 `content/assets/audio/wc3/PROVENANCE.md`），其中 mdx `SNDx` 事件軌
  // 那一批只有一部分被 `vfx-families.json` 綁上去。⛔ 這裡**不可以**寫成 combat ——
  // 那會讓 credits 頁替一個永遠不響的 clip 掛上「已啟用」。GH#436 追這件事。
  { key: "wc3.ancestralspirit", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.archerdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.banditdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.bloodelfsorcerordeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.bloodlusttarget", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.brewmasterdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.buildingdeathlargehuman", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.catapultmissile1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.catapultmissile2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.catapultmissile3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.catapultmissile4", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.coldarrow2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.coldarrow3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.criticalstrike", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.crushingwavecaster1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.deathcoilmissilelaunch1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.dispelmagictarget", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.fanofknives", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.farmwhat1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.farseermissile", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.feralspirittarget1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.fireballmissilelaunch1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.fireballmissilelaunch2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.fireballmissilelaunch3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.flamestrikebirth1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.footmandeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.furbolgdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.healtarget", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.heroblademasterattack1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.heroblademasterattack2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.heroblademasterdeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.herodeathknightattack1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.herodeathknightdeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.herodemonhunterdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.heropaladindeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.holybolt", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.humandissipate1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.infernalbirth1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.irongolemattack1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.irongolemdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.jainaonfootdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.keeperofthegrovemissilehit2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.keeperofthegrovemissilehit3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.keeperofthegrovemissilelaunch1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.keeperofthegrovemissilelaunch2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.keeperofthegrovemissilelaunch3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.knightnoriderdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.meatwagonmissilehit1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.nagabuildingcancel", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.nightelfdissipate1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.orcdissipate1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.peasantdeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.peonwhat2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.priestdeath", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.reincarnation", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.shockwave", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.step1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.step2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.step3", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.step4", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.succubusdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.tuskarrdeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.undeaddissipate2", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.villagerchilddeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.villagermaledeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.wardenattackeffort1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
  { key: "wc3.wardendeath1", kind: "unreachable", reason: "收錄在 audio-map 與出處帳本裡，但 content/ 沒有任何一支技能或特效家族綁到它（GH#436）" },
];

/** Rows by key — the lookup the derivations and the test both use. */
export const SFX_REACH_BY_KEY: ReadonlyMap<string, SfxReachRow> = new Map(
  SFX_REACHABILITY.map((r) => [r.key, r]),
);

/**
 * The SFX keys some code path can actually play. This — NOT the presence of an
 * audio-map entry — is what "wired" means on the credits page.
 */
export const PLAYABLE_SFX_KEYS: ReadonlySet<string> = new Set(
  SFX_REACHABILITY.filter((r) => r.kind !== "unreachable").map((r) => r.key),
);

/** True when some code path can play `key` (see PLAYABLE_SFX_KEYS). */
export function isPlayableSfxKey(key: string): boolean {
  return PLAYABLE_SFX_KEYS.has(key);
}

/** Why `key` cannot sound, or null when it can (or is not a known key). */
export function sfxSilentReason(key: string): string | null {
  const row = SFX_REACH_BY_KEY.get(key);
  if (!row || row.kind !== "unreachable") return null;
  return row.reason ?? null;
}
