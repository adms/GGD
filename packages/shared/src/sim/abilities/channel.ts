/**
 * 【持續引導】（GH#1191）—— 效果開始**之後**還要撐住的那一段。純函式，⛔ 沒有 Math.random／Date／三角（sim purity）。
 *
 * 一個機制、兩支技能（第〇·五守則）：稻草人 W 汲取 · 威寇茲 R 射線。作者介面是 `ability@1.channel`
 * （`content/schema/ability.ts::zAbilityChannel`，語意住那裡）；生命週期住 `AbilitiesComp.channel`，全部絕對 tick：
 *
 *   效果跑完 ─ beginChannel ─▶ 引導中（身體定住・不普攻・別的技能按不出來・同一格再按＝更新瞄準）
 *                                │
 *     ├─ 撐滿 durationSec（channelSystem）⇒ 殘留波次作廢 ⇒ onComplete
 *     └─ 被打斷（channelSystem：暈眩／沉默／擊倒／死亡／掉血／方向盤被拿走；OrderSystem：移動指令）⇒ 波次作廢 ⇒ ⛔ 不跑 onComplete
 *
 * ⭐ 「作廢波次」的關聯鍵 ＝ 施法者 × `ability:<id>` × `castInstance.serial` —— 同一次施放排出去的 `delayed`，
 *   ⛔ 不碰上一次施放的、也不碰別人的（與 `splitLiveProjectiles` 同一條關聯）。
 */
import type { EntityId, SeatId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import type { CastableSlot } from "../intents";
import type { AbilityDef } from "../content/defs";
import type { CastInstance } from "../content/castInstance";
import type { ChannelState } from "../stats/statsComp";
import { DEFAULT_CHANNEL_CANCEL_ON } from "../../content/schema/ability";
import { Abilities } from "../content/registry";
import { runEffects } from "../effects/effectRunner";
import { delayedQueue } from "../effects/delayed";
import { armFacingLock } from "../facingLock";
import { applyAugmentToEffects, collectAugmentOps } from "./abilityAugment";
import { steeringTaken } from "../steeringTaken";
import { tauntedBy } from "../taunt";

/** 引導為什麼結束 —— 前七個是作者寫得出的政策；`settled`（決鬥結束）與 `gone`（身體或技能不在了）一律結束。 */
export type ChannelEndCause = "move" | "stun" | "silence" | "knockdown" | "death" | "damage" | "control" | "settled" | "gone";

export interface ChannelBegin {
  slot: CastableSlot;
  rank: number;
  castInstance?: CastInstance;
  /** 按下那一 tick（`castCommitTick`）。 */
  commitTick: number;
  targets: readonly EntityId[];
  point?: Vec2;
  direction?: Vec2;
}

/** 效果跑完之後呼叫；`def.channel` 缺席 ⇒ 嚴格 no-op。 */
export function beginChannel(world: SimWorld, caster: EntityId, abilityId: AbilityDef["id"], def: AbilityDef, b: ChannelBegin): void {
  const spec = def.channel;
  const ab = world.abilities.get(caster);
  const hp = world.health.get(caster);
  if (!spec || !ab || !hp?.alive) return;
  const ticks = Math.max(1, Math.round(spec.durationSec / world.dt));
  const state: ChannelState = {
    slot: b.slot,
    abilityId,
    rank: b.rank,
    ...(b.castInstance !== undefined ? { castInstance: b.castInstance } : {}),
    beganTick: world.tick,
    commitTick: b.commitTick,
    endTick: world.tick + ticks,
    hpAtStart: hp.hp,
    targets: [...b.targets],
    ...(b.point !== undefined ? { point: { x: b.point.x, z: b.point.z } } : {}),
    ...(b.direction !== undefined ? { direction: { x: b.direction.x, z: b.direction.z } } : {}),
  };
  ab.channel = state;
  ab.windup = null; // 引導鎖住普攻，正在揮的那一刀作廢（同 ab.cast）
  // 有瞄準方向的引導（威寇茲 R）：整段引導面向釘在瞄準方向 —— ⛔ 不讓自動索敵把射線慢慢轉向別人。
  if (state.direction) armFacingLock(world, caster, state.direction, ticks);
}

/** 省略 `cancelOn` ⇒ 預設政策。 */
function cancelOnOf(def: AbilityDef | undefined): readonly string[] {
  return def?.channel?.cancelOn ?? DEFAULT_CHANNEL_CANCEL_ON;
}

function breakCause(world: SimWorld, id: EntityId, ch: ChannelState, def: AbilityDef | undefined): ChannelEndCause | undefined {
  const hp = world.health.get(id);
  const t = world.transform.get(id);
  if (!def?.channel || !hp || !t) return "gone";
  if (world.settledZones.has(t.zone)) return "settled";
  const causes = cancelOnOf(def);
  if (!hp.alive && causes.includes("death")) return "death";
  const st = world.status.get(id);
  if (causes.includes("stun") && (st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick) ?? false)) return "stun";
  if (causes.includes("silence") && (st?.effects.some((e) => e.silenced && e.expiresAtTick > world.tick) ?? false)) return "silence";
  if (causes.includes("knockdown") && (world.knockdown.get(id) ?? 0) > 0) return "knockdown";
  // ⭐ 修正輪（#1191 審查）：方向盤被拿走（暴走／恐懼／魅惑／混亂）也打斷 —— 判準與 OrderSystem 丟指令**同一支**。
  //   ⛔ 少了這一行，引導把腳定住，恐懼／魅惑打在引導中的人身上等於無效。
  //   嘲弄只在後台 `config.taunt@1.overridesManualOrder` 開著（＝嘲弄真的蓋掉玩家的指令）時才算；出貨 false ＝ 玩家仍握著方向盤。
  if (causes.includes("control") && (steeringTaken(world, id) || (world.tauntRules.overridesManualOrder && tauntedBy(world, id) !== null))) return "control";
  if (causes.includes("damage") && hp.hp < ch.hpAtStart) return "damage";
  return undefined;
}

/** 這一次施放排出去、還沒付完的 `delayed` 波次全部作廢（⭐ 取消與完成共用 —— 結束之後⛔ 沒有殘留波次）。 */
function voidScheduledWaves(world: SimWorld, id: EntityId, ch: ChannelState): void {
  const origin = `ability:${ch.abilityId}`;
  const serial = ch.castInstance?.serial ?? -1;
  for (const wave of delayedQueue(world)) {
    if (wave.caster === id && wave.origin === origin && (wave.castInstance?.serial ?? -1) === serial) {
      wave.next = wave.strikes.length; // delayedSystem 下一次跑到就移除
    }
  }
}

/** 打斷引導：波次作廢、⛔ 不跑收尾、面向鎖放掉（走開的人不被引導方向釘住）。 */
export function cancelChannel(world: SimWorld, id: EntityId, cause: ChannelEndCause): boolean {
  const ab = world.abilities.get(id);
  const ch = ab?.channel;
  if (!ab || !ch) return false;
  ab.channel = null;
  voidScheduledWaves(world, id, ch);
  world.facingLock.delete(id);
  // 沿用既有的 castInterrupt（客戶端已經在收：切掉施法姿勢、放掉 channelTakeover）。
  world.emit("castInterrupt", { caster: id, slot: ch.slot, abilityId: ch.abilityId, channel: true, cause });
  return true;
}

/**
 * 每 tick（`CastResolveSystem` 最前面）：被打斷 ⇒ cancel；撐滿 ⇒ 殘留波次作廢＋onComplete。
 * 沒有人在引導時是嚴格 no-op（每一份既有錄影逐位元不變）。
 */
export function channelSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const ch = ab.channel;
    if (!ch) continue;
    const def = Abilities.tryGet(ch.abilityId);
    const cause = breakCause(world, id, ch, def);
    if (cause !== undefined) {
      cancelChannel(world, id, cause);
      continue;
    }
    if (world.tick < ch.endTick) continue;
    ab.channel = null;
    voidScheduledWaves(world, id, ch);
    const onComplete = def?.channel?.onComplete;
    if (onComplete && onComplete.length > 0) {
      runEffects(applyAugmentToEffects(onComplete, collectAugmentOps(world, id, ch.abilityId)), {
        ...(ch.castInstance !== undefined ? { castInstance: ch.castInstance } : {}),
        world,
        caster: id,
        rank: ch.rank,
        targets: ch.targets,
        ...(ch.point !== undefined ? { point: ch.point } : {}),
        ...(ch.direction !== undefined ? { direction: ch.direction } : {}),
        origin: `ability:${ch.abilityId}`,
        abilitySlot: ch.slot,
        castCommitTick: ch.commitTick,
        rng: world.rng,
      });
    }
  }
}

/**
 * `OrderSystem` 套用一條**移動／攻擊**指令時呼叫。三道閘：後台 `config.cast-time@1.channelCancelOnMoveOrder`、
 * 真人座位（bot 每一拍都在下指令，同 recoveryCancelOnOrder）、技能的 `cancelOn` 有 `move`。
 */
export function cancelChannelByOrder(world: SimWorld, id: EntityId, seatId: SeatId): void {
  const ch = world.abilities.get(id)?.channel;
  if (!ch || !world.castTimeRules.channelCancelOnMoveOrder) return;
  if (world.mobRules?.humanSeats?.has(seatId) !== true) return;
  if (!cancelOnOf(Abilities.tryGet(ch.abilityId)).includes("move")) return;
  cancelChannel(world, id, "move");
}

/**
 * 引導中更新瞄準：面向改到 `dir` 並鎖到引導結束（`aim:"facing"` 的每一波讀當下面向）。
 * 兩個入口：同一格再按（滑鼠／觸控的 castAbility）與搖桿的連續 `aim`。回 false ＝ 沒有在引導。
 */
export function aimChannel(world: SimWorld, id: EntityId, dir: Vec2): boolean {
  const ch = world.abilities.get(id)?.channel;
  if (!ch) return false;
  if (dir.x * dir.x + dir.z * dir.z < 1e-12) return true; // 退化方向不算瞄準（同 armFacingLock）
  armFacingLock(world, id, dir, Math.max(1, ch.endTick - world.tick));
  ch.direction = { x: dir.x, z: dir.z };
  return true;
}
