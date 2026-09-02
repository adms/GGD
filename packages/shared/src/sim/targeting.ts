/**
 * targeting.ts — THE ONE auto-attack target rule (task #221).
 *
 * Owner directive (2026-07-26):
 *   「玩家操控的 近戰跟遠戰英雄 應該都要會自動攻擊附近英雄
 *     優先打攻擊自己的敵人 再來是血量低的 再來是距離最近的」
 *
 * A player-controlled champion — melee AND ranged — must engage nearby enemies
 * without the player ever right-clicking one. Before this module the sim had NO
 * auto-attack concept at all: `Navigation.attackTarget` was only ever written by
 * an explicit seat order (OrderSystem), by MobSystem for mobs, and by the BOT's
 * private nearest-enemy loop in `apps/game-server/src/ai/Tier0Brain.ts`. A human
 * who never right-clicked therefore had `attackTarget === null` forever and
 * `BasicAttackSystem`'s `if (!nav?.attackTarget) continue` bailed every tick.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES IN packages/shared/src/sim AND NOT IN THE BOT BRAIN
 * ---------------------------------------------------------------------------
 * 1. REPLAY. A rule that lives in a seat DRIVER does not replay: playback
 *    reconstructs drivers, so driver-side decisions are re-derived rather than
 *    re-played. An in-sim rule rides the recorded intent frames for free.
 * 2. FAIRNESS. Two targeting brains drift. `Tier0Brain` now calls
 *    {@link acquireTarget} too, so a bot and a human resolve "which enemy" with
 *    literally the same comparator on the same candidate set.
 * 3. DETERMINISM. Every client and every replay must pick the SAME enemy, so
 *    the order must be TOTAL and STABLE — see the comparator contract below.
 *
 * ---------------------------------------------------------------------------
 * THE COMPARATOR (total order — every tie falls through to the next key)
 * ---------------------------------------------------------------------------
 *   1. kind    — enemy CHAMPION (0) before SUMMON (1) before MOB (2), EXCEPT
 *                the 殭屍王, whose rank on this axis is a 後台 field and ships
 *                at −1, i.e. ABOVE enemy champions (#247; see `targetClassOf`)
 *   2. threat  — is it hitting me right now? (0 = yes, 1 = no)
 *   3. hp      — lowest current HP first
 *   4. d2      — nearest first (squared distance; never a sqrt)
 *   5. id      — lowest entity id (the FINAL tiebreak; always decides)
 *
 * Key 1 is the owner's 「附近英雄」 read: a hero anywhere inside the acquisition
 * radius outranks every mob. MOBS ARE STILL VALID TARGETS — they are simply the
 * fallback. Excluding them entirely would mean a player standing in a 30-zombie
 * pile from round 3 auto-attacks nothing at all, which reads as the feature
 * being broken; making them peers would let a 1-HP zombie out-rank the enemy
 * hero on key 3. Champion-before-mob is the only ordering that satisfies both.
 * 召喚物 sit BETWEEN the two and can be moved to either end per ability — the
 * tiers, the reasoning and the defaults are in sim/summonRules.ts.
 *
 * Keys 2-4 are the directive verbatim: 威脅 → 低血 → 最近.
 *
 * Key 5 exists because keys 1-4 are all tie-able (two full-HP mirror champions
 * placed symmetrically is the ordinary case at round start). Candidates arrive
 * from {@link queryOverlap}, which is documented and guaranteed to return
 * ASCENDING entity ids, and the scan below keeps the incumbent on an exact tie —
 * so the lowest id wins without a separate compare. NOTHING here iterates a Map
 * in insertion order: not `world.team`, not `world.nav`, and explicitly not the
 * inner `recentDamagers` map (whose iteration order is first-hit order, not id
 * order) — it is only ever used as a per-candidate LOOKUP.
 *
 * PURITY: no Math.random / Date.now / trig / `**` (see sim/purity.test.ts).
 * Distances stay squared and reaches are squared by multiplication.
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { StatsComp } from "./stats/statsComp";
import { distSq } from "./math/vec2";
import { queryOverlap } from "./collision/queries";
import { reachTo } from "./systems/BasicAttackSystem";
import { mobAggroRank } from "./mobs";
import { canSee } from "./stealth";
// [EX∅ 根源] 的兩支謂詞模組。⛔ 空殼期間全部回 false，見它們的 ZERO GUARANTEE。
import { carryBlocksAuto, carryBlocksManualTarget, carryBlocksMobAggro } from "./carry";
import { isMindControlled } from "./mindControl";
import { tauntedBy, type TauntPriority } from "./taunt";
import {
  TARGET_CLASS,
  summonAutoTargetable,
  summonManualTargetable,
  summonMobTargetable,
  summonTargetClass,
} from "./summonRules";

/**
 * How recently an enemy must have damaged me to count as "attacking me"
 * (key 2). 75 ticks = 2.5 s at 30 Hz — long enough that a ranged trade or a
 * slow-cadence melee swing keeps the aggressor flagged between blows, short
 * enough that a hit taken across the round does not permanently pin the target.
 *
 * The source of truth is `world.recentDamagers` (victim -> attacker -> tick),
 * which the assist bookkeeping in stats/matchStats.ts already maintains. NO
 * SECOND THREAT STORE IS ADDED: a parallel memory would be one more thing to
 * desync. Note its documented limit — it only records CHAMPION -> CHAMPION enemy
 * damage — which is harmless here precisely because key 1 already puts every
 * champion above every mob.
 */
export const THREAT_WINDOW_TICKS = 75;

/**
 * Minimum auto-acquisition radius (units), regardless of how short the weapon
 * is. Melee reach is ~1.6, so without a floor a melee hero would only ever
 * auto-attack somebody ALREADY touching it — it would never step forward, and
 * the feature would look dead for half the roster. 6 u is a modest step: it is
 * a quarter of the 24 u zone radius and well under every ranged band (6-12), so
 * a ranged champion still uses its own longer reach.
 */
export const MELEE_ACQUIRE_FLOOR = 6;

/**
 * Extra slack (units) before an ALREADY auto-acquired target is dropped. Pure
 * hysteresis: without it a target hovering exactly on the radius would be
 * acquired and dropped on alternating ticks, cancelling the wind-up each time
 * (BasicAttackSystem cancels a swing on target loss) — visible as a hero that
 * twitches and never lands a blow. It is also what stops the hero chasing
 * across the map: an auto target is leashed at `radius + 2`, never followed.
 *
 * EXPLICIT targets are NEVER leashed — the player's own order outranks this.
 */
export const ACQUIRE_LEASH = 2;

/** Radius assumed for a prospective target when sizing our own reach. */
const NOMINAL_TARGET_RADIUS = 0.6;

/** A resolved candidate: the winner plus the sort keys that won it. */
export interface AcquiredTarget {
  id: EntityId;
  /**
   * 嘲弄 (sim/taunt.ts). 0 = THIS candidate is the unit that has taunted me,
   * 1 = it has not. SORT KEY ZERO — see {@link beats}.
   */
  forced: number;
  /**
   * {@link TARGET_CLASS}: 0 = enemy champion, 1 = summon, 2 = mob — and NOT
   * necessarily one of those three. The 殭屍王 takes whatever rank
   * `mobWaves.boss.aggroRank` names (ships −1, above enemy champions), so this
   * is a NUMBER on that axis, not an enum. `beats` only ever asks `<`.
   */
  kind: number;
  /** 0 = damaged me within THREAT_WINDOW_TICKS, 1 = has not */
  threat: number;
  hp: number;
  /** squared centre-to-centre distance from the acquirer */
  d2: number;
}

/**
 * 嘲弄 —— THE ONE seam. 「`self` 這一刻被迫打誰」, or null.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS ONE FUNCTION WITH A `scope`, AND NOT TWO (OR THREE) PREDICATES
 * ---------------------------------------------------------------------------
 * This file's header is a post-mortem: 「什麼可以被索敵」 was answered
 * independently in three places, one of them was not updated when 召喚物
 * landed, and nothing in the game could target a summon. A taunt is the SAME
 * question asked by the SAME three call sites (auto-acquire, the bot brain via
 * `acquireTarget`, and MobSystem's aggro scan), so it gets the same treatment:
 * one function, and nobody else reads `world.taunt`.
 *
 * `scope` exists because the LEGALITY half genuinely differs and already did
 * before this existed — `isAutoTargetable` (team test + stealth) is not
 * `isMobTargetable` (no team test; MobSystem owns that, and a different stealth
 * field gates it). Re-deriving either one here would be the third copy. So:
 *
 *   "auto" → `isAutoTargetable`, i.e. exactly what auto-acquire already allows
 *   "mob"  → `isMobTargetable` + an explicit different-team test, i.e. exactly
 *            what MobSystem's own scan already allows
 *
 * ---------------------------------------------------------------------------
 * IT IS RE-VALIDATED EVERY TICK, NOT AT APPLY TIME
 * ---------------------------------------------------------------------------
 * `applyTaunt` deliberately checks nothing but the clock. Everything that can
 * make a taunt stop meaning anything — the taunter dies, goes invisible, leaves
 * the zone, changes team through a 變身 — is asked here, fresh, on the tick it
 * matters. Validating once at apply time would leave a wrong answer standing
 * for up to the whole duration, and 「一個 tick 之後才修好」 is exactly the
 * failure `stealth`'s destroy-cleanup note warns about.
 *
 * The zone test is HERE and not inside the two predicates because neither of
 * them has one (`rankOf` does it separately, MobSystem does it in its scan) —
 * so a taunt landed just before an arena swap cannot drag a body at a target
 * in another duel zone.
 */
export function forcedTargetOf(
  world: SimWorld,
  self: EntityId,
  scope: "auto" | "mob" = "auto",
): EntityId | null {
  const by = tauntedBy(world, self);
  if (by === null) return null;
  // 小怪吃不吃嘲弄 —— a FIELD, read at USE time so flipping it off in the
  // console frees every zombie on the very next tick instead of waiting for the
  // taunts already in flight to lapse (sim/taunt.ts::TauntRules.appliesToMobs).
  if (scope === "mob" && !world.tauntRules.appliesToMobs) return null;
  const selfT = world.transform.get(self);
  const byT = world.transform.get(by);
  if (!selfT || !byT || selfT.zone !== byT.zone) return null;
  // 牽引距離 (sim/taunt.ts::TauntRules.leashUnits) —— 「這條拉繩有多長」。
  // ⭐ 決策點做成欄位,而且判定在**這裡**是它唯一該在的地方:一發嘲弄無視受害者
  // 自己的索敵半徑(那是刻意的),所以在這一格之前**沒有任何東西**限制一個嘲弄者
  // 可以把一具身體拖多遠 —— 掛上、跑掉,受害者就一路追過整個區域。
  // 和到期同一個形態:讀取時判定,跑遠了當場鬆手,跑回來又生效。0 = 不限制。
  const leash = world.tauntRules.leashUnits;
  if (leash > 0 && distSq(selfT.pos, byT.pos) > leash * leash) return null;
  if (scope === "mob") {
    // MobSystem's own scan skips the MONSTER team before it ever calls
    // `isMobTargetable`; re-express that as 「不同隊」 so a mob can never be
    // taunted onto another mob (and so this stays true if the sentinel moves).
    const myTeam = world.team.get(self);
    const theirTeam = world.team.get(by);
    if (!myTeam || !theirTeam || myTeam.teamId === theirTeam.teamId) return null;
    if (!isMobTargetable(world, by, self)) return null;
  } else if (!isAutoTargetable(world, self, by)) {
    return null;
  }
  const hp = world.health.get(by);
  return hp?.alive ? by : null;
}

/**
 * How far a champion auto-acquires: its own effective attack reach, floored so
 * melee is not limited to targets already in contact. Derived from the SAME
 * `reachTo` the swing gate and the chase both use, so a ranged champion opens
 * fire from range and a melee champion closes in — with no second range number
 * to keep in sync.
 */
export function acquireRadius(
  sc: StatsComp | undefined,
  selfRadius: number,
  /**
   * ⭐ 近戰的**最小**索敵半徑。2026-09-01 起它是一格設定
   * （`config.combat-feel@1` 的 `autoEngage.meleeAcquireFloor`）——
   * ⛔ 在此之前它是這個檔的一個寫死常數，而 owner 的大目標逐字是
   * 「**所有功能都要可 JSON 操作設定**」。
   * ⚠️ 缺席 ⇒ 用 `MELEE_ACQUIRE_FLOOR`（⭐ 逐位元等於原本的值）。
   */
  floor: number = MELEE_ACQUIRE_FLOOR,
): number {
  if (!sc) return floor;
  const reach = reachTo(sc, selfRadius, NOMINAL_TARGET_RADIUS);
  return reach > floor ? reach : floor;
}

/**
 * WHICH TIER of combat body `cand` is, or `null` when nothing may auto-attack
 * it. THE one answer to 「這東西打不打得到」 — every automatic target picker in
 * the sim goes through this function, so a new body kind is wired in ONE place
 * instead of being remembered at each call site.
 *
 * That single-seam property is the whole point, and it is not theoretical: the
 * previous shape was the literal predicate
 *   `if (!world.champion.has(c) && !world.mob.has(c)) return false;`
 * duplicated in spirit by MobSystem's `if (!world.champion.has(cid)) continue;`
 * — and when 召喚物 landed as a THIRD kind of body (deliberately neither store),
 * both allow-lists silently excluded it. Nothing in the game could acquire a
 * summon; it hit people and nothing hit back.
 *
 * WHY NOT A 「可被索敵」 COMPONENT ON EVERY BODY. It was the other candidate and
 * it is the wrong trade here. Four of the transform-carrying non-bodies —
 * revive circles, dropped coins, aura carriers, projectiles — are already kept
 * OUT OF THE BROAD-PHASE GRID entirely (`SimWorld.rebuildGrid`), which is a
 * STRUCTURAL guarantee: every targeting query walks that grid, so they cannot be
 * targeted even by code that forgets about them. Re-expressing those four as
 * trait-carriers would replace a guarantee with a filter somebody can forget.
 * Flowers and guardian structures are excluded a second way (no TeamComp), which
 * the team test below still enforces. So: ONE predicate that every picker calls,
 * over the three stores that really are combat bodies — not a component every
 * body must remember to carry.
 */
export function targetClassOf(world: SimWorld, cand: EntityId): number | null {
  // [背負]（[EX∅ 根源]）—— 躲在箱子裡的身體對**自動索敵**不存在。
  // 閘下在這裡而不是各 picker，正是這個檔檔頭那篇「召喚物被三份獨立答案漏掉」
  // 的驗屍報告要求的：一個謂詞，每個 picker 都走它。
  // ⚠️ 這一行**今天真的會擋人**：`carryBlocksAuto` 讀 `world.carried`，而
  // `effects/carry.ts` 上車那一刻就寫進 `blocksAutoAcquire`（禰豆子的木箱）。
  // ⛔ 這裡曾經寫著「空殼期間 `carryBlocksAuto` 一律回 false，所以這一行今天是
  // 嚴格的 no-op」—— 那句話在 [背負] 從空殼變成真的那一刻就過期了（第三守則）。
  if (carryBlocksAuto(world, cand)) return null;
  if (world.champion.has(cand)) return TARGET_CLASS.champion;
  const sm = world.summon.get(cand);
  if (sm !== undefined) {
    // 召喚物該不該被自動索敵 is a DECISION POINT, not a constant: 分身/複製鏡
    // exist to soak attacks, 災難之牆's wall units are scenery. See
    // sim/summonRules.ts. `false` here means 「自動索敵看不見」 ONLY — the body
    // is still in the grid, so ability AoE and skillshots still hit it. It is
    // not invulnerability, and it must not be read as such.
    if (!summonAutoTargetable(sm)) return null;
    return summonTargetClass(sm);
  }
  // 小怪。⚠️ 這不再是常數 `TARGET_CLASS.mob` —— **殭屍王的排名是一個後台欄位**
  // (#247, owner 2026-08-01 「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」)。
  //
  // 為什麼是「排名」而不是另外加一個仇恨分數:KEY 1 本來就是一根字典序的排名軸
  // (`beats` 比的是 `a.kind < b.kind`),所以「王排第幾」在這根軸上是可以直接說
  // 出來的話。另外發明一套加權分數等於重寫整個比較器,會把 嘲弄/威脅/低血/最近
  // 四把鑰匙的語意一起改掉 —— 而這次改動不該碰它們。
  //
  // 出貨值 −1 = 王排在**敵方英雄之前**;0.5 = 「稍微優先」(敵方英雄仍然優先,
  // 王贏過召喚物與雜魚);2 = 跟一般殭屍同級 = 關掉。全部見
  // `zMobWavesConfig.boss.aggroRank`。
  //
  // ⚠️ 一格都不要改 `beats` / `beatsForSwap`:它們比的是數字,而 `kind` 現在是
  // 一個可以是 −1 或 0.5 的數字。KEY 1 在 `beatsForSwap` 的**穩定前綴**裡,
  // 那正是「王一出現,已經在打別人的人也會轉頭」所依賴的那一行 —— 少了它,
  // 這個功能只會對剛好閒著的人生效,也就是「有時候有用」。
  const mob = world.mob.get(cand);
  if (mob !== undefined) return mobAggroRank(world.mobRules, mob.kind);
  return null;
}

/**
 * Is `cand` a hostile unit `self` may auto-attack?
 *
 * Deliberately narrow: enemy CHAMPIONS, 召喚物 and roguelite MOBS. Everything
 * else that carries a transform is excluded by construction —
 *   - projectiles / revive circles / coins: dropped by `queryOverlap` itself;
 *   - healing FLOWERS: allied harvestables (auto-attacking one would be a bug);
 *   - neutral GUARDIANS: `world.structure`, no TeamComp;
 * the last two also carry no TeamComp, so they could never pass the team test.
 *
 * THE TEAM TEST IS WHAT KEEPS YOUR OWN PETS SAFE. A summon spawned with
 * `team: "owner"` carries its summoner's `teamId`, so this returns false for the
 * owner and for every ally — 己方永遠不會自動打自己的召喚物 — while a
 * `team: "neutral"` summon lands on the MONSTER sentinel and is hostile to
 * everyone including its own caster, which is the WC3 「敵對召喚」 form.
 */
export function isAutoTargetable(world: SimWorld, self: EntityId, cand: EntityId): boolean {
  if (cand === self) return false;
  // 隱形 (sim/stealth.ts). Wired HERE — the one predicate every automatic
  // picker already goes through — rather than at each picker, for the exact
  // reason this file's header gives for `targetClassOf`: three copies of "what
  // may be targeted" is how 召喚物 became untargetable by half the game.
  //
  // `canSee` answers "not hidden / mine / ally / I have true sight in range",
  // and the WHETHER is a field: `blocksAutoAcquire` defaults true (WC3), and
  // with it false a hidden body is auto-acquired exactly as before, so the flag
  // becomes render-only. That is a legitimate config, not a broken one.
  if (world.stealthRules.blocksAutoAcquire && !canSee(world, self, cand)) return false;
  if (targetClassOf(world, cand) === null) return false;
  // ⭐【混亂】—— owner 2026-08-09 改判（GH#299 第 9 條 / GH#301-3）：
  //   「混亂應該是**完全無法指定目標**，並且會亂走路，跟恐懼一樣」
  //
  // ⚠️ 只讀 `self` 身上的旗標：混亂的是**我**，不是被我看到的那個人。
  // ⛔ 這一行取代了原本那句「混亂時**隊友也算目標**」的旁路。舊行為是「照常
  // 打架，只是有時候打到隊友」，owner 明說那是錯的裁決。整個引擎裡「誰算得上
  // 目標」只有這一份規則，所以閘下在這裡 —— 下在 `chaos.ts` 只清 attackTarget
  // 的話，`autoAcquirePass` 仍然每 tick 挑一個再被清掉，而這一行會繼續是綠的
  // 卻對玩家不可見（失敗形態 ④／⑤）。行為與亂走見 `sim/chaos.ts`。
  if (isConfused(world, self)) return false;
  const myTeam = world.team.get(self);
  const theirTeam = world.team.get(cand);
  if (!myTeam || !theirTeam) return false;
  if (myTeam.teamId === theirTeam.teamId) return false;
  const hp = world.health.get(cand);
  return !!hp?.alive;
}

/**
 * May a #215 MOB pick `cand` as its aggro target?
 *
 * A SEPARATE question from {@link isAutoTargetable} and therefore a separate
 * field: zombies swarming a hero's ghouls instead of the hero is a real
 * tactical outcome (it is what summoning is FOR), and the owner may want it off
 * for a given ability without also making the body invisible to enemy heroes.
 * The team test stays where it already is, in MobSystem — mobs are hostile to
 * everything that is not on the MONSTER sentinel, which correctly also spares a
 * `team: "neutral"` summon.
 */
export function isMobTargetable(world: SimWorld, cand: EntityId, seeker?: EntityId): boolean {
  // 隱形. `seeker` is OPTIONAL and defaults to "nobody in particular" (-1), so
  // an existing caller that does not pass it still gets the right answer for
  // everything except true sight — a mob cannot have true sight today, and if
  // one ever does, its aggro scan is the one call site that must pass its own
  // id. Kept optional rather than required so this stays a strictly additive
  // change to a predicate three other lanes are editing this week.
  if (world.stealthRules.blocksMobAggro && !canSee(world, seeker ?? (-1 as EntityId), cand))
    return false;
  // [背負]：箱子裡的人也不吃小怪仇恨（它自己的軸，⛔ 不與自動索敵共用一格）。
  if (carryBlocksMobAggro(world, cand)) return false;
  if (world.champion.has(cand)) return true;
  const sm = world.summon.get(cand);
  if (sm !== undefined) return summonMobTargetable(sm);
  // [陣營轉換]（[EX∅ 根源]）—— 一隻**被借走的**小怪對其他小怪來說是敵人。
  // 沒有這一行的話，被捕的殭屍王在 `MobSystem` 的隊伍閘那一側是敵人、在這一側
  // 卻選不到，於是整群殭屍**站著不動**：兩份答案各自為真，而畫面上像是 AI 壞了。
  // ⚠️ ⭐ 這一行以前寫著「⛔ 空殼期間 `isMindControlled` 一律回 false，所以今天是
  //   嚴格的 no-op」—— ⛔ **那句話早就過期了**（`isMindControlled` 讀的是
  //   `world.mindControl`，而 `convertTeam` 真的會寫進去）。
  // ⚠️ 而它害人往錯的方向找：GH#913 的紅燈看起來像「這一族還沒實作」，
  //   ⭐ 而真相是 `MobSystem` 的候選名單把小怪整批剔掉了（失敗形態⑪，接縫是空的）。
  if (world.mob.has(cand) && isMindControlled(world, cand)) return true;
  return false;
}

/**
 * May a SEAT hand-pick `cand` with an explicit attack order?
 *
 * ⚠️ SCOPE. This is NOT a general legality check on `order.attackTarget` — the
 * sim has never had one (a seat may name a teammate, and `BasicAttackSystem`
 * runs no team test either), and inventing one here would silently change five
 * unrelated paths in a change about summons. It answers exactly one question:
 * 「這個召喚物允不允許被玩家點名」. Everything that is not a summon is left to
 * whatever the sim already did.
 */
export function isManuallyTargetable(
  world: SimWorld,
  cand: EntityId,
  clicker?: EntityId,
): boolean {
  // 隱形: 「擋不擋手動點選」 is its own field (`blocksManualTarget`, default
  // true = WC3: you cannot right-click what you cannot see). `clicker` is the
  // seat's own champion — it MUST be passed, because the ally/self exemptions
  // are the whole reason a stealthed player can still be clicked by his own
  // team. Without it the answer degrades to "nobody can click a hidden body",
  // which is wrong for allies, so the OrderSystem call site passes it.
  if (
    clicker !== undefined &&
    world.stealthRules.blocksManualTarget &&
    !canSee(world, clicker, cand)
  )
    return false;
  // [背負]：箱子裡的人點不到（它自己的軸 —— 「隊友看不看得見」與「箱子擋不擋
  // 右鍵」是兩個問題，⛔ 不共用一格）。
  if (carryBlocksManualTarget(world, cand)) return false;
  const sm = world.summon.get(cand);
  if (sm === undefined) return true;
  return summonManualTargetable(sm);
}

/** True when `attacker` damaged `victim` inside the threat window. */
export function isThreat(world: SimWorld, victim: EntityId, attacker: EntityId): boolean {
  // LOOKUP ONLY — never iterate this inner map: its order is first-hit order.
  const tick = world.recentDamagers.get(victim)?.get(attacker);
  if (tick === undefined) return false;
  // ⭐ 仇恨窗是一格設定（`autoEngage.threatWindowTicks`）——
  //   ⛔ 在此之前是這個檔的寫死常數。⚠️ 缺席 ⇒ 原本的 75。
  const w = world.combatFeel.autoEngage?.threatWindowTicks ?? THREAT_WINDOW_TICKS;
  return world.tick - tick <= w;
}

/** The sort keys for one candidate, or null when it is not a legal target. */
export function rankOf(
  world: SimWorld,
  self: EntityId,
  cand: EntityId,
): AcquiredTarget | null {
  if (!isAutoTargetable(world, self, cand)) return null;
  const selfT = world.transform.get(self);
  const candT = world.transform.get(cand);
  if (!selfT || !candT || candT.zone !== selfT.zone) return null;
  const hp = world.health.get(cand);
  if (!hp) return null;
  // `isAutoTargetable` already proved this is non-null; re-reading it (rather
  // than re-deriving the tier from `world.champion.has`) is what keeps a
  // summon's authored `targetPriority` from being silently overwritten with the
  // 「not a champion, so it must be a mob」 fallback the old line encoded.
  const kind = targetClassOf(world, cand);
  if (kind === null) return null;
  return {
    id: cand,
    // 嘲弄. Computed HERE rather than passed in by the caller, on purpose: the
    // held-target path in OrderSystem calls `rankOf` directly and never goes
    // through `acquireTarget`, so a parameter would be one more thing a call
    // site can forget — and forgetting it looks like the taunt「有時候有用」.
    forced: forcedTargetOf(world, self) === cand ? 0 : 1,
    kind,
    threat: isThreat(world, self, cand) ? 0 : 1,
    hp: hp.hp,
    d2: distSq(selfT.pos, candT.pos),
  };
}

/**
 * STRICTLY better on the full 5-key prefix (id is handled by iteration order:
 * candidates arrive ascending and an exact tie keeps the incumbent, so the
 * lowest id wins every remaining tie).
 *
 * WHERE 嘲弄 SITS IS A FIELD, NOT A CONSTANT (`tauntRules.priority`):
 *   · "absolute" (ships)      — sort KEY ZERO, above 「敵方英雄優先」 and 「威脅」.
 *   · "aboveThreatOnly"       — below 「敵方英雄優先」, above 「威脅」.
 * The shipped side is the owner's own card text 「吸引周圍敵人**優先攻擊自己**」.
 * The other side exists because it is a real preference and not a bug: a taunt
 * coming from a SUMMON or a MOB under "absolute" outranks an enemy champion
 * standing next to you, which is a much stronger decoy than some operators will
 * want. Losing to 「威脅」 is NOT offered on either side — a taunt cancelled by
 * the very enemy it is meant to peel you off is not a weaker taunt, it is a
 * taunt that silently does nothing.
 */
function beats(a: AcquiredTarget, b: AcquiredTarget, priority: TauntPriority): boolean {
  if (priority === "absolute" && a.forced !== b.forced) return a.forced < b.forced;
  if (a.kind !== b.kind) return a.kind < b.kind;
  if (a.forced !== b.forced) return a.forced < b.forced;
  if (a.threat !== b.threat) return a.threat < b.threat;
  if (a.hp !== b.hp) return a.hp < b.hp;
  return a.d2 < b.d2;
}

/**
 * STRICTLY better on the STABILITY PREFIX (kind, threat) only.
 *
 * Used to decide whether an ALREADY-held auto target should be swapped. HP and
 * distance move every tick, so re-running the full comparator each tick would
 * swap targets mid-approach and cancel the wind-up over and over (visible as a
 * hero flip-flopping between two enemies and dealing no damage). A held target
 * is therefore only abandoned for a categorically better one: an enemy champion
 * over a mob, or the enemy that just started hitting me. Everything else waits
 * until the held target dies, dies out of zone, or leaves the leash.
 */
function beatsForSwap(
  a: AcquiredTarget,
  b: AcquiredTarget,
  priority: TauntPriority,
): boolean {
  // 嘲弄 belongs in the STABILITY PREFIX and not only in `beats`, and this is
  // the line the whole mechanic hangs on. A champion already holding an auto
  // target takes the `held` branch in OrderSystem every tick and never reaches
  // the acquire path, so without this key a taunt would only ever work on
  // somebody who happened to be idle — i.e. it would look like it fires
  // 「有時候」, which is the worst shape a guard can have to describe.
  //
  // It reads the SAME `priority` field as `beats` (and in the same position),
  // because two answers to 「嘲弄排第幾」 is exactly the drift this file's
  // header is a post-mortem about.
  if (priority === "absolute" && a.forced !== b.forced) return a.forced < b.forced;
  if (a.kind !== b.kind) return a.kind < b.kind;
  if (a.forced !== b.forced) return a.forced < b.forced;
  return a.threat < b.threat;
}

/**
 * THE rule. Returns the best auto-attack target for `self` within `radius`, or
 * null when there is none.
 *
 * Candidates come from the broad-phase via `queryOverlap`, which returns
 * ASCENDING ids and already honours the zone (PairedDuels never cross zones).
 *
 * `radius` is CENTRE-TO-CENTRE. The grid query is a body-overlap test, i.e. a
 * superset (it also returns a fat body whose EDGE reaches in), so the exact
 * `d2 <= radius²` filter below is what defines the radius. Centre-to-centre is
 * the same measure `reachTo` / the chase / `BasicAttackSystem` all use, so a
 * caller that passes a hold-band radius is guaranteed no target it acquires can
 * make the chase step forward.
 */
/** 【混亂】—— 這個人現在不分敵我嗎（C2，#278）。 */
export function isConfused(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  if (!st) return false;
  for (const e of st.effects) {
    if (e.targetsAllies === true && e.expiresAtTick > world.tick) return true;
  }
  return false;
}

/**
 * ⭐ A 移動的 tie-break (GH#652 細節②) —— 「離**指令點**最近」。
 *
 * LoL 的 attack-move 打的是離**游標**最近的那一個，⛔ 不是離角色最近、⛔ 也不是
 * 英雄優先。上面那個共用排序是替**自動索敵**寫的:玩家沒有指到任何地方，只好用
 * 「誰比較重要」(kind/threat/hp)代替「他想打誰」。A 移動**有**指令點 ⇒ 那個
 * 代替品不再需要，而且它會直接和玩家指的地方打架(A 點在小兵身上卻飛去追英雄)。
 *
 * ⚠️ 嘲弄仍然排最前面，而且用**同一顆 `priority` 欄位**、擺在**同一個位置** ——
 * 這個檔案的檔頭就是「同一個問題有兩份答案」的驗屍報告。
 * ⚠️ 之後只剩 `d2`(此時已被換成「到指令點」的距離)，最終仍由 id 收尾:候選人
 * 由 `queryOverlap` 保證**遞增 id**，而掃描在完全平手時**留任**，所以最小 id 勝。
 */
function beatsFromCursor(
  a: AcquiredTarget,
  b: AcquiredTarget,
  priority: TauntPriority,
): boolean {
  if (priority === "absolute" && a.forced !== b.forced) return a.forced < b.forced;
  if (a.forced !== b.forced) return a.forced < b.forced;
  return a.d2 < b.d2;
}

export function acquireTarget(
  world: SimWorld,
  self: EntityId,
  radius: number,
  /**
   * ⭐ GH#652 細節②:排序改用「到**這一點**的距離」，⛔ 而不是到身體的距離。
   * 只有 `attackMove`(A + 點地板)會傳它，傳的就是玩家點的那一點。
   *
   * ⚠️ **半徑仍然量身體** —— 半徑的語意是「我看得到/構得到多遠」，換成量指令點
   * 的話 A 點在場外會索到整張地圖。換掉的只有**比較鍵**。
   */
  rankFrom?: Readonly<{ x: number; z: number }>,
  /**
   * ⭐ **spec §8（GH#863）**：自動索敵這一次只准挑 PvE。
   *
   * ⚠️ 選用，而且**只有 v4 的 idle 自動清怪會傳它** —— 出貨的 v3 一格都不動
   * （`idleAutoEngageSec` 的索敵本來就會挑上敵方英雄，那是 owner 2026-08-28
   * 要的行為，見 `config.controller-scheme@1` 的 waiver）。
   * ⛔ 傳 `false` 與省略**逐位元等價**。
   */
  pveOnly?: boolean,
): AcquiredTarget | null {
  const t = world.transform.get(self);
  if (!t) return null;
  const ids = queryOverlap(
    world,
    { kind: "circle", center: t.pos, radius },
    { zone: t.zone, aliveOnly: true },
  );
  const maxD2 = radius * radius;
  // ⭐ 一份候選人**兩種**量法:半徑閘永遠用身體距離(`r.d2`,`rankOf` 算的),
  // 比較鍵在 A 移動時換成「到指令點」。⛔ 不可以把 `rankOf` 改成算指令點 ——
  // 那會讓半徑閘跟著漂走(見上面 `rankFrom` 的警告)。
  const rerank = (r: AcquiredTarget, cand: EntityId): AcquiredTarget => {
    if (rankFrom === undefined) return r;
    const p = world.transform.get(cand);
    return p === undefined ? r : { ...r, d2: distSq(rankFrom, p.pos) };
  };
  const better = rankFrom === undefined ? beats : beatsFromCursor;
  let best: AcquiredTarget | null = null;
  // 嘲弄: did the taunter turn up as a REAL candidate (inside the radius)?
  // Tracked rather than re-derived from `best.forced`, and that distinction is
  // what keeps the two taunt lines in this file INDEPENDENTLY load-bearing:
  //   · inside the radius  → the comparator (`beats`, key 0) is what makes it win;
  //   · outside the radius → the rescue below is the only thing that can.
  // Deriving it from `best` instead would let the rescue silently cover the
  // in-radius case too, and then `beats`'s forced key could be deleted with
  // nothing going red — a line no guard can kill is not a feature (第二守則).
  let sawForced = false;
  const priority = world.tauntRules.priority;
  for (const cand of ids) {
    const r = rankOf(world, self, cand);
    if (!r || r.d2 > maxD2) continue; // ← 半徑閘:永遠是身體距離
    // ⭐ spec §8（GH#863）—— 自動清怪只挑 PvE。
    // ⚠️ **嘲弄照樣贏**（`r.forced === 0`）：被嘲弄不是「自動清怪自己挑上玩家」，
    //   那是別人強加的，⛔ 不在 §8 要防的那一類（「spontaneously attack」）。
    if (pveOnly && r.forced !== 0 && world.champion.has(cand)) continue;
    if (r.forced === 0) sawForced = true;
    const ranked = rerank(r, cand);
    if (best === null || better(ranked, best, priority)) best = ranked;
  }
  // 嘲弄 IGNORES `radius`, and that is deliberate rather than an oversight.
  // `radius` is 「我自己看多遠」 — for 82 melee champions it is the 6 u floor —
  // while the taunt's own reach is the AoE the taunter authored on its own
  // card. Leaving the victim's radius in charge would mean a melee body pulled
  // from 8 u away simply never acquires the taunter, so the pull would land
  // (the state is written), read back correctly, and change nothing on screen.
  // The chase loop then closes the distance exactly as it does for an explicit
  // order, which is the behaviour a taunt is supposed to have.
  //
  // ⚠️ IT IGNORES `radius`, NOT DISTANCE. How far a taunt may drag a body is
  // `tauntRules.leashUnits`, enforced inside `forcedTargetOf` — so this rescue
  // cannot reach past the leash, and no second distance rule lives here.
  //
  // The winner is decided by the SAME `beats` the loop above uses rather than
  // an unconditional assignment, because 「嘲弄排第幾」 is now a field: under
  // "aboveThreatOnly" a rescue that overwrote `best` outright would have
  // re-imposed "absolute" through the back door for every out-of-radius taunt.
  if (!sawForced) {
    const forced = forcedTargetOf(world, self);
    if (forced !== null) {
      const r = rankOf(world, self, forced);
      // 救援也走**同一個**比較器與同一份改寫 —— 少了 `rerank`,A 移動下一個
      // 半徑外的嘲弄者會帶著「到身體的距離」進來和「到指令點的距離」比大小,
      // 那是兩個空間混算(而且它必然贏,因為身體通常比游標近)。
      if (r) {
        const ranked = rerank(r, forced);
        if (best === null || better(ranked, best, priority)) best = ranked;
      }
    }
  }
  return best;
}

/**
 * Should a currently-held AUTO target be replaced by `candidate`?
 * Exported for the OrderSystem pass; see {@link beatsForSwap}.
 */
export function shouldSwapAutoTarget(
  world: SimWorld,
  held: AcquiredTarget,
  candidate: AcquiredTarget,
): boolean {
  return beatsForSwap(candidate, held, world.tauntRules.priority);
}
