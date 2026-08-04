/** Leveling (等級提升) + gold economy. */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { applyGoldFactor, type CombatEnvKey } from "../combatEnv";
import { recordGold, recordXp } from "../stats/matchStats";

/**
 * True level cap is 99. The per-round grant schedule (arena-rules.json) only
 * carries a champion to cumulative L50 by round 11; the remaining L50→L99 is
 * earned from XP — kills/assists today, and the roguelite mob-clearing planned
 * for the next version. So `grantLevels` (round grants) tops out at 50 by
 * design (rounds 12+ grant 0), while `grantXp` can climb all the way to 99.
 */
export const LEVEL_CAP = 99;
/**
 * `mob` (task #215) is the XP a killer earns per roguelite mob (喪標麥可) kill.
 * Deliberately SMALL relative to `xpToNext` (≈4,020 at L50 → ≈7,940 at L99): a
 * single mob barely moves the bar, so the DOMINANT L50→L99 climb is the
 * every-30-kills `grantLevels(1)` bonus (see MobSystem / `reward.killsPerLevel`),
 * not the per-kill XP. The mob is the intended path past the round-grant L50
 * ceiling — that is the whole point of the mechanic.
 */
export const XP_REWARDS = { kill: 120, assist: 60, roundSurvive: 100, mob: 40 };
/**
 * `killBounty` (task #90) is a ONE-TIME premium paid on top of `kill` the FIRST
 * time each enemy champion dies — extra reward for drawing first blood on a
 * player. A revived-then-rekilled victim pays base `kill` only (DeathSystem
 * tracks paid victims on `world.bountyPaid`). It rides on TOP of the ~7,600g
 * deterministic match income the price ladder is derived against, so it never
 * disturbs the stat-path arithmetic (which is about deterministic income only).
 */
/**
 * `mobKill` (task #215) is the FLAT, REPEATABLE gold a killer earns for slaying
 * a roguelite mob. Unlike `killBounty` there is NO once-per-victim bookkeeping
 * (no `bountyPaid` interaction): every mob pays a fresh 20 to whoever lands the
 * killing blow, exactly like a LoL minion. Sits OUTSIDE the deterministic
 * price-ladder income the shop is tuned against — it is optional PvE farm.
 */
export const GOLD_REWARDS = { kill: 150, assist: 75, roundWin: 300, roundLose: 150, killBounty: 100, mobKill: 20 };

/**
 * Gold every champion spawns with — the turn-1 shop purse.
 *
 * 600, and it is load-bearing (task #82). The whole price ladder is derived
 * against a match income of 600 + 750 + 2500 + 1000 + 1250 + 1500 = 7,600g, and
 * 600 is exactly TWO 300g SIMPLE items, which is what makes the opening a real
 * decision (two cheap items now, or bank it and reach a 1200g POWERFUL a full
 * round early). MatchController used to grant 500 while every design document
 * and `startingGold` in apps/platform/internal/curation assumed 600; at 500 the
 * player can buy exactly one item and the fork does not exist.
 */
export const STARTING_GOLD = 600;

export function xpToNext(level: number): number {
  return 100 + 80 * (level - 1);
}

export function grantXp(world: SimWorld, id: EntityId, amount: number): void {
  const champ = world.champion.get(id);
  const ab = world.abilities.get(id);
  const sc = world.stats.get(id);
  if (!champ || !ab || !sc) return;
  recordXp(world, id, amount); // scoreboard: total XP earned (incl. at level cap)
  if (champ.level >= LEVEL_CAP) return;
  champ.xp += amount;
  while (champ.level < LEVEL_CAP && champ.xp >= xpToNext(champ.level)) {
    champ.xp -= xpToNext(champ.level);
    champ.level++;
    ab.unspentPoints++;
    sc.dirty = true; // growth changes base stats
    world.emit("levelUp", { id, level: champ.level });
  }
}

/**
 * Grant up to `count` champion levels (arena round grants). Deterministic:
 * tops the XP bar off level by level via grantXp, so unspentPoints/stat growth
 * flow through the one levelling path. Capped at LEVEL_CAP.
 *
 * RETURNS HOW MANY LEVELS ACTUALLY LANDED, and callers that show a number to a
 * player MUST use it rather than `count`. The loop stops at `LEVEL_CAP` (99)
 * SILENTLY, and 「等級提升 +50」 (owner 2026-07-29, GH#206) is handed to people
 * who are already deep into the cap's range: a champion who has farmed 100
 * zombies to summon the king is past L50 before the payout is computed, so a
 * requested +100 (50 pool + 50 last-hit bonus) can land as ~40. Reporting the
 * request instead of the grant is failure shape ② — the settlement panel says
 * 「+100 等級」 and the level bar moves 40 — and no test that only checks
 * `champ.level > before` can see it.
 */
export function grantLevels(world: SimWorld, id: EntityId, count: number): number {
  const champ = world.champion.get(id);
  if (!champ) return 0;
  let granted = 0;
  for (let i = 0; i < count && champ.level < LEVEL_CAP; i++) {
    grantXp(world, id, xpToNext(champ.level) - champ.xp);
    granted++;
  }
  return granted;
}

/**
 * WHICH 發放倍率 a payout pays through (owner 2026-08-04「金錢發放有點太浮濫了,
 * 請你將獲得金錢也改成系統倍率在後台設定, 但是分為 回合發放倍率, 打殭屍發放倍率,
 * 擊敗英雄發放倍率, 完成任務發放倍率 四種」, 同日追加「普通殭屍 的確也可以單獨
 * 倍率, 預設改成 0.5」→ 打殭屍那一格拆成 mob / elite 兩格).
 *
 * ⚠️ IT IS A REQUIRED ARGUMENT OF `grantGold`, AND THAT IS THE GUARD. The one
 * real risk in this feature is a payout site nobody remembered — it keeps
 * paying the old amount, and on screen that reads as 「倍率沒生效」, i.e. a bug
 * report about a feature that works. A required parameter makes the census
 * compiler-enforced: a new gold source cannot be written without choosing a
 * bucket, and choosing wrongly is at least visible in review.
 *
 *   round     回合發放 —— 開局購物金, arena-rules 的每回合排程, 回合勝/負/輪空
 *   mob       打一般殭屍 —— 普通殭屍的 rewardGold, 召喚物賞金, 以及技能/道具
 *             把「非英雄的屍體」變成錢的發放 (鍊金術之盾)
 *   elite     打特殊殭屍與殭屍王 —— 特殊殭屍的 rewardGold(含 rewardMult) 與它的
 *             分紅獎池, 殭屍王的分紅獎池
 *   hero      擊敗英雄 —— 擊殺獎勵 + 首殺賞金 (#90)
 *   quest     完成任務 —— 守衛塔補刀獎勵 (#89) 等場上目標物
 *   unscaled  刻意不乘 —— 開發者作弊指令。「給我 1000」必須真的給 1000,
 *             否則除錯工具自己在說謊。
 *
 * ⚠️ `mob` 與 `elite` 是兩格, 不是一格 (owner 2026-08-04「普通殭屍 的確也可以
 * 單獨倍率, 預設改成 0.5」). 一隻普通殭屍是玩家整場刷幾十次的涓流; 一隻特殊殭屍
 * 或殭屍王是一次一整套裝備的大筆。合成一格就沒辦法在壓掉大筆的同時留住涓流。
 *
 * ⚠️ 殭屍王在 `elite`, 不在 `quest`。#262/#263 都還是 pending, 所以今天沒有任何
 * 任務在發錢, 而殭屍王是全場最大的一筆金源 —— 把它掛在一個 owner 不會想到要去
 * 轉的旋鈕上, 就會出現「我把打殭屍調成 0.1 了, 錢還是很多」。`quest` 不是空的:
 * 守衛塔補刀 (#89) 走的就是它。
 */
export type GoldPayoutCategory = "round" | "mob" | "elite" | "hero" | "quest" | "unscaled";

/** category → the combat-env row it multiplies (`null` = deliberately unscaled). */
const GOLD_CATEGORY_ENV_KEY: Readonly<Record<GoldPayoutCategory, CombatEnvKey | null>> =
  Object.freeze({
    round: "goldRoundPayout",
    mob: "goldMobKill",
    elite: "goldEliteKill",
    hero: "goldHeroKill",
    quest: "goldQuest",
    unscaled: null,
  });

/**
 * Apply one 發放倍率 to a gold amount.
 *
 * ROUNDING IS `Math.round`, and it is not a fresh decision — it is the one this
 * codebase already made for the only pre-existing gold multiplier: MobSystem's
 * 特殊殭屍 pays `Math.round(rules.rewardGold * mult)`, and `splitBossBounty`
 * settles its shares the same way. A second rounding rule for the same shape of
 * arithmetic is how two payout paths start disagreeing by a coin. `floor` was
 * the alternative and it is worse in the one place it differs: at 0.5× a 1-gold
 * payout floors to 0, which turns 「發一半」 into 「不發」 silently.
 *
 * ⚠️ THE `factor === 1` EARLY RETURN IS THE REGRESSION GUARD, not an
 * optimisation. Shipping at 1.0 must be BIT-IDENTICAL to the pre-multiplier
 * sim, and returning the amount untouched makes that true by construction —
 * including for any amount that is not already an integer, where
 * `Math.round(x * 1)` would quietly change the number.
 */
export function scaleGoldPayout(
  world: SimWorld,
  amount: number,
  category: GoldPayoutCategory,
): number {
  const key = GOLD_CATEGORY_ENV_KEY[category];
  if (key === null) return amount;
  // The arithmetic itself lives in `sim/combatEnv.applyGoldFactor` so the
  // CONSOLE can run the identical rule (後台小怪波頁的「實發」欄). See its doc.
  return applyGoldFactor(amount, world.combatEnv[key]);
}

/**
 * Pay `id` gold through `category`'s 發放倍率.
 *
 * RETURNS WHAT WAS ACTUALLY PAID, and every caller that puts a number on an
 * EVENT must use the return value rather than the requested amount — failure
 * shape ② wearing a floating 「+N 金」: the corpse says 60 and the purse moved
 * 30. `grantLevels` already has this shape for the same reason (GH#206).
 */
export function grantGold(
  world: SimWorld,
  id: EntityId,
  amount: number,
  category: GoldPayoutCategory,
): number {
  const champ = world.champion.get(id);
  if (!champ) return 0;
  const paid = scaleGoldPayout(world, amount, category);
  champ.gold += paid;
  recordGold(world, id, paid); // scoreboard: total gold earned
  return paid;
}
