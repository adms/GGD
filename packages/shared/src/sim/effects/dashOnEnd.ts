/**
 * `dash.onEnd` —— ⭐ S7【衝刺結束才揮出】(52-04「向前衝刺 400 距離**後**揮出」)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼它必須存在（實測，三臂同 seed）
 *
 *   · `dash` 單獨（對照組）                → 位移 +4.40u，受害者掉 43.47
 *   · `[dash, damageArea]` 同一個 effects[] → 位移 +4.40u，受害者掉 43.47
 *     ← **逐字相同：那一刀從起點揮出，完全落空**
 *   · 同一個 AoE 從衝刺**終點**放           → 受害者掉 199.83
 *
 * 原因是順序：effect 在 `SimWorld.step()` 的 slot 2b/3 跑完，位移在 slot 5 才
 * 發生，所以同一個 `effects[]` 裡的 AoE **必然**用衝刺前的座標。今天的內容寫
 * 得出這一招，而它每一次都打在身後 —— 失敗形態②（做了但玩家拿不到）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⛔ 為什麼是「MovementSystem 之後的一個系統」而不是改 MovementSystem
 *
 * 「衝刺結束了」這個真相只存在於 `MovementSystem` 的 override 迴圈裡：它在
 * **撞牆**與**跑完距離**兩種情況下都寫 `nav.override = null`。這支系統排在
 * `movementSystem`（slot 5）**之後**、`combatResolveSystem`（slot 8）**之前**，
 * 用一個純觀察的判準把那一刻抓出來：
 *
 *   「這個人有一筆待付的 onEnd，而他的 `nav.override` 已經不是**那一次**衝刺了」
 *
 * ⭐ 這讓 S7 **不需要新的 step slot、不動 `DashOverride` 的形狀、不改
 * `MovementSystem` 一行** —— 而它排出來的傷害仍然在**同一 tick** 被減傷、被
 * 護盾吃、被 `recordDamage` 記分、被 `deathSystem` 結算。
 *
 * ⚠️ `onEndOn: "completed"`（只有真的跑完距離才揮）的判準是**走了多遠**，
 * 不是「override 怎麼消失的」：`travelled >= maxDistance − ε`。撞牆停下來的
 * 衝刺走得比較短，這是唯一一個從外面觀察得到、而且不會說謊的分辨方式。
 * 預設 `"always"`，因為卡面說「衝刺後揮出」，而**一刀被場景取消是玩家看不見
 * 的失敗**。
 *
 * ⚠️ 它與 `delayed` **方向相反**（兩邊的檔頭都寫）：`delayed` 凍住的是**目標
 * 名單**（位置無關）；這裡凍不住任何東西，要的正是**結束那一刻的位置**
 *（名單無關），所以 payload 拿到的是 `targets: []` + `point = 終點`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ purity
 *
 * 無 rng、無時鐘、無三角函式。佇列是**陣列**（插入序 = 全序），不迭代 Map。
 * 沒有遞減計數器、沒有到期時刻 —— 這支系統只問一個**當下**的問題。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { Vec2 } from "../math/vec2";
import type { EffectDef } from "./effect";
import { runEffects } from "./effectRunner";
import { len, sub } from "../math/vec2";

/** 一筆「等這一次衝刺結束就跑」的待付回呼。 */
export interface DashOnEndPending {
  caster: EntityId;
  /** 起跳座標 —— 用來量「真的走了多遠」（`onEndOn: "completed"`）。 */
  from: Vec2;
  /** 這一次衝刺**授權**的距離。 */
  maxDistance: number;
  effects: EffectDef[];
  rank: number;
  origin: string;
  abilitySlot?: CastableSlot;
  /** 撞牆停下來的衝刺算不算「衝完」。 */
  onEndOn: "always" | "completed";
  /** 衝刺途中死掉還要不要揮。 */
  onEndWhenDead: boolean;
  zone: number;
}

/** 這個世界的待付回呼佇列 —— **唯一**的存取點（同 `randomAreaQueue` 的先例）。 */
export function dashOnEndQueue(world: SimWorld): DashOnEndPending[] {
  return world.dashOnEnd;
}

/** 「這一刻，那一次衝刺還在跑嗎？」—— 這支系統唯一的判斷。 */
function stillDashing(world: SimWorld, p: DashOnEndPending): boolean {
  const ov = world.nav.get(p.caster)?.override;
  // ⚠️ `kind !== "dash"` 也算結束：被擊退／被拋飛接管的那一刻，那一次衝刺就
  // 不再是它自己了。⛔ 不可以只看 `override != null`，否則一次擊退會讓回呼
  // 永遠掛在佇列裡等一個不會再結束的東西。
  return ov !== null && ov !== undefined && ov.kind === "dash";
}

/**
 * 付掉這一 tick 結束的衝刺回呼（`SimWorld.step()` 的 5′，見檔頭②）。
 *
 * **STRICT no-op**：佇列空的時候它在碰任何東西之前就回來，所以每一份既有
 * replay 與 digest 逐位元不變。
 */
export function dashOnEndSystem(world: SimWorld): void {
  const q = dashOnEndQueue(world);
  if (q.length === 0) return;

  let anyDone = false;
  for (const p of q) {
    if (stillDashing(world, p)) continue;
    anyDone = true;

    // 決鬥已經結束的分區不再揮刀（同 `dotTick` / `randomArea` / `delayed`）。
    if (world.settledZones.has(p.zone)) continue;
    if (!p.onEndWhenDead && world.health.get(p.caster)?.alive !== true) continue;

    const t = world.transform.get(p.caster);
    if (!t) continue;

    if (p.onEndOn === "completed") {
      // 走了多遠 —— 撞牆停下來的衝刺走得比較短（檔頭②）。
      const travelled = len(sub(t.pos, p.from));
      if (travelled + 1e-6 < p.maxDistance) continue;
    }

    // ⭐ 這一行是整個機制：圓心是**現在**的座標（衝刺終點），不是起點。
    runEffects(p.effects, {
      world,
      caster: p.caster,
      rank: p.rank,
      targets: [],
      point: { x: t.pos.x, z: t.pos.z },
      direction: { x: t.facing.x, z: t.facing.z },
      origin: p.origin,
      ...(p.abilitySlot !== undefined ? { abilitySlot: p.abilitySlot } : {}),
      rng: world.rng,
    });
  }

  if (anyDone) {
    const live = q.filter((p) => stillDashing(world, p));
    q.length = 0;
    for (const p of live) q.push(p);
  }
}
