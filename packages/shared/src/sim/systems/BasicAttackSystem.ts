/**
 * BasicAttackSystem — champion-driven autos honoring per-champion attack data.
 *
 * Each auto is a two-phase swing:
 *   1. wind-up: on-cooldown & in-range → enter a wind-up for `attackDamagePoint`
 *      ticks; the whole-interval cooldown is committed at swing start so cadence
 *      is baseAttackTime / attackSpeed regardless of the wind-up length.
 *   2. damage point (wind-up elapsed):
 *        - MELEE  → apply AD damage instantly if the target is still in range;
 *        - RANGED → launch an auto projectile at the champion's missileSpeed;
 *          damage + on-hit hooks + lifesteal resolve ON IMPACT (ProjectileSystem).
 *
 * Interrupt (before the damage point): stun, death, target loss, or the target
 * leaving range (moving out cancels, LoL-style). Crit is rolled at the damage
 * point via the seeded RNG (deterministic). On-hit item passives (onBasicAttack)
 * and lifesteal always fire when the hit LANDS, never at the swing start.
 */
import type { EntityId, ChampionId, ProjectileId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { StatsComp } from "../stats/statsComp";
import type { ChampionDef } from "../content/defs";
import { Stat } from "../stats/statTypes";
import { Champions } from "../content/registry";
import { distSq, normalize, sub, lenSq, type Vec2 } from "../math/vec2";
import { fireHooks } from "../effects/hooks";
import { rollEvade } from "../combat/evasion";
import { armFacingLock, facingTicks } from "../facingLock";
import { standstillBlocks } from "../combatFeel";

/**
 * Fallback wind-up (seconds) when a champion doc omits attackDamagePoint.
 *
 * EXPORTED for #267. This system runs ONE SWING AT A TIME (see the wind-up
 * block below — `continue`), so a champion's REAL attack cadence is bounded by
 * the wind-up, not by `Stat.AttackSpeed`: the measured saturation for this
 * 0.25 s default is 2.4 attacks/sec, BELOW the 2.5 stat ceiling. That is why
 * #267's "raise the melee cap" was measured and rejected — the numbers, and
 * where the real lever is, are on `STAT_CLAMPS` in stats/statTypes.ts, and
 * sim/balanceTuning.test.ts pins the saturation so a regression here is visible.
 */
export const DEFAULT_DAMAGE_POINT_MELEE = 0.25;
const DEFAULT_DAMAGE_POINT_RANGED = 0.3;
/** Fallback ranged projectile speed (GGD units/sec). */
const DEFAULT_MISSILE_SPEED = 20;
/** Auto-attack projectile hit radius + range buffer past the attack range. */
const AUTO_HIT_RADIUS = 0.4;
const AUTO_RANGE_BUFFER = 4;
/** Whiffed-melee over-commit lunge (combat-juice): a small forward stumble. */
const WHIFF_LUNGE_DIST = 0.8;
const WHIFF_LUNGE_SPEED = 10;

/**
 * Effective attack range against a specific target (never below body contact).
 *
 * EXPORTED on purpose: `OrderSystem` stops the chase at a fraction of this same
 * value, so the approach and the swing gate can never drift apart. Any change
 * here moves both ends together.
 */
export function reachTo(sc: StatsComp, selfR: number, tgtR: number): number {
  return Math.max(sc.final[Stat.AttackRange], selfR + tgtR + 0.1);
}

/**
 * Weapon-class priority for the per-weapon attack SFX (audio COMBAT-AUDIO). The
 * `basicAttack` event carries this so the pure client mapper (audio/combatSfx)
 * can play the right attack voice without loading any champion data of its own.
 * Purely descriptive — the sim never reads it back.
 *
 * ---------------------------------------------------------------------------
 * WHY `magic` AND `thrown` EXIST (2026-07-24) — and why they are not cosmetic
 * ---------------------------------------------------------------------------
 * This list used to be melee-shaped only: greatsword|katana|gun|bow|sword. There
 * is no such thing as an untagged champion, because {@link weaponClassOf} always
 * answers, so every champion the list could not describe fell through the
 * `ranged → bow` default. That silently gave a BOW DRAW to every caster in the
 * game: 皮卡丘 electrocuting you, 莉娜因巴斯 casting, 涅吉 with a staff — all
 * creaking a bowstring. No error, no crash; the class was simply missing from the
 * vocabulary, so the wrong member of it won. Adding tags could not have fixed it:
 * there was nothing to tag them AS.
 *
 * The five new-ish members are not invented flavour. Each ranged champion in this
 * roster descends from a real WC3 hero unit, and Blizzard's own
 * `Units/*UnitFunc.txt` `Missileart=` says what that hero throws. That table —
 * not vibes, not the champion's Chinese name — is the authority:
 *
 *   Arrow / MoonPriestessMissile              → `bow`     (a real arrow; 5 heroes)
 *   WardenMissile / BrewmasterMissile         → `thrown`  (a hurled object; 5)
 *   FireBall / KeeperGrove / Farseer /
 *   ShadowHunter / SerpentWard / DemonHunter /
 *   BloodElf / Lich …                         → `magic`   (a conjured bolt; 22)
 *
 * That census (22 magic / 5 bow / 5 thrown / 1 sword across the 33 ranged
 * champions — the last being a WC3 hero with no missile art at all) is
 * also why the ranged DEFAULT below is now `magic` rather than `bow`. It is still
 * a guess and still the wrong shape of answer — which is why
 * `sim/weaponClassCoverage.test.ts` forbids any shipped ranged champion from
 * relying on it. The default only decides how wrong a champion nobody tagged is,
 * and "unnamed ranged hero" is far more often a caster than an archer here.
 *
 * TWO-FILE CONTRACT. Every member here must have a decided outcome in
 * `apps/client/src/audio/combatSfx.ts` WEAPON_SFX — a dedicated clip, or the
 * generic swing NAMED explicitly (that is what `thrown` does). A member with no
 * row there falls back by accident instead of by decision, which is the same
 * silent-default failure this comment exists to describe.
 * `content/fieldAdoption.ts` censuses these strings as a TAG VOCABULARY, so a
 * member no champion carries fails the S8 guard rather than quietly meaning
 * nothing.
 */
export const WEAPON_TAGS = [
  "greatsword",
  "katana",
  "gun",
  "bow",
  "magic",
  "thrown",
  "sword",
] as const;

/**
 * The champion's weapon class, derived from existing metadata (deterministic, no
 * rng): an explicit weapon tag on the champion doc wins (checked in the priority
 * order above so `greatsword` never collapses to `sword`); otherwise the coarse
 * default from attackType — ranged → magic, melee → sword. Always returns a
 * class, so every basic attack gets an attack voice.
 *
 * The defaults are a LAST RESORT, not the design. See WEAPON_TAGS above: shipped
 * ranged champions are tagged from the WC3 missile-art table and a guard test
 * keeps them that way, so reaching the `ranged` branch here means a champion doc
 * was authored without one.
 */
export function weaponClassOf(
  cdef: ChampionDef | undefined,
  attackType: "melee" | "ranged",
): string {
  const tags = cdef?.tags;
  if (tags && tags.length > 0) {
    const set = new Set(tags.map((t) => t.toLowerCase()));
    for (const w of WEAPON_TAGS) if (set.has(w)) return w;
  }
  return attackType === "ranged" ? "magic" : "sword";
}

export function basicAttackSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const sc = world.stats.get(id);
    if (!t || !hp?.alive || !sc) {
      ab.windup = null;
      continue;
    }

    // Casting an ability animation-locks basic attacks.
    if (ab.cast) {
      ab.windup = null;
      continue;
    }

    // RECOVERY (後搖) also locks OUTPUT: an ability that WHIFFED commits the
    // caster out of autos as well as casts, which is the whole punish window
    // (a landed hit would already have cancelled it). Movement is NOT blocked
    // here — see abilities/abilityRecovery.ts DECISION 2.
    if ((ab.recovery?.ticksLeft ?? 0) > 0) {
      ab.windup = null;
      continue;
    }

    // Stun cancels any wind-up and blocks starting a new swing.
    const st = world.status.get(id);
    if (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick)) {
      ab.windup = null;
      continue;
    }

    // Combat-juice freeze. Knockdown (prone) cancels the swing entirely.
    // Hitstop PAUSES it: leave the wind-up intact so it resumes after the freeze
    // (a hit read as impact). Cooldowns keep ticking (see HitstopSystem), so
    // this never changes attack cadence/DPS.
    if ((world.knockdown.get(id) ?? 0) > 0) {
      ab.windup = null;
      continue;
    }
    if ((world.hitstop.get(id) ?? 0) > 0) continue;
    // Combat-juice HITSTUN: a victim-only action-lock that outlasts the shared
    // hitstop (frame advantage — the attacker is already free while the
    // defender still cannot swing). PAUSES the wind-up like hitstop (resumes
    // after), so cadence/DPS is unchanged; it only denies the on-the-back-foot
    // defender a free counter-swing mid-shove. See combat/damage.ts.
    if ((world.hitstun.get(id) ?? 0) > 0) continue;

    // ---- 打就站定:移動中不得出手 (owner 2026-07-28, 後台可關) ----
    //
    // 這條規則之前**完全不存在**。前搖只在「目標死了 / 目標跑出射程」時才取消,
    // 於是「能不能邊走邊打」實際上是被**射程**夾出來的副作用 —— 近戰 1.6、遠程
    // 8.2,差五倍。量到的完整數字與這條規則的來由寫在 sim/combatFeel.ts。
    //
    // 補法照 WC3(這批英雄本來就是 WC3 英雄單位改的):要攻擊就得停下來。傷害點
    // 之後沒有任何鎖,所以「結算完立刻走」仍然免費 —— hit-and-run 微操是自然
    // 浮現的,不是額外做的。
    //
    // 五件刻意的事:
    //   1. 讀 `Transform.vel`(movementSystem 這一 tick **實際**走出去的位移/dt),
    //      不是 `nav.moveTarget` 那種「想走」。撞牆推不動的人位移是 0,所以他
    //      **還是能打**;一次點到場外的滑鼠失誤不會讓那個人整局不能攻擊。
    //      被 separation 推開也不算移動 —— `separatePair` 直接改 `pos`,不寫 `vel`。
    //   2. 兩段都要擋。有前搖就取消;沒前搖就連開都不准開 —— 冷卻是在起手那一刻
    //      整段付掉的,若只取消不阻擋,一個一直在走的人會每輪燒掉一次冷卻卻永遠
    //      打不出東西。起手那個閘刻意放在冷卻 commit **之前**。
    //   3. 取消**不退冷卻**,和現有的「目標跑出射程」取消同一個待遇:想拉開距離
    //      就要付一次攻擊循環,這正是這條規則的全部價值。
    //      ⚠️ 這一條在 GH#193 的擊退改完之後**重新評估過**:那時「前搖被取消但
    //      冷卻已扣」的主要來源是自己打出的擊退把目標推出射程(#45),現在
    //      autoAttackCensus 的債務清單從 6 位掉到 1 位,而剩下那位是被 knockdown
    //      + stun 打斷,不是被走位打斷。所以退還冷卻已經不是必要的補償,
    //      而它會讓「走位取消」變成零成本 —— 那等於這條規則不存在。
    //   4. **不**觸發 whiff(揮空前衝)。whiff 是「打到空氣」的過度投入;自己走開
    //      是玩家的決定,安靜取消,LoL / WC3 都是這樣。
    //   5. 被擊退／自己衝刺同樣算移動:擊退把人往**遠離攻擊者**的方向推,靠近
    //      速度是負的,一定會取消 —— 被打飛就別想把那一刀揮完。
    //
    // 唯一的例外是「正在朝目標靠近」,而它是**量出來的**(拿掉就有近戰十秒打不出
    // 一下) —— 見 `combatFeel.standstillBlocks`。
    const ss = world.combatFeel.standstill;

    const champ = world.champion.get(id);
    const cdef = champ ? Champions.tryGet(champ.championId as ChampionId) : undefined;
    const attackType = cdef?.attackType ?? "melee";

    // ---- advance an in-progress wind-up ----
    if (ab.windup) {
      const w = ab.windup;
      const tgtT = world.transform.get(w.target);
      const tgtHp = world.health.get(w.target);
      // `reach * reach`, NOT `reach ** 2`: `**` is specified as Math.pow, which
      // is implementation-approximated and may differ by an ulp between hosts —
      // enough to flip this `<=` and desync a replica. (The purity gate now
      // bans `**` in sim source for exactly this reason; see purity.test.ts.)
      const reach = tgtT ? reachTo(sc, t.radius, tgtT.radius) : 0;
      const inRange = !!tgtT && tgtT.zone === t.zone && distSq(t.pos, tgtT.pos) <= reach * reach;
      if (!tgtT || !tgtHp?.alive || !inRange) {
        ab.windup = null;
        // WHIFF (combat-juice): if the swing had already COMMITTED (this was the
        // damage-point tick) and the target escaped/died, it connects with
        // nothing → a melee over-commit forward lunge. An EARLY interrupt
        // (target left well before the damage point) stays a silent cancel,
        // LoL-style, so cadence is unchanged.
        if (w.ticksLeft <= 1) whiff(world, id, t, attackType);
        continue;
      }
      // 打就站定:走動就作廢這一刀(朝目標靠近除外)。安靜取消,不 whiff,不退冷卻。
      if (standstillBlocks(ss, t.vel, t.pos, tgtT.pos)) {
        ab.windup = null;
        continue;
      }
      // 揮劍轉向 (task #264)：整段前搖每 tick 重新瞄準。目標會走位，所以不能只在
      // 出劍那一刻鎖一次方向 —— 那會讓長前搖的重武器對著目標的舊位置揮。
      // 這裡是 step slot 6，在 movementSystem (slot 5) 之後，所以這一 tick 寫下的
      // facing 不會再被移動方向蓋掉；鎖是為了保護「下一 tick」的 slot 5。
      aimAtTarget(world, id, t, tgtT.pos, w.ticksLeft + facingTicks(world).followThroughTicks);
      w.ticksLeft--;
      if (w.ticksLeft <= 0) {
        ab.windup = null;
        resolveAttack(world, id, w.target, attackType, sc, cdef);
      }
      continue; // one swing at a time
    }

    // ---- start a new swing ----
    if (ab.basicAttackCdTicks > 0) continue;
    const nav = world.nav.get(id);
    if (!nav?.attackTarget) continue;

    const tgtT = world.transform.get(nav.attackTarget);
    const tgtHp = world.health.get(nav.attackTarget);
    if (!tgtT || !tgtHp?.alive || tgtT.zone !== t.zone) {
      nav.attackTarget = null;
      nav.attackTargetAuto = false;
      continue;
    }
    const reach = reachTo(sc, t.radius, tgtT.radius);
    if (distSq(t.pos, tgtT.pos) > reach * reach) continue; // still chasing
    // 打就站定:走動中不開新的一刀(朝目標靠近除外)。擋在冷卻 commit **之前**,
    // 所以走位不會白白燒掉一次攻擊間隔 —— 停下來的那一 tick 就能立刻出手。
    if (standstillBlocks(ss, t.vel, t.pos, tgtT.pos)) continue;

    // commit the whole-interval cooldown now; the wind-up is part of it.
    const baseAttackTime = cdef?.baseAttackTime ?? 1.0;
    const attacksPerSec = Math.max(0.01, sc.final[Stat.AttackSpeed]);
    ab.basicAttackCdTicks = Math.max(1, Math.round(baseAttackTime / attacksPerSec / world.dt));

    const dpSec =
      cdef?.attackDamagePoint ??
      (attackType === "ranged" ? DEFAULT_DAMAGE_POINT_RANGED : DEFAULT_DAMAGE_POINT_MELEE);
    // 前搖隨攻速縮短 (#267 / owner 2026-07-28「攻速流要有實際效益」).
    //
    // ⚠️ 這是攻速能不能被玩家拿到的**唯一**關鍵,而它以前不成立:前搖是固定秒數,
    // 不隨攻速縮短,所以每一刀的固定成本是
    //
    //     前搖 8 tick + 自己被 hitstop 凍住 2 tick + 結算那一 tick 1 tick = 11
    //
    // → 天花板 2.73 次/秒,**不管面板寫多少**。實測面板 3 / 4 / 6 / 10 / 30 的
    // 實際輸出全部是 2.70,一模一樣。前搖 0.5 s 的那 22 位近戰更慘,天花板 1.67,
    // **比 2.5 的夾限還低** —— 他們買攻速裝到滿完全沒有效果,而面板顯示一切正常。
    //
    // LoL / Dota 的模型是「前搖是攻擊間隔的一個比例」,不是固定秒數:動畫被攻速
    // 加速播放。這裡照做 —— `dpSec` 是 `baseAttackTime = 1.0` 之下的前搖,所以
    // 除以 attacksPerSec 就是同一個比例在新間隔下的秒數。
    //
    // 攻速 1.0 時 `dpSec / 1` 與舊式完全相同,所以這不是重新平衡,是把「面板寫
    // 多少就給多少」補回去。實測縮放後:面板 2.5→2.50、3→3.00、4→3.75、6→6.00。
    // ⚠️ 只縮短,不拉長。`Math.max(1, …)` 那個 1 是刻意的:攻速 < 1.0 的英雄
    // (近戰 lv1 中位數 0.70,也就是**幾乎所有人**)若照 LoL 的雙向縮放,前搖會
    // 變得比作者寫的更長 —— 一個沒人要求的全體削弱。實測會讓初音掉出攻擊率
    // 棘輪(autoAttackCensus)。所以規則是「買攻速會讓你揮得更快,不買不會讓你
    // 變得更慢」,這也比較好對玩家解釋。
    const attackTimeScale = Math.max(1, attacksPerSec);
    const dpTicks = Math.max(0, Math.round(dpSec / attackTimeScale / world.dt));
    // 出劍的第一 tick 就轉向目標 (task #264)，別等前搖跑完 —— 前搖本來就是
    // 「舉劍」，玩家要在這裡看到身體轉過去。放在 dpTicks 分岔**之前**，所以
    // 沒有前搖的即時普攻（dpSec = 0）也一樣會 commit 面向，不會漏掉一整條分支。
    aimAtTarget(world, id, t, tgtT.pos, dpTicks + facingTicks(world).followThroughTicks);
    if (dpTicks <= 0) {
      resolveAttack(world, id, nav.attackTarget, attackType, sc, cdef);
    } else {
      ab.windup = { target: nav.attackTarget, ticksLeft: dpTicks };
      world.emit("attackWindup", {
        source: id,
        target: nav.attackTarget,
        ticks: dpTicks,
        ranged: attackType === "ranged",
      });
    }
  }
}

/**
 * The damage point: roll crit + AD, then either apply melee damage instantly or
 * launch a ranged auto projectile whose on-hit resolves at impact.
 */
function resolveAttack(
  world: SimWorld,
  id: EntityId,
  targetId: EntityId,
  attackType: "melee" | "ranged",
  sc: StatsComp,
  cdef: ChampionDef | undefined,
): void {
  const t = world.transform.get(id);
  const tgtT = world.transform.get(targetId);
  const tgtHp = world.health.get(targetId);
  if (!t || !tgtT || !tgtHp?.alive || tgtT.zone !== t.zone) return; // defensive (whiff handled at commit)

  // EVASION (迴避), MELEE half — rolled below, immediately before the melee
  // damage point. NOT here: this function is shared with the ranged path, whose
  // hit lands at projectile IMPACT (ProjectileSystem), and rolling in both
  // places would dodge a ranged auto twice. See combat/evasion.ts DECISION 2.

  let amount = sc.final[Stat.AttackDamage];
  let crit = false;
  const cc = sc.final[Stat.CritChance];
  if (cc > 0 && world.rng.chance(cc)) {
    crit = true;
    amount *= sc.final[Stat.CritDamage] || 1.75;
  }

  const weaponClass = weaponClassOf(cdef, attackType);
  const dir = normalize(sub(tgtT.pos, t.pos));

  // 面向 (task #264) 在這裡**不需要**再寫一次：呼叫這個函式的兩條路徑都已經在
  // 同一 tick 稍早用同一組 `tgtT.pos` commit 過瞄準方向（起手那一行，或前搖分支
  // 每 tick 的重新瞄準），所以 `dir` 與 `t.facing` 必然一致。多寫一行會是一條
  // 沒有任何測試殺得掉的死程式碼。

  if (attackType === "ranged" && (dir.x !== 0 || dir.z !== 0)) {
    // launch an auto projectile; on-hit pipeline resolves on impact
    const speed = cdef?.missileSpeed ?? DEFAULT_MISSILE_SPEED;
    const range = Math.max(sc.final[Stat.AttackRange], 4) + AUTO_RANGE_BUFFER;
    const pid = world.spawn();
    world.transform.set(pid, {
      pos: { x: t.pos.x, z: t.pos.z },
      vel: { x: dir.x * speed, z: dir.z * speed },
      facing: dir,
      radius: AUTO_HIT_RADIUS,
      zone: t.zone,
    });
    world.projectile.set(pid, {
      projectileId: "basic-attack" as ProjectileId,
      ownerId: id,
      dir,
      speed,
      remainingRange: range,
      hitRadius: AUTO_HIT_RADIUS,
      pierce: false,
      hitSet: new Set(),
      onHit: [],
      rank: 1,
      origin: "basic",
      basic: true,
      basicDamage: amount,
      crit,
    });
    // the swing itself happens now; the hit lands at impact.
    // `projectileSpawn` is what the client hangs the MUZZLE FLASH on (see the
    // VfxSystem case): ability projectiles emitted it and ranged autos did not,
    // so every ranged basic attack materialised out of thin air. The projectile
    // doc `basic-attack` supplies its trail/mesh identity client-side; the sim
    // still owns speed (champion missileSpeed) and range, so the doc's numbers
    // are descriptive only for this one projectile id.
    // ORDER MATTERS: `basicAttack` is what commits the attacker's aim on the
    // client, and the muzzle flash on `projectileSpawn` reads that aim back.
    world.emit("basicAttack", { source: id, target: targetId, crit, ranged: true, weaponClass });
    world.emit("projectileSpawn", { id: pid, owner: id, projectileId: "basic-attack" });
    return;
  }

  // melee: hit lands at the damage point.
  //
  // The SWING happens whether or not it connects, so `basicAttack` (the client's
  // aim commit + weapon slash SFX) is emitted FIRST, before the evasion gate
  // below — otherwise a dodged blow would be a silent, invisible non-event and
  // the defender would look like they were never attacked. Moving the emit above
  // the queue push does not reorder any event: `damageQueue` is a queue drained
  // later by combatResolveSystem, not an emit.
  world.emit("basicAttack", { source: id, target: targetId, crit, ranged: false, weaponClass });

  // EVASION (迴避) — the defender's pre-damage miss roll. A dodge is a TOTAL
  // miss, so it short-circuits everything that follows: no damage packet, no
  // lifesteal (it hangs off the packet), no `onBasicAttack` item proc, no
  // hitstop/knockback, no scoreboard hit. The swing's cooldown was committed at
  // swing start and is NOT refunded — a dodge costing the attacker a full attack
  // cycle is the stat's whole value. `whiff` is deliberately NOT emitted: the
  // blow reached a body and was slipped; the whiff-lunge is specifically the
  // over-commit of hitting empty air.
  // No-op — and zero rng draws — while evasion is 0 (every champion today).
  if (rollEvade(world, id, targetId)) return;

  world.damageQueue.push({
    source: id,
    target: targetId,
    amount,
    type: "physical",
    crit,
    origin: "basic",
  });
  fireHooks(world, id, "onBasicAttack", targetId);
}

/**
 * 把出手者的面向 commit 到目標身上 (task #264)。退化情形（兩人完全重疊）交給
 * `armFacingLock` 自行忽略 —— 硬轉到一個 0 向量只會讓身體瞬間亂指。
 */
function aimAtTarget(
  world: SimWorld,
  id: EntityId,
  t: { pos: Vec2 },
  targetPos: Vec2,
  ticks: number,
): void {
  armFacingLock(world, id, normalize(sub(targetPos, t.pos)), ticks);
}

/**
 * A committed swing that connected with nothing. Emits `whiff` (source) and —
 * for melee — a small forward over-commit lunge (a plain dash override in the
 * attacker's facing, so it slides + respects walls like any dash).
 */
function whiff(
  world: SimWorld,
  id: EntityId,
  t: { pos: { x: number; z: number }; facing: { x: number; z: number } },
  attackType: "melee" | "ranged",
): void {
  world.emit("whiff", { source: id, x: t.pos.x, z: t.pos.z });
  if (attackType !== "melee") return;
  const nav = world.nav.get(id);
  if (!nav || lenSq(t.facing) < 1e-12) return;
  nav.override = {
    kind: "dash",
    dir: normalize(t.facing),
    speed: WHIFF_LUNGE_SPEED,
    remaining: WHIFF_LUNGE_DIST,
  };
}
