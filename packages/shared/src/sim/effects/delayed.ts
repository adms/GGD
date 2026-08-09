/**
 * `delayed` —— ⭐ G12【延遲序列】：一串排在**未來 tick** 的效果，而且**目標在
 * 施放那一刻就凍住**。
 *
 * 擋住兩支：
 *   · 20-002「連續七次斬擊…最後再給予…」（最後一擊附加擊退＋恐懼）
 *   · 52-002「對目標連續 100 下的斬擊」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⭐ 它與 `randomArea` 的差別只有一句話，而那句話就是它存在的理由
 *
 *   · `randomArea` 到期時用**圓心重解**目標（實測：目標走開就打空）；
 *   · `delayed`   到期時用**施放那一刻凍住的那一份名單**。
 *
 * 今天寫「連續七次斬擊」只能寫成同一個 `effects[]` 裡七發 `damage` —— 那是
 * **同一 tick 七發**，畫面上不是連擊而是一下。這支補的正是缺的那個詞彙：
 * **一串綁在絕對 tick 上、名單已經定案的事件**。
 *
 * ⚠️ 它與 `dash.onEnd` **方向相反**（兩邊的檔頭都寫）：這裡凍住的是**名單**
 *（位置無關）；那裡凍不住任何東西，要的正是**結束那一刻的位置**（名單無關）。
 * 兩個長得像，混用會安靜地做錯。
 *
 * ⭐ `targetMode: "reresolve"` 沒有被刪掉而是留成一格下拉：「原地爆的連擊」
 * 要的正是 `randomArea` 的語意，而那是一個**設計偏好**不是缺陷（第一守則：
 * 拿不定主意的決策，兩種模式都做，預設選等於這個機制存在理由的那一個）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 決定性
 *
 * ⭐ 這個 kind **完全不碰 rng**（沒有落點要抽），所以它連 `randomArea` 的
 * draw 預算問題都沒有 —— 一次施放推進亂數流 **0** 步。
 * 排程是**絕對 tick**：第 i 發的到期時刻是 `castTick + delayTicks + i×intervalTicks`。
 * ⚠️ `intervalTicks` 夾成**至少 1**：0.001 秒在 30Hz 會算出 0，整波塞進同一個
 * tick —— 那不是「很快」，那正是這個 kind 要修的那個症狀。
 * 佇列是**陣列**（插入序 = 全序），不迭代 Map。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 接線（`SimWorld.delayed` + `SimWorld.step()` 的 7e′）
 *
 * 與 `randomArea` 完全同一個位置與同一個理由：排在 `combatResolveSystem`
 * **之前**，所以這一 tick 到期的一刀在**同一個 tick** 被減傷、被護盾吃、被
 * `recordDamage` 記分、被 `deathSystem` 結算。排在 drain 之後整波每一發都會晚
 * 一個 tick，而畫面上看不出來。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { Vec2 } from "../math/vec2";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets, type ShapedEffect } from "./shapeTargets";
import { runEffects } from "./effectRunner";
import {
  DELAYED_MAX_COUNT,
  DELAYED_MAX_DELAY_SEC,
  DELAYED_MAX_INTERVAL_SEC,
} from "./kindLimits";

/** 一發：什麼時候、是不是最後一發（`finalEffects` 只跟在最後那一發後面）。 */
export interface DelayedStrike {
  /** **絕對** tick（不是剩餘 tick 數）。 */
  readonly atTick: number;
  readonly final: boolean;
}

/** 一次施放排出來的一整串。 */
export interface DelayedWave {
  caster: EntityId;
  rank: number;
  origin: string;
  abilitySlot?: CastableSlot;
  /** 每一發跑的東西。 */
  effects: EffectDef[];
  /** 最後一發**額外**跑的東西（省略 = 最後一發與其餘完全相同）。 */
  finalEffects?: EffectDef[];
  /**
   * ⭐ 施放那一刻凍住的名單 —— 這個 kind 存在的**全部理由**。
   * `targetMode: "reresolve"` 時它是施放當下的那一份，但每一發會被
   * {@link reresolve} 覆寫掉。
   */
  frozen: EntityId[];
  /** `targetMode: "reresolve"` 時到期重解用的幾何；`"frozen"` 時 undefined。 */
  reresolve?: ShapedEffect;
  /** 重解的圓心 / 巢狀效果的落點（施放那一刻的錨點）。 */
  point?: Vec2;
  strikes: DelayedStrike[];
  /** 下一個還沒付的 index。 */
  next: number;
  /** 凍住的目標死了就跳過他（不繼續鞭屍）。 */
  dropDeadTargets: boolean;
  /** 施法者陣亡就整串停掉。 */
  stopOnCasterDeath: boolean;
  /** 這一串屬於哪個競技場分區 —— 分區的決鬥結束了就不再落下。 */
  zone: number;
}

/**
 * 這個世界的延遲佇列 —— **唯一**的存取點（`randomAreaQueue` 的先例：搬家時
 * 呼叫端一個字都不用改，而那件事在 randomArea 身上真的發生過一次）。
 */
export function delayedQueue(world: SimWorld): DelayedWave[] {
  return world.delayed;
}

export const delayedEffect: EffectKindSpec<"delayed"> = {
  apply(e, ctx) {
    const { world } = ctx;

    const count = Math.max(0, Math.min(DELAYED_MAX_COUNT, Math.floor(e.count ?? 1)));
    if (count <= 0) return;

    const delaySec = Math.max(0, Math.min(DELAYED_MAX_DELAY_SEC, e.delaySec));
    // 第一發可以是「同一 tick」（delaySec 0 = 退化成「先來一發再連擊」），
    // 但**間隔**不行：見檔頭②。
    const delayTicks = Math.max(0, Math.round(delaySec / world.dt));
    const intervalSec = Math.max(0, Math.min(DELAYED_MAX_INTERVAL_SEC, e.intervalSec ?? 0));
    const intervalTicks = Math.max(1, Math.round(intervalSec / world.dt));

    // ⭐ 名單在**這一刻**定案。`shape: "single"` 時 `shapeTargets` 回的正是上游
    // 已經解好的那一份（它不重新發明目標選擇）。
    const frozen = shapeTargets(e, ctx);
    const t = world.transform.get(ctx.caster);
    // 錨點：優先用第一個目標的位置（「對目標連續 100 下」），否則落點，否則自己。
    const anchor =
      (frozen[0] !== undefined ? world.transform.get(frozen[0])?.pos : undefined) ??
      ctx.point ??
      t?.pos;

    const strikes: DelayedStrike[] = [];
    for (let i = 0; i < count; i++) {
      strikes.push({ atTick: world.tick + delayTicks + i * intervalTicks, final: i === count - 1 });
    }

    delayedQueue(world).push({
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      effects: e.effects,
      ...(e.finalEffects !== undefined ? { finalEffects: e.finalEffects } : {}),
      frozen,
      ...((e.targetMode ?? "frozen") === "reresolve"
        ? {
            reresolve: {
              shape: e.shape,
              ...(e.radius !== undefined ? { radius: e.radius } : {}),
              ...(e.side !== undefined ? { side: e.side } : {}),
              ...(e.maxTargets !== undefined ? { maxTargets: e.maxTargets } : {}),
            } satisfies ShapedEffect,
          }
        : {}),
      ...(anchor !== undefined ? { point: { x: anchor.x, z: anchor.z } } : {}),
      strikes,
      next: 0,
      dropDeadTargets: e.dropDeadTargets ?? true,
      stopOnCasterDeath: e.stopOnCasterDeath ?? false,
      zone: t?.zone ?? 0,
    });
  },
  /**
   * 這個 kind 的 payload 整串都是**延遲**的，所以它必須在施法那一刻烘焙 ——
   * 與 `randomArea.effects` / `leap.onLand` / `spawnProjectile.onHit` 同一個
   * #247 缺陷。少了這一段，第七刀會用**落地當下**的 `comboBonus` 結算，而卡上
   * 寫的是施法時的狀態。
   */
  bake(e, ctx, bakeList) {
    return {
      ...e,
      effects: bakeList(e.effects, ctx),
      ...(e.finalEffects !== undefined ? { finalEffects: bakeList(e.finalEffects, ctx) } : {}),
    };
  },
};

/**
 * 把這一 tick 到期的那幾發付掉（`SimWorld.step()` 的 7e′，見檔頭③）。
 *
 * **STRICT no-op**：佇列空的時候它在碰任何東西之前就回來，所以每一份既有
 * replay 與 digest 逐位元不變。
 */
export function delayedSystem(world: SimWorld): void {
  const q = delayedQueue(world);
  if (q.length === 0) return;

  let anyDone = false;
  // 陣列 = 插入序 = 全序（不迭代 Map）。
  for (const wave of q) {
    // 決鬥已經結束的分區不再揮刀 —— 與 `dotTick` / `randomArea` 對 `settledZones`
    // 的處置逐字相同（#100/#216：回合結束後還在扣血是玩家看得見的缺陷）。
    if (world.settledZones.has(wave.zone)) {
      wave.next = wave.strikes.length;
      anyDone = true;
      continue;
    }
    if (wave.stopOnCasterDeath && world.health.get(wave.caster)?.alive !== true) {
      wave.next = wave.strikes.length;
      anyDone = true;
      continue;
    }

    while (wave.next < wave.strikes.length && wave.strikes[wave.next]!.atTick <= world.tick) {
      const strike = wave.strikes[wave.next]!;
      wave.next++;

      const base: EffectContext = {
        world,
        caster: wave.caster,
        rank: wave.rank,
        targets: [],
        ...(wave.point !== undefined ? { point: wave.point } : {}),
        origin: wave.origin,
        ...(wave.abilitySlot !== undefined ? { abilitySlot: wave.abilitySlot } : {}),
        rng: world.rng,
      };
      // ⭐ 這一行是整個機制：`frozen` 的那一份名單，不是重解出來的。
      const targets = wave.reresolve
        ? shapeTargets(wave.reresolve, base)
        : wave.dropDeadTargets
          ? wave.frozen.filter((id) => world.health.get(id)?.alive === true)
          : [...wave.frozen];

      const ctx: EffectContext = { ...base, targets };
      runEffects(wave.effects, ctx);
      if (strike.final && wave.finalEffects) runEffects(wave.finalEffects, ctx);
    }
    if (wave.next >= wave.strikes.length) anyDone = true;
  }

  // 付完的整串移除。只在真的有東西付完時重建陣列，免得每 tick 配一次記憶體。
  if (anyDone) {
    const live = q.filter((w) => w.next < w.strikes.length);
    q.length = 0;
    for (const w of live) q.push(w);
  }
}
