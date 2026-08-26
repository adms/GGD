/**
 * ⭐ GH#718 —— 門開了，**玩家真的看得到門後面的人**。 @visual-proof
 *
 * ⚠️ 缺陷的形狀：`occlusionZone.ts` 寫死 `activeObstacles(zone.obstacles, undefined, 0)`
 * ⇒ `schedule === undefined` 時 `activeObstacles` **原樣回傳**
 * ⇒ 門在遮蔽上**永遠算關著**。tsc 綠、既有守衛全綠（失敗形態⑧）。
 *
 * ⭐ **終點是畫面，⛔ 不是 `blocked()` 回什麼。** 所以這一支跑的是**真的消費端**：
 * 出貨的 `content/arenas/` 文件 → `arenaDefFromDoc` → 出貨的 `occludeArgsFor`
 * → 出貨的 `EntityViewRegistry.sync`（NullEngine）→ 讀那具身體的 `isEnabled()`。
 * ⛔ 中間任何一段自造 payload 都是失敗形態⑤（測的不是出貨的那個）。
 *
 * ⭐ **兩個方向**（⛔ 只驗一邊＝失敗形態④）：門關 ⇒ 看不到；門開 ⇒ 看得到。
 * 而且 tick 從出貨排程推導，⛔ 零字面 tick、零字面座標。
 *
 * ── 突變（2026-08-27）：`occlusionZone.ts` 的 `gateScheduleOf({ zones })`
 *    改回 `undefined` → 「門開著」那一條紅（那具身體仍然 `isEnabled() === false`）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { arenaDefFromDoc, type ObstacleBox } from "@ggd/shared/sim/world/ArenaDef";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { closedGatesAt, gateScheduleOf } from "@ggd/shared/sim/map/gates";
import { DEFAULT_VISION_RULES } from "@ggd/shared/sim/vision";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";
import { occludeArgsFor } from "./occlusionZone";

const ARENA = arenaDefFromDoc(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../content/arenas/arena.infinity-castle.json", import.meta.url)),
      "utf8",
    ),
  ) as Parameters<typeof arenaDefFromDoc>[0],
);
const ZONE = ARENA.zones[0]!;
const SCHED = gateScheduleOf(ARENA)!;
/** 第一道門（`gateGroup` 有值的障礙物）—— ⛔ 不寫死是哪一道。 */
const DOOR = ZONE.obstacles.find(
  (o): o is ObstacleBox => o.kind === "box" && o.gateGroup !== undefined,
)!;
/** 每個組態的起始 tick ⇒ 一定同時存在「這道門關著」與「開著」的那一刻。 */
const TICKS = SCHED.configurations.map((_, i) => i * SCHED.periodTicks);
const CLOSED = TICKS.find((t) => closedGatesAt(SCHED, t).includes(DOOR.gateGroup!))!;
const OPEN = TICKS.find((t) => !closedGatesAt(SCHED, t).includes(DOOR.gateGroup!))!;

/** 隔著門對站的兩點 —— 挑「兩端都不在實心牆裡」的那條軸（門兩側夾著牆）。 */
function acrossGate(): [Vec2, Vec2] {
  const gap = 2;
  const alongX: [Vec2, Vec2] = [
    { x: DOOR.center.x - DOOR.halfW - gap, z: DOOR.center.z },
    { x: DOOR.center.x + DOOR.halfW + gap, z: DOOR.center.z },
  ];
  const alongZ: [Vec2, Vec2] = [
    { x: DOOR.center.x, z: DOOR.center.z - DOOR.halfD - gap },
    { x: DOOR.center.x, z: DOOR.center.z + DOOR.halfD + gap },
  ];
  const inWall = (p: Vec2): boolean =>
    ZONE.obstacles.some(
      (o) =>
        o.kind === "box" &&
        o.gateGroup === undefined &&
        Math.abs(p.x - o.center.x) <= o.halfW &&
        Math.abs(p.z - o.center.z) <= o.halfD,
    );
  return alongX.some(inWall) ? alongZ : alongX;
}

const [EYE, FOE] = acrossGate();
/** ⭐ 遮蔽是 `fullVision` 關掉之後的行為（出貨預設全視野，owner 2026-08-23）。 */
const OCCLUDING = { ...DEFAULT_VISION_RULES, fullVision: false };

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** 敵方英雄站在門的另一邊 —— `friendly`/`isLocal` 都不是 true，所以它會被遮。 */
const FOE_ENTITY: EntityViewState = {
  id: 1,
  kind: 0,
  seatId: 0,
  key: "champ.sela",
  teamId: 1,
  x: FOE.x,
  z: FOE.z,
  fx: 1,
  fz: 0,
  alive: true,
};

/** 出貨的渲染登錄表在這一 tick 之後，那具身體是不是**畫在畫面上**。 */
function foeIsVisibleAt(tick: number): boolean {
  const registry = new EntityViewRegistry(scene, new AssetManager(scene));
  try {
    registry.sync({
      entities: [FOE_ENTITY],
      poseFor: (e) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz }),
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
      occlude: occludeArgsFor(ARENA.zones, 0, EYE, tick, OCCLUDING),
    });
    return registry.getChampionView(1)!.root.isEnabled();
  } finally {
    registry.dispose();
  }
}

describe("GH#718 門的開關要傳到視野遮蔽", () => {
  it(`⭐ 門**關著**的 tick（${CLOSED}）⇒ 門後的敵人不畫`, () => {
    expect(foeIsVisibleAt(CLOSED), `${DOOR.gateGroup} 關著卻還看得到門後的人`).toBe(false);
  });

  it(`⛔ 門**開著**的 tick（${OPEN}）⇒ 看得到 —— 這就是寫死 \`undefined, 0\` 吃掉的那一半`, () => {
    expect(foeIsVisibleAt(OPEN), `${DOOR.gateGroup} 開著卻還在遮 —— 門的狀態沒接進來`).toBe(true);
  });

  it("⭐ AC3：沒有 gateGroup 的牆兩個 tick 都擋（既有場地逐位元不變）", () => {
    const wall = ZONE.obstacles.find(
      (o): o is ObstacleBox => o.kind === "box" && o.gateGroup === undefined && o.halfD > o.halfW,
    )!;
    const eye = { x: wall.center.x - wall.halfW - 2, z: wall.center.z };
    const foe = { x: wall.center.x + wall.halfW + 2, z: wall.center.z };
    for (const t of [CLOSED, OPEN]) {
      expect(occludeArgsFor(ARENA.zones, 0, eye, t, OCCLUDING)!.blocked(foe.x, foe.z), `tick ${t}`).toBe(
        true,
      );
    }
  });
});
