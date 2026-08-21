/**
 * DeathSystem — hp<=0 → dead; kill credit to the last damager (tracked via
 * damage events this tick), XP/gold rewards, onKill hooks.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { grantXp, grantGold, XP_REWARDS, GOLD_REWARDS } from "../economy/progression";
import { fireHooks } from "../effects/hooks";
import { creditKillCombo } from "../combat/killCombo";
import { killScores, recordChampionDeath, recordFlowerEaten } from "../stats/matchStats";
import { cancelLeap } from "../movement/leap";
import { releaseUnit } from "../mindControl";

export function deathSystem(world: SimWorld): void {
  // last damage source per target this tick (events are ordered)
  const lastDamager = new Map<EntityId, EntityId>();
  // TRUE killing-blow source per target: the packet that CROSSED zero. combat/
  // damage.ts sets `killingBlow` only when `hpBefore > 0 && hp.hp <= 0`, so at
  // most one packet per death can carry it (task #89 §7.2). Preferring it fixes
  // the case where an overkill packet queued LATER in the same tick (a slower
  // auto/projectile) overwrites `lastDamager` and steals credit from the nuke
  // that actually killed. No behavioural change when the killing blow IS the
  // last packet — the overwhelming majority — but it makes the guardian's
  // 打死最後一下的人 reward rule (and correct kill credit generally) implementable.
  const killingBlowSource = new Map<EntityId, EntityId>();
  for (const ev of world.events) {
    if (ev.type !== "damage") continue;
    lastDamager.set(ev.data.target as EntityId, ev.data.source as EntityId);
    if (ev.data.killingBlow === true) {
      killingBlowSource.set(ev.data.target as EntityId, ev.data.source as EntityId);
    }
  }

  for (const [id, hp] of world.health) {
    if (!hp.alive || hp.hp > 0) continue;
    hp.hp = 0;
    hp.alive = false;
    // Task #247: a leaper killed at apex drops to the floor ON THE DEATH TICK,
    // so the #220 dissolve plays on the ground rather than in mid-air, and the
    // landing effects never fire — a killed leaper deals no landing damage.
    // (LeapSystem re-checks this next tick too; doing it here removes the
    // one-tick corpse-hanging-in-the-air window.)
    cancelLeap(world, id);
    // ⭐ [陣營轉換]（[EX∅ 根源]）—— 歸位，而且**一定要在 `emit("death")` 之前**。
    //
    // 下游有兩個消費者讀死者的 `TeamComp.teamId`：復活圈用它決定圈開在哪一隊
    // （`ReviveSystem`），結算用它算誰還活著。先發事件再歸位＝一個被借走的
    // 隊友死掉時，復活圈開在**借他的那一隊**那邊 —— 而且畫面上完全正常，
    // 只是他的隊友按不到那個圈。
    //
    // 對沒有被借走的身體是零成本的 no-op（`world.mindControl` 空表時直接 miss）。
    releaseUnit(world, id);
    const killer = killingBlowSource.get(id) ?? lastDamager.get(id) ?? null;
    world.emit("death", { id, killer });

    if (world.flower.has(id)) {
      // Flowers are not kills: no XP/gold/onKill — their reward is the HP/MP
      // burst (FlowerSystem consumes this death event right after this system).
      // The killing blow still scores as a "flower eaten" for the killer.
      if (killer !== null && world.champion.has(killer)) recordFlowerEaten(world, killer);
    } else if (world.champion.has(id)) {
      // champion death: scoreboard (deaths / kills / assists / KP / multikills)
      recordChampionDeath(world, id, killer);
      // ⭐ GH#159 —— 發放的閘是 `killScores`（`stats/matchStats.ts`），⛔ 不是
      // 「兇手是英雄」。在此之前這一行只有 `killer !== null && champion.has(killer)`，
      // 於是**打死自己隊友**（普攻是唯一沒有隊伍濾網的傷害路徑）照樣領擊殺金 +
      // 首殺賞金 + XP + onKill + 連殺，配上 #84 的復活圈就是救回來再殺一次的印鈔機。
      // ⛔ 謂詞刻意跟計分板共用同一支函式：擋住金幣卻讓 KDA／連殺照加，只是把
      // 漏洞換一個地方出現。
      if (killScores(world, id, killer)) {
        grantXp(world, killer, XP_REWARDS.kill);
        // 擊敗英雄發放倍率 (owner 2026-08-04): both the base kill reward and the
        // #90 first-blood bounty below are the SAME bucket — they are two halves
        // of one 「殺了一個英雄」 payout, so splitting them across two knobs
        // would give the operator a dial that cannot express 「英雄擊殺減半」.
        grantGold(world, killer, GOLD_REWARDS.kill, "hero");
        // Kill BOUNTY (task #90): a one-time premium the FIRST time THIS enemy
        // champion is killed. Marked paid by victim entity id (stable across a
        // revive), so a revived-then-rekilled victim yields base kill gold only
        // and never the bounty again. A no-killer death never consumes it —
        // the bounty is only ever spent when a killer actually collects it.
        if (!world.bountyPaid.has(id)) {
          world.bountyPaid.add(id);
          grantGold(world, killer, GOLD_REWARDS.killBounty, "hero");
        }
        fireHooks(world, killer, "onKill", id);
        // 連殺 COMBO (owner, 2026-07-27). A CHAMPION kill feeds the very same
        // counter a zombie kill does — the owner's ruling is that they add up on
        // one number. This is the second and last credit site; the other is
        // MobSystem's payout branch. Deliberately AFTER the gold/xp/bounty/hook
        // bookkeeping so the ordering of `killCombo` against the other events of
        // this death is fixed and replayable.
        creditKillCombo(world, killer, id, "champion");
      }
    }
  }
}
