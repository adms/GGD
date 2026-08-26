/**
 * matchStats — the deterministic per-player match-scoreboard accumulator.
 *
 * These counters are part of the authoritative WORLD STATE (SimWorld.matchStats)
 * and fold into SimWorld.digest(), so two seeded runs of the same match produce
 * byte-identical scoreboards and the client's prediction replay never diverges
 * on them. Every increment here is a pure integer/float add driven by an EXISTING
 * sim event (damage resolve / death / heal / ability cast / projectile hit /
 * flower burst / gold+xp grant) — NO rng, NO trig, NO wall-clock (sim purity).
 *
 * Only entities that went through spawnChampion() get an entry (created there),
 * so neutral flowers, projectiles and hand-built test entities never accumulate;
 * the increment helpers `get()` the entry and no-op when it is absent.
 *
 * The rating layer (rating.ts) grades a finished scoreboard; this file only
 * COUNTS. Keep the two concerns separate.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { mobLedgerRule } from "../mobs";

/**
 * Per-player match scoreboard. All counters are monotonic within a match (they
 * only ever increase), reset only when a fresh champion entity spawns.
 *
 *  - damageDealt   : mitigated damage OUTPUT to enemy champions (post armor/MR,
 *                    PRE-shield — a fully-shielded blow still credits output).
 *  - damageTaken   : HP actually lost (post-shield) from all sources.
 *  - damageBlocked : damage neutralised on this player — armor/MR mitigation +
 *                    shield absorption ("blocked/mitigated").
 *  - healingDone   : HP restored by this player's heal effects + its lifesteal
 *                    (passive regen and flower bursts are excluded — the latter
 *                    is captured by flowersEaten).
 *  - ccAppliedTicks: total tick-seconds of hard/soft CC (stun/root/slow) this
 *                    player applied to ENEMY champions (counted at apply time).
 *  - abilityCasts  : successful ability casts (Q/W/E/R/EX).
 *  - abilityHits   : ability SKILLSHOT projectiles that struck an enemy champion.
 *  - abilityWhiffs : ability skillshot projectiles that expired hitting nobody.
 *                    accuracy := hits / (hits + whiffs); non-skillshot champions
 *                    (melee / point-and-click) grade neutral (see rating.ts).
 *  - basicAttackHits: basic-attack connections on an enemy champion.
 *  - flowersEaten  : healing flowers this player got the killing blow on.
 *  - timeAliveTicks: ticks spent alive DURING COMBAT (world.combatActive gate).
 *  - killParticipation: enemy champion deaths this player got a kill OR assist on.
 *  - largestSingleHit : biggest single-packet damage output.
 *  - multikills    : kills that landed inside the multikill window of the prior
 *                    kill (a double counts 1, a triple 2, …).
 *  - revivesPerformed: teammates this player channelled back up out of a revive
 *                    circle (task #84). A rescue is a teammate-support action,
 *                    so it scores on its OWN line — reviving deliberately does
 *                    NOT erase the death or the enemy's kill.
 *  - revivesReceived : times this player was channelled back up by a teammate.
 *  - guardianDamage  : 打在**守護塔**（duel-zone 的中立目標物，systems/
 *                    GuardianSystem）身上的減傷後輸出。⭐ 自己一條線，⛔ 不併進
 *                    `damageDealt` —— 那一格的語意是「對敵方英雄的輸出」，而
 *                    評分（rating.ts）就是照那個語意在打分。整場專心拆塔的人
 *                    在此之前結算頁上**一個數字都沒有**（GH#729／#157）。
 *  - guardiansSlain  : 守護塔的**尾刀**數（`payout` 真的付出去的那一條路；
 *                    void payout —— 擊殺者不見了／不是英雄／死了／換區 ——
 *                    ⛔ 不計，因為那一刀沒有人收到獎勵）。
 *  - bountyGold      : 首殺賞金（task #90 的 `GOLD_REWARDS.killBounty`）實際入袋的
 *                    金額。⭐ 它**已經**含在 `goldEarned` 裡（`grantGold` 一律走
 *                    `recordGold`）—— 這一格是那筆錢的**子集**，讓結算頁印得出
 *                    「賞金 N / 總金幣 M」。⛔ 不要拿它去餵評分：`goldEarned`
 *                    本來就刻意不評分，一個它的子集更不該（GH#729 Scope）。
 *  - coinsCollected  : 陣亡投幣 coins picked off the floor (task #191). Its own
 *                    line rather than `goldEarned`, because that coin's 100 gold
 *                    was already counted as earned when the thrower first got
 *                    it; folding it in again would let two players pump the
 *                    settlement rating by 1000 a round for money that never
 *                    entered the economy.
 */
export interface PlayerMatchStats {
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  damageBlocked: number;
  healingDone: number;
  ccAppliedTicks: number;
  goldEarned: number;
  xp: number;
  abilityCasts: number;
  abilityHits: number;
  abilityWhiffs: number;
  basicAttackHits: number;
  flowersEaten: number;
  timeAliveTicks: number;
  killParticipation: number;
  largestSingleHit: number;
  multikills: number;
  revivesPerformed: number;
  revivesReceived: number;
  coinsCollected: number;
  guardianDamage: number;
  guardiansSlain: number;
  bountyGold: number;
}

/** Assist credit window: an enemy that damaged the victim within this many ticks
 *  before its death (and is not the killer) earns an assist. 10s @30Hz. */
export const ASSIST_WINDOW_TICKS = 300;
/** Kills within this many ticks of the previous one chain into a multikill. */
export const MULTIKILL_WINDOW_TICKS = 300;

/** A fresh zeroed scoreboard. */
export function createMatchStats(): PlayerMatchStats {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    goldEarned: 0,
    xp: 0,
    abilityCasts: 0,
    abilityHits: 0,
    abilityWhiffs: 0,
    basicAttackHits: 0,
    flowersEaten: 0,
    timeAliveTicks: 0,
    killParticipation: 0,
    largestSingleHit: 0,
    multikills: 0,
    revivesPerformed: 0,
    revivesReceived: 0,
    coinsCollected: 0,
    guardianDamage: 0,
    guardiansSlain: 0,
    bountyGold: 0,
  };
}

/** Read a scoreboard, or a zeroed one if the entity never spawned as a champion. */
export function getMatchStats(world: SimWorld, id: EntityId): PlayerMatchStats {
  return world.matchStats.get(id) ?? createMatchStats();
}

/**
 * Record one resolved damage packet (called from combatResolveSystem AFTER
 * mitigation + shields). `output` = mitigated pre-shield force credited to the
 * attacker; `hpLoss` = HP the victim actually lost; `blocked` = mitigated +
 * shield-absorbed. Only champion↔champion counts; the enemy attacker is logged
 * for assist attribution.
 */
/**
 * ⭐ **戰績要記在誰頭上** —— owner 2026-08-18 對 [陣營轉換]（大師球）的裁決：
 *
 *   「物理意義上，我們比較像是**複製一個敵方隊友短暫在這一回合加入我方**，
 *    所以**實質上這個單位就是我方單位**，就算他造成任何傷害或者戰績
 *    都是算在我方而非那個敵方單位上」
 *
 * ⚠️ 這一格是必要的，而理由是量到的：`world.matchStats` 以 **entityId** 為鍵，
 * 而結算是走 `seat.entityId` 讀出來的（`MatchController` 四處）—— 所以在這一行
 * 出現之前，被我方捕獲的敵方英雄打出來的傷害會記在**他自己那一列**，也就是
 * **敵方玩家的計分板**上。玩家會看到「我被抓走的那段時間幫對面刷了輸出」。
 *
 * ⛔ 為什麼是一個轉址而不是給每個 `record*` 各加一個 if：`recordDamage` /
 * `recordCc` / `recordHealing` … 是同一個問題的七個入口，七份 if 保證有一天只改到六份
 * （第零守則⑨）。⭐ 也⛔ 不是改 `world.team` —— 那個已經換隊了（敵我判定因此本來就對），
 * 動它會連「他原本是誰」都丟掉，而歸位需要那個。
 *
 * 沒有被捕的單位（幾乎全部）逐位元回自己 —— 這是一個嚴格的 no-op 路徑。
 */
function creditedTo(world: SimWorld, source: EntityId): EntityId {
  return world.mindControl.get(source)?.captor ?? source;
}

/**
 * ⭐ 一次英雄擊殺**算不算數** —— 賞金／經驗／onKill／連殺／計分板五條線共用的
 * **同一個**謂詞（GH#159）。
 *
 * 在此之前發放端只問「兇手存在而且是英雄」，⛔ **一格隊伍都沒有比** ——
 * 而普攻是目前唯一沒有隊伍濾網的傷害路徑（`OrderSystem` 的 `attackTarget`
 * 直接吃玩家指定的 entity，`combat/damage.ts` 與 `BasicAttackSystem` 對
 * `world.team` 都是零命中），所以**打死自己隊友照樣領擊殺金 + 首殺賞金 + 連殺**，
 * 配上 #84 的復活圈就是一台印鈔機：救回來再殺一次。
 *
 * ⛔ 為什麼是**一個匯出的謂詞**而不是兩個 if：發放（`DeathSystem`）與計分板
 * （`recordChampionDeath`）是同一條規則的兩個出口。兩份 if 保證有一天只改到一份，
 * 而那個結果 —— 「金幣擋住了但 KDA／連殺仍可刷」—— 正是這張票 body 點名要避免的
 * 那一半（第零守則⑨：N 個同型 = K 個模板）。
 *
 * ⚠️ 隊伍資訊缺任何一半就**不算數**（fail-closed）。出貨路徑 `spawnChampion`
 * 一定寫 `TeamComp`，能造出「英雄身上沒有隊伍」的只有手寫夾具 —— 一個**發錢**的
 * 判斷在不確定的時候不發，是唯一安全的退化方向。
 *
 * ⭐ [陣營轉換]（大師球）自動是對的：被借走的身體 `world.team` 已經換過隊，
 * 所以「借來的敵人殺掉他的舊隊友」照付，「借來的身體殺掉我的人」不付。
 */
export function killScores(
  world: SimWorld,
  victim: EntityId,
  killer: EntityId | null,
): killer is EntityId {
  if (killer === null || killer === victim) return false;
  if (!world.champion.has(killer)) return false;
  const kt = world.team.get(killer);
  const vt = world.team.get(victim);
  return kt !== undefined && vt !== undefined && kt.teamId !== vt.teamId;
}

export function recordDamage(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  output: number,
  hpLoss: number,
  blocked: number,
  origin: string,
): void {
  const srcChamp = world.champion.has(source);
  const tgtChamp = world.champion.has(target);

  // 殭屍王 + 特殊殭屍傷害帳本 (task #262, widened by #288). BEFORE the early
  // return below, because both are NEUTRALS and that return is exactly what
  // drops every packet aimed at one.
  //
  // ⚠️ 一般殭屍 IS DELIBERATELY EXCLUDED, AND THAT EXCLUSION IS LOAD-BEARING —
  // it is not an oversight to "fix" later. `mobLedgerRule` answers `null` for
  // `kind === "normal"`, so an ordinary zombie allocates NOTHING. Round 9
  // schedules 50 alive per zone × 2 zones = 100 zombies; giving each of them a
  // `Map` would mean 100 ledgers, and `SimWorld.destroy` sweeps EVERY ledger
  // looking for the dying entity as a damager — so 100 deaths a tick against
  // 100 ledgers is 10,000 map probes per tick, i.e. O(n²) in the mob count, for
  // a 20-gold minion that pays its whole reward to one last hitter anyway. The
  // ledger exists only for mobs whose reward is SPLIT (`mobBountyRules !== null`
  // for exactly the same kinds), which is the king and the 特殊殭屍.
  //
  // 溢傷不算 — owner ruled 2026-07-29 (GH#206). `output` is post-mitigation but
  // NOT capped at the king's remaining hp (`mitigate()` clamps only a
  // STRUCTURE's per-packet cap), so recording it counted OVERKILL in full: a
  // 4,000-damage ult on a king with 100 hp left weighed 4,000 — before the
  // last-hit multiplier — and took almost the whole pool for one button. That
  // matters far more under GH#206's `"bonus"` mode, where the total is no
  // longer conserved, so overkill inflates the WHOLE payout rather than just
  // redistributing it. `hpLoss` is what the king actually lost, so the last
  // packet weighs only the sliver of health that was really there.
  //
  // ⚠️ `hpLoss` also excludes what a SHIELD absorbed. That is the same answer
  // for the same reason (a shielded point of damage did not kill the king), and
  // kings carry no shields today, so nothing observable turns on it.
  //
  // Kept switchable per the project's first rule (see CLAUDE.md — 所有功能都做成
  // 後台可調): `countOverkill: true` restores the pre-#206 behaviour without a
  // code change. Default false = the owner's ruling.
  //
  // Gated on the mob's KIND (through the armed rules), not on the ledger's
  // existence, so an ordinary zombie never allocates a map and a world with no
  // king / no 特殊殭屍分紅 is untouched.
  // `srcChamp` FIRST so a mob-on-champion packet (the overwhelming majority in
  // a mob round) never even reaches the `world.mob` probe — the same
  // short-circuit the pre-#288 one-liner had.
  const victimKind = srcChamp ? world.mob.get(target)?.kind : undefined;
  const ledgerRule = victimKind === undefined ? null : mobLedgerRule(world.mobRules, victimKind);
  if (ledgerRule !== null) {
    // ⚠️ `hpLoss` IS NOT CAPPED EITHER — its own parameter doc says 「HP actually
    // removed」 and that is not true: `damage.ts` does a bare `hp.hp -= dmg`, so
    // hp goes NEGATIVE and `hpLoss` is the full post-shield force. Both numbers
    // this function receives include overkill.
    //
    // The cap has to be rebuilt here because `recordDamage` runs AFTER the
    // subtraction: `hp.hp + hpLoss` is what the king had a moment ago, and
    // clamping at 0 handles a body that was already dead. Deliberately NOT done
    // by changing `hpLoss` at the call site — that value also feeds
    // `damageTaken` on the scoreboard, and re-capping it there is a separate
    // decision about a different number that nobody has asked for.
    const hpNow = world.health.get(target)?.hp ?? 0;
    const hpBefore = Math.max(0, hpNow + hpLoss);
    // #288 — the knob is read off the SLAIN KIND's own block (`boss.countOverkill`
    // for a king, `special.countOverkill` for a 特殊殭屍), never off a single
    // global. `mobLedgerRule` already resolved which one; reading
    // `world.mobRules.boss` here instead would silently apply the king's setting
    // to a special, and would apply NOTHING at all in an arena with no king.
    const credited = ledgerRule.countOverkill ? output : Math.min(hpLoss, hpBefore);
    if (credited > 0) {
      let ledger = world.bossDamage.get(target);
      if (!ledger) {
        ledger = new Map<EntityId, number>();
        world.bossDamage.set(target, ledger);
      }
      ledger.set(source, (ledger.get(source) ?? 0) + credited);
    }
  }

  // ⭐【守護塔】GH#729 —— **在** `!tgtChamp` 那道早退**之前**，因為守護塔是中立的，
  // 而那道早退正是「打塔的傷害連 `damageDealt` 都不計」的那一行。
  //
  // ⛔ 刻意**不**碰 `damageDealt` 也**不**碰 `largestSingleHit`：那兩格的語意是
  // 「對敵方英雄」，評分（rating.ts）照那個語意打分 —— 把塔的傷害倒進去等於用
  //  一個中立目標物去衝高對人輸出的評價。它有自己的一條線。
  if (srcChamp && output > 0 && world.structure.has(target)) {
    const src = world.matchStats.get(creditedTo(world, source));
    if (src) src.guardianDamage += output;
  }

  if (!tgtChamp) return; // damage to flowers / neutrals never scores

  if (srcChamp && source !== target) {
    const src = world.matchStats.get(creditedTo(world, source));
    if (src) {
      src.damageDealt += output;
      if (output > src.largestSingleHit) src.largestSingleHit = output;
      if (origin === "basic") src.basicAttackHits += 1;
    }
    // assist bookkeeping: log the last tick an ENEMY champion hurt this victim
    const st = world.team.get(source);
    const tt = world.team.get(target);
    if (st && tt && st.teamId !== tt.teamId) {
      let m = world.recentDamagers.get(target);
      if (!m) {
        m = new Map<EntityId, number>();
        world.recentDamagers.set(target, m);
      }
      m.set(source, world.tick);
    }
  }

  const tgt = world.matchStats.get(target);
  if (tgt) {
    tgt.damageTaken += hpLoss;
    tgt.damageBlocked += blocked;
  }
}

/** Record HP healed by `healer` (heal effect or lifesteal). */
export function recordHealing(world: SimWorld, healer: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(creditedTo(world, healer));
  if (s && world.champion.has(healer)) s.healingDone += amount;
}

/** Record CC ticks `caster` applied to an ENEMY champion `target`. */
export function recordCc(world: SimWorld, caster: EntityId, target: EntityId, ticks: number): void {
  if (ticks <= 0) return;
  if (!world.champion.has(caster) || !world.champion.has(target)) return;
  const ct = world.team.get(caster);
  const tt = world.team.get(target);
  if (ct && tt && ct.teamId === tt.teamId) return; // no credit for self/ally CC
  const s = world.matchStats.get(creditedTo(world, caster));
  if (s) s.ccAppliedTicks += ticks;
}

/** Record a successful ability cast. */
export function recordAbilityCast(world: SimWorld, caster: EntityId): void {
  const s = world.matchStats.get(caster);
  if (s) s.abilityCasts += 1;
}

/** Record an ability skillshot connecting with an enemy champion. */
export function recordAbilityHit(world: SimWorld, owner: EntityId, target: EntityId): void {
  if (!world.champion.has(target)) return;
  const s = world.matchStats.get(owner);
  if (s) s.abilityHits += 1;
}

/** Record an ability skillshot that expired without hitting anyone. */
export function recordAbilityWhiff(world: SimWorld, owner: EntityId): void {
  const s = world.matchStats.get(owner);
  if (s) s.abilityWhiffs += 1;
}

/** Record a healing flower whose killing blow belongs to `killer`. */
export function recordFlowerEaten(world: SimWorld, killer: EntityId): void {
  const s = world.matchStats.get(killer);
  if (s && world.champion.has(killer)) s.flowersEaten += 1;
}

/**
 * Record a completed revive-circle channel (task #84): credit the channeller
 * and the recipient on their own counters. History is NOT rewritten — by the
 * time the circle exists, DeathSystem has already booked the death, paid the
 * killer and fired the onKill hooks, and reversing any of that would corrupt
 * the 19 pre-existing counters and the S+..C- rating.
 */
export function recordRevive(world: SimWorld, channeller: EntityId, revived: EntityId): void {
  if (!world.champion.has(channeller) || !world.champion.has(revived)) return;
  const c = world.matchStats.get(channeller);
  if (c) c.revivesPerformed += 1;
  const r = world.matchStats.get(revived);
  if (r) r.revivesReceived += 1;
}

/** Record gold earned. */
export function recordGold(world: SimWorld, id: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(id);
  if (s) s.goldEarned += amount;
}

/**
 * 【守護塔尾刀】GH#729 —— 只在 `payout` **真的付出去**的那條路上呼叫。
 * ⛔ void payout（擊殺者不見了／不是英雄／死了／換區）不算：那一刀沒有人收到獎勵，
 *    把它記成一次擊殺會讓結算頁上的數字對不上他實際拿到的金幣與 buff。
 */
export function recordGuardianSlain(world: SimWorld, id: EntityId): void {
  const s = world.matchStats.get(id);
  if (s) s.guardiansSlain += 1;
}

/**
 * 【首殺賞金】GH#729 —— `GOLD_REWARDS.killBounty` **實際入袋**的金額
 * （倍率套用後的，⛔ 不是設定值）。
 * ⚠️ 這一筆錢**已經**被 `recordGold` 記進 `goldEarned` 了 —— 這裡記的是同一筆錢的
 *    **標籤**，⛔ 不是第二次入帳。結算頁把它印成金幣那一列底下的子行。
 */
export function recordBountyGold(world: SimWorld, id: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(id);
  if (s) s.bountyGold += amount;
}

/** Record XP earned. */
export function recordXp(world: SimWorld, id: EntityId, amount: number): void {
  if (amount <= 0) return;
  const s = world.matchStats.get(id);
  if (s) s.xp += amount;
}

/**
 * Record a champion death: victim death, killer kill + multikill streak, recent
 * enemy damagers as assists, and kill-participation for everyone credited. The
 * victim's recent-damager log is cleared (a fresh life starts clean).
 *
 * ⚠️ The DEATH is always booked; only the KILLER half is gated by `killScores`
 * — a player who suicides or is finished off by a teammate is still dead, and
 * hiding that would make the scoreboard disagree with the corpse on the floor.
 */
export function recordChampionDeath(
  world: SimWorld,
  victim: EntityId,
  killer: EntityId | null,
): void {
  const v = world.matchStats.get(victim);
  if (v) v.deaths += 1;

  const now = world.tick;
  // 同一個謂詞守住 KDA / 連殺 / 多殺 —— ⛔ 擋住金幣但讓計分板照加，等於把漏洞
  // 從「印錢」降級成「刷數據」，而結算評分讀的正是這幾格（GH#159）。
  if (killScores(world, victim, killer)) {
    const k = world.matchStats.get(killer);
    if (k) {
      k.kills += 1;
      k.killParticipation += 1;
      const tr = world.killTracking.get(killer) ?? { lastKillTick: -1, streak: 0 };
      tr.streak = tr.lastKillTick >= 0 && now - tr.lastKillTick <= MULTIKILL_WINDOW_TICKS ? tr.streak + 1 : 1;
      tr.lastKillTick = now;
      world.killTracking.set(killer, tr);
      if (tr.streak >= 2) k.multikills += 1;
    }
  }

  const dmgMap = world.recentDamagers.get(victim);
  if (dmgMap) {
    for (const [attacker, tick] of dmgMap) {
      if (attacker === killer) continue;
      if (now - tick > ASSIST_WINDOW_TICKS) continue;
      const a = world.matchStats.get(attacker);
      if (a) {
        a.assists += 1;
        a.killParticipation += 1;
      }
    }
    world.recentDamagers.delete(victim);
  }
}

/**
 * Accumulate time-alive for every champion currently alive. Gated on
 * world.combatActive so intermission/champ-select/settlement idle time does not
 * inflate the stat. Called once per tick from SimWorld.step().
 */
export function accumulateTimeAlive(world: SimWorld): void {
  if (!world.combatActive) return;
  for (const [id] of world.champion) {
    const hp = world.health.get(id);
    if (!hp?.alive) continue;
    const s = world.matchStats.get(id);
    if (s) s.timeAliveTicks += 1;
  }
}
