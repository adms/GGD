/**
 * MobSystem — the roguelite mob-wave lifecycle (task #215 肉鴿小怪波).
 *
 * One self-contained system owns the whole mechanic at step slot 9d/9e (right
 * after deathSystem/reviveSystem, alongside guardianSystem): a dedicated
 * combatActive-gated `mobTicks` clock drives the wave schedule, per-mob AI aims
 * each mob at the nearest enemy champion, a cooldown-gated melee pushes packets
 * into `world.damageQueue`, and a death-scan pass pays the killer +gold +XP and
 * grants a level every Nth mob kill.
 *
 * TICK ORDER (once per live-combat tick, in a FIXED slot):
 *   1) CLOCK   — `world.mobTicks++` first (a DEDICATED counter, like
 *                fireRingTicks — NOT combatTicks, which only advances while
 *                flowers are armed). combat-second S = mobTicks/TICK_HZ.
 *   1b) 火圈  — the shrinking ring's %-HP true burn, applied to MOBS (owner
 *                2026-07-30 「所有場上玩家、bot、各種殭屍都會…燒死，所以還是
 *                有個保底結果」). `fireRingSystem` burns the champions at step
 *                8b of the same tick; this is the other half, and it is what
 *                makes 「the round always ends」 true even when a zombie is the
 *                last thing standing. See sim/fireRing.ts `fireRingBurnMobs`.
 *   2) SCHEDULE— fire a wave when the cadence lands; wave k spawns min(k,cap)
 *                mobs per active zone, one at a time, never past maxAlivePerZone.
 *   3) AI      — each mob (ascending id) aims at the nearest enemy champion,
 *                then regenerates `rules.hpRegenPerSec * dt` (#217: a mob has no
 *                StatsComp, so RegenSystem never sees it).
 *   4) MELEE   — a mob in range with a ready cooldown queues one melee packet.
 *   5) PAYOUT  — pay the killer for mobs that DIED this tick, then QUEUE the
 *                corpse for removal at slot 9g. GH#296: destroying it HERE wiped
 *                the StatsComp `worldHookSystem` (9f) needs to dispatch the mob's
 *                own 【死亡時】, so the hook died in `fireHooks`' first line.
 *                Same tick, later slot — see `SimWorld.destroyAfterHooks`.
 *
 * WHY SLOT 9d (after deathSystem): so it reads THIS tick's `death` events and
 * the settled alive-state before paying, exactly like guardianSystem; and it
 * sets nav.attackTarget / queues melee for NEXT tick's chase+resolve (a 1-tick
 * latency identical to guardian volleys — harmless and deterministic). Running
 * it BEFORE deathSystem would miss same-tick kills.
 *
 * PER-ZONE STAND-DOWN (task #216). `combatActive` is global — it only drops once
 * EVERY duel is decided — so a zone that finished early kept taking mob waves
 * and mob melee while another zone fought on. Any zone in `world.settledZones`
 * (host-written the instant that duel's winner is recorded) spawns no new wave
 * and its mobs drop aggro, exactly like the fire ring stops burning it.
 *
 * OFF BY DEFAULT / BYTE-IDENTICAL. `world.mobRules === null || world.mobTicks <
 * 0 || !world.combatActive` makes it a strict no-op, so a skeleton/test/
 * prediction-shadow world stays byte-identical (world.mob + world.mobKills empty,
 * mobTicks -1 ⇒ nothing folds into the digest).
 *
 * DETERMINISM. Zero rng draws (guardian-style): the schedule is pure arithmetic
 * on mobTicks; edge-spawn positions come from `mobSpawnPos` (a static direction
 * table + integer hash, no rng, no trig); AI ties break by ascending entityId;
 * every store/zone list iterates in sorted order. Distances use squared compares
 * only. See `mobs.ts` + `sim/purity.test.ts`.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";
import {
  grantGold,
  grantXp,
  grantLevels,
  type GoldPayoutCategory,
} from "../economy/progression";
import { fireHooks } from "../effects/hooks";
import { creditKillCombo } from "../combat/killCombo";
import { fireRingBurnMobs } from "../fireRing";
import {
  type MobRules,
  type MobKingRules,
  DEFAULT_KING_AREA_MIN_TARGETS,
  DEFAULT_KING_SITUATIONAL_AIMING,
  MONSTER_TEAM,
  spawnMob,
  summonMobBoss,
  mobProfile,
  mobBountyRules,
  mobsAliveInZone,
} from "../mobs";
import type { MobKind } from "../components";
import { bossSummonsAt, splitBossBounty, type BossDamageEntry, type BossBountyShare } from "../mobBoss";
import { standstillBlocks } from "../combatFeel";
import { forcedTargetOf, isMobTargetable } from "../targeting";
// ⭐ GH#577 / GH#602 —— 王的自動施法走**出貨的**施法入口，⛔ 不是第二條路徑。
import { castAbility, groundAoeTargets, resolveAbilityRange } from "../abilities/abilitySystem";
import { abilityInstanceFor } from "../abilities/innateActive";
import { Abilities } from "../content/registry";
import type { AbilityDef } from "../content/defs";
import { INNATE_SLOT, type CastableSlot, type CastTarget } from "../intents";
import type { SeatId } from "../../ids";

export function mobSystem(world: SimWorld): void {
  const rules = world.mobRules;
  if (rules === null || world.mobTicks < 0 || !world.combatActive) return;
  /** 打就站定 —— 和英雄同一張後台表(見步驟 4 的說明)。 */
  const ss = world.combatFeel.standstill;

  // 1) CLOCK — the dedicated combat-elapsed mob counter, advanced first.
  world.mobTicks++;
  const mt = world.mobTicks;

  // 1b) 火圈燒殭屍 (owner 2026-07-30) — 「所有場上玩家、bot、各種殭屍都會百分比
  //     真實傷害燒死，所以還是有個保底結果」. This is THE guarantee that a round
  //     ends: without it one zombie parked in a corner can hold the field open
  //     forever. `fireRingSystem` (step 8b) already advanced `fireRingTicks`
  //     this tick and burned the champions, so this applies the identical rate
  //     against the identical radius — see sim/fireRing.ts.
  //
  //     RUN BEFORE THE AI/MELEE LOOP so a mob the ring has already reduced to
  //     0 hp does not get a free extra swing on the tick it dies; the kill
  //     itself resolves through the ordinary path (next tick's deathSystem →
  //     step 5's payout scan, which already handles a fire-ring death as a
  //     no-killer death and still pays a king / 特殊殭屍's 分紅獎池).
  fireRingBurnMobs(world);

  // 2) WAVE SCHEDULE — fire on the cadence; spawn min(k,cap) per active zone.
  //
  // GH#343 —— `autoWaves === false`（只有練習房會寫）整條排程停掉，但**規則表仍在**：
  // 測試碼的生怪指令、每區存活上限、賞金與等級都讀 `world.mobRules`，所以「不自動
  // 湧怪」不可以用 `endCombatMobs` 來達成（那會把整張表拆掉，生怪指令就沒東西可讀）。
  // ⚠️ ABSENT ⇒ true：正式比賽、舊錄影與既有測試一個 tick 都沒變。
  if (
    rules.autoWaves !== false &&
    mt >= rules.firstWaveTicks &&
    (mt - rules.firstWaveTicks) % rules.waveIntervalTicks === 0
  ) {
    const k = (mt - rules.firstWaveTicks) / rules.waveIntervalTicks + 1;
    const count = Math.min(k, rules.mobsPerWaveCap);
    // active zones in sorted order (deterministic); each zone independently
    // spawns up to `count`, never exceeding its alive cap.
    const zones = [...world.mobZones].sort((a, b) => a - b);
    for (const zone of zones) {
      // #216: a zone whose duel is already decided gets no new wave — the round
      // is over there, and PvE that keeps arriving is PvE that keeps hitting.
      //
      // owner 2026-08-02「敵方英雄全死光 或我方英雄全死光 殭屍就不應該再生成」——
      // `settledZones` 來得太晚：主機要等到勝負被**記下**才寫它，而勝負又被
      // 「場上還有殭屍」壓著不記，於是形成一個自我維持的迴圈（有殭屍 ⇒ 不記 ⇒
      // 繼續生 ⇒ 永遠有殭屍）。`spawnHaltedZones` 在**一隊全滅的那一刻**就寫，
      // 不等勝負，這是切斷那個迴圈的其中一刀（另一刀是收窄「哪幾種怪壓住回合」）。
      if (world.settledZones.has(zone) || world.spawnHaltedZones.has(zone)) continue;
      for (let i = 0; i < count; i++) {
        if (mobsAliveInZone(world, zone) >= rules.maxAlivePerZone) break;
        spawnMob(world, zone, rules, k, i);
      }
    }
  }

  // 3) AI TARGET PICK — each mob (ascending id) aims at the nearest enemy
  //    champion in its zone. Every champion is an enemy (team !== MONSTER), so
  //    this is champion-blind aggro with no per-team logic.
  for (const [mobId, mob] of world.mob) {
    const mt2 = world.transform.get(mobId);
    const mhp = world.health.get(mobId);
    if (!mt2 || !mhp?.alive) continue;
    // #216: STAND DOWN in a settled zone. The duel there is decided, so a mob
    // must not keep chasing/hitting the survivors while the other zone plays on
    // (same reason the fire ring stops burning them). Target is cleared rather
    // than kept, so the nav chase stops on the same tick as the melee.
    if (world.settledZones.has(mob.zone)) {
      mob.target = -1;
      const idleNav = world.nav.get(mobId);
      if (idleNav) idleNav.attackTarget = null;
      continue;
    }
    let target: EntityId | -1 = -1;
    let bestD2 = Infinity;
    // 嘲弄 (sim/taunt.ts) —— 「這一刻我被迫打誰」。ONE seam, `forcedTargetOf`,
    // shared verbatim with the champion auto-acquire path; this system does NOT
    // read `world.taunt` itself, for the reason this file's own `isMobTargetable`
    // comment gives (three private answers to one targeting question is how
    // 召喚物 became unhittable). `scope: "mob"` picks the PvE legality half —
    // `isMobTargetable` + the different-team test that the scan below applies —
    // and it is also where the 小怪吃不吃嘲弄 field is honoured.
    //
    // ⭐ 決策點,而且它是一個**欄位**不是這一行:「取代」還是「偏袒」那個
    // 最近敵人掃描 —— `tauntRules.mobTauntMode`(sim/taunt.ts)。
    //   · "replace"(出貨)      —— 嘲弄是一條拉繩,「最近」正是它要推翻的答案;
    //   · "nearestFirst"       —— 掃描照跑,嘲弄者只有在沒有更近的敵人時才贏
    //                             (平手時它贏,那就是「偏袒」唯一有意義的部分)。
    // 兩種模式都吃 `tauntRules.leashUnits` —— 那個判定在 `forcedTargetOf` 裡,
    // 所以這裡不存在第二份「拉繩多長」的知識。
    const taunter = forcedTargetOf(world, mobId, "mob");
    const taunterT = taunter !== null ? world.transform.get(taunter) : undefined;
    const forcedD2 = taunterT ? distSq(mt2.pos, taunterT.pos) : Infinity;
    if (taunter !== null && taunterT && world.tauntRules.mobTauntMode === "replace") {
      target = taunter;
      bestD2 = forcedD2;
    } else {
    // ⭐ [陣營轉換]（[EX∅ 根源]）—— 這一隻小怪**自己**現在算哪一隊。
    //
    // 沒有捕獲時它就是 `MONSTER_TEAM`，於是下面那一行與 `MONSTER_TEAM` 的常數
    // 版本**逐位元相同**（每一場既有比賽零改變）。被借走之後它是捕獲者那一隊，
    // 而那正是這一行必須是變數的理由：常數版本會讓被捕的殭屍王把**捕獲它的
    // 主人**也算成敵人（同隊，但閘只擋 `MONSTER_TEAM`），也就是玩家花了一件
    // 寶具換來一隻立刻回頭打自己的王。
    const myTeam = world.team.get(mobId)?.teamId ?? MONSTER_TEAM;
    // ⭐ GH#577 —— 「**優先攻擊玩家角色而非bot**」（owner 2026-08-23）。
    //
    // ⚠️ 只有**王**吃這一格：一般殭屍照舊誰近打誰（給整群殭屍裝上「無視擋在
    // 面前的 bot 直奔真人」等於重寫整個 PvE 難度，而 owner 說的是殭屍王）。
    //
    // ⚠️ 兩趟，⛔ 不是一趟加權：第一趟只看真人，一個都沒有（全 bot 的練習賽、
    // 真人全滅、或 host 還沒把座位表交進來）才跑第二趟的全體掃描。加權寫法在
    // 「最近的真人在 20 格外、bot 貼臉」時會退化成打 bot，而那正是這一格要否決的。
    const preferHumans = kingPrefersHumans(rules, mob.kind);
    for (const pass of preferHumans ? [true, false] : [false]) {
    if (pass === false && target !== -1) break; // 第一趟已經找到真人了
    for (const [cid, cteam] of world.team) {
      if (cteam.teamId === myTeam) continue; // never target its own side
      // 第一趟：**只有真人座位**。`humanSeats` 由 host 每一場戰鬥開始交進規則表
      // （`MobRules.humanSeats`）—— sim 自己沒有「誰是 bot」這個概念，理由寫在那裡。
      if (pass && !isHumanSeatId(rules, cteam.seatId)) continue;
      // 英雄 + 召喚物。`isMobTargetable` (sim/targeting.ts) is THE predicate —
      // the bare `world.champion.has(cid)` that used to stand here is exactly
      // how 召喚物 ended up unhittable by the whole PvE side: a summon carries
      // neither ChampionComp nor MobComp on purpose, so a store test could
      // never see it. Whether a given summon draws zombie aggro is a per-ability
      // decision point (sim/summonRules.ts), not a constant.
      // `mobId` is passed as the SEEKER (隱形): a hidden hero drops out of the
      // zombie aggro scan while `blocksMobAggro` is on, and a mob that somehow
      // acquires true sight would see through it from its own position.
      if (!isMobTargetable(world, cid, mobId)) continue;
      const chp = world.health.get(cid);
      const ct = world.transform.get(cid);
      if (!chp?.alive || !ct || ct.zone !== mob.zone) continue;
      const d2 = distSq(mt2.pos, ct.pos);
      // strict `<` + ascending-id iteration = ties break by lowest entityId.
      if (d2 < bestD2) {
        bestD2 = d2;
        target = cid;
      }
    }
    }
    // "nearestFirst": the taunter competes on distance like anybody else and
    // takes the tie (`<=`), which is the whole difference from "replace".
    // Deterministic either way — one comparison against one number.
    if (taunter !== null && taunterT && forcedD2 <= bestD2) {
      bestD2 = forcedD2;
      target = taunter;
    }
    }
    mob.target = target;
    const nav = world.nav.get(mobId);
    if (nav) nav.attackTarget = target === -1 ? null : target;

    // #262 — THIS mob's numbers, not the wave's. A king and a 特殊殭屍 differ
    // from a plain zombie in melee damage, reach and swing cadence, and reading
    // `rules.attackDamage` straight here is exactly how a 6,000 hp boss ends up
    // punching for 1.2.
    const prof = mobProfile(rules, mob.kind);

    // 3b) REGEN (task #217) — a mob has no StatsComp, so RegenSystem skips it.
    //     Apply the LEVELLED hp regen baked into the rules with the exact same
    //     `hp + perSec * dt` form RegenSystem uses for champions. Zero when the
    //     champion doc is unavailable, so a content-free world is unchanged.
    if (rules.hpRegenPerSec > 0) {
      mhp.hp = Math.min(mhp.maxHp, mhp.hp + rules.hpRegenPerSec * world.dt);
    }

    // 3c) ⭐ 殭屍王的腦（GH#577 / GH#602）—— 回魔 + 自動施法。
    //     ⚠️ 位置在 MELEE **之前**：一次成功的施法會寫 `nav.override`（[leap吸血]
    //     的拋物線），而下面那一段揮刀只在「站定」時出手 —— 順序反了會讓王在
    //     起跳的同一 tick 還揮一刀，而那一刀的目標可能在半個場外。
    kingBrain(world, mobId, mob.kind, rules, target);

    // 4) MELEE — in range + cooldown ready + STANDING STILL → queue one packet;
    //    else age the cd.
    //
    // 打就站定 (owner 2026-07-28:「並且殭屍王也會預設套用」). 小怪**沒有**
    // AbilitiesComp,所以 basicAttackSystem 整個迴圈都看不到它們 —— 它們走的是
    // 這條簡化路徑,直接把傷害推進 damageQueue。若只在 BasicAttackSystem 那側加
    // 規則,合併後的結果會是「殭屍能邊走邊打、玩家不能」,一個沒有人想要的不對稱。
    // 判斷本身和英雄共用同一支 `standstillBlocks`(sim/combatFeel.ts),所以兩條
    // 路徑不可能各自漂移。
    //
    // 冷卻在這裡不會被白燒:被擋下時走的是 `else if (cd > 0) cd--` 那條,而一個
    // 準備好出手的小怪 cd 正好是 0,所以它只是「這一 tick 沒打」,停下來的下一
    // tick 就打得出來 —— 和英雄那側「閘擋在冷卻 commit 之前」是同一個語意。
    const ssBlocked =
      ss.applyToMobs &&
      target !== -1 &&
      standstillBlocks(ss, mt2.vel, mt2.pos, world.transform.get(target)?.pos ?? mt2.pos);
    if (target !== -1 && mob.attackCdTicks <= 0 && bestD2 <= prof.attackRangeSq && !ssBlocked) {
      world.damageQueue.push({
        source: mobId,
        target,
        amount: prof.attackDamage,
        type: "physical",
        crit: false,
        origin: "mob",
      });
      mob.attackCdTicks = prof.attackCdTicks;
    } else if (mob.attackCdTicks > 0) {
      mob.attackCdTicks--;
    }
  }

  // 5) DEATH PAYOUT + CLEANUP — pay the killer for mobs that died THIS tick,
  //    then QUEUE the corpse (GH#296 — `world.destroyAfterHooks`, drained at slot
  //    9g, AFTER this tick's hook dispatch). A mob killed by a non-champion (another mob, the
  //    fire ring, a DoT with no champion source) pays nobody — mirrors
  //    DeathSystem's no-killer path and the guardian/coin `champion.has` gate.
  for (const ev of world.events) {
    if (ev.type !== "death") continue;
    const id = ev.data.id as EntityId;
    const dead = world.mob.get(id);
    if (!dead) continue;
    const killer = (ev.data.killer as EntityId | null) ?? null;

    // ── 殭屍王 (task #262) ────────────────────────────────────────────────
    // A KING PAYS ITS POOL, NOT THE PER-ZOMBIE REWARD, and it does NOT bump
    // `mobKills`: it is the quest's PRIZE, not another zombie, so killing one
    // must never count toward summoning the next one (with `repeatable` on,
    // that would be a 100-kill loop that ends one kill early forever).
    // Returned to the flat path for nothing — the branch is total.
    if (dead.kind === "boss") {
      payMobBounty(world, id, "boss", killer, rules);
      // A boss kill is still A KILL: `onKill` passives and the 連殺 combo fire
      // exactly as they do for a zombie (#244's ruling), before the entity goes.
      if (killer !== null && world.champion.has(killer)) {
        fireHooks(world, killer, "onKill", id);
        creditKillCombo(world, killer, id, "mob");
      }
      world.destroyAfterHooks(id);
      continue;
    }

    // ── 特殊殭屍分紅 (#288) ───────────────────────────────────────────────
    // BEFORE the killer gate and OUTSIDE it, exactly like the king's: a 特殊殭屍
    // that drowned in the fire ring still owes every champion who chipped it.
    // `null` back means 「這種怪不走獎池」 (every 一般殭屍, and a special in an
    // arena that authored none), which is what keeps the pre-#288 flat reward
    // below reachable and byte-identical. An EMPTY ARRAY is a different answer —
    // 「走獎池,但沒有人可以領」 — and must NOT fall back to the flat reward, or a
    // fire-ring kill would pay the pool AND the minion reward.
    const shares = payMobBounty(world, id, dead.kind, killer, rules);

    if (killer !== null && world.champion.has(killer)) {
      // #262: a 特殊殭屍 pays `rewardMult`× — the reason to hunt it. Rounded so
      // gold stays integral (the wallet and every display treat it as whole).
      //
      // #288 — SKIPPED ENTIRELY once the special has a 分紅獎池: the pool IS the
      // reward, and paying both would hand the last hitter their share plus a
      // second, unexplained 60 gold. `gold` still ends up on the `mobSlain`
      // event either way, because the floating 「+N 金」 over the corpse has to be
      // the money that actually entered THIS killer's wallet.
      let gold: number;
      if (shares === null) {
        const mult = mobProfile(rules, dead.kind).rewardMult;
        // 打殭屍發放倍率 (owner 2026-08-04) — 一般與特殊走**不同的兩格**.
        // `rewardMult` is exactly what makes them different economies: the
        // special pays a multiple of the normal reward precisely because it is
        // meant to be a lump, so scaling both through one knob would undo the
        // separation the owner asked for (「普通殭屍 的確也可以單獨倍率」).
        // A `boss` never reaches this line — MobSystem's boss branch returns
        // above, and `mobProfile` documents the king's flat reward as 0 anyway.
        const bucket: GoldPayoutCategory = dead.kind === "special" ? "elite" : "mob";
        // `grantGold` RETURNS what actually landed, and `gold` must be that
        // number — it is what the floating 「+N 金」 over the corpse prints, so
        // reading the pre-multiplier request here would make the corpse say 60
        // while the purse moved 30.
        gold = grantGold(world, killer, Math.round(rules.rewardGold * mult), bucket);
        grantXp(world, killer, Math.round(rules.rewardXp * mult));
      } else {
        gold = shares.find((s) => s.id === killer)?.gold ?? 0;
      }
      const n = (world.mobKills.get(killer) ?? 0) + 1;
      world.mobKills.set(killer, n);
      if (rules.killsPerLevel > 0 && n % rules.killsPerLevel === 0) {
        grantLevels(world, killer, 1);
      }
      // #244 — A MOB KILL IS A KILL. `fireHooks(…, "onKill", …)` used to live
      // ONLY in DeathSystem's champion branch, so every `onKill` passive was
      // silently dead against mobs: 孫悟空's 09-00 賽亞人的血脈 literally reads
      // 「每殺死一個部隊增加2點生命」 and had never once paid out since #215
      // shipped. Fired here, AFTER the gold/xp/level bookkeeping and BEFORE the
      // `mobSlain` event, so the ordering is fixed and deterministic. The mob
      // entity is still alive in `world.mob` at this point, which is what lets a
      // hook's `victim: "mob"` filter tell a 部隊 kill from a 英雄 kill.
      fireHooks(world, killer, "onKill", id);
      // 連殺 COMBO (owner, 2026-07-27): 「殭屍與英雄的擊殺都算」, on ONE shared
      // counter. Credited HERE — on the same line that bumps `mobKills` — rather
      // than in a system of its own, so the sim keeps exactly one place that
      // decides 「a mob died and X killed it」. `mobKills` itself could not carry
      // the combo (match-cumulative, mob-only, no timestamp); see
      // sim/combat/killCombo.ts.
      //
      // This is the round-9 firehose: 20-per-wave / 60-alive zombies mean one AoE
      // can land a dozen credits inside this very loop, all on the same tick, all
      // chaining. Round 10 schedules zero mobs, so the identical code path simply
      // never runs there and the final's combo is pure champion kills.
      creditKillCombo(world, killer, id, "mob");
      world.emit("mobSlain", {
        id,
        killer,
        killerSeatId: world.team.get(killer)?.seatId ?? -1,
        gold,
        kills: n,
        kind: dead.kind,
      });

      // 殭屍王召喚 (task #262). LAST in the kill bookkeeping, on purpose: the
      // tally, the level grant and the slain event all describe the zombie that
      // just died, and a king appearing mid-way through that would let a hook
      // observe a half-written state. `n` is THIS ONE CHAMPION's cumulative
      // total (`world.mobKills` is per-champion and match-cumulative since
      // #215), so two players on 50 kills each summon nothing — the boundary
      // and the per-hero-ness both live in `bossSummonsAt`.
      if (bossSummonsAt(rules.boss, n)) {
        // The king spawns in the SUMMONER's zone: the quest belongs to the
        // player who did the work, and their duel is where the fight has to
        // happen. Falls back to the dead zombie's zone if the champion somehow
        // has no transform (it always does — it just landed a killing blow).
        const zone = world.transform.get(killer)?.zone ?? dead.zone;
        summonMobBoss(world, zone, rules, killer, n);
      }
    } else {
      world.emit("mobSlain", { id, killer: null, killerSeatId: -1, gold: 0, kills: 0, kind: dead.kind });
    }
    world.destroyAfterHooks(id);
  }
}

/**
 * Pay out a mob's prize pool and announce the split — the 殭屍王 (task #262) and,
 * since #288, the 特殊殭屍 (owner 2026-07-29: 「特殊殭屍也照傷害比例分,金錢
 * +5,000 · 等級提升 +5」).
 *
 * ONE function for both kinds ON PURPOSE. The king's payout was five separate
 * decisions — read the ledger, drop damagers who are no longer champions, split,
 * report the GRANTED levels rather than the requested ones, and put the whole
 * sheet on the wire — and every one of them is a decision the special needs too.
 * A second copy would have re-derived four of them slightly differently, which
 * is precisely how one settlement panel ends up telling the truth and the other
 * one does not. `kind` picks the pool via `mobBountyRules`; nothing else forks.
 *
 * The arithmetic — proportional shares, the last hitter's 翻倍 weight, and the
 * rounding remainder — lives in `sim/mobBoss.ts` as a pure function.
 *
 * ORDER IS FIXED: `splitBossBounty` sorts by ascending entity id, and the grants
 * below walk that sorted array, so two hosts replaying the same match hand out
 * byte-identical amounts in a byte-identical order.
 *
 * RETURNS `null` when this kind pays NO pool (every 一般殭屍, a special with no
 * `bounty` block) so the caller can fall back to the flat per-kill reward, and a
 * possibly-EMPTY array when it does. Those two are different answers and the
 * caller must not conflate them.
 */
function payMobBounty(
  world: SimWorld,
  mobId: EntityId,
  kind: MobKind,
  killer: EntityId | null,
  rules: MobRules,
): BossBountyShare[] | null {
  const bounty = mobBountyRules(rules, kind);
  if (bounty === null) return null;
  const lastHitter = killer !== null && world.champion.has(killer) ? killer : null;
  // 「照傷害比例分」 vs 「全額給補刀的人」 (#288's `special.splitByDamage`) is
  // expressed by WHAT GOES INTO THE TABLE, not by a second payout routine: an
  // empty damager list is exactly `splitBossBounty`'s 「沒有人造成可測量的傷害」
  // branch, which hands the entire pool to the last hitter and — deliberately —
  // applies no 翻倍 on top. Same rounding, same event, same determinism, and the
  // switch cannot drift away from the split path it is the alternative to.
  const damagers: BossDamageEntry[] = [];
  if (bounty.splitByDamage) {
    const ledger = world.bossDamage.get(mobId);
    if (ledger) {
      for (const [id, dmg] of ledger) {
        if (world.champion.has(id)) damagers.push([id, dmg]);
      }
    }
  }
  const shares = splitBossBounty(
    damagers,
    { gold: bounty.gold, xp: bounty.xp, levels: bounty.levels },
    lastHitter,
    bounty.lastHitMultiplier,
    bounty.lastHitMode,
  );
  // 等級提升 (GH#206). `grantLevels` RETURNS what it managed to hand out — the
  // request and the grant diverge at `LEVEL_CAP`, and it is the GRANT that the
  // settlement panel must show. Accumulated here rather than re-derived from
  // `shares`, because `shares[].levels` is the request.
  // 發放倍率 (owner 2026-08-04) — WHICH BUCKET A POOL PAYS THROUGH IS `kind`.
  //
  // BOTH POOLS ARE `elite`. A 特殊殭屍 and a 殭屍王 are the same economic shape:
  // one kill, one lump, split by damage — the opposite of the per-kill trickle
  // `mob` collects. That is why the owner's 0.1 belongs on this row and his 0.5
  // on the other one.
  //
  // ⚠️ THE KING IS **NOT** `quest`, and that is a correction of an earlier call.
  // It was filed under 完成任務 because the branch above calls it 「the quest's
  // PRIZE」 — true as design intent, wrong as wiring: #262/#263 are both still
  // pending, so no quest pays gold today, while the king is the LARGEST single
  // gold source in a match. Under 完成任務 it would sit behind a knob nobody
  // turns, and 「打殭屍調成 0.1 了, 錢還是很多」 is the bug report that follows.
  // `quest` is not left dangling: 守衛塔補刀 (#89) pays through it.
  //
  // `normal` never reaches this line with a pool today (一般殭屍 authors none,
  // so `shares` is null and the flat path above pays it), but it is named
  // rather than folded into the ternary's else-branch: the day someone authors
  // a pool for 一般殭屍, it must land in the trickle bucket, not the lump one.
  const category: GoldPayoutCategory = kind === "normal" ? "mob" : "elite";
  let paidLevels = 0;
  const grantedPerShare = new Map<EntityId, number>();
  // What each share ACTUALLY received. The event below reports the split to the
  // 分紅結算 panel, and its own comment insists those numbers are 「SUMS OF WHAT
  // WAS PAID, NOT THE CONFIGURED POOL」 — a multiplier applied inside `grantGold`
  // and not reflected here would turn that sentence into a lie, which is the
  // exact failure (④ 斷言/顯示與缺陷無關) the panel was built to avoid.
  const paidGold = new Map<EntityId, number>();
  for (const s of shares) {
    paidGold.set(s.id, s.gold > 0 ? grantGold(world, s.id, s.gold, category) : 0);
    if (s.xp > 0) grantXp(world, s.id, s.xp);
    if (s.levels > 0) {
      const got = grantLevels(world, s.id, s.levels);
      grantedPerShare.set(s.id, got);
      paidLevels += got;
    }
  }
  const paidShares: BossBountyShare[] = shares.map((s) => ({
    ...s,
    gold: paidGold.get(s.id) ?? 0,
  }));
  // FAILURE SHAPE ② (「算出來了但從沒送到客戶端」): without this the whole
  // mechanic is server-side arithmetic. The payload carries the WHOLE split —
  // every participant, their damage, their gold/xp and who doubled — so the
  // client can show the settlement instead of guessing from a gold counter that
  // jumped. `killerSeatId` is what a local-seat cue gates on, exactly like
  // `guardianSlain` / `coinPickedUp`.
  //
  // ── #288: WHY THE 特殊殭屍 REUSES `mobBossSlain` RATHER THAN GETTING ITS OWN
  //    EVENT NAME ─────────────────────────────────────────────────────────────
  // Both were on the table (the task asked for one, with the reason written
  // down). Reuse wins on three counts:
  //
  //  1. IT ACTUALLY REACHES THE PLAYER TODAY. `mobBossSlain` is already in
  //     `FANNED_OUT_EVENT_TYPES`, already projected by the client's
  //     `parseMobBossEvent`, and already drives the 分紅結算 panel + the 中獎
  //     cue. A NEW name would cross the wire and land on zero consumers — the
  //     split computed, transmitted, and shown to nobody. That is failure shape
  //     ① 畫面外 wearing ②'s clothes, and it is not fixable from this lane
  //     (apps/client/** is out of scope here).
  //  2. THE PAYLOAD IS THE SAME CLAIM. 「這些人各打了多少,各領多少金/經驗/等級,
  //     誰補的刀」 — identical fields, identical meaning, produced by the identical
  //     `splitBossBounty`. Two names for one sentence is how two settlement
  //     panels start disagreeing about money.
  //  3. `kind` KEEPS THEM DISTINGUISHABLE. The client can print 特殊殭屍 instead
  //     of 殭屍王 (and gate its own cue) off one string, with no wire-schema
  //     change; an unknown key is ignored by `parseMobBossEvent`, so today's
  //     client keeps working unchanged.
  //
  // The cost, stated plainly: until the client reads `kind`, a special's
  // settlement renders with the king's wording and takes the king's single
  // panel slot. A 特殊殭屍 now carries 12,000+ hp, so this fires a handful of
  // times a round, not per zombie — the panel is not being spammed.
  world.emit("mobBossSlain", {
    id: mobId,
    // #288 — 「哪一種怪」. `"boss"` for the king, `"special"` for a 特殊殭屍.
    kind,
    // #288 — THE ZONE, WHICH THIS EVENT COULD ALWAYS HAVE CARRIED. The client's
    // projection comments assume the entity is gone by now and falls back to
    // inheriting the zone from the matching `mobBossSpawn`; it is NOT gone (the
    // caller destroys it after this returns), and a 特殊殭屍 has no
    // `mobBossSpawn` to inherit from, so without this line every special's
    // payout sheet arrives with zone -1 and shows up in the OTHER arena too.
    zone: world.mob.get(mobId)?.zone ?? -1,
    killer: lastHitter,
    killerSeatId: lastHitter === null ? -1 : (world.team.get(lastHitter)?.seatId ?? -1),
    // ⚠️ THESE ARE SUMS OF WHAT WAS PAID, NOT THE CONFIGURED POOL — and since
    // GH#206's `"bonus"` mode they can EXCEED it (up to ×lastHitMultiplier).
    // Any consumer that substitutes `boss.bountyGold` here is lying to the
    // player; `bossTotalLine` reads these.
    totalGold: paidShares.reduce((a, s) => a + s.gold, 0),
    totalXp: shares.reduce((a, s) => a + s.xp, 0),
    totalLevels: paidLevels,
    lastHitMultiplier: bounty.lastHitMultiplier,
    lastHitMode: bounty.lastHitMode,
    shares: paidShares.map((s) => ({
      id: s.id,
      seatId: world.team.get(s.id)?.seatId ?? -1,
      damage: s.damage,
      // PAID, not requested — same rule as `levels` below, now that a 發放倍率
      // can sit between the pool and the purse.
      gold: s.gold,
      xp: s.xp,
      // GRANTED, not requested — see `paidLevels` above.
      levels: grantedPerShare.get(s.id) ?? 0,
      lastHit: s.lastHit,
    })),
  });
  // The PAID sheet is also what the caller reads to print the 「+N 金」 over a
  // 特殊殭屍's corpse, so the returned array carries the same numbers the event
  // does — one answer to 「這個人領了多少」, not two.
  return paidShares;
}

/**
 * Combat entry: arm the mob mechanic. Idempotent — clears any stale mobs first,
 * sets the rules, resets the dedicated clock to 0 and records the active zone
 * list (mirror of beginCombatFlowers/beginCombatGuardians). The host only calls
 * this from ROUND `mobRules.fromRound` onward (see MatchController.enterCombat).
 */
export function beginCombatMobs(
  world: SimWorld,
  rules: MobRules,
  zones: readonly number[],
): void {
  endCombatMobs(world);
  world.mobRules = rules;
  world.mobTicks = 0;
  for (const zone of zones) world.mobZones.add(zone);
}

/**
 * Combat exit (round end / phase leave): despawn EVERY mob silently — no payout,
 * no corpse — clear the zone list, disarm the rules and stop the clock
 * (mobTicks = -1). This is what stops post-round farming, exactly like
 * endCombatGuardians. Idempotent.
 *
 * `world.mobKills` is deliberately NOT cleared here (owner decision, #215): the
 * every-30-kills → +1 level bonus is the DOMINANT L50→L99 climb, so the tally is
 * MATCH-CUMULATIVE — a 29-kill remainder carries into the next round instead of
 * being discarded. It resets naturally with a fresh SimWorld per match; champion
 * EntityIds are stable across rounds (one world per match), so the per-champion
 * count keeps accruing. Mob ENTITIES still despawn every round (the loop below),
 * so there is no post-round PvE farming.
 */
export function endCombatMobs(world: SimWorld): void {
  for (const id of [...world.mob.keys()]) world.destroy(id);
  world.mob.clear();
  // #262 (+#288's 特殊殭屍): a ledgered mob despawned at round end pays NOBODY
  // (same silent-despawn rule every mob follows), so its ledger is dead weight. Cleared
  // wholesale rather than relying on `destroy` alone, so a ledger keyed by an id
  // that never reached `world.mob` cannot survive the round either.
  world.bossDamage.clear();
  // #247 —— 每回合上限的重置點. THE ROUND BOUNDARY, said out loud: `beginCombatMobs`
  // calls this first, so arming round N+1 wipes round N's tally through exactly
  // one line. Deliberately NOT a tick deadline — a king summoned in the last
  // second of a round must not carry its quota into the next one, and an absolute
  // -tick expiry would have to know a round length the sim does not have.
  world.bossSpawnsThisRound.clear();
  world.mobZones.clear();
  world.mobRules = null;
  world.mobTicks = -1;
}

// ===========================================================================
// ⭐ 殭屍王的腦 —— GH#577 / GH#602（owner 2026-08-23）
// ===========================================================================
//
// owner 逐字：
// > 「殭屍王 應該要會**自動學習所有技能並施展技能** 並且**攻速都是上限4起跳**
// >  並且**優先攻擊玩家角色而非bot**」
// > 「殭屍王 內建 **[leap吸血]** 技能，當殭屍王**生命低於20%**時，殭屍王將會
// >  **無上限施法距離**跳躍**[leap]** 到**全場血量最少的英雄**旁邊咬一口⋯**冷卻30秒**」
// > 「殭屍王**回魔速度是每秒1000點**，基本上不缺魔力」
//
// ⭐ 同日補的裁決（逐字）——「額外」與「本體」是**兩件事，並存**：
// > 「**QWEREX都要學起來根據情況放**（**最近的敵人單體或多人範圍**），
// >  至少殭屍王角色**自己原本的技能都要學好學滿、放好放滿**，
// >  額外追加 leap吸血 是給殭屍王一點額外優勢**不會單方面被打太無聊**而已」
// ⇒ 「學好學滿」＝ `learnRankMode: "max"`（`sim/mobs.ts::installKingKit`）；
//    「根據情況放」＝ `kingCastTarget` / `kingAimAnchor`（本檔下方）。
//
// ⭐ 這一段是**AI**，⛔ 不是技能。[leap吸血] 的每一個效果（黑幕、拋物線、真傷、
// 吸血、追加回復、冷卻）都住 `content/abilities/godie-zombieking.passive.json`，
// 走的是**出貨的** `castAbility` → `runEffects` → `leapSystem`，一行技能專用的
// 程式都沒有（第〇·五守則：引擎做機制、JSON 做技能）。
// 這裡只回答兩個 AI 才回答得了的問題：**現在要不要按**，以及**按在誰身上**。
//
// ⚠️ 「HP 低於 X% 才放得出來」為什麼是 AI 而不是技能上的一格：
// `zEffectDef` 只有 hook 有 `condition`，主動技**沒有任何欄位**表達得出施法前的
// 生命門檻 —— 逐字同 `abilities/berserkRules.ts` 檔頭第 1 條（那條規則的另一個
// 使用者是 EX 完全暴走）。寫進效果裡的話冷卻照轉、什麼都不會發生（失敗形態②）。

/** 這一隻是不是一隻「會打架」的王。⛔ 一般殭屍與特殊殭屍永遠回 null。 */
function kingRulesFor(rules: MobRules, kind: MobKind): MobKingRules | null {
  if (kind !== "boss") return null;
  const king = rules.boss?.king ?? null;
  return king !== null && king.enabled ? king : null;
}

/** 王要不要走「先打真人」那一趟掃描。 */
function kingPrefersHumans(rules: MobRules, kind: MobKind): boolean {
  const king = kingRulesFor(rules, kind);
  if (king === null || king.targetPreference !== "players") return false;
  // ⚠️ **空集合 ⇒ false**（⛔ 不是「一個都不打」）：host 還沒交座位表、
  // 一場全 bot 的練習賽、以及每一份手搭的測試夾具，行為都必須是這一格出現之前
  // 的樣子。這一行就是那個承諾。
  return (rules.humanSeats?.size ?? 0) > 0;
}

/** 這個座位是不是真人。 */
function isHumanSeatId(rules: MobRules, seatId: number): boolean {
  return rules.humanSeats?.has(seatId as SeatId) === true;
}

/**
 * ⭐ **全場血量最少的英雄** —— [leap吸血] 的目標（owner 的字面規格）。
 *
 * ⚠️ 三個判準，⛔ 一個都不是「最近的」：
 *   ① **英雄**（`world.champion.has`）—— ⛔ 不含召喚物、不含花、不含另一隻殭屍。
 *      owner 寫的是「英雄」，而 `isMobTargetable` 那條謂詞是為**普攻索敵**寫的
 *      （它刻意讓召喚物進得來）。
 *   ② **同一個決鬥區**、活著、不同隊。
 *   ③ **絕對血量最少**（⛔ 不是百分比）：owner 說的是「血量最少」。
 *      平手時取**最小的 entity id** —— 決定性，與這支檔案每一處掃描同一個規矩。
 *
 * ⚠️ **不看距離** —— 那就是「無上限施法距離」在索敵這一側的樣子。
 * （施法閘那一側由技能文件的 `rangeUnlimited: true` 負責。）
 */
export function lowestHealthEnemyChampion(
  world: SimWorld,
  seeker: EntityId,
  zone: number,
): EntityId | null {
  const myTeam = world.team.get(seeker)?.teamId ?? MONSTER_TEAM;
  let best: EntityId | null = null;
  let bestHp = Infinity;
  // ascending entity id (world.team is the ordered store) ⇒ ties break lowest id
  for (const [cid, cteam] of world.team) {
    if (cteam.teamId === myTeam) continue;
    if (!world.champion.has(cid)) continue; // ① 英雄，⛔ 不是「任何打得到的東西」
    const chp = world.health.get(cid);
    const ct = world.transform.get(cid);
    if (!chp?.alive || !ct || ct.zone !== zone) continue;
    if (chp.hp < bestHp) {
      bestHp = chp.hp;
      best = cid;
    }
  }
  return best;
}

/**
 * 回魔 + 自動施法。每 tick 一次，在王的 AI 掃描之後、揮刀之前。
 *
 * `meleeTarget` 是這一 tick 掃描出來的普攻目標（`-1` = 沒有）——
 * Q/W/E/R/EX 打它，[leap吸血] ⛔ 不打它（見 {@link lowestHealthEnemyChampion}）。
 */
function kingBrain(
  world: SimWorld,
  id: EntityId,
  kind: MobKind,
  rules: MobRules,
  meleeTarget: EntityId | -1,
): void {
  const king = kingRulesFor(rules, kind);
  if (king === null) return;
  const hp = world.health.get(id);
  if (!hp?.alive) return;

  // ── 回魔 ────────────────────────────────────────────────────────────────
  // 王沒有 ChampionComp ⇒ `recomputeStats` 早退 ⇒ `RegenSystem` 對它一格都不動，
  // 所以回魔和上面那一段 hp 回復一樣由這裡付，用**同一個** `+ perSec * dt` 形狀。
  if (king.manaRegenPerSec > 0 && hp.maxMana > 0) {
    hp.mana = Math.min(hp.maxMana, hp.mana + king.manaRegenPerSec * world.dt);
  }

  const ab = world.abilities.get(id);
  if (!ab) return;
  // 正在施法 / 正在飛（[leap吸血] 的拋物線）⇒ 這一 tick 不下任何新指令。
  // ⛔ 不是最佳化：`castAbility` 對 `ab.cast` 回 "cooldown"，而在空中再按一次
  // 會把 `nav.override` 換成第二條弧線，王會在半空中改道。
  if (ab.cast || world.nav.get(id)?.override) return;

  // ── ⭐ [leap吸血]：**生命低於門檻**才按得下去 ──────────────────────────
  // 順序是刻意的：它排在 Q/W/E/R 前面。owner 的規格是「當殭屍王生命低於20%時」，
  // 那是一個**保命/處決**技，被一支剛好轉好的 Q 卡住一個 tick 都是錯的。
  if (
    king.innateAbilityId !== "" &&
    ab.passiveSlot != null &&
    ab.passiveSlot.abilityId === king.innateAbilityId &&
    ab.passiveSlot.cooldownRemainingTicks <= 0 &&
    hp.maxHp > 0 &&
    hp.hp / hp.maxHp < king.innateCastHpPct
  ) {
    const victim = lowestHealthEnemyChampion(world, id, world.transform.get(id)?.zone ?? 0);
    if (victim !== null) {
      // ⛔ `allowApproach: false` —— 「無上限施法距離」的意思是**不必走過去**。
      // 武裝一道接近指令會把王的移動通道搶走（而且它永遠到得了，因為射程是 ∞），
      // 那是一個看起來像「王呆住不動」的 bug。
      const res = castAbility(world, id, INNATE_SLOT, { type: "entity", entityId: victim }, {
        allowApproach: false,
      });
      if (res === "ok") return; // 這一 tick 已經動用了，⛔ 不再疊一支 Q
    }
  }

  // ── 自動施展**所有**技能 ────────────────────────────────────────────────
  // 固定順序 R → EX → E → W → Q（大招優先），⛔ 不抽籤：sim 的每一格都必須是
  // 決定性的（`sim/purity.test.ts`），而「王這一場放不放大招」不該取決於 rng。
  if (meleeTarget === -1) return;
  if (!world.transform.get(meleeTarget)) return;
  for (const slot of KING_CAST_ORDER) {
    const inst = abilityInstanceFor(ab, slot);
    if (!inst || inst.rank <= 0 || inst.cooldownRemainingTicks > 0) continue;
    const def = Abilities.tryGet(inst.abilityId);
    if (!def) continue;
    const target = kingCastTarget(world, id, def, meleeTarget, king);
    if (target === null) continue;
    // ⛔ `allowApproach: false` —— 接近指令會接管 `nav`，而王的走位歸 MobSystem
    // 的追擊管（`nav.attackTarget`）。兩個東西同時寫同一個通道 = 王原地抖動。
    if (castAbility(world, id, slot, target, { allowApproach: false }) === "ok") return;
  }
}

/**
 * ⭐ **「根據情況放（最近的敵人單體或多人範圍）」**（owner 2026-08-23 逐字）——
 * 這一支技能這一次瞄準誰／哪裡。
 *
 * owner 只給了兩條，所以這裡也只有兩條：
 *   · **單體型** ⇒ 打**最近的敵人**。那正是索敵掃描已經挑好的 `mob.target`
 *     （它同時吃「先打真人」那一格），⛔ 不在這裡重掃一次距離。
 *   · **範圍型** ⇒ 挪到**打得到最多人**的那一個敵人身上。
 *
 * ⚠️ 目標的**形狀**仍然由技能卡決定，⛔ 不是這裡挑：指定技給實體，其餘給一個點
 * （地面技會自己夾到射程內，方向技／衝刺技自己正規化成方向）。
 *
 * 回 `null` = 這一支這一 tick 沒有合法目標 ⇒ 換下一個槽位（⛔ 不是整個 tick 放棄）。
 */
export function kingCastTarget(
  world: SimWorld,
  id: EntityId,
  def: AbilityDef,
  primary: EntityId,
  king: MobKingRules,
): CastTarget | null {
  const t = world.transform.get(id);
  if (!t) return null;
  // 自我施法 —— 「打誰」這個問題不存在。
  if (def.castType === "self") return { type: "entity", entityId: id };
  // ⭐ 增益／治療型（`targetsEnemies: false`）的對象是**自己人**。指定技給自己、
  // 其餘給自己腳下。⛔ 瞄敵人的話 `castAbility` 回 "bad-target"，於是那一支
  // 技能王一整場放不出來，而且畫面上完全看不出來（失敗形態②）——
  // 「放好放滿」少掉的正是這一族。
  if (def.targetsEnemies === false) {
    return def.castType === "targeted"
      ? { type: "entity", entityId: id }
      : { type: "point", point: { x: t.pos.x, z: t.pos.z } };
  }
  const anchor = kingAimAnchor(world, id, def, primary, king);
  const at = world.transform.get(anchor);
  if (!at) return null;
  return def.castType === "targeted"
    ? { type: "entity", entityId: anchor }
    : { type: "point", point: { x: at.pos.x, z: at.pos.z } };
}

/**
 * 範圍技要落在**誰**身上；單體技回 `primary`（＝最近的那一個）。
 *
 * ⭐ 「單體 vs 範圍」是**推導**的，⛔ 不是一張「哪幾支是範圍」的名單
 * （第〇·四守則）—— 那張名單換一張臉就過期，而王每一場戴的臉是**抽**的
 * （`boss.championSource: "random"`）。
 * 判準是 `def.radius`：`radiusTier` 在**載入時**就由 `resolveRadiusTier` 翻成
 * 這個數字，而且它正是**引擎自己**問「這個圈打得到誰」時讀的那一格
 * （`groundAoeTargets`）⇒ AI 眼中的「範圍」與引擎眼中的逐位元是同一個。
 *
 * ⭐ 「打得到幾個人」也不在這裡算：直接問 `groundAoeTargets`，⛔ 不重寫一份
 * 圓形查詢（它還要吃 `combatEnv.abilityRadius` 與 `targetsEnemies` 的側別，
 * 重寫一份必然漂掉，而且漂掉的樣子是「王站在人堆外面放大絕」）。
 *
 * 候選點**落在敵人身上**（⛔ 不是掃網格）：保證至少打中那一個，
 * 而且逐 tick 決定性（`world.team` 是 id 遞增的有序表，平手取先看到的）。
 */
function kingAimAnchor(
  world: SimWorld,
  id: EntityId,
  def: AbilityDef,
  primary: EntityId,
  king: MobKingRules,
): EntityId {
  if ((king.situationalAiming ?? DEFAULT_KING_SITUATIONAL_AIMING) === false) return primary;
  if ((def.radius ?? 0) <= 0) return primary; // 單體 ⇒ 最近的敵人
  const t = world.transform.get(id);
  if (!t) return primary;
  // ⛔ 射程怎麼算不在這裡重寫：`resolveAbilityRange` 是全專案唯一的答案
  // （它還要乘 `combatEnv.abilityRange`）。放不到的位置不算候選 —— 地面技會被
  // 夾回射程內（於是圈心根本不在那裡），指定技則直接被拒。
  // ⚠️ 「無上限施法距離」是 `Infinity`，比較恆真，所以那一族全部進得來。
  const range = resolveAbilityRange(world, def.range);
  const myTeam = world.team.get(id)?.teamId ?? MONSTER_TEAM;
  let best = primary;
  let bestHits = 0;
  for (const [cid, cteam] of world.team) {
    if (cteam.teamId === myTeam) continue;
    if (!isMobTargetable(world, cid, id)) continue;
    const chp = world.health.get(cid);
    const ct = world.transform.get(cid);
    if (!chp?.alive || !ct || ct.zone !== t.zone) continue;
    if (distSq(t.pos, ct.pos) > range * range) continue;
    const hits = groundAoeTargets(world, id, def, ct.pos).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = cid;
    }
  }
  // ⭐ 「**多人**」才值得挪落點。連 `areaMinTargets` 個都打不到 ⇒ 回到最近的那一個
  // （⛔ 不是「不放」—— owner 要的是「放好放滿」）。
  return bestHits >= (king.areaMinTargets ?? DEFAULT_KING_AREA_MIN_TARGETS) ? best : primary;
}

/** 王試著施放的槽位順序 —— 大招優先，⛔ 不抽籤（決定性）。 */
const KING_CAST_ORDER: readonly CastableSlot[] = ["R", "EX", "E", "W", "Q"];
