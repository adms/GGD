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
import type { DisplaceEvent } from "../movement/leap";
import { abilityIdOfOrigin } from "../combat/damage";
import { TICK_HZ } from "../../constants";

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

    // GH#354 —— 位移的統一時刻（衝刺／閃現／跳躍共用一則），
    // `mode` 帶種類，所以「使用位移技後⋯」一張卡就涵蓋三種，
    // 而只想吃閃現的人用條件葉讀 mode。⛔ 不為三種各開一個事件。
    // ⚠️ 方向是零向量時 `startDash` 不建 override＝衝刺沒有發生，所以這道閘
    // 與下面 onEnd 那一道是**同一個判準**，⛔ 不是兩份。
    if (world.nav.get(ctx.caster)?.override?.kind === "dash") {
      // ⭐⭐ 2026-09-02（Codex P0-5）—— **第三個發射站**。
      //
      // ⛔⛔ 留它不補就是失敗形態⑧：另外兩站（`leap.ts` / `blink.ts`）已經帶
      // `phase`／`abilityId`，⭐ 而消費端讀 `ev.data.phase` 在衝刺上會拿到
      // **`undefined`** —— 一個「有 case、而它讀一個零寫入端的欄位」的洞。
      //
      // `phase: "start"`：這一行在 `startDash` 建好 override **之後**、
      // 而位移要到下一個 tick 才開始積 ⇒ ⭐ 身體一格都還沒動。
      // ⚠️ ⛔ **不補第二則**（理由與另外兩站逐字相同）：`displace` 接
      // `onDashOrBlink`（`WorldHookSystem.ts:313`）⇒ 多發一則 = 卡片觸發兩次 = **改 sim 判定**。
      const dashOv = world.nav.get(ctx.caster)?.override;
      world.emit("displace", {
        id: ctx.caster,
        mode: "dash",
        phase: "start",
        caster: ctx.caster,
        origin: ctx.origin,
        abilityId: abilityIdOfOrigin(ctx.origin) ?? null,
        // ⭐ 引擎真的排的時長（⛔ 不是作者寫的秒數）——與 leap 那一站同一個口徑。
        durationSec:
          dashOv != null && typeof (dashOv as { ticks?: unknown }).ticks === "number"
            ? (dashOv as { ticks: number }).ticks / TICK_HZ
            : 0,
      } satisfies DisplaceEvent);
    }

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
