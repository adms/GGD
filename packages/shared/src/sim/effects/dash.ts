/**
 * `dash` — forced linear displacement of the CASTER, integrated with collision
 * by MovementSystem.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 *
 * ⭐ S7（2026-08-10）新增 `onEnd`：**衝刺結束的那一刻**才跑的那一段
 * （52-04「向前衝刺 400 距離後揮出」）。這裡只負責**登記**；「什麼時候算結束」
 * 與「圓心是哪裡」整段住在 `./dashOnEnd.ts`，理由寫在那支的檔頭②。
 * ⛔ 不要把 payload 直接放進這個 `effects[]` —— 那正是 S7 要修的缺陷本體：
 * effect 在 slot 2b/3 跑完、位移在 slot 5 才發生，所以那一刀必然從**起點**揮出。
 */
import type { EffectKindSpec } from "./effectKind";
import { startDash } from "../systems/MovementSystem";
import { normalize, sub } from "../math/vec2";
import { dashOnEndQueue } from "./dashOnEnd";
import { DASH_ON_END_MAX_EFFECTS } from "./kindLimits";

export const dashEffect: EffectKindSpec<"dash"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const t = world.transform.get(ctx.caster);
    if (!t) return;
    const dir =
      e.mode === "toPoint" && ctx.point
        ? normalize(sub(ctx.point, t.pos))
        : ctx.direction ?? t.facing;
    startDash(world, ctx.caster, dir, e.speed, e.maxDistance);

    // ⭐ S7 —— 缺席 = 沒有回呼 = 這個欄位出現之前的行為，一個 tick 都不差。
    if (!e.onEnd || e.onEnd.length === 0) return;
    // `startDash` 在方向為零向量時**不建 override**，那時登記一筆回呼會讓它在
    // 下一個 tick 立刻付掉（衝刺根本沒發生）—— 所以照著 override 有沒有真的
    // 建起來決定，⛔ 不是照著我們「有沒有呼叫」決定。
    if (world.nav.get(ctx.caster)?.override?.kind !== "dash") return;

    dashOnEndQueue(world).push({
      caster: ctx.caster,
      from: { x: t.pos.x, z: t.pos.z },
      maxDistance: e.maxDistance,
      effects: e.onEnd.slice(0, DASH_ON_END_MAX_EFFECTS),
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      onEndOn: e.onEndOn ?? "always",
      onEndWhenDead: e.onEndWhenDead ?? false,
      zone: t.zone,
    });
  },
  /**
   * `onEnd` 是一段**延遲**的 payload，所以它必須在施法那一刻烘焙 —— 與
   * `leap.onLand` / `spawnProjectile.onHit` / `randomArea.effects` 同一個 #247
   * 缺陷。少了這一段，衝完那一刀會用**落地當下**的條件結算，而卡上寫的是施法
   * 那一刻的狀態。
   */
  bake(e, ctx, bakeList) {
    if (!e.onEnd) return e;
    return { ...e, onEnd: bakeList(e.onEnd, ctx) };
  },
};
