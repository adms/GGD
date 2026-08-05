/**
 * Ability casting + rank-up. Validation order: learned → alive → not stunned →
 * off cooldown → mana → range. Cast is instant in the skeleton (no windup);
 * effects run immediately with resolved targeting.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot, CoreAbilitySlot, CastTarget } from "../intents";
import { Abilities } from "../content/registry";
import { Stat } from "../stats/statTypes";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { recordAbilityCast } from "../stats/matchStats";
import { queryOverlap } from "../collision/queries";
import { circle } from "../collision/shapes";
import { normalize, sub, distSq, clampLen, add } from "../math/vec2";
import { isPassiveOnly, syncAbilityPassives } from "./abilityPassives";
import { abilityInstanceFor, innateCastBlock } from "./innateActive";
import { berserkCastBlock, berserkCooldownFactor } from "./berserkRules";
import { armRecovery } from "./abilityRecovery";
import { breakStealth, canSee } from "../stealth";
import {
  armFacingLock,
  facingTicks,
} from "../facingLock";

/**
 * Enemies of `caster` currently standing inside a ground-AoE circle.
 *
 * EXPORTED so the cast-BEGIN membership (here) and the cast-RESOLVE membership
 * (CastResolveSystem, after the wind-up) are computed by the same code. They
 * used to be one snapshot taken at begin and replayed at resolve, so an AoE
 * with a cast time hit whoever stood in the circle when the key was pressed
 * even if they walked out — and missed anyone who walked in.
 */
/**
 * Ability CAST RANGE after the global combat-env `abilityRange` factor
 * (task #136: 原始技能範圍太大 → 系統倍率縮為 60%). The ONE seam every read of an
 * ability's `def.range` passes through, so cast validation, the ground clamp and
 * the tooltip can never disagree. Applied once per read; with the neutral 1.0
 * table it is byte-identical to the pre-#136 sim (determinism preserved).
 */
export function resolveAbilityRange(world: SimWorld, range: number): number {
  return range * world.combatEnv.abilityRange;
}

/** Ability AoE RADIUS after the same `abilityRange` factor (task #136). */
export function resolveAbilityRadius(world: SimWorld, radius: number): number {
  return radius * world.combatEnv.abilityRange;
}

export function enemiesInCircle(
  world: SimWorld,
  caster: EntityId,
  point: { x: number; z: number },
  radius: number,
): EntityId[] {
  const t = world.transform.get(caster);
  if (!t) return [];
  const selfTeam = world.team.get(caster);
  const hits = queryOverlap(world, circle(point, radius), {
    zone: t.zone,
    exclude: new Set([caster]),
    aliveOnly: true,
  });
  return hits.filter((h) => {
    const ht = world.team.get(h);
    if (ht && selfTeam && ht.teamId === selfTeam.teamId) return false;
    // 隱形擋不擋技能 AoE —— a DECISION POINT, and the shipped answer is NO
    // (`blocksAbilityAoe: false`, sim/stealth.ts): in WC3 a Blizzard/Flame
    // Strike does burn an invisible unit standing in it, because invisibility
    // is un-TARGETABILITY, not immunity. So with the shipping config this
    // predicate is a constant `true` and this whole AoE path is byte-identical
    // to before. Flipping the field on turns 永久隱形 into a real "walk through
    // the fight untouched" mechanic, which is a design the owner may want and
    // must not have to redeploy for.
    if (world.stealthRules.blocksAbilityAoe && !canSee(world, caster, h)) return false;
    return true;
  });
}

export type CastResult =
  | "ok"
  | "not-learned"
  | "dead"
  | "stunned"
  | "silenced"
  | "cooldown"
  | "no-mana"
  | "out-of-range"
  | "bad-target"
  /** the ability is a PERMANENT passive (WC3 Cool=0) — there is nothing to cast */
  | "passive"
  /**
   * 暴走系主動技的生命門檻沒到 —— 「你還沒虛弱到需要把方向盤交出去」
   * (owner 2026-08-03:EX 完全暴走 HP ≤ 15% 才放得出來)。
   *
   * 它是一個**獨立的**理由而不是 `bad-target`,因為玩家能做的事完全不同:
   * bad-target 是「換一個目標」,這一條是「等你被打到剩 15% 再按」。
   * 門檻本身是欄位(`world.berserkRules.castHpPct`),見 `abilities/berserkRules.ts`。
   *
   * ⚠️ 客戶端 `apps/client/src/ui/castFeedback.ts` 的 `CastRejectReason` 是一份
   * **本地**聯集(刻意的,見那個檔的註解),所以這一個新成員在舊客戶端上會退回
   * 通用句「現在無法施放」而不是型別錯誤。要那句專屬文案,見回報的 needsOthers。
   */
  | "hp-too-high"
  /**
   * still committed to the RECOVERY of a previous ability that WHIFFED
   * (abilityRecovery.ts). Distinct from "cooldown" on purpose: the HUD should
   * be able to say "you missed and you're still recovering", which is the whole
   * feedback loop that teaches the hit-cancel rule.
   */
  | "recovery";

export function castAbility(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
  target: CastTarget,
): CastResult {
  const ab = world.abilities.get(caster);
  const t = world.transform.get(caster);
  const hp = world.health.get(caster);
  const sc = world.stats.get(caster);
  if (!ab || !t || !hp || !sc) return "bad-target";

  // Q/W/E/R live in the record, EX in `exSlot`, the level-1 天生技 in
  // `passiveSlot` — `abilityInstanceFor` is the ONE resolver (innateActive.ts).
  // A missing instance (hero has no EX / no NN-00) or a locked EX (rank 0,
  // pre-unlock) both read as "not-learned". The innate spawns at rank 1, so for
  // it this gate only ever fires on the 3 heroes that genuinely have none.
  const inst = abilityInstanceFor(ab, slot);
  if (!inst || inst.rank <= 0) return "not-learned";
  if (!hp.alive) return "dead";

  const st = world.status.get(caster);
  if (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick)) return "stunned";
  // 【沉默】C1（#278）。⛔ 位置是刻意的：**在扣魔力與進冷卻之前**。
  // 放到後面的話按 Q 會「沒放出來但魔力沒了、冷卻也轉了」—— 那比不能施法更糟，
  // 而且畫面上只看得到一個沒反應的按鈕（`c1c2.test.ts` 的第二條在釘這個）。
  if (st?.effects.some((e) => e.silenced && e.expiresAtTick > world.tick)) return "silenced";
  // Combat-juice: a knocked-down (prone) caster is hard-CC'd like a stun.
  if ((world.knockdown.get(caster) ?? 0) > 0) return "stunned";
  // already mid-cast (another ability's cast time) — animation-locked
  if (ab.cast) return "cooldown";
  if (inst.cooldownRemainingTicks > 0) return "cooldown";

  const def = Abilities.get(inst.abilityId);
  // The SIXTH slot is castable only for `innateKind: "active"` — the ~60 real
  // WC3 D-slot innates. A permanent 天生技 (迴避/靈氣/on-hit proc) answers
  // "passive", keyed on the AUTHORED KIND so it holds even if a mis-authored
  // doc grew a stray effect (innateActive.ts DECISION 4).
  const innateBlock = innateCastBlock(def);
  if (innateBlock) return innateBlock;
  // A passive-only ability (native Cool=0, no castable effects) can never be
  // activated. Reject BEFORE any cost is paid — the old shape charged mana and
  // a fabricated cooldown for a button WC3 does not even let you press.
  if (isPassiveOnly(def)) return "passive";
  // 暴走系主動技的生命門檻 (owner 2026-08-03:EX 完全暴走 HP ≤ 15%).
  //
  // 位置是**所有付出成本之前**,和 `isPassiveOnly` 同一段:被這條擋下來的一次
  // 按鍵,魔力一點都不扣、冷卻一格都不轉。寫在效果裡的話按鈕會照樣吃掉 120 秒
  // 冷卻然後什麼都不發生(失敗形態 ②)。
  //
  // 判定的是「這支技能會不會給暴走」而不是英雄 id,所以下一支暴走技自動繼承
  // 同一條規則 —— 見 abilities/berserkRules.ts。
  const berserkBlock = berserkCastBlock(world, def, caster);
  if (berserkBlock) return berserkBlock;
  const mana = def.manaCost[inst.rank - 1] ?? 0;
  if (hp.mana < mana) return "no-mana";

  // Still committed to the RECOVERY of a previous ability that WHIFFED. A
  // landed hit would already have cleared this on the tick it connected, so
  // reaching here means the last ability missed — this is the punish window
  // (abilities/abilityRecovery.ts).
  //
  // ORDER: every check above is a pure predicate that pays no cost, so their
  // relative order is purely a question of WHICH REASON IS REPORTED, never of
  // what is allowed. Recovery is placed LAST on purpose: when the button is
  // also on cooldown or you also lack the mana, those are the older, longer and
  // more actionable answers, and "recovery" would just be a confusing new name
  // for the same dead button. The case recovery exists to govern is a COMBO —
  // a DIFFERENT ability, off cooldown, mana in hand, right after the first one
  // — and that case reaches exactly this line.
  if ((ab.recovery?.ticksLeft ?? 0) > 0) return "recovery";

  // ---- resolve targeting ----
  let targets: EntityId[] = [];
  let point: { x: number; z: number } | undefined;
  let direction: { x: number; z: number } | undefined;
  const selfTeam = world.team.get(caster);

  switch (def.castType) {
    case "self":
      targets = [caster];
      break;
    case "targeted": {
      if (target.type !== "entity") return "bad-target";
      const tgt = world.transform.get(target.entityId);
      const tgtHp = world.health.get(target.entityId);
      if (!tgt || !tgtHp?.alive || tgt.zone !== t.zone) return "bad-target";
      if (def.targetsEnemies !== false) {
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId === selfTeam.teamId) return "bad-target";
      } else {
        // ally-targeted abilities (heals/restores/buffs) can never target a
        // neutral flower — nor an ENEMY. `targetsEnemies: false` used to only
        // *skip* the same-team check, so every ported WC3 「目標 friend」 spell
        // (6 docs, all heals) could be aimed at the enemy team and would happily
        // heal them. The WC3 target flags are exclusive; so is this.
        if (world.flower.has(target.entityId)) return "bad-target";
        const tgtTeam = world.team.get(target.entityId);
        if (tgtTeam && selfTeam && tgtTeam.teamId !== selfTeam.teamId) return "bad-target";
      }
      // combat-env `abilityRange` (task #136) shrinks the effective cast range
      const range = resolveAbilityRange(world, def.range);
      if (distSq(t.pos, tgt.pos) > range * range) return "out-of-range";
      targets = [target.entityId];
      point = { x: tgt.pos.x, z: tgt.pos.z };
      direction = normalize(sub(tgt.pos, t.pos));
      break;
    }
    case "skillshot": {
      if (target.type === "dir") direction = normalize(target.dir);
      else if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
    case "ground": {
      if (target.type !== "point") return "bad-target";
      // clamp the point to range instead of rejecting (LoL behavior).
      // combat-env `abilityRange` (task #136) shrinks both the reach and the AoE.
      const off = clampLen(sub(target.point, t.pos), resolveAbilityRange(world, def.range));
      point = add(t.pos, off);
      // task #264: 地面指定技能過去**從來沒有**算出 `direction`，所以下面那行
      // `if (direction) t.facing = direction` 對它整組是死的 —— 94 支 ground 技能
      // (含喪標麥可 Q/E/R 三支) 施法時身體完全不轉，可以背對著地面 AoE 放。
      // 方向就是「自己 → 落點」，落點與自己重合時退化為 0 向量，由 armFacingLock
      // 自行忽略（原地放的 AoE 沒有有意義的朝向）。
      direction = normalize(sub(point, t.pos));
      // ground AoE: hit enemies in radius at the point. With a cast time this
      // set is RE-QUERIED when the wind-up elapses (CastResolveSystem).
      targets = enemiesInCircle(world, caster, point, resolveAbilityRadius(world, def.radius ?? 1));
      break;
    }
    case "dash": {
      if (target.type === "point") direction = normalize(sub(target.point, t.pos));
      else if (target.type === "dir") direction = normalize(target.dir);
      else return "bad-target";
      if (direction.x === 0 && direction.z === 0) return "bad-target";
      break;
    }
  }

  // ---- pay costs (mana + cooldown paid up-front, at cast-begin) ----
  hp.mana -= mana;
  const cdr = sc.final[Stat.CooldownReduction] ?? 0;
  // world.combatEnv.cooldown: global env factor on the cooldown SECONDS (2.0 =
  // twice as long). One seam covers Q/W/E/R and the EX slot alike.
  //
  // 暴走中的冷卻倍率 (owner 2026-08-03:「冷卻時間 ×2」) 乘在**同一個seam**上,
  // 理由和 `combatEnv.cooldown` 完全相同:分開一條路線就會有一半的技能忘記
  // 套用。不是暴走中 → 回 1,所以每一份既有錄影逐位元不變。
  //
  // ⚠️ 讀的是**開始施放的那一刻**的狀態,所以 EX 自己的 120 秒不會被自己剛掛上
  // 的暴走加倍(效果在付完成本之後才跑),而暴走**之前**就已經在轉的冷卻也不會
  // 被追溯加倍 —— 那會讓玩家看到冷卻進度條倒退。
  const cdSecs =
    (def.cooldown[inst.rank - 1] ?? 0) *
    (1 - cdr) *
    world.combatEnv.cooldown *
    berserkCooldownFactor(world, caster);
  inst.cooldownRemainingTicks = Math.round(cdSecs / world.dt);

  // ---- 面向：commit 瞄準方向 (task #264) ----
  // 過去這裡只是 `t.facing = direction`，而 MovementSystem 在同一 tick 稍後
  // (step slot 5 vs 這裡的 slot 3) 會無條件把 facing 轉回移動方向 —— 搖桿/觸控
  // 每一幀都合成一筆 move 訂單，所以走位中施法的轉身存活 0 tick。改用面向鎖：
  // 一樣立刻寫 facing，但同時宣告「接下來這幾 tick 移動方向不得覆蓋」。
  // 鎖的長度 = 吟唱時間，瞬發技至少 facing.instantCastTicks（沒有吟唱可以撐住
  // 面向，只給收招餘韻的話玩家看不到轉身），再加上收招餘韻。
  const castTicksForAim = Math.round((def.castTimeSec ?? 0) / world.dt);
  const fTicks = facingTicks(world); // 後台可調 (config.combat-feel@1 → facing)
  if (direction) {
    armFacingLock(
      world,
      caster,
      direction,
      Math.max(castTicksForAim, fTicks.instantCastTicks) + fTicks.followThroughTicks,
    );
  }

  recordAbilityCast(world, caster); // scoreboard: one successful cast (Q/W/E/R/EX/天生技)
  // `vfxKey` (fx.prim.<element>.<shape>) rides along so the client's per-frame
  // audio mapper can play the ELEMENT whoosh (fire/ice/lightning) for the cast
  // without loading any ability data of its own (audio COMBAT-AUDIO routing).
  // `sfxKey` is the same contract one step more specific: the WC3 source map's
  // own per-ability cast sound (content `ability@1.sfxKey`), which the mapper
  // plays INSTEAD of the element/generic voice. Rides `abilityCast` and not
  // `castBegin` on purpose — castBegin only fires when castTimeSec > 0, so an
  // instant cast (e.g. godie-o00k.passive 裝可愛) would never sound there.
  // 破隱 (sim/stealth.ts). Placed at the SINGLE point where a cast is
  // committed — past every rejection (`not-learned`/`cooldown`/`no-mana`/
  // `out-of-range`/`recovery`), and BEFORE the ct>0 / ct==0 fork, so a channelled
  // cast and an instant cast reveal on the same tick. Putting it in either
  // branch would have made half the roster's casts silent.
  breakStealth(world, caster, "cast");

  world.emit("abilityCast", {
    caster,
    slot,
    abilityId: inst.abilityId,
    point,
    direction,
    vfxKey: def.vfxKey,
    sfxKey: def.sfxKey,
  });

  // ---- cast time: defer effects to CastResolveSystem when ct > 0 ----
  const ctTicks = Math.round((def.castTimeSec ?? 0) / world.dt);
  if (ctTicks > 0) {
    ab.cast = {
      slot,
      abilityId: inst.abilityId,
      rank: inst.rank,
      ticksLeft: ctTicks,
      targets,
      point,
      direction,
      rooted: def.rootWhileCasting !== false,
      // Baseline for `interruptOn: "damage"` (CastResolveSystem). Written
      // unconditionally — see `CastState.hpAtStart`.
      hpAtStart: hp.hp,
    };
    // stop any in-progress auto — the cast animation-locks the caster
    ab.windup = null;
    world.emit("castBegin", {
      caster,
      slot,
      abilityId: inst.abilityId,
      ticks: ctTicks,
      castTimeSec: def.castTimeSec ?? 0,
    });
    return "ok";
  }

  // ---- instant cast (ct = 0): run effects immediately ----
  // A ground-targeted AoE detonates at its point THIS tick (a cast time defers
  // the blast to CastResolveSystem instead). One discrete `explosion` cue per
  // cast, at the point — the client's AoE/爆裂 sound (audio COMBAT-AUDIO).
  if (def.castType === "ground" && point) {
    world.emit("explosion", { caster, abilityId: inst.abilityId, x: point.x, z: point.z });
  }
  runEffects(def.effects, {
    world,
    caster,
    rank: inst.rank,
    targets,
    point,
    direction,
    origin: `ability:${inst.abilityId}`,
    abilitySlot: slot,
    rng: world.rng,
  });

  fireHooks(world, caster, "onAbilityCast", targets[0], slot);
  for (const hitId of targets) {
    if (hitId !== caster) fireHooks(world, caster, "onAbilityHit", hitId, slot);
  }
  // RECOVERY starts at the END of startup. For an instant cast startup is zero
  // ticks long, so "end of startup" IS this moment. Effects above only QUEUED
  // their damage (combatResolveSystem drains it at step 8 of this same tick), so
  // the hit-cancel still lands on the same tick if it connects.
  armRecovery(world, caster, slot, def, targets);
  return "ok";
}

/**
 * Spend a point on Q/W/E/R. The parameter is `CoreAbilitySlot`, which is the
 * whole guard for the two non-rankable slots: EX is UNLOCKED (`learnEx`) and the
 * sixth slot's 天生技 is OWNED at rank 1 for life. Neither is expressible here,
 * so neither needs a runtime rejection.
 */
export function rankUpAbility(world: SimWorld, id: EntityId, slot: CoreAbilitySlot): boolean {
  const ab = world.abilities.get(id);
  const champ = world.champion.get(id);
  if (!ab || !champ || ab.unspentPoints <= 0) return false;
  const inst = ab.slots[slot];
  const def = Abilities.get(inst.abilityId);
  if (inst.rank >= def.maxRank) return false;
  // R gated to champion levels 6/11/16 — unless the host lifted the gate
  // (arena rules: R learnable from a configured round, world.ultGateOverride)
  if (slot === "R" && !world.ultGateOverride) {
    const gate = [6, 11, 16][inst.rank] ?? 99;
    if (champ.level < gate) return false;
  }
  inst.rank++;
  ab.unspentPoints--;
  // a permanent passive's columns are per LEVEL — re-attach at the new rank
  syncAbilityPassives(world, id);
  world.emit("rankUp", { id, slot, rank: inst.rank });
  return true;
}

/** Tick down cooldowns (called by commandSystem each tick). */
export function tickCooldowns(world: SimWorld): void {
  for (const [, ab] of world.abilities) {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const inst = ab.slots[slot];
      if (inst.cooldownRemainingTicks > 0) inst.cooldownRemainingTicks--;
    }
    if (ab.exSlot && ab.exSlot.cooldownRemainingTicks > 0) ab.exSlot.cooldownRemainingTicks--;
    // The SIXTH slot's cooldown is REAL and owned by the slot. Replay-neutral:
    // the counter can only be raised by a `castAbility(slot "PASSIVE")`, which
    // no historical input log contains, so on every existing recording this
    // line reads 0 and does nothing (innateActive.ts DECISION 5).
    if (ab.passiveSlot && ab.passiveSlot.cooldownRemainingTicks > 0)
      ab.passiveSlot.cooldownRemainingTicks--;
    if (ab.basicAttackCdTicks > 0) ab.basicAttackCdTicks--;
  }
}

/**
 * Unlock a champion's "EX 技能" (rank 0 -> 1). No-op (returns false) for heroes
 * without an EX slot or one already unlocked. Emits `exUnlock` for the HUD toast
 * + a VFX cue. Called by the match host once the arena EX-unlock point is hit.
 */
export function learnEx(world: SimWorld, id: EntityId): boolean {
  const ab = world.abilities.get(id);
  if (!ab || !ab.exSlot || ab.exSlot.rank > 0) return false;
  ab.exSlot.rank = 1;
  // a passive EX (the native `Cool=0` family) becomes ACTIVE at unlock
  syncAbilityPassives(world, id);
  world.emit("exUnlock", { id, abilityId: ab.exSlot.abilityId });
  return true;
}
