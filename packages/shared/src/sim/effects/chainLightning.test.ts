/**
 * 連鎖閃電（`chainLightning`）的**行為**守衛 —— GH#451.
 *
 * owner 2026-08-19：「**N 個單位 N 次連鎖閃電**、周圍敵方單位**逐個傷害遞減**」
 * owner 2026-08-20：「重點在於**隨機選擇單位遞減時間差的閃電特效與傷害**
 *  （**每個閃電有極小的時間間隔播放閃電動畫與傷害才到下一個**）」
 *
 * 三條，一條一件事，⛔ 沒有第四條瑣碎斷言（owner：不要做小範圍瑣碎測試）：
 *   ① ⭐ **承重** —— 逐跳真的跨了很多個 tick，而且**每一跳各發一次**渲染事件。
 *      走的是**出貨的那條路**（`world.step()`，⛔ 不是手動叫 system），所以
 *      「忘了把 system 掛進 step()」也會紅（失敗形態⑤）。
 *   ② 傷害逐跳遞減 + 下一跳是**隨機**抽的（同一個場面、兩顆種子 ⇒ 兩條路徑）。
 *   ③ 效能：改前（`jumpIntervalSec: 0`）vs 改後的**每 tick 尖峰**，量測不斷言。
 *
 * 目標集合走真的 `enemiesInCircle` + 真的 broad-phase grid，⛔ 不自己手寫名單。
 *
 * 突變紀錄（⭐ 承重的那一條線）：
 *   · `apply` 的 `atTick: world.tick + i * intervalTicks` → `world.tick`，
 *     且 `boltOnce` 的 `s.atTick = world.tick + cast.intervalTicks` → `world.tick`
 *    （＝把整次施放排回同一個 tick）→ ① 的「跨了不只一個 tick」與「尖峰被攤平」紅。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import { chainLightningSystem } from "./chainLightning";
import type { EffectContext, EffectDef } from "./effect";
import { asTeamId, asSeatId, type EntityId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;

/** 施法者站在圓心，`offsets` 是每個敵人往東的距離（GGD 單位）。 */
function rig(offsets: number[], seed = 7): { world: SimWorld; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const place = (x: number, z: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    return id;
  };
  const caster = place(C.x, C.z, 0, 0);
  offsets.forEach((d, i) => place(C.x + d, C.z, 1, i + 1));
  world.rebuildGrid();
  return { world, caster };
}

function ctxOf(world: SimWorld, caster: EntityId): EffectContext {
  return { world, caster, rank: 1, targets: [], origin: "ability:test-chain", rng: world.rng };
}

const chain = (over: Partial<Extract<EffectDef, { kind: "chainLightning" }>>): EffectDef => ({
  kind: "chainLightning",
  shape: "circle",
  radius: 6,
  amount: { flat: 100 },
  damageType: "magic",
  jumps: 3,
  jumpRange: 6,
  decay: 0.5,
  ...over,
});

/** 手動推進到期（⛔ 不走 `step()`，因為 `step()` 會把 `damageQueue` 排空）。 */
function advance(world: SimWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    chainLightningSystem(world);
    world.tick++;
  }
}

describe("chainLightning — 逐跳有時間差、隨機挑下一個、逐跳遞減 (do-chain-lightning)", () => {
  it("⭐ 每一跳各發一次事件，而且散落在**很多個 tick** 上（走真的 step()）", () => {
    cover("do-chain-lightning");
    const { world, caster } = rig([1, 2, 3]);
    runEffects([chain({})], ctxOf(world, caster));

    // 出貨的那條路：`chainLightningSystem` 掛在 `SimWorld.step()` 裡。
    // ⚠️ `step()` 每一格開頭會清空 `events`，所以要逐格收。
    const boltTicks: number[] = [];
    const collect = (): void => {
      for (const ev of world.events) {
        if (ev.type !== "chainLightning") continue;
        // 一個事件 = 一發閃電 = 一段折線（客戶端據此畫弧）。
        expect((ev.data.segments as unknown[]).length, "一個事件應該只帶這一發").toBe(1);
        boltTicks.push(ev.tick);
      }
    };
    // ⚠️ 施放那一格自己的事件要先收：`step()` 每一格開頭會清空 `events`，
    // 少了這一行，「整次施放在施放的 tick 全發完」會長得像「一發都沒發」，
    // 而那會讓下面那條斷言用**錯誤的訊息**紅。
    collect();
    for (let i = 0; i < 16; i++) {
      world.step(new Map());
      collect();
    }

    // ① 3 條鏈 × 3 跳，**每一跳各一次**通知 —— 一次不多（整段結束才發一次會少），
    //    一次不少（漏發的那幾跳玩家只看得到血條跳）。
    expect(boltTicks.length, "每一跳都要有自己的渲染通知").toBe(9);
    // ② ⭐ 承重：真的有時間差。全部排在同一個 tick 的實作在這裡紅。
    expect(new Set(boltTicks).size, "逐跳應該跨多個 tick").toBeGreaterThan(1);
    // ③ 尖峰被攤平：沒有任何一個 tick 扛下整次施放（owner 說的「避免計算上限」）。
    const perTick = new Map<number, number>();
    for (const t of boltTicks) perTick.set(t, (perTick.get(t) ?? 0) + 1);
    expect(Math.max(...perTick.values()), "一個 tick 不該扛下整次施放").toBeLessThan(
      boltTicks.length,
    );
  });

  it("逐跳遞減，而且下一跳是**隨機**抽的（同一個場面、兩顆種子 ⇒ 兩條路徑）", () => {
    cover("do-chain-lightning");
    // 六個敵人排成一列，彼此都在鏈長內 ⇒ 每一跳都有好幾個候選可以抽。
    const line = [1, 1.6, 2.2, 2.8, 3.4, 4];
    const walk = (seed: number): { order: EntityId[]; tally: [number, number][] } => {
      const { world, caster } = rig(line, seed);
      runEffects([chain({ maxSources: 2 })], ctxOf(world, caster));
      advance(world, 24);
      const tally = new Map<number, number>();
      for (const p of world.damageQueue) tally.set(p.amount, (tally.get(p.amount) ?? 0) + 1);
      return {
        order: world.damageQueue.map((p) => p.target),
        tally: [...tally.entries()].sort((a, b) => b[0] - a[0]),
      };
    };

    const a = walk(7);
    // ① 「逐個傷害遞減」—— 2 條鏈 × 3 跳的形狀是 100/50/25 各兩份。
    //    拿掉 `amount *= cast.decay` 的話六筆全是 100，這一條紅。
    expect(a.tally).toEqual([
      [100, 2],
      [50, 2],
      [25, 2],
    ]);
    // ② ⭐ 隨機：取「最近的那一個」是**確定**的，兩顆種子會給出逐字相同的路徑。
    const b = walk(20260820);
    expect(a.order, "下一跳應該是抽的，不是取最近的").not.toEqual(b.order);
  });

  it("尖峰情境：改前（瞬發）vs 改後（逐跳）的每 tick 成本", () => {
    cover("do-chain-lightning");
    const worst = (over: Partial<Extract<EffectDef, { kind: "chainLightning" }>>): EffectDef =>
      chain({ radius: 24, jumpRange: 24, jumps: 24, maxTotalJumps: 480, ...over });

    // ⚠️ 先燒一次 JIT 再量：**第一次呼叫** ~50ms 量到的是「這台機器第一次執行這段
    // 程式」，不是「這個機制多貴」。少了這一行，跑在前面的那一組會揹上冷啟動。
    {
      const w = rig(Array.from({ length: 100 }, (_, i) => 0.3 + i * 0.08));
      runEffects([worst({ jumpIntervalSec: 0 })], ctxOf(w.world, w.caster));
    }

    for (const bodies of [60, 100]) {
      const offsets = Array.from({ length: bodies }, (_, i) => 0.3 + i * 0.08);

      // ── 改前：`jumpIntervalSec: 0` 走的正是舊的「一格 tick 全結算」那條路 ──
      let instant = Infinity;
      let packets = 0;
      for (let k = 0; k < 3; k++) {
        const r = rig(offsets);
        const t0 = process.hrtime.bigint();
        runEffects([worst({ jumpIntervalSec: 0 })], ctxOf(r.world, r.caster));
        const took = Number(process.hrtime.bigint() - t0) / 1e6;
        if (took < instant) instant = took;
        packets = r.world.damageQueue.length;
      }
      // 保險絲：兩個上界都拉到頂也不會超過 maxTotalJumps。
      expect(packets).toBeLessThanOrEqual(480);

      // ── 改後：施放那一格 + 之後每一個到期 tick 的**最大值** ──────────────
      // ⚠️ 報的是**每一個有付款的 tick 的平均**，⛔ 不是那 160 格的最大值：
      // 一段 160 格的迴圈幾乎一定會撞到一次 GC 停頓，於是「最大值」量到的是 GC
      // 不是這個機制（實測同一個情境印過 0.34 / 4.67 / 14.68 三種「最大值」）。
      // 總和是誠實的聚合量，而它正好可以跟「改前」那個一格的數字直接比。
      let cast = Infinity;
      let spent = Infinity;
      let busiest = 0;
      let spread = 0;
      for (let k = 0; k < 3; k++) {
        const r = rig(offsets);
        const t1 = process.hrtime.bigint();
        runEffects([worst({})], ctxOf(r.world, r.caster));
        const took1 = Number(process.hrtime.bigint() - t1) / 1e6;
        if (took1 < cast) cast = took1;
        let sum = 0;
        let active = 0;
        for (let i = 0; i < 160; i++) {
          const before = r.world.damageQueue.length;
          const t2 = process.hrtime.bigint();
          chainLightningSystem(r.world);
          sum += Number(process.hrtime.bigint() - t2) / 1e6;
          const paid = r.world.damageQueue.length - before;
          if (paid > 0) active++;
          if (paid > busiest) busiest = paid;
          r.world.tick++;
        }
        if (sum / Math.max(1, active) < spent) spent = sum / Math.max(1, active);
        spread = r.world.damageQueue.length;
      }
      expect(spread, "逐跳與瞬發的總傷害筆數必須一樣").toBe(packets);
      // 量到的數字（不是推的）印出來；⛔ 不斷言毫秒數 —— 那是機器性能不是機制。
      // eslint-disable-next-line no-console
      console.log(
        `[chainLightning] ${bodies} 身體 / ${packets} 筆傷害 · ` +
          `改前(瞬發) 一格 ${instant.toFixed(2)}ms · ` +
          `改後 施放 ${cast.toFixed(2)}ms + 有付款的 tick 平均 ${spent.toFixed(3)}ms ` +
          `(單格最多 ${busiest} 發)`,
      );
    }
  });
});
