/**
 * 導航路線 —— owner 2026-08-23「地圖路徑還很卡，常常會循環來回拉扯」。
 *
 * ⭐ 這條守衛盯的**機制**是：烘焙表的 next-hop 指向一堵牆的另一邊時，
 * 單位還是要繞過去走到，而且**不可以來回**。
 *
 * ⚠️ 場地是**手搭的**（一堵牆、四個節點、一張刻意壞掉的 `nextHop`），
 * ⛔ 不是讀出貨的 `content/arenas/*.json`：出貨的節點座標是內容，會被編輯器改，
 * 而這條測試要釘的是**演算法**（第二守則「驗機制不驗數字」）。
 * 那張壞掉的表逐字複製 `map/graph.ts::bakeNav` 的缺陷形狀（「最短路上索引最小的
 * 節點」常常就是終點自己）。
 *
 * ⭐ **突變驗證直接寫成第二個 `it`**：把 `losCorrection` 關掉 —— 也就是 owner
 * 要的一鍵 rollback ——單位就走不到。這一格若哪天變成 no-op，第二條會紅。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { applyNavRulesDoc, clearNavRouteCache } from "./navRoute";
import type { ArenaDef, ZoneDef } from "./world/ArenaDef";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

const START = { x: -10, z: 0 };
const GOAL = { x: 10, z: 0 };

/** 一堵從南邊長到 z=8 的牆；唯一的通路在北邊 z ∈ (8, 12)。 */
const ZONE: ZoneDef = {
  id: "navroute-test",
  center: { x: 0, z: 0 },
  boundaryRadius: 26,
  bounds: { kind: "rect", halfW: 20, halfD: 12 },
  obstacles: [{ kind: "box", center: { x: 0, z: -2 }, halfW: 1, halfD: 10 }],
  spawns: [[START], [GOAL]],
  nav: {
    nodes: [START, { x: -10, z: 10 }, { x: 10, z: 10 }, GOAL],
    // ⛔ 每一格都指著**終點節點自己** —— 那正是 bakeNav 的缺陷：從 0 走向 3
    //    的「下一跳」是 3，而 0→3 的直線穿過那堵牆。
    nextHop: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
  },
};
const ARENA: ArenaDef = { id: "navroute-test", name: "navroute", zones: [ZONE] };

function spawnUnit(world: SimWorld): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...START }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 100, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(0), seatId: asSeatId(0) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  return id;
}

/** 走 `ticks` tick，回報方向反轉次數與有沒有走到。 */
function walk(ticks = 400): { reversals: number; arrived: boolean } {
  const world = new SimWorld(ARENA, 1);
  const id = spawnUnit(world);
  const intents: Map<SeatId, IntentFrame> = new Map([
    [asSeatId(0), { order: { kind: "move" as const, point: GOAL }, commands: [] }],
  ]);
  world.step(intents);
  let prev: V.Vec2 | null = null;
  let reversals = 0;
  for (let k = 0; k < ticks; k++) {
    world.step(new Map());
    const t = world.transform.get(id)!;
    const sp = V.len(t.vel);
    if (sp > 1e-3) {
      const d = { x: t.vel.x / sp, z: t.vel.z / sp };
      // ⭐ 「循環來回拉扯」量化成這一行：這一 tick 的移動方向和上一 tick **反向**。
      if (prev && V.dot(prev, d) < 0) reversals++;
      prev = d;
    }
    if (V.len(V.sub(GOAL, t.pos)) < 1) return { reversals, arrived: true };
  }
  return { reversals, arrived: false };
}

describe("導航路線的執行期修正 (owner 2026-08-23)", () => {
  it("next-hop 指向牆後面時，單位繞得過去而且**不來回**", () => {
    cover("nav-route-los");
    applyNavRulesDoc(null);
    clearNavRouteCache();
    const r = walk();
    expect(r.arrived, "繞不過那堵牆 —— 這就是 owner 說的「卡住」").toBe(true);
    // 上界是 0：這條路線只有一個轉角，⛔ 沒有任何理由需要往回走一步。
    expect(r.reversals, "方向反轉 = 「循環來回拉扯」").toBe(0);
  });

  it("⭐ 突變／rollback：關掉 losCorrection 就走不到 —— 這一格不是 no-op", () => {
    cover("nav-route-los");
    applyNavRulesDoc({ mapNav: { losCorrection: false } });
    clearNavRouteCache();
    expect(walk().arrived).toBe(false);
    applyNavRulesDoc(null); // ⚠️ 現值是模組級的：⛔ 不還原會汙染同檔的其他測試
    clearNavRouteCache();
  });
});
