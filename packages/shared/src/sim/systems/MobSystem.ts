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
 *   2) SCHEDULE— fire a wave when the cadence lands; wave k spawns min(k,cap)
 *                mobs per active zone, one at a time, never past maxAlivePerZone.
 *   3) AI      — each mob (ascending id) aims at the nearest enemy champion,
 *                then regenerates `rules.hpRegenPerSec * dt` (#217: a mob has no
 *                StatsComp, so RegenSystem never sees it).
 *   4) MELEE   — a mob in range with a ready cooldown queues one melee packet.
 *   5) PAYOUT  — pay the killer for mobs that DIED this tick, then despawn them.
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
import { grantGold, grantXp, grantLevels } from "../economy/progression";
import { fireHooks } from "../effects/hooks";
import { creditKillCombo } from "../combat/killCombo";
import {
  type MobRules,
  MONSTER_TEAM,
  spawnMob,
  summonMobBoss,
  mobProfile,
  mobsAliveInZone,
} from "../mobs";
import { bossSummonsAt, splitBossBounty, type BossDamageEntry } from "../mobBoss";
import { standstillBlocks } from "../combatFeel";

export function mobSystem(world: SimWorld): void {
  const rules = world.mobRules;
  if (rules === null || world.mobTicks < 0 || !world.combatActive) return;
  /** 打就站定 —— 和英雄同一張後台表(見步驟 4 的說明)。 */
  const ss = world.combatFeel.standstill;

  // 1) CLOCK — the dedicated combat-elapsed mob counter, advanced first.
  world.mobTicks++;
  const mt = world.mobTicks;

  // 2) WAVE SCHEDULE — fire on the cadence; spawn min(k,cap) per active zone.
  if (mt >= rules.firstWaveTicks && (mt - rules.firstWaveTicks) % rules.waveIntervalTicks === 0) {
    const k = (mt - rules.firstWaveTicks) / rules.waveIntervalTicks + 1;
    const count = Math.min(k, rules.mobsPerWaveCap);
    // active zones in sorted order (deterministic); each zone independently
    // spawns up to `count`, never exceeding its alive cap.
    const zones = [...world.mobZones].sort((a, b) => a - b);
    for (const zone of zones) {
      // #216: a zone whose duel is already decided gets no new wave — the round
      // is over there, and PvE that keeps arriving is PvE that keeps hitting.
      if (world.settledZones.has(zone)) continue;
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
    for (const [cid, cteam] of world.team) {
      if (cteam.teamId === MONSTER_TEAM) continue; // never target another mob
      if (!world.champion.has(cid)) continue; // champions only
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
  //    then remove the corpse. A mob killed by a non-champion (another mob, the
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
      payBossBounty(world, id, killer, rules);
      // A boss kill is still A KILL: `onKill` passives and the 連殺 combo fire
      // exactly as they do for a zombie (#244's ruling), before the entity goes.
      if (killer !== null && world.champion.has(killer)) {
        fireHooks(world, killer, "onKill", id);
        creditKillCombo(world, killer, id, "mob");
      }
      world.destroy(id);
      continue;
    }

    if (killer !== null && world.champion.has(killer)) {
      // #262: a 特殊殭屍 pays `rewardMult`× — the reason to hunt it. Rounded so
      // gold stays integral (the wallet and every display treat it as whole).
      const mult = mobProfile(rules, dead.kind).rewardMult;
      grantGold(world, killer, Math.round(rules.rewardGold * mult));
      grantXp(world, killer, Math.round(rules.rewardXp * mult));
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
        gold: Math.round(rules.rewardGold * mult),
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
    world.destroy(id);
  }
}

/**
 * Pay out the king's prize pool (task #262) and announce the split.
 *
 * The arithmetic — proportional shares, the last hitter's 翻倍 weight, and the
 * rounding remainder — lives in `sim/mobBoss.ts` as a pure function. This
 * wrapper does only the three things that need the world: read the ledger,
 * filter it to entities that are still CHAMPIONS (a damager who has since
 * disconnected/despawned cannot be paid), and grant.
 *
 * ORDER IS FIXED: `splitBossBounty` sorts by ascending entity id, and the grants
 * below walk that sorted array, so two hosts replaying the same match hand out
 * byte-identical amounts in a byte-identical order.
 */
function payBossBounty(
  world: SimWorld,
  bossId: EntityId,
  killer: EntityId | null,
  rules: MobRules,
): void {
  const boss = rules.boss;
  const ledger = world.bossDamage.get(bossId);
  const damagers: BossDamageEntry[] = [];
  if (ledger) {
    for (const [id, dmg] of ledger) {
      if (world.champion.has(id)) damagers.push([id, dmg]);
    }
  }
  const lastHitter = killer !== null && world.champion.has(killer) ? killer : null;
  const shares =
    boss === null
      ? []
      : splitBossBounty(
          damagers,
          { gold: boss.bountyGold, xp: boss.bountyXp },
          lastHitter,
          boss.lastHitMultiplier,
        );
  for (const s of shares) {
    if (s.gold > 0) grantGold(world, s.id, s.gold);
    if (s.xp > 0) grantXp(world, s.id, s.xp);
  }
  // FAILURE SHAPE ② (「算出來了但從沒送到客戶端」): without this the whole
  // mechanic is server-side arithmetic. The payload carries the WHOLE split —
  // every participant, their damage, their gold/xp and who doubled — so the
  // client can show the settlement instead of guessing from a gold counter that
  // jumped. `killerSeatId` is what a local-seat cue gates on, exactly like
  // `guardianSlain` / `coinPickedUp`.
  world.emit("mobBossSlain", {
    id: bossId,
    killer: lastHitter,
    killerSeatId: lastHitter === null ? -1 : (world.team.get(lastHitter)?.seatId ?? -1),
    totalGold: shares.reduce((a, s) => a + s.gold, 0),
    totalXp: shares.reduce((a, s) => a + s.xp, 0),
    lastHitMultiplier: boss?.lastHitMultiplier ?? 1,
    shares: shares.map((s) => ({
      id: s.id,
      seatId: world.team.get(s.id)?.seatId ?? -1,
      damage: s.damage,
      gold: s.gold,
      xp: s.xp,
      lastHit: s.lastHit,
    })),
  });
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
  // #262: a king despawned at round end pays NOBODY (same silent-despawn rule
  // every mob follows here), so its damage ledger is dead weight. Cleared
  // wholesale rather than relying on `destroy` alone, so a ledger keyed by an id
  // that never reached `world.mob` cannot survive the round either.
  world.bossDamage.clear();
  world.mobZones.clear();
  world.mobRules = null;
  world.mobTicks = -1;
}
