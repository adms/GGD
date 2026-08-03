/**
 * Roguelite mob waves (task #215 肉鴿小怪波 — 聖杯黑泥醬-喪標麥可 voxel-zombies).
 *
 * From ROUND 3 onward, voxel-zombie mobs stream in from the EDGES of every
 * active duel zone and escalate with combat time: a wave every 2 combat-seconds,
 * the wave at combat-second (2k-1) spawning min(k,10) mobs, capped at 30 alive
 * per battlefield. A mob walks to the nearest enemy champion and melee-attacks;
 * on death it pays the killer +20 gold + XP, and every 30th mob kill grants that
 * champion +1 LEVEL — the intended path past the round-grant L50 ceiling toward
 * the LV99 cap.
 *
 * This module owns the DATA side (rules, spawn helper, alive-count, the
 * deterministic edge-position table). The tick lifecycle lives in
 * `systems/MobSystem.ts`. It is built by copying the guardian/flower blueprint
 * verbatim and layering on the two new capabilities (see MobComp's doc):
 * movement (Navigation) and mutual hostility (the sentinel MONSTER team).
 *
 * NEUTRALITY / OFF-BY-DEFAULT. Like flowers/guardians/coins, the whole mechanic
 * is inert unless the host armed it: `world.mobRules === null` (skeleton boot,
 * unit tests, the client's prediction shadow world) keeps `world.mob` +
 * `world.mobKills` empty and `world.mobTicks = -1`, so a pre-feature world is
 * byte-identical down to the digest.
 *
 * DETERMINISM. The edge-spawn position is a PURE function of (zone, waveIndex k,
 * mobIndex i): a direction is chosen from a STATIC literal table by an integer
 * hash of those three ints (xor/mul/shift only), so it draws ZERO from
 * `world.rng` — the shared rng stream is left completely untouched (it can never
 * perturb crits / evasion / the legendary orb), exactly like the coin ring. No
 * trig (the direction table is authored numeric literals, not a `Math.cos`
 * loop), no `Math.pow`, no wall-clock — see `sim/purity.test.ts`.
 *
 * LEVEL (task #217, curve re-sourced by #244). A mob is level
 * `baseLevel + levelPerRound*(round-fromRound)` — round 3 → lv3, round 4 → lv4,
 * … — and its maxHp/regen follow the MOB CARD's own
 * `baseHp + hpPerLevel*(level-1)`. The ROUND lives on the HOST, so
 * it reaches the sim through the one deterministic arming channel that already
 * carries everything else: `mobRulesFromConfig(cfg, dt, round)` bakes the level
 * and its stats into `MobRules` ONCE, at `beginCombatMobs` time. Nothing per-tick
 * and nothing per-mob knows what a round is, so there is no wall-clock or
 * client-state path in — exactly the shape `guardianHp(rules, round)` uses.
 */
import type { ChampionId, EntityId, SeatId, TeamId } from "../ids";
import { asSeatId, asTeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { MobKind } from "./components";
import type { LastHitMode } from "./mobBoss";
// #247 —— 殭屍王的「無視碰撞」就是 04-00 翔封界的那個狀態,不是第二份實作。
// TYPE-ONLY, so no module cycle: flight.ts imports nothing from here.
import type { FlightGrant } from "./flight";
import type { Vec2 } from "./math/vec2";
import { pushOutOfObstacle, clampToBoundary } from "./collision/resolve";
// #L1 — 殭屍王在場 → 回合延長. The round clock rides the ring's rules (it is the
// only per-combat clock the sim has); this module owns the one moment a king
// enters the world, so it is the module that trips it. No cycle: fireRing.ts
// imports only SimWorld/ids/vec2.
import { extendRoundForBoss, fireRingIgnitionTick } from "./fireRing";
import { Champions } from "./content/registry";
import { Stat } from "./stats/statTypes";
import { championStatBase } from "./stats/attributes";
import { COMBAT_ENV_DEFAULTS, type CombatEnvMultipliers } from "./combatEnv";
// 索敵排名的那一根軸。VALUE import,而且**沒有**造成模組循環:summonRules.ts
// 只 import 了一個 type，它不 import 這個檔,也不 import targeting.ts。
import { TARGET_CLASS } from "./summonRules";

/**
 * What a mob walks at when its card does not say. Deliberately equal to
 * MovementSystem's BASE_MOVE_SPEED so an un-authored card behaves exactly as it
 * did before #215 gave mobs their own knob — the fallback must never be a
 * silent balance change.
 */
const MOB_FALLBACK_MOVE_SPEED = 6;

/**
 * The CHAMPION DOC a mob is an avatar OF (task #217, re-scoped by #244). A mob
 * carries NO ChampionComp — the neutrality contract is untouched.
 *
 * Since #244 this constant documents WHOSE FACE the mob wears, nothing more:
 * the mob's levelled hp/regen come from `mobWaves.mob.baseHp`/`hpPerLevel`/
 * `baseRegen`/`regenPerLevel`. Reading the hero sheet is now only the LEGACY
 * FALLBACK for arenas authored before the split (see `mobRulesFromConfig`).
 * Overridable per-arena via `mobWaves.mob.championId`.
 */
export const MOB_CHAMPION_ID = "godie-zombiex";

/**
 * EntityState.key / model doc id used for a mob on the wire — 喪標麥可's REAL
 * low-poly undead mesh (task #217: `champ.godie-zombiex` → the CC0 KayKit
 * guardian_skeleton.glb, 5,288 tris, cheaper than the knight stand-in it
 * replaces). Resolved client-side through the SAME modelDocFor seam ChampionView
 * / FlowerView / GuardianView use. This constant is only the FALLBACK now: the
 * live key travels on `MobRules.modelKey` so `mobWaves.mob.modelKey` is a real
 * knob (it used to be authored-but-ignored). Presentation only, so it is
 * deliberately NOT folded into `SimWorld.digest()`.
 */
export const MOB_MODEL_KEY = "champ.godie-zombiex";

// ===========================================================================
// 由誰擔任 —— 指定 / 隨機 (#289, owner 2026-07-29)
// ===========================================================================
//
// 「殭屍 / 特殊殭屍 / 殭屍王 除了指定英雄,也要有隨機選項。特殊殭屍與殭屍王預設
//  是隨機」 + owner's follow-up ruling: 隨機 draws 「從策展白名單抽」 — the same
// curated roster a player can actually be handed in champ-select.
//
// ── WHY THIS IS A PARALLEL ENUM AND NOT A `championId: "__random__"` SENTINEL
// A magic string would sail through `z.string().min(1)`, reach
// `mobChampionModelKey("__random__")`, find no such champion and fall back to
// MOB_MODEL_KEY — a zombie that renders as the default mesh with the default
// stats while the console says 「隨機」. That is failure shape ② (算了沒送到)
// wearing a green test suite. `championSource` is a THIRD field with three legal
// values, so an unimplemented one is a schema rejection, not a silent default.
//
// ── WHY THE DRAW ITSELF IS NOT IN THIS FILE ────────────────────────────────
// `sim/**` may not call `Math.random`, and it must not touch `world.rng` either:
// #215 deliberately spends ZERO rng on mobs so the shared stream (crit / evasion
// / 傳說寶玉) lands exactly where a mobless build leaves it. A draw made HERE
// would have to come from one of those two. So the sim takes a HOST CALLBACK
// ({@link MobChampionPicker}) instead: the roster (whitelist ∩ model-backed) and
// the seed both live on the host, the sim only consumes the answer, and an
// ABSENT callback degrades to 「沿用今天的行為」 rather than throwing.

/**
 * WHERE ONE ZOMBIE KIND'S FACE COMES FROM.
 *
 *   • `"inherit"` (and ABSENT — every pre-#289 doc) — exactly today's chain:
 *     the kind's own `championId` if it has one, else the normal mob's, else
 *     {@link MOB_CHAMPION_ID}. Nothing is drawn.
 *   • `"fixed"` — the same thing said out loud. Identical behaviour to
 *     `"inherit"`; it exists so the console can show 「指定」 as a real choice
 *     opposite 「隨機」 instead of an empty box.
 *   • `"random"` — draw from the host's curated pool ONCE PER ROUND.
 *
 * ⚠️ THERE IS DELIBERATELY NO `"wave"` AND NO `"mob"`. The numbers a hero-derived
 * zombie fights with (`heroDerivedStats` → hp / attack damage) are baked from ONE
 * champion at ARM TIME and stored per-KIND on {@link MobRules}; every mob of that
 * kind in the round shares them. A per-wave or per-entity face would therefore
 * produce 「臉是皮卡丘、數值是殭屍」 — the picture and the fight disagreeing, which
 * is failure shape ⑤ (被測的不是出貨的) built into the design. Making those legal
 * means moving the derived stats onto MobComp first, which is a different task.
 */
export type MobChampionSource = "inherit" | "fixed" | "random";

/** Which zombie kind a draw is for. Doubles as the hash salt (see the order). */
export type MobChampionSlot = "mob" | "boss" | "special";

/**
 * The slots, in the order that fixes their hash salt. ⚠️ APPEND ONLY: the index
 * is folded into {@link pickMobChampion}, so re-ordering this list silently
 * re-rolls every existing seed's answer.
 */
export const MOB_CHAMPION_SLOTS: readonly MobChampionSlot[] = ["mob", "boss", "special"];

// ===========================================================================
// 英雄卡讀在幾級 —— 三種模式 (#290, owner 2026-07-29)
// ===========================================================================
//
// 「特殊殭屍也可以設 heroLevel,但預設是跟當時場上英雄最高等級相同(一樣是個
//  選項)」。
//
// ── 為什麼這是一個 enum 而不是「heroLevel: 0 代表跟著英雄」 ─────────────────
// `heroLevel` 的 schema 是 `int().min(1).max(99)`,要塞一個 sentinel 就得把下界
// 打開到 0,而 0 在其他每一格 heroLevel 都是「填錯了」。三個具名值讓「沒實作的
// 模式」是一個 zod 422,不是一個安靜的預設值(和 {@link MobChampionSource} 同一
// 條理由)。
//
// ── 為什麼 `"matchHighest"` 一定要在 SPAWN TIME 解析 ───────────────────────
// 另外兩個模式都是常數,在 arm time(`mobRulesFromConfig`)烘進 {@link MobRules}
// 就結束了。「當時場上英雄最高等級」不是常數:英雄在同一個回合裡會升級(打殭屍
// 每 N 隻 +1 級、王的 `bountyLevels`),所以「當時」只有在**生成那一刻**才成立。
// arm time 版本會讓同一回合的第二隻特殊殭屍跟第一隻一模一樣 —— 一個加了模式但
// 沒有生效的功能,而且沒有任何現有斷言看得見。
export type MobHeroLevelSource = "round" | "fixed" | "matchHighest";

/**
 * 三個模式,依 console 顯示的順序。⚠️ 必須與 schema 的 `zMobHeroLevelSource`
 * 相等 —— 後台的 `validateField` 只放行這個清單裡的值。
 */
export const MOB_HERO_LEVEL_SOURCES: readonly MobHeroLevelSource[] = [
  "round",
  "fixed",
  "matchHighest",
];

/**
 * 生成那一刻要重算英雄推導數值所需要的一切 (#290)。
 *
 * ⚠️ 只有 `heroLevelSource: "matchHighest"` 的 kind 才會拿到這個物件,其他每一
 * 種情況都是 `null`。`"round"` / `"fixed"` / 沒填 的答案在 arm time 就已經是最終
 * 值,再算一次只會得到同一個數字,所以 {@link mobSpawnProfile} 直接短路回
 * {@link mobProfile} —— pre-#290 的世界一個乘法都沒有多做。
 */
export interface MobHeroDeriveRule {
  /** 解析成哪個英雄的卡(已經走完 指定/沿用/隨機 的鏈) */
  championId: string;
  /** ×`championStatBase(MaxHealth)`;absent ⇒ 血量不推導 */
  heroHpMult?: number;
  /** ×`championStatBase(AttackDamage)`;absent ⇒ 攻擊力不推導 */
  heroDamageMult?: number;
  /** 乘完之後才加的固定血量 */
  hpFlatBonus?: number;
  /**
   * arm time 烘好的等級 —— 該小怪所在 zone「一個英雄都沒有」時的 FALLBACK。
   *
   * ⚠️ 「全隊倒地」不再是這條路 (owner 2026-07-29 裁決 (a),見
   * {@link matchHighestChampionLevel})。屍體照樣算等級,所以真正會走到這裡的只剩
   * 三種:回合開場前 zone 還沒有人被放進來、那個 zone 這回合根本沒有排到對戰、
   * 以及一個沒有英雄的測試/預測世界。這三種要的都是「就照這回合算」,不是 1、
   * 不是 99、也不是 NaN。
   */
  armedLevel: number;
  /**
   * arm time 用的那張 combat-env 表。
   *
   * ⚠️ 存下來而不是在 spawn time 讀 `world.combatEnv`,理由和 MatchController 那
   * 句 `undefined, // NOT this.combatEnv` 註解是同一個:出貨的 arm 呼叫刻意用**出貨
   * 係數**,spawn time 改讀 live 表會讓 `"matchHighest"` 和 `"round"`/`"fixed"`
   * 算在兩張不同的表上 —— 一個偽裝成管線改動的平衡改動。
   */
  env: CombatEnvMultipliers;
}

/**
 * The host's draw. `(slot, round) => championId`, or `undefined` when the host
 * cannot answer (no content loaded, an empty roster, a caller that simply does
 * not implement it — the client's prediction shadow, every unit test).
 *
 * ⚠️ `undefined` MUST degrade to `"inherit"`, never throw and never produce an
 * empty id: an un-picked zombie has to be a PLAYABLE zombie.
 */
export type MobChampionPicker = (slot: MobChampionSlot, round: number) => string | undefined;

/**
 * 32-bit integer avalanche (splitmix-style finalizer) — the same one
 * `sim/world/ArenaDef.ts` uses for the per-round map rotation, restated here
 * rather than imported so this module keeps its "no cross-module coupling for
 * three lines of integer math" shape. Pure `Math.imul` / xor / shift: no float,
 * no trig, no `**`, no wall-clock (see `sim/purity.test.ts`).
 */
function hash32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

/**
 * THE DRAW: which champion `slot` wears in `round`, as a pure function of
 * `(pool, matchSeed, round, slot)`. Returns `null` only for an empty pool, which
 * the caller must degrade on (see {@link MobChampionPicker}).
 *
 * ── WHY NOT `mixInt` (which is RIGHT THERE, 900 lines down) ─────────────────
 * `mixInt` masks every argument with `& 0xffff`. It is correct for what it does
 * — (zone, waveIndex, mobIndex) are all small — but a `matchSeed` is a full
 * 32-bit number, so feeding it through would throw away the top 16 bits and make
 * seeds 0x0001_0007 and 0x0002_0007 draw the same zombie for the whole match.
 *
 * ── WHY THE POOL IS SORTED HERE ────────────────────────────────────────────
 * The host's pool comes out of a `Map`'s key order (the champion registry's
 * insertion order = content load order). Sorting a COPY makes the answer depend
 * on the SET of enabled champions and not on the order they happened to load in,
 * so two hosts with the same whitelist agree even if their content walks landed
 * in a different sequence — and a replay re-derives the same face. Arm-time only
 * (~61 strings, once per round), never per tick.
 *
 * ── WHY NOT `world.rng` ────────────────────────────────────────────────────
 * Same reason `mobSpawnPos` hashes instead of drawing: #215 spends zero rng on
 * mobs, so the shared stream stays byte-identical to a mobless build. A hash of
 * the seed is just as reproducible and perturbs nothing.
 */
export function pickMobChampion(
  pool: readonly string[],
  matchSeed: number,
  round: number,
  slot: MobChampionSlot,
): string | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort();
  if (sorted.length === 1) return sorted[0]!;
  // index+1 so slot 0 ("mob") still perturbs the stream rather than multiplying
  // by zero, which would collapse it onto the (seed, round) hash alone.
  const slotSalt = MOB_CHAMPION_SLOTS.indexOf(slot) + 1;
  let h = hash32(matchSeed >>> 0);
  h = hash32((h ^ Math.imul(Math.round(round) | 0, 0x9e3779b1)) >>> 0);
  h = hash32((h ^ Math.imul(slotSalt, 0x85ebca6b)) >>> 0);
  return sorted[h % sorted.length]!;
}

/**
 * The sentinel MONSTER team. A single id OUTSIDE the player range (teams are
 * 0..3, so this is well clear) that no champion is ever on — which is the whole
 * point: a mob on this team is `differentTeam` from EVERY champion, so it is an
 * enemy to all of them with no ChampionComp and no bespoke aggro table. Every
 * champion/team iteration that keys off `world.champion` (scoreboard, duel
 * resolution, team lives, placement) stays blind to a MONSTER-team entity by
 * construction, because a mob carries no ChampionComp.
 */
export const MONSTER_TEAM: TeamId = asTeamId(255);

/** Mob-wave rules in TICKS / squared-distances (converted from the config doc). */
export interface MobRules {
  /** 1-based round from which waves spawn (>= this round) */
  fromRound: number;
  /** mobTicks at which wave k=1 fires (round(firstWaveSec/dt)) */
  firstWaveTicks: number;
  /** ticks between waves (round(waveIntervalSec/dt)) */
  waveIntervalTicks: number;
  /** hard cap on mobs spawned per wave: count = min(k, mobsPerWaveCap) */
  mobsPerWaveCap: number;
  /** hard cap on mobs ALIVE per zone at once */
  maxAlivePerZone: number;

  /**
   * 「一隊全滅之後，這個 zone 還要不要繼續生殭屍」（owner 2026-08-02
   * 「敵方英雄全死光 或我方英雄全死光 殭屍就不應該再生成」）。主機在偵測到
   * 全滅的那一刻寫 `world.spawnHaltedZones`，`MobSystem` 的波次迴圈讀它。
   */
  stopSpawnOnTeamWipe?: boolean;
  /**
   * 「哪幾種怪會壓住回合不結束」（owner 2026-08-02 把 2026-07-30 的「任何殭屍」
   * 收窄成「只有殭屍王」）。主機的 `checkCombatEnd` 讀它；見 {@link ROUND_HOLD_KINDS}。
   */
  roundHoldMobKinds?: RoundHoldMobKinds;

  /**
   * The mob's EFFECTIVE LEVEL this round (task #217). Derived ONCE at arm time
   * from the ROUND — `baseLevel + levelPerRound * (round - fromRound)` — because
   * the round number lives on the host, never in the sim. Carried here (not on
   * MobComp) so it is immutable arm-time state that no system can drift.
   */
  level: number;
  /** mob hit points AT `level` (#244: `mob.baseHp + mob.hpPerLevel*(level-1)`) */
  maxHp: number;
  /**
   * Mob hp regenerated PER SECOND at `level` (#244: `mob.baseRegen +
   * mob.regenPerLevel*(level-1)`). Applied by mobSystem with the exact
   * `hp + regen * dt` form RegenSystem uses for champions — a mob still has no
   * StatsComp, so this is the only regen path it has.
   */
  hpRegenPerSec: number;
  /** model doc id sent as EntityState.key (presentation only, never digested) */
  modelKey: string;
  /**
   * 體型倍率 (GH#192) — the RENDERED size as a multiple of what the resolved
   * model doc already declares. Presentation only: the sim's body is `radius`,
   * and nothing here reaches collision, navigation or the zone inset. Travels
   * per mob on the wire (see `snapshot.ts`), because the three kinds can now
   * share one model key and the key can no longer imply a size.
   */
  sizeMult: number;
  /**
   * 染黑強度 (GH#192) 0..1, applied to EVERY kind. Presentation only and never
   * digested, for the same reason `modelKey` is not.
   */
  tintStrength: number;
  /**
   * #247 腳下圈圈的基準直徑 (GGD units, at 體型倍率 1) and 跟著體型放大的程度.
   *
   * ⚠️ PRESENTATION ONLY, and unlike `sizeMult` that is not merely a convention:
   * NO sim system reads either of these. They exist on `MobRules` solely so
   * `mobVisualJson` can put them on the wire — the collision body stays `radius`
   * / `boss.radius`, which is what makes owner's 「圈圈比較大但不影響無碰撞」 true
   * by construction rather than by care. Guarded in sim/mobBossRing.test.ts.
   *
   * ⚠️ OPTIONAL, and ABSENT MEANS the shipped default — the same 「缺席 = 今天的
   * 行為」 rule `MobBossRules.heroDerive` states. A `MobRules` built by hand (the
   * ten fixtures across sim/**, any future caller that does not go through
   * `mobRulesFromConfig`) must degrade to the champion-sized ring rather than
   * fail to compile. `mobRulesFromConfig` ALWAYS writes both explicitly.
   */
  groundRingDiameter?: number;
  groundRingSizeFollow?: number;
  /** melee packet amount */
  attackDamage: number;
  /** mob walk speed in u/s (#215). Owned by the mob card, NOT the shared fallback. */
  moveSpeed: number;
  /** SQUARED melee reach (compared against distSq — trig/pow-free) */
  attackRangeSq: number;
  /** melee cooldown in ticks (round(attackCdSec/dt)) */
  attackCdTicks: number;
  /** collision/body radius (drives the edge inset = boundaryRadius - radius) */
  radius: number;

  /** flat gold to the killer per mob kill */
  rewardGold: number;
  /** XP to the killer per mob kill */
  rewardXp: number;
  /** every Nth mob kill grants the killer +1 level */
  killsPerLevel: number;

  /**
   * 殭屍王 (task #262). `null` = the sub-mechanic is OFF, which is what every
   * pre-#262 caller, every unit-test fixture and the client's prediction shadow
   * mean — a world armed with `boss: null` behaves exactly as it did before, so
   * the "byte-identical when disarmed" contract survives one level deeper.
   */
  boss: MobBossRules | null;
  /**
   * 特殊殭屍 (task #262). `null` = no special zombies AND — this is the part
   * that matters — no `world.rng` draw at all, so an arena that does not author
   * the block leaves the shared random stream (crits / evasion / the legendary
   * orb) exactly where #215 left it.
   */
  special: MobSpecialRules | null;
}

/**
 * WHAT KIND OF ZOMBIE this is. Stored on `MobComp` because everything
 * downstream — hp at spawn, melee damage, walk speed, body radius, the model on
 * the wire, the reward on death — forks on it, and a per-entity fork needs
 * per-entity state. It is authoritative sim state written ONCE at spawn and
 * never mutated, so no system can drift it. Declared in `sim/components.ts`
 * beside the component it lives on; re-exported here because this module is
 * where every consumer of it already imports from.
 */
export type { MobKind } from "./components";

/** 殭屍王 rules in TICKS / squared distances (converted from the config doc). */
export interface MobBossRules {
  enabled: boolean;
  /** ONE champion's cumulative `world.mobKills` that summons the king */
  killThreshold: number;
  /** true = every Nth kill summons another; false = once per champion per match */
  repeatable: boolean;
  maxHp: number;
  attackDamage: number;
  moveSpeed: number;
  /** SQUARED melee reach (compared against distSq — trig/pow-free) */
  attackRangeSq: number;
  attackCdTicks: number;
  radius: number;
  /** model doc id sent as EntityState.key (presentation only, never digested) */
  modelKey: string;
  /**
   * WHOSE FACE THIS KING WEARS — the champion id `mobKindChampion` resolved at
   * arm time (#289), i.e. the 隨機 draw's answer when `championSource` is
   * `"random"` (the SHIPPED value) and the inherited/authored id otherwise.
   *
   * ⚠️ IT IS NOT ALWAYS 喪標麥可, and that is the whole reason this field had to
   * exist. `modelKey` next to it is a MODEL doc id — it names a mesh, not a
   * character, so nothing downstream could recover 「這一隻穿的是誰」 from it
   * (two champions may share a mesh, and `boss.modelKey` can override it
   * outright). The 出場演出 (`ui/hud/bossIntroModel`) needs the CHARACTER to look
   * up that champion's 描述／攻略要點／弱點, so the identity travels explicitly.
   *
   * ⚠️ OPTIONAL, and ABSENT MEANS 「不知道是誰」 — a hand-built `MobRules`
   * (fixtures, any caller that skips `mobRulesFromConfig`) must degrade to an
   * intro that draws nothing rather than fail to compile, the same 「缺席 = 今天
   * 的行為」 rule every #206/#288/#289/#290 field follows. `mobRulesFromConfig`
   * ALWAYS writes it.
   */
  championId?: string;
  /** 體型倍率 (GH#192) — see `MobRules.sizeMult`; owner default 10 */
  sizeMult: number;
  /**
   * The prize pool in gold, split by damage share (see sim/mobBoss.ts).
   *
   * ⚠️ NOT the amount paid. Since GH#206 the shipped `lastHitMode: "bonus"`
   * pays `[pool, pool × lastHitMultiplier]` — this names the FLOOR and the
   * ceiling is `× lastHitMultiplier`. Only `"weight"` pays exactly this.
   */
  bountyGold: number;
  /** the same, in XP */
  bountyXp: number;
  /**
   * 等級提升 (GH#206, owner 2026-07-29) — WHOLE LEVELS, split by damage share
   * exactly like gold. Distinct from `bountyXp`: this one skips the curve.
   */
  bountyLevels: number;
  /** the last hitter's damage counts this many times over when sharing */
  lastHitMultiplier: number;
  /** how 「最後一刀翻倍」 is paid — see `LastHitMode` in sim/mobBoss.ts */
  lastHitMode: LastHitMode;
  /**
   * 溢傷算不算進分紅權重. owner 2026-07-29 ruled 不算 (GH#206), so this ships
   * `false` and the ledger records `hpLoss`. `true` restores the pre-#206
   * behaviour (raw post-mitigation `output`, overkill included).
   */
  countOverkill: boolean;
  /**
   * #290 —「跟當時場上英雄最高等級相同」的重算輸入。`null` = 這個 kind 不需要
   * spawn-time 重算(沒推導、或 `heroLevelSource` 不是 `"matchHighest"`),此時
   * `maxHp`/`attackDamage` 上面那兩格就是最終值。See {@link MobHeroDeriveRule}.
   *
   * ⚠️ OPTIONAL, and ABSENT MEANS `null`. A `MobRules` built by hand (test
   * fixtures, a future caller that does not go through `mobRulesFromConfig`)
   * must degrade to 「不重算」 rather than fail to compile into an older shape —
   * the same 「缺席 = 今天的行為」 rule every other #206/#288/#289 field follows.
   * `mobRulesFromConfig` ALWAYS writes it explicitly (pinned by a test).
   */
  heroDerive?: MobHeroDeriveRule | null;

  /* ── #247 (owner 2026-08-01) ──────────────────────────────────────────── */
  /**
   * 無視碰撞 —— resolved at arm time into the {@link FlightGrant} the king is
   * handed at spawn, or `null` for 「照舊會被卡住」.
   *
   * A GRANT AND NOT FOUR BOOLEANS, because the consumer is `world.flight` and
   * the sim already has exactly one vocabulary for 「這個身體穿得過什麼」. Resolving
   * it here (arm time) rather than in `summonMobBoss` means the spawn path holds
   * no policy at all — it writes whatever the operator authored.
   *
   * ⚠️ OPTIONAL, ABSENT MEANS `null`: a `MobRules` built by hand (fixtures, any
   * caller that does not go through `mobRulesFromConfig`) degrades to 「沒有無碰撞」
   * — the same 「缺席 = 今天的行為」 rule every #206/#288/#289/#290 field follows.
   */
  noClip?: FlightGrant | null;
  /**
   * 每回合最多召喚幾隻王 (owner 2026-08-01: 「每回合最多只會出現一次」).
   * ABSENT ⇒ {@link BOSS_MAX_PER_ROUND_UNCAPPED}.
   */
  maxPerRound?: number;
  /** 上限算「每個戰場」還是「整場」. ABSENT ⇒ `"zone"`. */
  maxPerRoundScope?: BossSpawnCapScope;

  /* ── #247 owner 2026-08-01 實戰回饋(第二批)────────────────────────────── */
  /**
   * 王在自動索敵比較器 KEY 1 上的排名。ABSENT ⇒ {@link BOSS_AGGRO_RANK_ABSENT}
   * (= `TARGET_CLASS.mob`,也就是**今天的行為**:王就是一隻小怪)。
   * 語意與上下界見 `zMobWavesConfig.boss.aggroRank`;讀它的是
   * {@link mobAggroRank},唯一的呼叫點是 sim/targeting.ts 的 `targetClassOf`。
   */
  aggroRank?: number;
  /**
   * 長血條的三格。ABSENT ⇒ 出貨值(亮 / 上方 / 召喚那一刻),**不是**「今天的
   * 行為」—— 理由見 `zMobWavesConfig.boss.healthBar`。
   *
   * ⚠️ 它們是**畫面**,所以 sim 這一側一個 tick 都不讀它們。它們存在的唯一理由
   * 是 {@link mobVisualJson} 要把它們送到客戶端(失敗形態 ②:算出來但沒送到)。
   */
  healthBar?: boolean;
  healthBarAnchor?: BossHealthBarAnchor;
  healthBarReveal?: BossHealthBarReveal;
}

/** 長血條畫在畫面哪裡 —— see `zMobWavesConfig.boss.healthBarAnchor`. */
export type BossHealthBarAnchor = "top" | "bottom";
/** 長血條什麼時候亮 —— see `zMobWavesConfig.boss.healthBarReveal`. */
export type BossHealthBarReveal = "summon" | "sighted";

/**
 * 每回合上限算在哪一個範圍上 —— see `zMobWavesConfig.boss.maxPerRoundScope` for
 * why `"zone"` is the shipped answer.
 */
export type BossSpawnCapScope = "zone" | "match";

/**
 * 「不設上限」 —— the value an arena authored before #247 behaves as. Large
 * enough that no real round can reach it (a round is ~3 minutes and a king
 * needs 100 personal zombie kills), so it means 「就是今天的無限出場」 without a
 * second `null`-shaped branch through `bossSpawnCapReached`.
 */
export const BOSS_MAX_PER_ROUND_UNCAPPED = 1_000_000;

/**
 * The KEY `world.bossSpawnsThisRound` counts under, for `scope`. `-1` is the
 * 「整場」 bucket — no duel zone is ever negative, so the two scopes can share one
 * map without a second store or a tuple key (which would need sorted iteration).
 */
export function bossSpawnCapKey(zone: number, scope: BossSpawnCapScope | undefined): number {
  return scope === "match" ? -1 : zone;
}

/**
 * 這個 zone(或這一場)這一回合的王額度用完了嗎?
 *
 * PURE, and separate from `summonMobBoss` so the boundary is testable without a
 * world: at `maxPerRound - 1` already-spawned it is false, at `maxPerRound` it
 * is true. `boss === null` / 沒開 answers false — those cases are already
 * rejected one line earlier by the caller and must not read as 「額度滿了」.
 */
export function bossSpawnCapReached(
  boss: { maxPerRound?: number } | null,
  alreadySpawned: number,
): boolean {
  if (boss === null) return false;
  const cap = boss.maxPerRound ?? BOSS_MAX_PER_ROUND_UNCAPPED;
  return alreadySpawned >= cap;
}

/**
 * 特殊殭屍的分紅獎池 (#288, owner 2026-07-29: 「特殊殭屍也照傷害比例分,金錢
 * +5,000 · 等級提升 +5」).
 *
 * SHAPED LIKE THE KING'S SIX FIELDS ON PURPOSE — `bountyGold` / `bountyXp` /
 * `bountyLevels` / `lastHitMultiplier` / `lastHitMode` / `countOverkill` all
 * mean exactly what they mean on {@link MobBossRules}, and the SAME pure
 * `splitBossBounty` divides both. A second, differently-named vocabulary for
 * the same rule is how two payout paths drift apart.
 *
 * ⚠️ AUTHORING THIS BLOCK REPLACES `rewardMult` FOR THE SPECIAL. A 特殊殭屍 with
 * a pool no longer pays `rewardGold × rewardMult` to the last hitter; the pool
 * IS the reward. `rewardMult` stays live for any arena that authors no pool
 * (and is still the only thing that pays a special before #288), which is why
 * the block is nullable rather than a set of zero-defaulted fields.
 */
export interface MobSpecialBounty {
  /** the pool in gold, split by damage share */
  gold: number;
  /** the same, in XP */
  xp: number;
  /** 等級提升 — WHOLE levels, split by damage exactly like gold (skips the curve) */
  levels: number;
  /** the last hitter's damage counts this many times over (1 = 沒有翻倍) */
  lastHitMultiplier: number;
  /** how 「最後一刀翻倍」 is paid — see `LastHitMode` in sim/mobBoss.ts */
  lastHitMode: LastHitMode;
  /**
   * true (shipped) = 照傷害比例分給每個打過它的人.
   * false = the pre-#288 behaviour: the whole pool goes to whoever landed the
   * killing blow. Implemented by handing `splitBossBounty` an EMPTY damager
   * table, so 「全額給補刀的人」 is the same arithmetic, not a second one.
   */
  splitByDamage: boolean;
  /**
   * 溢傷算不算進分紅權重. Its own field rather than a read of
   * `boss.countOverkill`, because the two blocks are independently authorable —
   * an arena that disables the king entirely (`boss` absent) must not silently
   * change how a special's damage is weighed.
   */
  countOverkill: boolean;
}

/** 特殊殭屍 rules — multipliers against the normal mob of the same round. */
export interface MobSpecialRules {
  /** probability per spawned mob as a FRACTION in [0,1] (config carries percent) */
  chance: number;
  hpMult: number;
  damageMult: number;
  moveSpeedMult: number;
  radiusMult: number;
  /** 體型倍率 (GH#192) — the RENDERED size; `radiusMult` is the sim body */
  sizeMult: number;
  /** gold AND xp multiplier on the kill reward */
  rewardMult: number;
  modelKey: string;

  /* ── 從英雄推導的絕對值 (GH#206, owner 2026-07-29) ─────────────────────────
   *
   * `null` = NOT DERIVED, and every pre-#206 arena is exactly that — the
   * multiplier fields above stay the answer and `mobProfile` computes the same
   * expression it always did, byte for byte.
   *
   * WHY THESE ARE ABSOLUTE AND THE OTHERS ARE MULTIPLIERS. The owner's rule is
   * 「生命與能力屬性 = 該設定英雄的 5 倍」 — anchored on a HERO SHEET, not on the
   * round's zombie, so it cannot be expressed as a `hpMult`. Dividing the
   * derived number by the zombie's hp to fake one would leak the zombie curve
   * back into a value the owner said was independent of it, and would round
   * differently besides. The KING needs no twin fields: `MobBossRules.maxHp` /
   * `.attackDamage` / `.moveSpeed` are ALREADY absolute, so its derivation just
   * writes those.
   *
   * Both are resolved ONCE, in `mobRulesFromConfig` at arm time — the champion
   * registry is never touched from a per-tick path. See the note there.
   *
   * ⚠️ #290 ADDED ONE EXCEPTION, AND ONLY ONE: `heroLevelSource:
   * "matchHighest"` re-runs the derivation at SPAWN time (a few times a wave),
   * through {@link mobSpawnProfile}. These two fields still hold the arm-time
   * answer — nothing per-tick learned a new trick.
   */
  /** absolute maxHp from the hero sheet; `null` ⇒ use `hpMult` */
  maxHp: number | null;
  /** absolute melee damage from the hero sheet; `null` ⇒ use `damageMult` */
  attackDamage: number | null;

  /**
   * 分紅獎池 (#288). `null` = this arena authored none ⇒ the special pays the
   * pre-#288 way (`rewardGold × rewardMult` straight to the last hitter), keeps
   * NO damage ledger, and is byte-identical to before.
   */
  bounty: MobSpecialBounty | null;
  /**
   * #290 —「跟當時場上英雄最高等級相同」的重算輸入,和王的那一格同義。`null` /
   * absent = 不需要 spawn-time 重算。See {@link MobBossRules.heroDerive}.
   */
  heroDerive?: MobHeroDeriveRule | null;
}

/**
 * The payout rule for ONE mob kind, normalised so `payMobBounty` has exactly one
 * shape to read. `null` = this kind pays no pool (every 一般殭屍, a king in an
 * arena with no `boss` block, a special with no `bounty` block).
 *
 * ⚠️ 一般殭屍 IS AND MUST STAY `null`. See the ledger note in
 * `stats/matchStats.recordDamage` — this is the function that keeps the
 * per-mob damage ledger off the 100-zombie round-9 firehose.
 */
export interface MobBountyRules {
  readonly gold: number;
  readonly xp: number;
  readonly levels: number;
  readonly lastHitMultiplier: number;
  readonly lastHitMode: LastHitMode;
  readonly splitByDamage: boolean;
  readonly countOverkill: boolean;
}

/**
 * The pool a mob of `kind` pays out, or `null` when it pays none.
 *
 * ONE function so the ledger (`stats/matchStats`) and the payout
 * (`systems/MobSystem`) can never disagree about which kinds are in the scheme
 * — a ledger kept for a kind that never pays is wasted memory, and a payout for
 * a kind with no ledger silently hands the whole pool to the last hitter.
 */
export function mobBountyRules(rules: MobRules | null, kind: MobKind): MobBountyRules | null {
  if (rules === null) return null;
  if (kind === "boss") {
    const b = rules.boss;
    if (b === null) return null;
    return {
      gold: b.bountyGold,
      xp: b.bountyXp,
      levels: b.bountyLevels,
      lastHitMultiplier: b.lastHitMultiplier,
      lastHitMode: b.lastHitMode,
      // 殭屍王 ALWAYS splits. #262 is 「照傷害比例發獎金」 and the owner ruled on
      // it directly, so there is no knob to turn it off — unlike the special,
      // whose switch exists only to preserve its pre-#288 「直接給 killer」.
      splitByDamage: true,
      countOverkill: b.countOverkill,
    };
  }
  if (kind === "special") {
    const s = rules.special?.bounty ?? null;
    if (s === null) return null;
    return {
      gold: s.gold,
      xp: s.xp,
      levels: s.levels,
      lastHitMultiplier: s.lastHitMultiplier,
      lastHitMode: s.lastHitMode,
      splitByDamage: s.splitByDamage,
      countOverkill: s.countOverkill,
    };
  }
  return null;
}

/**
 * Does a mob of `kind` keep a per-entity DAMAGE LEDGER, and does its overkill
 * count? `null` = no ledger at all.
 *
 * ⚠️ ALLOCATION-FREE BY CONSTRUCTION — it returns a STORED sub-object, never a
 * fresh literal, because `recordDamage` calls it on every damage packet in the
 * match. `mobBountyRules` (which does allocate) is for the once-per-death payout
 * path only. Both answer `null` for the same kinds, which is what keeps the two
 * halves in agreement.
 */
export function mobLedgerRule(
  rules: MobRules | null,
  kind: MobKind,
): { readonly countOverkill: boolean } | null {
  if (rules === null) return null;
  if (kind === "boss") return rules.boss;
  if (kind === "special") return rules.special?.bounty ?? null;
  return null;
}

/**
 * The stats one mob of `kind` actually fights with. ONE function so no system
 * can read a different number than another: MobSystem's melee, MovementSystem's
 * walk speed, `spawnMob`'s hp/radius and the snapshot's model key all resolve
 * here. Before #262 every one of these was `rules.<field>` read directly, which
 * is exactly how a boss ends up hitting for a zombie's 1.2 damage.
 */
export interface MobProfile {
  maxHp: number;
  attackDamage: number;
  moveSpeed: number;
  attackRangeSq: number;
  attackCdTicks: number;
  radius: number;
  modelKey: string;
  /**
   * 體型倍率 (GH#192) — the RENDERED size multiplier for this kind. Resolved
   * here, in the one place every consumer already reads, for exactly the reason
   * the rest of this struct exists: before GH#192 the size came from the model
   * DOC each kind happened to name, so a king that reused the zombie's key was
   * a zombie-sized king and no assertion on `modelKey` could see it.
   */
  sizeMult: number;
  /** multiplier applied to `rewardGold` / `rewardXp` on this mob's death */
  rewardMult: number;
}

export function mobProfile(rules: MobRules, kind: MobKind): MobProfile {
  if (kind === "boss" && rules.boss !== null) {
    const b = rules.boss;
    return {
      maxHp: b.maxHp,
      attackDamage: b.attackDamage,
      moveSpeed: b.moveSpeed,
      attackRangeSq: b.attackRangeSq,
      attackCdTicks: b.attackCdTicks,
      radius: b.radius,
      modelKey: b.modelKey,
      // ×THE NORMAL MOB, for the same reason the special's is — 10 means
      // 「王是一般殭屍的 10 倍高」, which is what the owner said, and it stays
      // true if the normal mob is ever resized.
      sizeMult: rules.sizeMult * b.sizeMult,
      // A king pays its BOUNTY POOL, never the per-zombie reward — MobSystem
      // takes the boss branch and never reaches the flat reward at all. 0 here
      // so a future caller that forgets that gets nothing rather than a silent
      // double payout.
      rewardMult: 0,
    };
  }
  const base: MobProfile = {
    maxHp: rules.maxHp,
    attackDamage: rules.attackDamage,
    moveSpeed: rules.moveSpeed,
    attackRangeSq: rules.attackRangeSq,
    attackCdTicks: rules.attackCdTicks,
    radius: rules.radius,
    modelKey: rules.modelKey,
    sizeMult: rules.sizeMult,
    rewardMult: 1,
  };
  if (kind !== "special" || rules.special === null) return base;
  const s = rules.special;
  return {
    // GH#206 — a `null` override is the pre-#206 path VERBATIM (same rounding,
    // same operands), so an arena that authored no `heroHpMult` produces the
    // identical number and the digest cannot move. The DERIVATION that fills
    // these in lives in `mobRulesFromConfig`; this is a field read, not a
    // champion lookup, so the per-tick callers (MovementSystem's walk speed,
    // MobSystem's melee) stay as cheap as they were.
    maxHp: s.maxHp ?? Math.max(1, Math.round(base.maxHp * s.hpMult)),
    attackDamage: s.attackDamage ?? base.attackDamage * s.damageMult,
    // ⚠️ MOVE SPEED IS NEVER HERO-DERIVED — see `heroDerivedStats`. It stays
    // anchored on the NORMAL zombie, which is what `moveSpeedMult` already
    // meant, so 「特殊殭屍 ×0.5」 is 0.5 of a zombie no matter whose face it wears.
    moveSpeed: base.moveSpeed * s.moveSpeedMult,
    // radius scales, so reach scales with it — a body twice as wide that still
    // has to walk into melee range measured from its centre would stand INSIDE
    // its target and never connect.
    attackRangeSq: base.attackRangeSq * s.radiusMult * s.radiusMult,
    attackCdTicks: base.attackCdTicks,
    radius: base.radius * s.radiusMult,
    modelKey: s.modelKey,
    // ×THE NORMAL MOB, exactly like `hpMult` / `damageMult` / `moveSpeedMult`
    // one line up — every `*Mult` in the 特殊殭屍 block means the same thing, so
    // 1.8 here reads as 「是一般殭屍的 1.8 倍高」 and not as an absolute size the
    // operator has to re-derive whenever the normal mob's own size changes.
    sizeMult: rules.sizeMult * s.sizeMult,
    rewardMult: s.rewardMult,
  };
}

/**
 * The RENDERED size multiplier for a mob of `kind` — the value the snapshot
 * puts on the wire. `rules === null` (a world that never armed the mechanic)
 * reads as 1, i.e. exactly the model doc's own size, so a pre-GH#192 client and
 * every disarmed test world are unchanged.
 */
export function mobSizeMultFor(rules: MobRules | null, kind: MobKind): number {
  if (rules === null) return 1;
  const s = mobProfile(rules, kind).sizeMult;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * The model doc id for a mob of `kind` — the ONE seam between the sim's kind and
 * what the client actually renders. Lives here (not in the snapshot encoder) so
 * the wire and any future consumer cannot disagree about which mesh a king gets.
 */
export function mobModelKeyFor(rules: MobRules | null, kind: MobKind): string {
  if (rules === null) return MOB_MODEL_KEY;
  return mobProfile(rules, kind).modelKey;
}

/**
 * Roll ONE spawn's kind against `special.chance`, drawing from `world.rng`.
 *
 * WHY THE SHARED STREAM, when #215 went out of its way to keep mobs off it: the
 * owner asked for a CHANCE (「殭屍群裡面會有一隻特殊殭屍」), and a chance that
 * does not come off the seeded stream is either `Math.random` (banned by
 * `sim/purity.test.ts`, and un-replayable) or a hash of the spawn index, which
 * is not a probability at all — it is a fixed pattern that players would learn.
 * `world.rng` is seeded per match and its state is folded into `digest()`, so
 * the same seed reproduces the same zombies and a replica that rolled
 * differently says so on the tick it happens.
 *
 * NO DRAW AT ALL when the block is absent or the chance is zero, so every
 * pre-#262 arena's crit/evasion/orb rolls land exactly where they used to.
 */
export function rollMobKind(world: SimWorld, rules: MobRules): MobKind {
  const s = rules.special;
  if (s === null || s.chance <= 0) return "normal";
  return world.rng.next() < s.chance ? "special" : "normal";
}

/** Seconds-based mob-wave config (mirror of config.arena-rules@1 `mobWaves`). */
export interface MobWavesConfigLike {
  fromRound: number;
  firstWaveSec: number;
  waveIntervalSec: number;
  mobsPerWaveCap: number;
  maxAlivePerZone: number;
  /** owner 2026-08-02 「一隊全滅就不要再生成殭屍」。ABSENT ⇒ true（出貨行為）。 */
  stopSpawnOnTeamWipe?: boolean;
  /** owner 2026-08-02 「場上沒有殭屍王就該馬上結算」。ABSENT ⇒ `"boss"`。 */
  roundHoldMobKinds?: RoundHoldMobKinds;
  /**
   * per-round overrides (owner 2026-07-27); absent ⇒ authored caps everywhere.
   * `championId` (GH#191) is 「這一回合由誰擔任」 and, since GH#192, decides the
   * MODEL as well as the face.
   */
  schedule?: readonly {
    round: number;
    mobsPerWaveCap: number;
    maxAlivePerZone: number;
    championId?: string;
  }[];
  mob: {
    maxHp: number;
    attackDamage: number;
    moveSpeed?: number;
    attackRange: number;
    attackCdSec: number;
    radius: number;
    modelKey?: string;
    championId?: string;
    /** #289 — 指定 / 隨機. ABSENT = `"inherit"`; see {@link MobChampionSource} */
    championSource?: MobChampionSource;
    /** GH#192 體型倍率 (default 1) */
    sizeMult?: number;
    /** GH#192 染黑強度 0..1 (default DEFAULT_MOB_TINT_STRENGTH) */
    tintStrength?: number;
    /** #247 腳下圈圈基準直徑 (default {@link DEFAULT_MOB_RING_DIAMETER}) */
    groundRingDiameter?: number;
    /** #247 圈圈跟著體型放大的程度 (default {@link DEFAULT_MOB_RING_SIZE_FOLLOW}) */
    groundRingSizeFollow?: number;
    baseLevel?: number;
    levelPerRound?: number;
    /** #244 — the mob's OWN hp curve: round(baseHp + hpPerLevel*(level-1)) */
    baseHp?: number;
    hpPerLevel?: number;
    /** #244 — the mob's OWN regen curve: baseRegen + regenPerLevel*(level-1) */
    baseRegen?: number;
    regenPerLevel?: number;
  };
  reward: {
    gold: number;
    xp: number;
    killsPerLevel: number;
  };
  /** 殭屍王 (#262); absent = the sub-mechanic is off */
  boss?: {
    enabled: boolean;
    killThreshold: number;
    repeatable: boolean;
    maxHp: number;
    attackDamage: number;
    moveSpeed: number;
    attackRange: number;
    attackCdSec: number;
    radius: number;
    modelKey?: string;
    /** GH#192 — ×N the normal mob's hp for that round; wins over `maxHp` */
    hpMult?: number;
    /** GH#192 — the king's own face/model; absent = the round's mob champion */
    championId?: string;
    /** #289 — 指定 / 隨機. SHIPS `"random"`; see {@link MobChampionSource} */
    championSource?: MobChampionSource;
    /** GH#192 體型倍率 (default DEFAULT_BOSS_SIZE_MULT) */
    sizeMult?: number;
    bountyGold: number;
    bountyXp: number;
    /** GH#206 等級提升 — absent on an arena authored before it; defaults to 0 */
    bountyLevels?: number;
    lastHitMultiplier: number;
    /** GH#206 — absent = the shipped `"bonus"` (owner 2026-07-29) */
    lastHitMode?: LastHitMode;
    /** GH#206 — absent = the owner's ruling 「不算」 */
    countOverkill?: boolean;
    /* ── 從英雄推導 (GH#206, owner 2026-07-29) — see `heroDerivedStats` ────── */
    /** ×`championStatBase(MaxHealth)`; ABSENT ⇒ the `hpMult`/`maxHp` path */
    heroHpMult?: number;
    /** ×`championStatBase(AttackDamage)`; ABSENT ⇒ the flat `attackDamage` */
    heroDamageMult?: number;
    /** flat hp added AFTER the multiply (owner 2026-07-28: 加成不參與倍率) */
    hpFlatBonus?: number;
    /** ×the NORMAL zombie's walk speed; ABSENT ⇒ the flat `moveSpeed` */
    moveSpeedMult?: number;
    /** the hero LEVEL the sheet is read at; ABSENT ⇒ the round's mob level */
    heroLevel?: number;
    /** #290 — 怎麼決定上面那格;ABSENT ⇒ 今天的行為 (`heroLevel ?? 該回合等級`) */
    heroLevelSource?: MobHeroLevelSource;
    /* ── #247 無視碰撞 + 每回合上限 (owner 2026-08-01) ─────────────────────
     * ABSENT on all six ⇒ the pre-#247 behaviour, byte-identical: no flight
     * grant is written and the per-round gate is wide open. Every arena doc
     * authored before this batch therefore behaves exactly as it did. */
    /** ABSENT ⇒ false (沒有無碰撞). `content/config/arena-rules.json` ships true. */
    noClip?: boolean;
    /** ABSENT ⇒ true, and only read when `noClip` is on */
    noClipUnits?: boolean;
    /** ABSENT ⇒ true, and only read when `noClip` is on */
    noClipObstacles?: boolean;
    /** ABSENT ⇒ true (仍被場地邊界擋住) — see the schema note on the polarity */
    noClipStayInside?: boolean;
    /** ABSENT ⇒ {@link BOSS_MAX_PER_ROUND_UNCAPPED}, i.e. 今天的「無限出場」 */
    maxPerRound?: number;
    /** ABSENT ⇒ `"zone"` */
    maxPerRoundScope?: BossSpawnCapScope;
    /** #247 仇恨排名. ABSENT ⇒ {@link BOSS_AGGRO_RANK_ABSENT} (= 今天的行為) */
    aggroRank?: number;
    /** #247 長血條三格. ABSENT ⇒ 出貨值 (畫面,不是平衡 — 見 schema 的理由) */
    healthBar?: boolean;
    healthBarAnchor?: BossHealthBarAnchor;
    healthBarReveal?: BossHealthBarReveal;
  };
  /** 特殊殭屍 (#262); absent = no special zombies and no rng draw */
  special?: {
    chancePercent: number;
    hpMult: number;
    damageMult: number;
    moveSpeedMult: number;
    radiusMult: number;
    rewardMult: number;
    modelKey?: string;
    /** GH#192 體型倍率 (default = `radiusMult`, so old docs keep one number) */
    sizeMult?: number;
    /** GH#192 — the special's own face/model; absent = the round's mob champion */
    championId?: string;
    /** #289 — 指定 / 隨機. SHIPS `"random"`; see {@link MobChampionSource} */
    championSource?: MobChampionSource;
    /* ── 從英雄推導 (GH#206) — same three as the king. NO `moveSpeedMult`: the
     * special already has a required one, and it already means 「×一般殭屍」. */
    heroHpMult?: number;
    heroDamageMult?: number;
    hpFlatBonus?: number;
    /** ABSENT ⇒ the round's mob level, so the special grows with the round */
    heroLevel?: number;
    /** #290 — 怎麼決定上面那格. SHIPS `"matchHighest"`; see {@link MobHeroLevelSource} */
    heroLevelSource?: MobHeroLevelSource;
    /* ── 分紅獎池 (#288, owner 2026-07-29) — see {@link MobSpecialBounty} ─────
     * ALL THREE ABSENT ⇒ no pool, no damage ledger, and the pre-#288
     * `rewardMult`-to-the-last-hitter payout, unchanged. */
    bountyGold?: number;
    bountyXp?: number;
    bountyLevels?: number;
    /** ABSENT ⇒ 1 (照傷害比例分,沒有翻倍) */
    lastHitMultiplier?: number;
    /** ABSENT ⇒ `"bonus"`, matching the king's shipped mode */
    lastHitMode?: LastHitMode;
    /** ABSENT ⇒ true (owner: 特殊殭屍也照傷害比例分) */
    splitByDamage?: boolean;
    /** ABSENT ⇒ false, matching the owner's 「溢傷不算」 ruling for the king */
    countOverkill?: boolean;
  };
}

/** Default mob level in the FIRST mob round (`fromRound`) — owner #217: 第3場 = lv3. */
export const DEFAULT_MOB_BASE_LEVEL = 3;
/** Default level gained per round past `fromRound` — owner #217: 每場 +1. */
export const DEFAULT_MOB_LEVEL_PER_ROUND = 1;

/**
 * The mob's EFFECTIVE LEVEL in `round` (task #217). Pure integer arithmetic on
 * the ROUND — the host's deterministic phase counter, the very same value that
 * already feeds `beginCombatGuardians(..., round)`.
 *
 * `round <= fromRound` clamps to `baseLevel` so a mis-armed early round can
 * never produce a level below the floor (or, worse, a negative one).
 */
/**
 * The two caps in effect for `round` — the authored ones, unless the schedule
 * overrides that round (owner, 2026-07-27: round 8 → 10/30, round 9 → 20/60,
 * round 10 → 0/0 乾淨總決賽).
 *
 * ZERO IS A VALUE, not "unset". `maxAlivePerZone: 0` is how the grand final
 * gets no zombies at all, so every read here uses `??` on the FIELD rather than
 * `||` on the number — `0 || 15` is 15, and that one operator would silently
 * repopulate the round the owner asked to empty.
 *
 * `round <= 0` is the 「no round tracking」 sentinel used by unit tests and the
 * client's prediction shadow (same convention as mobLevelForRound): it reads as
 * the authored caps, never as a scheduled row.
 */
export function mobCapsForRound(
  cfg: MobWavesConfigLike,
  round: number,
): { mobsPerWaveCap: number; maxAlivePerZone: number } {
  const authored = { mobsPerWaveCap: cfg.mobsPerWaveCap, maxAlivePerZone: cfg.maxAlivePerZone };
  if (!cfg.schedule || round <= 0) return authored;
  const row = cfg.schedule.find((r) => r.round === Math.round(round));
  if (!row) return authored;
  return {
    mobsPerWaveCap: Math.max(0, row.mobsPerWaveCap),
    maxAlivePerZone: Math.max(0, row.maxAlivePerZone),
  };
}

/** 染黑 default — see `zMobWavesConfig.mob.tintStrength` for why 0.65. */
export const DEFAULT_MOB_TINT_STRENGTH = 0.65;
/**
 * #247 腳下圈圈 defaults. 1.25 is the champion team ring's own diameter (see
 * `ChampionView`'s `CreateTorus` call), so an un-authored zombie wears exactly
 * the ring a player does and the feature is invisible until an operator uses it.
 */
export const DEFAULT_MOB_RING_DIAMETER = 1.25;
/** 1 = 圈圈完全跟著 體型倍率 走, which is owner's 「殭屍王底下圈圈會比較大」. */
export const DEFAULT_MOB_RING_SIZE_FOLLOW = 1;
/**
 * The widest ground ring the renderer will draw, whatever the two knobs say.
 *
 * ⚠️ THIS IS A REAL CEILING AND IT IS NOT SILENT — 24u is the duel zone's own
 * `boundaryRadius`, i.e. a ring that already spans half the arena floor. The
 * authored bounds (diameter ≤ 8, follow ≤ 2) can multiply out to 8 × (1 + 49×2)
 * = 792u against a 體型倍率 of 50, which is a ring bigger than the world. The
 * clamp exists so a legal-but-absurd pair cannot paint the entire arena; it is
 * reported to the operator rather than applied behind their back (see
 * `mobGroundRingDiameter`, which is the ONE place it happens).
 */
export const MOB_RING_MAX_DIAMETER = 24;

/**
 * 這一隻殭屍腳下的圈圈要畫多大 —— the ONE resolver, shared by the renderer and by
 * every test, so 「圈圈」 has a single definition.
 *
 * `sizeMult` is the mob's 體型倍率 as it arrives on the wire (`EntityState.mana`
 * → `EntityViewState.mobScale`). The shape is a LERP, not a bare multiply,
 * because 「圈圈多大」 and 「圈圈要不要跟著體型變大」 are two decisions and an
 * operator must be able to answer them separately:
 *
 *     diameter = base × (1 + (sizeMult − 1) × follow)
 *
 * follow = 1 → 完全跟著 (the shipped king: 1.25 × 10 = 12.5u)
 * follow = 0 → 每一種殭屍一樣大 (1.25u, whatever the size)
 *
 * NEVER NEGATIVE and never past {@link MOB_RING_MAX_DIAMETER}: a follow above 1
 * with a sub-1 `sizeMult` (the shipped 0.68 zombie) can drive the bracket
 * negative, and a mirrored ring is a rendering bug, not a small ring.
 */
export function mobGroundRingDiameter(
  sizeMult: number,
  // ⚠️ `Pick`, not the whole {@link MobVisualTable}: this resolver reads exactly
  // two of its fields, and saying so is what keeps every caller (and every
  // fixture) from having to grow a boss-health-bar setting it does not use when
  // the table gains one. A full table still satisfies it.
  table: Pick<MobVisualTable, "groundRingDiameter" | "groundRingSizeFollow">,
): number {
  const s = Number.isFinite(sizeMult) && sizeMult > 0 ? sizeMult : 1;
  const d = table.groundRingDiameter * (1 + (s - 1) * table.groundRingSizeFollow);
  if (!(d > 0)) return 0;
  return d > MOB_RING_MAX_DIAMETER ? MOB_RING_MAX_DIAMETER : d;
}
/**
 * The king's 體型倍率 when the arena authors none — a DEFAULT, overridable per
 * arena/後台. 10 was owner GH#192 「modal 大小是10倍」; the SHIPPED doc now says 30
 * (owner 2026-07-29 「體型 30 倍」) and this is only the un-authored fallback, so
 * it deliberately stays at the older, safer number rather than tracking it.
 */
export const DEFAULT_BOSS_SIZE_MULT = 10;

/* ═══════════════════════════════════════════════════════════════════════════
 * 殭屍王的仇恨排名 (#247, owner 2026-08-01)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 一隻**沒有**被作者填過 `boss.aggroRank` 的王排第幾 —— `TARGET_CLASS.mob`,
 * 也就是**今天的行為**:王跟一般殭屍同級,排在敵方英雄與召喚物之後。
 *
 * 這一格照「缺席 = 今天的行為」的家規走,跟長血條那三格相反(那三格缺席就是
 * 出貨值)。差別是刻意的:排名是**平衡**,一張沒填過的舊 arena 文件不該因為
 * 這次改動而改變它那一場的打法;長血條是**畫面**,拿到它不會讓任何數字不同。
 */
export const BOSS_AGGRO_RANK_ABSENT: number = TARGET_CLASS.mob;

/** 沒填過的長血條三格 = 出貨值(見 `zMobWavesConfig.boss.healthBar` 的理由)。 */
export const DEFAULT_BOSS_HEALTH_BAR = true;
export const DEFAULT_BOSS_HEALTH_BAR_ANCHOR: BossHealthBarAnchor = "top";
export const DEFAULT_BOSS_HEALTH_BAR_REVEAL: BossHealthBarReveal = "summon";

/**
 * 這一隻殭屍在自動索敵比較器 KEY 1 上排第幾 —— **唯一**的解析點。
 *
 * 呼叫它的只有 sim/targeting.ts 的 `targetClassOf`,而那是 #221 之後全遊戲
 * 唯一一個回答「這東西打不打得到、排第幾」的地方 —— 玩家的自動攻擊
 * (systems/OrderSystem)與 bot 的腦(game-server ai/Tier0Brain)都走它,所以
 * 「優先打王」在兩條路上是**同一行程式**,不會漂移。這正是 targeting.ts 檔頭
 * 那條 FAIRNESS 理由存在的原因。
 *
 * 形狀刻意跟旁邊的 {@link mobSizeMultFor} / {@link mobModelKeyFor} 一樣
 * (`(rules, kind) => 值`),所以 targeting.ts 不必知道 `MobRules` 的內部長相。
 *
 * PURE:沒有 world、沒有亂數、沒有時鐘、沒有 Map 走訪。
 */
export function mobAggroRank(rules: MobRules | null, kind: MobKind): number {
  if (kind !== "boss") return TARGET_CLASS.mob;
  const rank = rules?.boss?.aggroRank;
  return typeof rank === "number" && Number.isFinite(rank) ? rank : BOSS_AGGRO_RANK_ABSENT;
}

/*
 * ⚠️ THERE IS NO `DEFAULT_BOSS_HP_MULT`, AND THAT IS ON PURPOSE (GH#206).
 *
 * One existed — `= 100`, exported, and referenced by exactly nothing in the
 * repo including this file. It read like a knob (the size default one line up
 * IS one) so the next person to lower the king's hp would have edited it and
 * changed nothing. It cannot become live either: for `hpMult` the meaning of
 * ABSENT is 「use the flat `maxHp`」, not 「use 100」, so defaulting it would
 * silently multiply every legacy arena's king by its round's zombie.
 * The shipped 100 lives in `DEFAULT_MOB_WAVES_CONFIG.boss.hpMult`, which is the
 * doc the sim actually loads.
 */

/**
 * WHO WEARS THE ZOMBIE'S FACE IN `round` (GH#191).
 *
 * 「甚至設定每回合殭屍指定哪個英雄來擔任」. Precedence, highest first:
 *   1. that round's schedule row's `championId`;
 *   2. the whole-match `mob.championId`;
 *   3. MOB_CHAMPION_ID.
 *
 * `round <= 0` is the 「no round tracking」 sentinel (unit tests, the client's
 * prediction shadow) and reads as the whole-match setting — the exact same
 * convention `mobCapsForRound` / `mobLevelForRound` use, so the three cannot
 * disagree about what a round-less world means.
 *
 * The schedule is searched by EXACT round the same way the caps are (`find` on
 * `Math.round(round)`), so a row can override the face without touching the caps
 * and vice versa.
 */
export function mobChampionForRound(
  cfg: MobWavesConfigLike,
  round: number,
  pick?: MobChampionPicker,
): string {
  // 1. THE PER-ROUND COLUMN WINS OUTRIGHT, including over `"random"` (#289).
  //    「第 5 回合由皮卡丘擔任」 is an instruction about ONE round; 隨機 is a
  //    whole-match default. The more specific statement wins, which is the same
  //    precedence the row already had over `mob.championId` — 隨機 slots into the
  //    chain where the whole-match field is, not above the row.
  const row = cfg.schedule && round > 0 ? cfg.schedule.find((r) => r.round === Math.round(round)) : undefined;
  if (row?.championId !== undefined) return row.championId;
  // 2. 隨機 (#289) — the HOST draws; an absent/failed draw falls through to 3.
  if (cfg.mob.championSource === "random") {
    const drawn = pick?.("mob", round);
    if (drawn !== undefined && drawn !== "") return drawn;
  }
  // 3. the whole-match setting, then the built-in fallback.
  return cfg.mob.championId ?? MOB_CHAMPION_ID;
}

/**
 * 由誰擔任 for the KING / the SPECIAL — the two blocks that inherit from the
 * normal mob when they say nothing (#289 adds the 隨機 branch on top).
 *
 * `own` is 「這一種殭屍自己指名了一個英雄」 and drives the MESH fallback: a kind
 * that named nobody keeps inheriting the mob's RESOLVED `modelKey` (so an arena
 * that overrode `mob.modelKey` still dresses its king in that mesh), while a kind
 * that drew or named its own champion resolves the mesh FROM that champion. That
 * is byte-for-byte the pre-#289 rule (`championId === undefined ? modelKey :
 * mobChampionModelKey(championId)`) with 隨機 counted as 「自己指名」.
 *
 * An absent block, an absent/blank draw, or `"inherit"`/`"fixed"` with no
 * `championId` all land on the inherited champion — never on a throw and never
 * on an empty id.
 */
function mobKindChampion(
  block: { championId?: string; championSource?: MobChampionSource } | undefined,
  inherited: string,
  slot: MobChampionSlot,
  round: number,
  pick?: MobChampionPicker,
): { championId: string; own: boolean } {
  if (block === undefined) return { championId: inherited, own: false };
  if (block.championSource === "random") {
    const drawn = pick?.(slot, round);
    if (drawn !== undefined && drawn !== "") return { championId: drawn, own: true };
  }
  if (block.championId === undefined) return { championId: inherited, own: false };
  return { championId: block.championId, own: true };
}

/**
 * The MODEL a mob wearing `championId` renders as (GH#192, owner: 「選什麼英雄
 * 就會讀取什麼 3d modal」).
 *
 * Before this, `mobWaves.mob.championId` (the face) and `mobWaves.mob.modelKey`
 * (the mesh) were two independent fields an operator had to keep in agreement by
 * hand — pick a new champion in the console and the zombies kept the old mesh,
 * silently. Now the champion doc's own `modelKey` IS the answer and the config
 * field is only an override.
 *
 * Falls back to MOB_MODEL_KEY when the champion is not registered (skeleton
 * content, a doc id with a typo, a host with no content loaded) rather than
 * emitting an empty key that would render nothing at all.
 */
export function mobChampionModelKey(championId: string): string {
  return Champions.tryGet(championId as ChampionId)?.modelKey ?? MOB_MODEL_KEY;
}

export function mobLevelForRound(cfg: MobWavesConfigLike, round: number): number {
  const base = cfg.mob.baseLevel ?? DEFAULT_MOB_BASE_LEVEL;
  const per = cfg.mob.levelPerRound ?? DEFAULT_MOB_LEVEL_PER_ROUND;
  return base + per * Math.max(0, Math.round(round) - cfg.fromRound);
}

/** The absolute stats a king / special zombie inherits from its hero sheet. */
export interface HeroDerivedMobStats {
  /** `null` = not derived; the caller keeps its pre-#206 number */
  maxHp: number | null;
  /** `null` = not derived; the caller keeps its pre-#206 number */
  attackDamage: number | null;
}

/** Nothing derived — the shared 「走舊路徑」 answer. */
const NO_HERO_DERIVED: HeroDerivedMobStats = { maxHp: null, attackDamage: null };

/**
 * 從英雄推導的數值 (GH#206, owner 2026-07-29): 「生命與能力屬性 = 該設定英雄的 N 倍,
 * 基礎生命額外 +M」.
 *
 * ── WHERE THIS IS ALLOWED TO RUN ───────────────────────────────────────────
 * ARM TIME ONLY. It touches the champion REGISTRY (`Champions.tryGet`) and the
 * 三圍 model (`championStatBase`), neither of which belongs anywhere near a
 * per-tick path: `mobProfile` is called by MovementSystem on every mob on every
 * tick. So the answer is computed ONCE in `mobRulesFromConfig` and stored as a
 * plain number, exactly like the seconds→ticks conversions beside it.
 *
 * ── THE ORDER OF OPERATIONS IS THE OWNER'S, NOT A CHOICE ───────────────────
 *   round(heroStat × mult) + flatBonus        ← the ADD is OUTSIDE the multiply
 * This mirrors 基礎加成 (sim/baseBonus.ts) verbatim, where the owner ruled on
 * 2026-07-28 「初始HP/MP/AP/AD/... 增加數值也要放到後台設定 並且不參與倍率計算」.
 * Folding the +100,000 inside the ×20 would hand the king 2,000,000 hp — the
 * exact v0.9.8 bug that ruling exists to prevent, one mechanic over.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE: MOVE SPEED ────────────────────────────
 * 移速 is anchored on the NORMAL ZOMBIE, never on the hero. The king and the
 * special both default to 「隨機/指定英雄」 as their face, and hero `ms` on this
 * roster runs from 2.6 (喪標麥可) to 6.1 — so a hero-anchored 「特殊殭屍 ×0.5」
 * would be 1.3 for one draw and 3.05 for another, i.e. FASTER than the 3.0
 * zombie it is supposed to be a slowed-down version of. 「移動速度 −50%」 has to
 * mean 「比一般殭屍慢一半」 or it means nothing the player can read.
 *
 * ── DEGRADED INPUT ─────────────────────────────────────────────────────────
 * An unregistered champion (skeleton content, a typo'd doc id, a host with no
 * content loaded) returns {@link NO_HERO_DERIVED} and the caller falls back to
 * its pre-#206 numbers. That is the SAME degradation `mobChampionModelKey`
 * already picks for the mesh: a king with the old hp is playable, a king with
 * `NaN` hp is a crash, and a king with 0 hp dies on spawn.
 */
export function heroDerivedStats(
  championId: string,
  block: {
    heroHpMult?: number;
    heroDamageMult?: number;
    hpFlatBonus?: number;
  },
  heroLevel: number,
  env: CombatEnvMultipliers,
): HeroDerivedMobStats {
  // NOT AUTHORED ⇒ don't even look the champion up. `heroHpMult` absent is the
  // pre-#206 contract (`hpMult` × the round's zombie, or the flat `maxHp`), and
  // a whole shelf of arena tests is written against it.
  if (block.heroHpMult === undefined && block.heroDamageMult === undefined) return NO_HERO_DERIVED;
  const def = Champions.tryGet(championId as ChampionId);
  if (def === undefined) return NO_HERO_DERIVED;
  const level = Math.max(1, Math.round(heroLevel));
  const flat = Math.max(0, block.hpFlatBonus ?? 0);
  return {
    maxHp:
      block.heroHpMult === undefined
        ? null
        : Math.max(1, Math.round(championStatBase(def, Stat.MaxHealth, level, env) * block.heroHpMult) + flat),
    // NOT rounded, unlike hp: melee damage is a float everywhere else in this
    // file (the zombie's own is 1.2) and the sim's damage pipeline takes floats,
    // so rounding here would be a silent balance edit rather than a tidy-up.
    attackDamage:
      block.heroDamageMult === undefined
        ? null
        : Math.max(0, championStatBase(def, Stat.AttackDamage, level, env) * block.heroDamageMult),
  };
}

/**
 * 英雄卡要讀在幾級 —— arm time 的答案 (#290).
 *
 * ⚠️ ABSENT `heroLevelSource` MUST reproduce today's chain EXACTLY. Before #290
 * the only rule was `heroLevel ?? 該回合等級`, and that is what an arena authored
 * before this field means — the king (99) and every pre-#206 doc alike. A
 * "tidier" default of `"round"` here would silently un-pin the king from 滿級 99
 * and cut its hp by more than half.
 *
 * `"matchHighest"` has NO arm-time answer (the whole point is that it is not a
 * constant), so it returns the `"round"` value as the FALLBACK that
 * {@link MobHeroDeriveRule.armedLevel} records — see the note there.
 */
export function mobArmedHeroLevel(
  block: { heroLevel?: number; heroLevelSource?: MobHeroLevelSource },
  roundLevel: number,
): number {
  switch (block.heroLevelSource) {
    case "round":
      return roundLevel;
    case "fixed":
      // 選了「指定」卻沒填數字 ⇒ 退回該回合等級,而不是 1。空欄位是「還沒填」,
      // 不是「一級」。
      return block.heroLevel ?? roundLevel;
    case "matchHighest":
      return roundLevel;
    default:
      return block.heroLevel ?? roundLevel;
  }
}

/**
 * `zone` 裡最高的英雄等級,`null` = 那個 zone 一個英雄都沒有 (#290).
 *
 * ── OWNER 的裁決,逐字 (2026-07-29) ─────────────────────────────────────────
 * 「①「場上英雄」是哪些?=> (a) 該小怪所在 zone 的全英雄(死活都計算在內)」
 *
 * 登記在 `docs/_requirements-audit-gaps.md`(commit c05d8d26,搜「死活都算」)。
 * 同一段還登記了尚未實作的另外三種來源 —— `matchLowest` / `matchAverage` /
 * `mobKills` —— 它們三個都是 spawn time 解析,而且都要「該 zone 的全英雄,死活都
 * 算」這一組人。要加的時候改這裡的迭代,不要另外寫一份。
 *
 * 兩個字都是承重的:
 *
 * **(a-1) 「該小怪所在 zone 的」** —— 不是全世界。一場 3v3v3v3 同時有好幾個
 * duel zone 在打,zone 1 那組打到 L60 不該讓 zone 0 的殭屍變成 L60 的怪物。所以
 * 這裡讀 `world.transform.zone`,而呼叫端 ({@link mobSpawnProfile}) 一定要把小怪
 * 自己要生在哪一區傳進來 —— 這也是 zone 是**必填參數**而不是 optional 的理由:
 * 忘記傳會是型別錯誤,不會安靜地退化成「全世界最高」。
 *
 * **(a-2) 「死活都計算在內」** —— 屍體照算。這是 owner 推翻過的那一版:先前的
 * 實作要求 `alive === true`,結果是全隊倒地的那幾秒特殊殭屍會縮回該回合的小怪等
 * 級(round 3 ⇒ 6,764 hp),然後有人被復活又彈回兩萬多 —— 同一波殭屍在玩家眼裡
 * 忽胖忽瘦,而且「隊友倒下 ⇒ 怪物變弱」正好是難度曲線反過來走。屍體的等級就是
 * 那個玩家這一場的實力,拿它當難度基準是穩定的。
 *
 * ⚠️ 輪空(bye)的隊伍在 `startCombat` 裡被 park 成 `alive:false` 而 `zone` 留在
 * 上一回合的值,所以「死活都算」也把他們算進來。這是**知道而接受**的:同一場的英
 * 雄等級本來就在同一個量級(每回合 grantLevels 齊發),不是離群值。
 *
 * ⚠️ 決定性:`world.champion` 是 Map,插入順序在不同 host 上不保證一致,所以這裡
 * 走**排序過的 EntityId**。平手時取哪一個不影響答案(只取 level 這個數字),但
 * 迭代順序仍然固定 —— 一條不必靠「這次剛好沒差」撐著的規則。
 */
export function matchHighestChampionLevel(world: SimWorld, zone: number): number | null {
  let best: number | null = null;
  for (const id of [...world.champion.keys()].sort((a, b) => a - b)) {
    // (a-1) zone 過濾。沒有 transform 的英雄(不該發生,但 snapshot 重建過的世界
    // 出過)算作「不在任何 zone」,而不是算進每一個 zone。
    if (world.transform.get(id)?.zone !== zone) continue;
    // (a-2) 刻意沒有 `alive` 檢查 —— 見上面 owner 的裁決。
    const lv = world.champion.get(id)?.level;
    if (lv === undefined || !Number.isFinite(lv)) continue;
    if (best === null || lv > best) best = lv;
  }
  return best;
}

/**
 * The stats one mob of `kind` spawns with, `"matchHighest"` resolved AT THIS
 * MOMENT (#290, owner 2026-07-29 「預設是跟當時場上英雄最高等級相同」).
 *
 * ── WHY THIS IS A SECOND FUNCTION AND NOT A BRANCH INSIDE `mobProfile` ──────
 * `mobProfile` is called by MovementSystem for EVERY mob on EVERY tick, and by
 * MobSystem's melee on top of that. This one is called a handful of times per
 * wave. Putting the champion-registry lookup + `championStatBase` behind the
 * per-tick door would pay 100-mobs × 30Hz for an answer that only changes when
 * something spawns.
 *
 * ── AND WHY IT IS SPAWN TIME AND NOT ARM TIME ──────────────────────────────
 * 「當時」. Heroes level up DURING a round (every Nth zombie kill, and the king's
 * `bountyLevels`), so an arm-time answer would make the 20th special of a round
 * identical to the 1st — a mode that reads as implemented and is not.
 *
 * Everything else — `"round"`, `"fixed"`, an absent field, a pre-#206 arena, a
 * plain zombie — takes the `heroDerive === null` short-circuit and returns
 * exactly what `mobProfile` returns, same object shape, same numbers.
 *
 * ── 為什麼 `zone` 是必填的第二個參數 ────────────────────────────────────────
 * owner 2026-07-29 裁決 (a) 說的是「**該小怪所在 zone 的**全英雄」。這隻小怪要生
 * 在哪一區,只有呼叫端知道 (`spawnMob` / `summonMobBoss` 的 `zone` 引數),所以它
 * 一路傳到 {@link matchHighestChampionLevel}。做成必填而不是 `zone?: number`,是
 * 因為 optional 的漏傳會安靜地變成「全世界最高」—— 正好是這條裁決要禁止的行為。
 */
export function mobSpawnProfile(
  world: SimWorld,
  zone: number,
  rules: MobRules,
  kind: MobKind,
): MobProfile {
  const prof = mobProfile(rules, kind);
  const derive =
    kind === "boss"
      ? (rules.boss?.heroDerive ?? null)
      : kind === "special"
        ? (rules.special?.heroDerive ?? null)
        : null;
  if (derive === null) return prof;
  // 這個 zone 一個英雄都沒有(死的也沒有)⇒ `armedLevel`,也就是該回合小怪的等級
  // (owner-suggested fallback)。不是 NaN、不是 0、不會 throw。
  const level = matchHighestChampionLevel(world, zone) ?? derive.armedLevel;
  const live = heroDerivedStats(derive.championId, derive, level, derive.env);
  if (live.maxHp === null && live.attackDamage === null) return prof;
  return {
    ...prof,
    maxHp: live.maxHp ?? prof.maxHp,
    attackDamage: live.attackDamage ?? prof.attackDamage,
  };
}

/**
 * Convert the seconds-based config block into tick-based sim rules. The
 * seconds→ticks conversion happens ONCE, here, at arm time — never per tick, so
 * no per-tick division can round differently on a different host.
 *
 * `round` (task #217) is the host's 1-based combat round. It is the ONLY channel
 * by which the round reaches the sim: the level — and therefore the levelled
 * maxHp/regen — is baked into the returned rules right here, so `spawnMob` and
 * `mobSystem` never learn what a round is and no wall-clock or client state can
 * leak in. Omitting it re-arms at `fromRound` (level = baseLevel), which is what
 * every pre-#217 caller/test means.
 *
 * WHERE THE LEVELLED STATS COME FROM — three tiers, in strict precedence
 * (task #244 「拆文件」):
 *
 *   1. THE MOB CARD (`mobWaves.mob.baseHp` / `hpPerLevel` / `baseRegen` /
 *      `regenPerLevel`) — the SOURCE. This is what the shipped arena authors.
 *   2. the CHAMPION DOC named by `mob.championId` — a LEGACY FALLBACK for
 *      arenas authored before #244 (and for any test that hands in a bare
 *      config), read with the identical `base + growth*(level-1)` law;
 *   3. the config's flat `mob.maxHp` + zero regen, so the mechanic keeps
 *      working content-free (skeleton content, unit tests, a host with no
 *      content loaded).
 *
 * WHY THE SPLIT. Until #244 tier 2 was the ONLY tier and this comment called the
 * champion doc "one source of truth for the hero sheet and its mob avatar". It
 * was really a coupling BUG: 喪標麥可 is BOTH a pickable hero and the #215 mob,
 * so every edit to the hero's `baseStats`/`growth` silently re-tuned the
 * roguelite difficulty — on 2026-07-26 a growth change moved round-3 zombies
 * from 200 to 300 hp with nobody asking for it. The mob now owns its numbers.
 * `championId` still travels, but it only documents WHOSE FACE the mob wears.
 * The identical arithmetic (same `Math.round`, same `base + per*(level-1)`)
 * means the shipped curve survives the split byte-for-byte: round 3 → 300,
 * round 4 → 400, round 5 → 500, round 6 → 600.
 *
 * TIER 2 AND #248. The legacy fallback now reads the champion sheet through
 * `championStatBase`, not through `baseStats`/`growth` directly, because since
 * #248 those fields hold the RAW w3x numbers and the 三圍 term lives outside
 * them: reading them raw would have quietly handed a pre-#244 arena an 80 hp
 * zombie where the champion card says 380. `env` defaults to the shipped
 * coefficients — mob hp is never scaled by combat-env at all (spawnMob writes
 * `world.health` directly), so this argument exists only so a caller that HAS
 * a live table can stay consistent with it.
 */
export function mobRulesFromConfig(
  cfg: MobWavesConfigLike,
  dt: number,
  round: number = cfg.fromRound,
  env: CombatEnvMultipliers = COMBAT_ENV_DEFAULTS,
  /**
   * #289 隨機英雄 — the HOST's draw (see {@link MobChampionPicker}). Optional on
   * purpose: OMITTING IT IS A SUPPORTED MODE, not a bug. The client's prediction
   * shadow, the replay player's pure-function re-arm, and every unit test call
   * this with four arguments or fewer, and they all degrade to 「沿用今天的行為」
   * (`championSource: "random"` reads as `"inherit"`) rather than throwing or
   * emitting an empty champion id. The ONE production caller that passes it is
   * `MatchController.enterCombat`.
   */
  pickChampion?: MobChampionPicker,
): MobRules {
  const ticks = (sec: number): number => Math.max(1, Math.round(sec / dt));
  const level = mobLevelForRound(cfg, round);
  // GH#191 — the round's champion, not the whole-match one. This is the ONE
  // line the per-round 由誰擔任 column was missing: `round` was already an
  // argument (the caps use it), so consuming the field needed no new channel.
  // #289 — and the same one line now also carries 隨機, because the draw is a
  // pure function of (seed, round, slot) that the host hands in.
  const championId = mobChampionForRound(cfg, round, pickChampion);
  const def = Champions.tryGet(championId as ChampionId);
  const perLevel = level - 1;
  // TIER 1 (#244): the mob card owns the curve. `baseHp` is the presence flag —
  // an authored curve wins outright, and the champion doc is never consulted.
  const maxHp =
    cfg.mob.baseHp !== undefined
      ? Math.max(1, Math.round(cfg.mob.baseHp + (cfg.mob.hpPerLevel ?? 0) * perLevel))
      : def === undefined
        ? cfg.mob.maxHp
        : Math.max(
            1,
            // #244 的規矩:英雄的數值調整不得移動肉鴿曲線。這條 legacy tier 只是
            // 把英雄卡當頭像用。v0.9.9 起「全英雄初始生命 +300」住在
            // `finalizeStat`(sim/baseBonus.ts),而這裡呼叫的是 `championStatBase`
            // —— 卡面,不含系統贈禮 —— 所以那條界線不再靠記得傳旗標維持。
            Math.round(championStatBase(def, Stat.MaxHealth, level, env)),
          );
  const hpRegenPerSec =
    cfg.mob.baseRegen !== undefined
      ? Math.max(0, cfg.mob.baseRegen + (cfg.mob.regenPerLevel ?? 0) * perLevel)
      : def === undefined
        ? 0
        : Math.max(0, championStatBase(def, Stat.HealthRegen, level, env));
  const caps = mobCapsForRound(cfg, round);
  // GH#206 — hoisted out of the return literal because the KING's 移速 is now
  // expressible as a multiple of it (see `heroDerivedStats` for why the anchor
  // is this number and not a hero's `ms`).
  const mobMoveSpeed = cfg.mob.moveSpeed ?? MOB_FALLBACK_MOVE_SPEED;
  // GH#192 — the mesh follows the champion; `modelKey` is only an override.
  const modelKey = cfg.mob.modelKey ?? mobChampionModelKey(championId);
  const tintStrength = Math.max(0, Math.min(1, cfg.mob.tintStrength ?? DEFAULT_MOB_TINT_STRENGTH));
  // #247 腳下圈圈 —— clamped to the SAME bounds the Zod schema states, so a doc
  // that bypassed validation (a hand-built config, an overlay written before the
  // field existed) cannot hand the renderer a negative or arena-sized ring.
  const groundRingDiameter = Math.max(
    0,
    Math.min(8, cfg.mob.groundRingDiameter ?? DEFAULT_MOB_RING_DIAMETER),
  );
  const groundRingSizeFollow = Math.max(
    0,
    Math.min(2, cfg.mob.groundRingSizeFollow ?? DEFAULT_MOB_RING_SIZE_FOLLOW),
  );
  // GH#206 — 從英雄推導, resolved HERE and nowhere else. Both blocks inherit the
  // round's champion when they name none, the same precedence the mesh uses one
  // line up, so an operator who only sets 「這回合由誰擔任」 gets a king built from
  // that hero's sheet for free.
  //
  // The LEVEL differs on purpose: the king is pinned (owner 2026-07-29 「殭屍王的
  // 等級是滿級99」) while the special inherits the round's mob level and therefore
  // grows through the match. Absent `heroLevel` = the round's level for both.
  //
  // #290 — 「幾級」 is now a THREE-WAY MODE (`heroLevelSource`), and one of the
  // three (`"matchHighest"`) has no arm-time answer at all. What is baked here
  // is `mobArmedHeroLevel` — today's chain for every legacy doc, the `"round"`
  // value for `"matchHighest"` — and `"matchHighest"` additionally gets a
  // {@link MobHeroDeriveRule} so `mobSpawnProfile` can redo the arithmetic at
  // the live level when a mob is actually created.
  //
  // #289 — the KING's and the SPECIAL's face is resolved ONCE, here, into a
  // single `{championId, own}` that BOTH the hero derivation below and the mesh
  // in the return literal read. That single resolution is the whole guard
  // against failure shape ⑤: a 隨機 draw that only reached `mobChampionModelKey`
  // would ship 「臉是抽到的英雄、數值還是原本那隻」 — a re-skin pretending to be a
  // feature — and no existing test would notice, because every hp assertion in
  // the repo is written against the inherited champion.
  const bossFace = mobKindChampion(cfg.boss, championId, "boss", round, pickChampion);
  const specialFace = mobKindChampion(cfg.special, championId, "special", round, pickChampion);
  const bossArmedLevel = cfg.boss === undefined ? level : mobArmedHeroLevel(cfg.boss, level);
  const specialArmedLevel =
    cfg.special === undefined ? level : mobArmedHeroLevel(cfg.special, level);
  const bossHero =
    cfg.boss === undefined
      ? NO_HERO_DERIVED
      : heroDerivedStats(bossFace.championId, cfg.boss, bossArmedLevel, env);
  const specialHero =
    cfg.special === undefined
      ? NO_HERO_DERIVED
      : heroDerivedStats(specialFace.championId, cfg.special, specialArmedLevel, env);
  // #290 — the spawn-time re-derivation input, and ONLY for `"matchHighest"`.
  //
  // ⚠️ GATED ON `hero.maxHp !== null || hero.attackDamage !== null`, i.e. on the
  // derivation having actually produced something. A block that authors
  // `heroLevelSource: "matchHighest"` but no `heroHpMult`/`heroDamageMult`
  // derives nothing at all (see `heroDerivedStats`), and handing `spawnMob` a
  // rule that recomputes two `null`s every spawn would be pure cost with no
  // observable effect — plus it would make `heroDerive !== null` stop meaning
  // 「這隻真的會在生成時重算」.
  type HeroDeriveBlock = {
    heroHpMult?: number;
    heroDamageMult?: number;
    hpFlatBonus?: number;
    heroLevelSource?: MobHeroLevelSource;
  };
  const deriveFor = (
    block: HeroDeriveBlock | undefined,
    face: { championId: string },
    hero: HeroDerivedMobStats,
    armedLevel: number,
  ): MobHeroDeriveRule | null =>
    block === undefined ||
    block.heroLevelSource !== "matchHighest" ||
    (hero.maxHp === null && hero.attackDamage === null)
      ? null
      : {
          championId: face.championId,
          heroHpMult: block.heroHpMult,
          heroDamageMult: block.heroDamageMult,
          hpFlatBonus: block.hpFlatBonus,
          armedLevel,
          env,
        };
  return {
    fromRound: cfg.fromRound,
    firstWaveTicks: ticks(cfg.firstWaveSec),
    waveIntervalTicks: ticks(cfg.waveIntervalSec),
    // Both caps come from the per-round schedule. Baked HERE, at arm time, next
    // to the level — so the per-tick spawn path keeps reading two plain numbers
    // and still has no idea what a round is.
    mobsPerWaveCap: caps.mobsPerWaveCap,
    maxAlivePerZone: caps.maxAlivePerZone,
    // owner 2026-08-02 的兩個回合結束旋鈕。ABSENT ⇒ 出貨預設（見上面兩個常數），
    // 不是「關掉」—— 一份沒有這兩格的舊 config 拿到的是 owner 現在要的行為。
    stopSpawnOnTeamWipe: cfg.stopSpawnOnTeamWipe ?? DEFAULT_STOP_SPAWN_ON_TEAM_WIPE,
    roundHoldMobKinds: cfg.roundHoldMobKinds ?? DEFAULT_ROUND_HOLD_KINDS,
    level,
    maxHp,
    hpRegenPerSec,
    modelKey,
    sizeMult: cfg.mob.sizeMult ?? 1,
    tintStrength,
    groundRingDiameter,
    groundRingSizeFollow,
    attackDamage: cfg.mob.attackDamage,
    moveSpeed: mobMoveSpeed,
    attackRangeSq: cfg.mob.attackRange * cfg.mob.attackRange,
    attackCdTicks: ticks(cfg.mob.attackCdSec),
    radius: cfg.mob.radius,
    rewardGold: cfg.reward.gold,
    rewardXp: cfg.reward.xp,
    killsPerLevel: cfg.reward.killsPerLevel,
    // #262 — both sub-blocks convert here, at arm time, for exactly the reason
    // the rest of this function exists: seconds→ticks and percent→fraction
    // happen ONCE, so no per-tick divide can round differently on another host.
    // An absent block stays `null` all the way down rather than becoming a
    // zeroed struct, so "off" is representable and testable.
    boss:
      cfg.boss === undefined
        ? null
        : {
            enabled: cfg.boss.enabled,
            killThreshold: cfg.boss.killThreshold,
            repeatable: cfg.boss.repeatable,
            // GH#206 ── THREE TIERS, highest first. The king's own fields are
            // already ABSOLUTE, so the hero derivation simply writes them and
            // `MobBossRules` needs no new shape:
            //   1. `heroHpMult` — ×該英雄 at `heroLevel` (owner 2026-07-29);
            //   2. `hpMult`     — ×the ROUND'S zombie (GH#192 「HP是100倍」), so
            //      the king scales with the curve instead of being a flat number
            //      a zombie retune quietly outgrows;
            //   3. the flat `maxHp`, for an arena that authored neither.
            // Tier 2 and 3 are UNTOUCHED by this change: an arena with no
            // `heroHpMult` produces the same number it did before #206, which is
            // what a shelf of existing arena tests is written against.
            maxHp:
              bossHero.maxHp ??
              (cfg.boss.hpMult === undefined
                ? cfg.boss.maxHp
                : Math.max(1, Math.round(maxHp * cfg.boss.hpMult))),
            // A SEPARATE knob from the hp one, on purpose (owner-approved 折衷):
            // a huge hp pool makes the king a wall, a huge attack makes it a
            // one-shot, so 20× hp does NOT imply 20× damage.
            attackDamage: bossHero.attackDamage ?? cfg.boss.attackDamage,
            // ×THE NORMAL ZOMBIE (0.2 = 「移動速度 −80%」), never ×a hero — see
            // `heroDerivedStats`. Absent ⇒ the flat authored speed.
            moveSpeed:
              cfg.boss.moveSpeedMult === undefined
                ? cfg.boss.moveSpeed
                : Math.max(0, mobMoveSpeed * cfg.boss.moveSpeedMult),
            attackRangeSq: cfg.boss.attackRange * cfg.boss.attackRange,
            attackCdTicks: ticks(cfg.boss.attackCdSec),
            radius: cfg.boss.radius,
            // GH#192 — same precedence as the normal mob: explicit override,
            // else the CHAMPION's mesh (its own, when the block names one).
            // #289 — `bossFace.own` replaces the old
            // `cfg.boss.championId === undefined` test, so a 隨機 draw dresses
            // the king in the champion it DREW instead of inheriting the mob's
            // mesh. Identical answer whenever no draw happened.
            modelKey:
              cfg.boss.modelKey ?? (bossFace.own ? mobChampionModelKey(bossFace.championId) : modelKey),
            // …and the CHARACTER behind that mesh, for the 出場演出. Written
            // UNCONDITIONALLY — including when `bossFace.own` is false and the
            // king simply inherited the wave's champion — because 「這一隻是誰」
            // has an answer in every branch, and gating it on `own` would make
            // the intro silently blank for every arena that pins one champion.
            championId: bossFace.championId,
            sizeMult: cfg.boss.sizeMult ?? DEFAULT_BOSS_SIZE_MULT,
            bountyGold: cfg.boss.bountyGold,
            bountyXp: cfg.boss.bountyXp,
            bountyLevels: cfg.boss.bountyLevels ?? 0,
            lastHitMultiplier: cfg.boss.lastHitMultiplier,
            // GH#206 — `"bonus"` is the owner's 2026-07-29 ruling and therefore
            // the fallback for any arena authored before the field existed.
            lastHitMode: cfg.boss.lastHitMode ?? "bonus",
            countOverkill: cfg.boss.countOverkill ?? false,
            heroDerive: deriveFor(cfg.boss, bossFace, bossHero, bossArmedLevel),
            // #247 —— 無視碰撞, resolved ONCE into the grant `summonMobBoss` hands
            // to `world.flight`. `noClip: false`/absent ⇒ `null` ⇒ no grant is
            // ever written, so a pre-#247 arena keeps a king that collides.
            noClip:
              cfg.boss.noClip === true
                ? {
                    // 0: 「無視碰撞但貼著地面走」. A hover height would need
                    // `EntityState.h`, which the snapshot's mob branch does not
                    // write — see the report. Left at ground level deliberately
                    // rather than authored-but-invisible (failure shape ②).
                    hoverHeight: 0,
                    ignoreUnits: cfg.boss.noClipUnits ?? true,
                    ignoreObstacles: cfg.boss.noClipObstacles ?? true,
                    stayInsideBoundary: cfg.boss.noClipStayInside ?? true,
                  }
                : null,
            maxPerRound: cfg.boss.maxPerRound ?? BOSS_MAX_PER_ROUND_UNCAPPED,
            maxPerRoundScope: cfg.boss.maxPerRoundScope ?? "zone",
            // #247 —— 仇恨排名。缺席 ⇒ 今天的行為(跟一般殭屍同級),見
            // `BOSS_AGGRO_RANK_ABSENT`。這裡寫**絕對值**而不是留 undefined,所以
            // `mobAggroRank` 對「有 arena 但沒填」與「完全沒有 arena」兩種情形
            // 給的答案由這一行決定,不是散在讀取端。
            aggroRank: cfg.boss.aggroRank ?? BOSS_AGGRO_RANK_ABSENT,
            // 長血條三格 —— 缺席 ⇒ 出貨值(畫面,不是平衡;理由見 schema)。
            healthBar: cfg.boss.healthBar ?? DEFAULT_BOSS_HEALTH_BAR,
            healthBarAnchor: cfg.boss.healthBarAnchor ?? DEFAULT_BOSS_HEALTH_BAR_ANCHOR,
            healthBarReveal: cfg.boss.healthBarReveal ?? DEFAULT_BOSS_HEALTH_BAR_REVEAL,
          },
    special:
      cfg.special === undefined
        ? null
        : {
            // percent → fraction ONCE. The config is authored in percent because
            // that is what an operator types into the console; the sim compares
            // against `rng.next()`, which is [0,1).
            chance: Math.max(0, Math.min(1, cfg.special.chancePercent / 100)),
            hpMult: cfg.special.hpMult,
            damageMult: cfg.special.damageMult,
            moveSpeedMult: cfg.special.moveSpeedMult,
            radiusMult: cfg.special.radiusMult,
            // GH#206 — `null` when the arena authored no `heroHpMult`, and then
            // `mobProfile` runs the pre-#206 multiplier expression unchanged.
            maxHp: specialHero.maxHp,
            attackDamage: specialHero.attackDamage,
            // GH#192 — defaults to `radiusMult` so an arena authored before the
            // split keeps ONE number meaning one thing (body and silhouette
            // agreed by construction) instead of silently rendering at 1×.
            sizeMult: cfg.special.sizeMult ?? cfg.special.radiusMult,
            rewardMult: cfg.special.rewardMult,
            // #288 — 分紅獎池. PRESENCE IS THE SWITCH: an arena that authored none
            // of the three pool numbers gets `null` and keeps the pre-#288
            // 「rewardMult 直接給補刀的人」 path byte-for-byte, including keeping no
            // damage ledger. Authoring ANY one of them opts the whole block in
            // (the other two default to 0), which is the same 「一個欄位就啟用」
            // rule `heroHpMult` uses one block up.
            bounty:
              cfg.special.bountyGold === undefined &&
              cfg.special.bountyXp === undefined &&
              cfg.special.bountyLevels === undefined
                ? null
                : {
                    gold: cfg.special.bountyGold ?? 0,
                    xp: cfg.special.bountyXp ?? 0,
                    levels: cfg.special.bountyLevels ?? 0,
                    // 1 = 沒有翻倍. The owner asked only for 「照傷害比例分」 on the
                    // special (the 翻倍 ruling was about the KING), so the shipped
                    // answer is a pure proportion and the knob is there for a
                    // playtest that wants otherwise.
                    lastHitMultiplier: cfg.special.lastHitMultiplier ?? 1,
                    lastHitMode: cfg.special.lastHitMode ?? "bonus",
                    splitByDamage: cfg.special.splitByDamage ?? true,
                    countOverkill: cfg.special.countOverkill ?? false,
                  },
            // #289 — see the king's note one block up.
            modelKey:
              cfg.special.modelKey ??
              (specialFace.own ? mobChampionModelKey(specialFace.championId) : modelKey),
            heroDerive: deriveFor(cfg.special, specialFace, specialHero, specialArmedLevel),
          },
  };
}

/**
 * The MATCH-WIDE mob appearance the client needs and cannot derive (GH#192,
 * extended by #247).
 *
 * 染黑強度 + 腳下圈圈. The per-kind SIZE is NOT here — it is per-entity and rides
 * `EntityState.mana` (see snapshot.ts) — and that is exactly why the ring can be
 * match-wide: the ring is expressed as a FUNCTION of that per-entity size
 * (`mobGroundRingDiameter`), so two numbers on the match state produce three
 * different rings without a new wire field or a `defineTypes` append.
 */
export interface MobVisualTable {
  /** 0 = the champion's own colours, 1 = a solid black silhouette */
  tintStrength: number;
  /** #247 腳下圈圈的基準直徑 at 體型倍率 1 (GGD units); 0 = 不畫圈 */
  groundRingDiameter: number;
  /** #247 圈圈跟著體型倍率放大的程度; 1 = 完全跟著, 0 = 全部一樣大 */
  groundRingSizeFollow: number;
  /**
   * 殭屍王長血條的三格 (#247, owner 2026-08-01 「要像其他遊戲 BOSS 一樣亮長血條」).
   *
   * ⚠️ 為什麼它們騎在**這一張表**上,而不是新開一條線:王的身分本來就已經到得了
   * 客戶端(`mobBossSpawn` 事件帶著王的 entity id,RoomStore 存成
   * `hud.mobBoss.bossId`),所以缺的從來不是資訊,而是**這三個決策要不要可調**。
   * 這張表已經是「小怪長什麼樣子」的既有頻道,而且 `parseMobVisualJson` 是
   * **逐欄位**降級的 —— 一台跑在舊 shard 前面的客戶端拿到的是出貨值,不是一張
   * 歸零的表。多開一個 `MatchState` 欄位要付一格永久的 append-only 索引。
   */
  bossHealthBar: boolean;
  bossHealthBarAnchor: BossHealthBarAnchor;
  bossHealthBarReveal: BossHealthBarReveal;
}

/** The shipped fallback — 「no tint」 is NOT what a missing/blank field means. */
export const MOB_VISUAL_DEFAULT: MobVisualTable = {
  tintStrength: DEFAULT_MOB_TINT_STRENGTH,
  groundRingDiameter: DEFAULT_MOB_RING_DIAMETER,
  groundRingSizeFollow: DEFAULT_MOB_RING_SIZE_FOLLOW,
  bossHealthBar: DEFAULT_BOSS_HEALTH_BAR,
  bossHealthBarAnchor: DEFAULT_BOSS_HEALTH_BAR_ANCHOR,
  bossHealthBarReveal: DEFAULT_BOSS_HEALTH_BAR_REVEAL,
};

/** Serialize the armed rules' visual half for `MatchState.mobVisualJson`. */
export function mobVisualJson(rules: MobRules | null): string {
  const table: MobVisualTable =
    rules === null
      ? MOB_VISUAL_DEFAULT
      : {
          tintStrength: rules.tintStrength,
          groundRingDiameter: rules.groundRingDiameter ?? DEFAULT_MOB_RING_DIAMETER,
          groundRingSizeFollow: rules.groundRingSizeFollow ?? DEFAULT_MOB_RING_SIZE_FOLLOW,
          // #247 —— 王的三格畫面決策。`rules.boss === null`(這張 arena 根本沒有
          // 王)照樣寫出貨值:客戶端不會有王可以畫,所以這裡沒有第二種語意。
          bossHealthBar: rules.boss?.healthBar ?? DEFAULT_BOSS_HEALTH_BAR,
          bossHealthBarAnchor: rules.boss?.healthBarAnchor ?? DEFAULT_BOSS_HEALTH_BAR_ANCHOR,
          bossHealthBarReveal: rules.boss?.healthBarReveal ?? DEFAULT_BOSS_HEALTH_BAR_REVEAL,
        };
  return JSON.stringify(table);
}

/**
 * Decode `MatchState.mobVisualJson`. Every failure mode — "", not JSON, not an
 * object, a non-finite or out-of-range number — degrades to the SHIPPED table,
 * never to a zeroed one: a client that fails to parse must show the zombies the
 * way the game means them to look, not un-tinted and indistinguishable from the
 * players (failure shape ③ — the feature deleted, quietly, and still green).
 *
 * ⚠️ PER FIELD, NOT ALL-OR-NOTHING (#247). A server that predates the ring
 * fields sends `{"tintStrength":0.65}` and MUST still get its tint honoured —
 * rejecting the whole table because one key is missing would silently un-tint
 * every zombie the moment a client ran ahead of a shard. Each key falls back to
 * its own shipped default.
 */
export function parseMobVisualJson(json: string | null | undefined): MobVisualTable {
  if (!json) return MOB_VISUAL_DEFAULT;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return MOB_VISUAL_DEFAULT;
  }
  if (typeof raw !== "object" || raw === null) return MOB_VISUAL_DEFAULT;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  // 同一條「每一格自己降級」的規則,套在 bool / enum 上:一台跑在舊 shard 前面的
  // 客戶端收到的是沒有這三個 key 的表,而它必須拿到**出貨值**,不是 false ——
  // false 會把整個功能靜默刪掉而且全綠(失敗形態 ③)。
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  return {
    tintStrength: num(o.tintStrength, 0, 1, DEFAULT_MOB_TINT_STRENGTH),
    groundRingDiameter: num(o.groundRingDiameter, 0, 8, DEFAULT_MOB_RING_DIAMETER),
    groundRingSizeFollow: num(o.groundRingSizeFollow, 0, 2, DEFAULT_MOB_RING_SIZE_FOLLOW),
    bossHealthBar: bool(o.bossHealthBar, DEFAULT_BOSS_HEALTH_BAR),
    bossHealthBarAnchor: oneOf(
      o.bossHealthBarAnchor,
      BOSS_HEALTH_BAR_ANCHORS,
      DEFAULT_BOSS_HEALTH_BAR_ANCHOR,
    ),
    bossHealthBarReveal: oneOf(
      o.bossHealthBarReveal,
      BOSS_HEALTH_BAR_REVEALS,
      DEFAULT_BOSS_HEALTH_BAR_REVEAL,
    ),
  };
}

/** The two legal values of each長血條 enum — one list, read by the parser and 後台. */
export const BOSS_HEALTH_BAR_ANCHORS: readonly BossHealthBarAnchor[] = ["top", "bottom"];
export const BOSS_HEALTH_BAR_REVEALS: readonly BossHealthBarReveal[] = ["summon", "sighted"];

/**
 * IS `id` A MOB THAT IS **CURRENTLY ALIVE** — as opposed to a CORPSE that has
 * not been swept yet? (L3, owner 2026-07-30: 「如果場上還有沒消滅的各種殭屍,
 * 就算場上只剩同一隊伍也不會結束,除非玩家全滅」.)
 *
 * ⚠️ THE CORPSE CASE IS THE WHOLE REASON THIS PREDICATE EXISTS, and it is the
 * one that is easy to get wrong. `world.mob` is NOT emptied at the instant a
 * zombie dies:
 *
 *   · WITHIN A TICK — `deathSystem` (slot 9) flips `health.alive = false`, and
 *     `mobSystem` (slot 9d′) is what actually `world.destroy`s the body, at the
 *     END of its own pass. Anything reading between those two slots — a hook, a
 *     future system, a mid-tick host probe — sees `world.mob` still holding the
 *     corpse.
 *   · ACROSS TICKS — `mobSystem` bails on its very first line when
 *     `world.combatActive === false` (and when `mobRules === null` /
 *     `mobTicks < 0`), so a zombie that died on the tick combat was frozen
 *     stays in `world.mob` with `alive === false` until `endCombatMobs` runs.
 *
 * A round-end rule that counted `world.mob.size` — or that only checked
 * membership — would therefore see a battlefield full of "zombies" that are
 * lying on the floor with 0 hp, and would refuse to ever end the round. Both
 * `alive` AND `hp > 0` are checked because they are set by DIFFERENT writers
 * (`deathSystem` sets both; damage resolution lowers `hp` earlier in the tick),
 * so between slot 8 and slot 9 a zombie is at 0 hp with `alive` still true.
 *
 * `world.mob.has(id)` is part of the answer, not an assertion: the caller may
 * hand in ANY entity id, and a champion — who is very much alive — must answer
 * `false` here.
 */
export function isMobAlive(world: SimWorld, id: EntityId): boolean {
  if (!world.mob.has(id)) return false;
  const hp = world.health.get(id);
  return hp !== undefined && hp.alive && hp.hp > 0;
}

/**
 * Alive mobs currently in `zone` — 一般殭屍 + 特殊殭屍 + 殭屍王 together, since
 * every one of them is 「沒消滅的殭屍」 as far as the round-end rule is concerned.
 *
 * Shares ONE liveness predicate with {@link anyMobsAlive} on purpose: the wave
 * cap and the round-end gate must never be able to disagree about what a live
 * zombie is (two copies is exactly how a cap that says 「滿了」 ends up next to a
 * gate that says 「清空了」).
 */
export function mobsAliveInZone(world: SimWorld, zone: number): number {
  let n = 0;
  for (const [id, m] of world.mob) {
    if (m.zone !== zone) continue;
    if (isMobAlive(world, id)) n++;
  }
  return n;
}

/**
 * 場上還有沒有「沒消滅的殭屍」? — the L3 round-end query, for the host.
 *
 * The owner's rule (2026-07-30) has three ways a round may end, and this answers
 * the middle one:
 *   · 玩家全滅            → end, mobs or no mobs;
 *   · 只剩一隊存活 **且** `!anyMobsAlive(world, zone)` → end;
 *   · 時間到              → end.
 *
 * WHY A BOOLEAN AND NOT `mobsAliveInZone(...) > 0`: this is called every combat
 * tick, per pairing, and round 9 holds up to 50 zombies per zone. The count
 * function has to walk the whole store; this one stops at the first survivor.
 * Identical answer by construction — same predicate, same iteration — so the
 * two can never drift apart.
 *
 * DETERMINISTIC. Pure read: no `world.rng` draw, no wall clock, no mutation. The
 * result is a fold that is blind to iteration order (`||` over the store), so
 * `world.mob`'s insertion order — which differs between a live match and a
 * replay only if the spawns differed, in which case the answer SHOULD differ —
 * cannot flip it. That is why this one does NOT need the sorted-iteration dance
 * the ordering-sensitive passes in this file use.
 *
 * ⚠️ THE DECISION ITSELF IS NOT HERE. 「宣佈回合勝利」 lives in
 * `apps/game-server/src/match/MatchController.ts` (`checkCombatEnd` for a duel,
 * `checkRoyaleEnd` for the finale), which is a different lane; this module only
 * supplies the fact. See the task write-up for the exact wiring.
 */
export function anyMobsAlive(world: SimWorld, zone: number): boolean {
  return anyMobsAliveOfKinds(world, zone, ROUND_HOLD_KINDS.any);
}

/**
 * 「哪幾種怪會壓住回合不結束」—— owner 2026-08-02
 * 「已經只剩我方英雄 敵方英雄全死 並且場上沒有殭屍王 回合應該要馬上勝利結算才對」
 *
 * ⚠️ 這是一個**決策點**，不是一個常數（CLAUDE.md 第一守則）。它已經被 owner 改過
 * 一次了：2026-07-30 是「任何殭屍都算」（`anyMobsAlive` 的原始語意），2026-08-02
 * 收窄成「只有殭屍王算」。所以它住在後台的 `mobWaves.roundHoldMobKinds`，
 * 而不是寫死在這裡 —— 下次再改是一個下拉選單，不是一次部署。
 *
 * ⚠️ 為什麼「任何殭屍都算」會變成玩家眼中的 bug：那個規則跟生成閘門形成一個
 * **自我維持的迴圈** —— 場上有殭屍 ⇒ 不記勝負 ⇒ 不進 `settledZones` ⇒ 繼續生殭屍。
 * 唯一能打破它的是火圈的百分比真實傷害，所以玩家的體感就是「一定要等火圈」。
 * 迴圈的另一個切點在 `world.spawnHaltedZones`（見 SimWorld）。
 */
export const ROUND_HOLD_KINDS = {
  none: [] as readonly MobKind[],
  boss: ["boss"] as readonly MobKind[],
  bossAndSpecial: ["boss", "special"] as readonly MobKind[],
  any: ["boss", "special", "normal"] as readonly MobKind[],
} as const;

export type RoundHoldMobKinds = keyof typeof ROUND_HOLD_KINDS;

/**
 * 出貨值 = owner 2026-08-02 的原話：「場上沒有殭屍王 → 回合應該要馬上勝利結算」。
 * 這兩個常數是「設定缺席時的行為」，不是「唯一的行為」—— 真正的出貨值住在
 * `content/config/arena-rules.json`，schema DEFAULT 與後台 SHIPPED 各有一份鏡像。
 */
export const DEFAULT_ROUND_HOLD_KINDS: RoundHoldMobKinds = "boss";
export const DEFAULT_STOP_SPAWN_ON_TEAM_WIPE = true;

export function anyMobsAliveOfKinds(
  world: SimWorld,
  zone: number,
  kinds: readonly MobKind[],
): boolean {
  if (kinds.length === 0) return false;
  for (const [id, m] of world.mob) {
    if (m.zone !== zone) continue;
    if (!kinds.includes(m.kind)) continue;
    if (isMobAlive(world, id)) return true;
  }
  return false;
}

/**
 * Twelve edge directions as unit offsets (30° apart). Authored numeric literals
 * rather than a `Math.cos` loop — `sim/purity.test.ts` bans trig in SOURCE, and
 * a lookup table is exactly how that ban is meant to be satisfied (same pattern
 * as the coin ring). The values are cos/sin at 0°,30°,…,330° to 7 digits.
 */
export const DIR_TABLE: readonly Vec2[] = [
  { x: 1, z: 0 },
  { x: 0.8660254, z: 0.5 },
  { x: 0.5, z: 0.8660254 },
  { x: 0, z: 1 },
  { x: -0.5, z: 0.8660254 },
  { x: -0.8660254, z: 0.5 },
  { x: -1, z: 0 },
  { x: -0.8660254, z: -0.5 },
  { x: -0.5, z: -0.8660254 },
  { x: 0, z: -1 },
  { x: 0.5, z: -0.8660254 },
  { x: 0.8660254, z: -0.5 },
];

/**
 * Integer hash of three small ints → an unsigned 32-bit value, using only
 * xor / multiply / shift (FNV-1a style). NO floats, no trig, no `**`, so it is
 * byte-identical on every replica/replay and never touches `world.rng`. Used to
 * pick a stable edge DIRECTION per (zone, waveIndex, mobIndex).
 */
export function mixInt(a: number, b: number, c: number): number {
  let h = 0x811c9dc5;
  h = Math.imul(h ^ (a & 0xffff), 0x01000193);
  h = Math.imul(h ^ (b & 0xffff), 0x01000193);
  h = Math.imul(h ^ (c & 0xffff), 0x01000193);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Where the `i`-th mob of wave `k` spawns in `zone`: on the zone rim, in a
 * direction chosen deterministically from DIR_TABLE by `mixInt(zone, k, i)`.
 * Pure function of its three int inputs (no rng draw). The rim point is then
 * pushed out of obstacles and clamped into the zone (the same two helpers the
 * flower/coin spawns fall back to) so a direction that lands inside a wall or
 * outside the boundary still yields legal ground.
 */
export function mobSpawnPos(world: SimWorld, zone: number, k: number, i: number, radius: number): Vec2 {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  const dir = DIR_TABLE[mixInt(zone, k, i) % DIR_TABLE.length]!;
  // inset the rim by the body radius so the whole mob starts inside the boundary
  const inset = Math.max(0, zoneDef.boundaryRadius - radius);
  const body = {
    pos: { x: zoneDef.center.x + dir.x * inset, z: zoneDef.center.z + dir.z * inset },
    radius,
  };
  for (const ob of zoneDef.obstacles) pushOutOfObstacle(body, ob);
  clampToBoundary(body, zoneDef);
  return body.pos;
}

/**
 * Spawn ONE mob at the zone edge: Transform (radius rules.radius) + Health (no
 * regen — a mob has no StatsComp) + MobComp + Navigation (empty; MovementSystem
 * walks it at BASE_MOVE_SPEED) + TeamComp on the sentinel MONSTER team. NO
 * ChampionComp / seat / StatsComp / AbilitiesComp. Emits
 * `mobSpawn {id, zone, x, z, maxHp}`.
 */
export function spawnMob(world: SimWorld, zone: number, rules: MobRules, k: number, i: number): EntityId {
  // ROLL FIRST, then place: the body radius (and therefore the edge inset) is
  // kind-dependent, so a special zombie spawned at the normal inset would clip
  // through the boundary on its first tick.
  const kind = rollMobKind(world, rules);
  // #290 — `mobSpawnProfile`, not `mobProfile`: 「跟當時場上英雄最高等級相同」 is
  // resolved HERE, at the one moment 「當時」 means something. Identical to
  // `mobProfile` for every other mode (short-circuits on `heroDerive === null`).
  // `zone` travels with it — owner 2026-07-29 「該小怪所在 zone 的全英雄」.
  const profile = mobSpawnProfile(world, zone, rules, kind);
  const pos = mobSpawnPos(world, zone, k, i, profile.radius);
  const id = spawnMobBody(world, zone, kind, profile, pos);
  world.emit("mobSpawn", { id, zone, x: pos.x, z: pos.z, maxHp: profile.maxHp, kind });
  return id;
}

/**
 * Summon the 殭屍王 into `zone` (task #262). Called from MobSystem the instant
 * ONE champion's cumulative zombie tally crosses `boss.killThreshold`.
 *
 * The entity is an ordinary mob in every structural sense — MONSTER team, no
 * ChampionComp, no StatsComp, driven by the same MobSystem AI — so nothing
 * about duel resolution, the scoreboard, team lives or placement has to learn
 * about kings. Only {@link MobComp}'s `kind` differs, and everything that forks
 * on it forks through {@link mobProfile}.
 *
 * The spawn point comes from the SAME pure `mobSpawnPos` table the waves use,
 * keyed by (zone, {@link BOSS_SPAWN_WAVE}, kills): the king walks in from the
 * rim like everything else, deterministically, without touching `world.rng`.
 * `kills` is in the key so two kings summoned in one zone in one match do not
 * stack on the same rim point.
 *
 * #L1 — SUMMONING A KING ALSO PUSHES THE ROUND'S TWO DEADLINES OUT (owner
 * 2026-07-30 「殭屍王出現回合結束時間延長 3 分鐘(火圈時間也延後)…避免打到一半
 * 結果回合結束」). It happens HERE, not at the MobSystem call site, because this
 * is the one function through which a king actually enters the world — the
 * shipped path, the replay path and any future caller all pass through it, so
 * no caller can spawn a king that does not extend the round (failure mode ⑤:
 * 被測的不是出貨的那個). The arithmetic lives in `sim/fireRing.ts`, next to the
 * clock it moves.
 */
export function summonMobBoss(
  world: SimWorld,
  zone: number,
  rules: MobRules,
  summoner: EntityId,
  kills: number,
): EntityId | null {
  if (rules.boss === null || !rules.boss.enabled) return null;
  // #247 —— 每回合最多幾隻 (owner 2026-08-01 「每回合最多只會出現一次殭屍王，不會
  // 無限出場」). GATED HERE, before anything is spawned or any clock is moved, for
  // the same reason the round extension lives in this function: this is the ONE
  // door a king enters through, so no caller can be the one that skips the cap
  // (失敗形態 ⑤ — 被測的不是出貨的那個).
  //
  // ⚠️ THIS IS NOT `repeatable`. `repeatable` is a MATCH-WIDE question about one
  // champion's tally (「第 200 隻要不要再來一次」); this is a ROUND-WIDE question
  // about the zone (「這回合已經來過幾隻了」). Six champions in one zone each
  // crossing 100 kills is exactly the case `repeatable` cannot see and the case
  // owner watched happen.
  const capKey = bossSpawnCapKey(zone, rules.boss.maxPerRoundScope);
  const already = world.bossSpawnsThisRound.get(capKey) ?? 0;
  if (bossSpawnCapReached(rules.boss, already)) return null;
  // #290 — same seam as `spawnMob`'s; a king summoned mid-round is a spawn too.
  // The king walks into the SUMMONER's zone, so that is the zone whose heroes
  // 「跟場上最高」 would read (inert while the shipped king is `"fixed"` at 99).
  const profile = mobSpawnProfile(world, zone, rules, "boss");
  const pos = mobSpawnPos(world, zone, BOSS_SPAWN_WAVE, kills, profile.radius);
  const id = spawnMobBody(world, zone, "boss", profile, pos);
  world.bossSpawnsThisRound.set(capKey, already + 1);
  // #247 —— 無視碰撞穿透地形. The king is handed the SAME `FlightGrant` a flying
  // champion carries, so the three MovementSystem exemptions (steering wall-stop,
  // unit soft-separation, post-separation push-out) have exactly one
  // implementation between them and cannot disagree about who is airborne.
  //
  // WRITTEN DIRECTLY, not through a StatsComp source: a mob deliberately has no
  // StatsComp (see `MobComp` in sim/components.ts), which is also what makes this
  // write SAFE — `flightSystem` reconciles only ids present in `world.stats`, so
  // it can never see this entry and delete it. `world.destroy` clears
  // `world.flight`, so the grant dies with the king.
  if (rules.boss.noClip) world.flight.set(id, rules.boss.noClip);
  // #L1 — 「回合結束時間延長 3 分鐘(火圈時間也延後)」. AFTER the body exists, so a
  // summon that could not happen cannot move the clock, and BEFORE the event, so
  // the announcement carries the extension that is already in force rather than
  // one a later line still has to apply.
  const extendedTicks = extendRoundForBoss(world);
  world.emit("mobBossSpawn", {
    id,
    zone,
    x: pos.x,
    z: pos.z,
    maxHp: profile.maxHp,
    summoner,
    summonerSeatId: world.team.get(summoner)?.seatId ?? -1,
    kills,
    // 出場演出 (owner 2026-08-02) —— WHOSE FACE walked in. The client cannot
    // derive this: `EntityState.key` carries a MODEL doc id, and the shipped
    // `boss.championSource: "random"` means the answer changes every arm.
    // `""` = 「這份 rules 沒有身分」 (a hand-built fixture); the intro then draws
    // nothing rather than looking up champion `undefined`.
    championId: rules.boss.championId ?? "",
    // #L1 — the REAL number, read back out of `extendRoundForBoss`, not the
    // authored `extendCombatSec`: a disarmed ring or a 0 knob extends nothing,
    // and a broadcast that said 「延長 180 秒」 anyway would be a lie the player
    // can time with a stopwatch. 0 = 「這場沒有延長」.
    //
    // ⚠️ #248 gave that sentence a third way to be true: 回合硬上限 clips the
    // extension to whatever is left under `roundHardCapSec`, so a late king can
    // legitimately return a PARTIAL number, or 0 once the round is already at
    // the wall. That is why this reads the return value and not the config.
    extendedTicks,
    /** the ignition tick now IN FORCE — post-delay, for the HUD's ring cue */
    fireRingStartTick: fireRingIgnitionTick(world),
  });
  return id;
}

/**
 * The wave index the king's spawn position is keyed by. A large constant well
 * clear of any real wave `k`, so a king can never land on the same rim point as
 * the wave that summoned it.
 */
export const BOSS_SPAWN_WAVE = 9001;

/**
 * The four components EVERY walking neutral body needs: Transform + Health +
 * Navigation + TeamComp. NOTHING kind-specific — no MobComp, no SummonComp.
 *
 * ── WHY THIS IS ITS OWN FUNCTION (GH#289 lane P2 召喚物) ────────────────────
 * `summon` needs the identical four writes: a body at a legal point, on a team,
 * with an empty nav so `orderSystem`'s chase resolution and `movementSystem`'s
 * integrator pick it up. The instruction for that lane was 「把 spawnMob 參數
 * 化，不要重寫一份」, and THIS is the parameter that was missing — the old
 * private `spawnMobBody` hard-coded {@link MONSTER_TEAM} and always wrote a
 * MobComp, which is exactly what a summon must NOT have (see SimWorld.summon:
 * the #215 wave scheduler counts `mob` entries against its own alive cap and
 * pays 20 gold per kill out of that ledger).
 *
 * So the SHAPE is shared and the MARKER is the caller's. A second copy of these
 * four writes would drift on the next Transform/Health field — `accel`,
 * `shields` and `attackTargetAuto` were all added after #215 and every hand-
 * rolled spawn in the repo had to be found and fixed each time.
 */
export function spawnUnitBody(
  world: SimWorld,
  spec: {
    zone: number;
    pos: Vec2;
    radius: number;
    maxHp: number;
    maxMana?: number;
    teamId: TeamId;
    seatId: SeatId;
  },
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: spec.pos.x, z: spec.pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: spec.radius,
    zone: spec.zone,
  });
  world.health.set(id, {
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    mana: 0,
    maxMana: spec.maxMana ?? 0,
    alive: true,
    shields: [],
  });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.team.set(id, { teamId: spec.teamId, seatId: spec.seatId });
  return id;
}

/** The component set every mob carries, kind-independent. */
function spawnMobBody(
  world: SimWorld,
  zone: number,
  kind: MobKind,
  profile: MobProfile,
  pos: Vec2,
): EntityId {
  // seatId -1: a mob belongs to no player seat — the same "no seat" sentinel the
  // snapshot emits for every neutral entity. Only `teamId` is load-bearing.
  const id = spawnUnitBody(world, {
    zone,
    pos,
    radius: profile.radius,
    maxHp: profile.maxHp,
    teamId: MONSTER_TEAM,
    seatId: asSeatId(-1),
  });
  world.mob.set(id, {
    zone,
    team: MONSTER_TEAM,
    kind,
    target: -1,
    attackCdTicks: 0,
    spawnTick: world.mobTicks,
  });
  return id;
}
