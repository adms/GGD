/**
 * ⚡ 65-04 天譴（飛鼠先生 `godie-udea.r`）的**整條出貨鏈**守衛 —— GH#571 / #649。
 *
 * owner 2026-08-24（**第二次**回報）：
 * >「閃電特效**還是沒上線** 連鎖閃電 是在連鎖的對象間拉出閃電
 * >  但我用**飛鼠天譴** 什麼閃電都沒看到」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼既有的三條守衛**全部是綠的**而這一條才問得出玩家看到什麼
 *
 * · `sim/effects/chainLightning.test.ts` —— 手寫一個 `EffectDef` 餵 `runEffects`。
 *   它證明**機制**會跑，⛔ 不證明**出貨的那份技能文件**接得上（失敗形態⑤）。
 * · `vfx/chainLightningArc.test.ts` —— 手寫一份 payload 餵 `handleEvent`。
 *   它證明**客戶端**畫得出來，⛔ 不證明 sim 真的送得出那個形狀（失敗形態⑤）。
 * · `eventFanout` 的白名單 —— 它只證明那個**字串在一個 Set 裡**。
 *
 * ⇒ 三條各自守著一段，而**接縫沒有人守**。這一條把三段接起來跑一次：
 *
 *     出貨 content（`ContentLoader` 讀真的 `content/`）
 *       → 真的 `SimWorld.step()`（⛔ 不手動叫 system）
 *       → 出貨的 `isFannedOutEvent`（⛔ 不是這裡抄一份白名單）
 *       → 出貨的 `VfxSystem.handleEvent` + `update()`（真的 Babylon 場景）
 *       → ⭐ **畫面上真的有一條亮著的弧，而且它連在鏈真的跳過的兩點之間**
 *
 * ⭐ 斷言的是**幾何**，⛔ 不是計數器：讀真的 ribbon 頂點，並要求它落在 sim 真的
 * 送出來的那條線段的端點附近。一條畫在原點、畫在地板下、或畫在別人身上的弧
 * ⇒ 紅。（`ArcBoltFx` 只有 32 條 strip，滿了會搶最舊的 —— 所以「有 mesh」
 * 逐字不等於「這一跳被畫出來」。）
 *
 * ⛔ 一個出貨數值都沒有抄（第二守則）：跳數／傷害／半徑／壽命全部是 owner 每週在調
 * 的東西。這裡只問「這個機制在玩家那一端會不會發生」。
 *
 * 突變紀錄（⭐ 承重的那一條線）：
 *   `VfxSystem.handleEvent` 的 `case "chainLightning"` 裡那一行
 *   `this.strikeArc(...)` 註解掉 → 這一條紅（「畫面上零條亮著的弧」）。
 */
import { describe, it, expect, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "@ggd/shared/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { MONSTER_TEAM } from "@ggd/shared/sim/mobs";
import { asSeatId, asTeamId } from "@ggd/shared/ids";
// ⭐ 出貨的那一份白名單，⛔ 不是這裡抄的一個 Set。
import { isFannedOutEvent } from "../../../game-server/src/net/eventFanout";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 飛鼠先生 —— owner 點名的那一支。 */
const UDEA = "godie-udea";
/** 一條弧的端點要多接近 sim 真的送出來的端點才算「畫在該畫的地方」。 */
const NEAR = 0.75;

type Seg = { x: number; z: number; x2: number; z2: number };

describe("65-04 天譴：出貨內容 → sim → fanout → 客戶端，畫面上真的有一條弧", () => {
  it("玩家那一端看得到連鎖閃電", async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);

    // ── 真的世界：飛鼠 + 一圈敵人（MONSTER_TEAM = 玩家實際在打的那一種身體）──
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const caster = spawnChampion(world, {
      championId: UDEA,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: C.x, z: C.z },
      zone: 0,
      level: 9,
    } as never);
    for (let i = 0; i < 6; i++) {
      spawnChampion(world, {
        championId: "godie-e001",
        seatId: asSeatId(i + 1),
        teamId: MONSTER_TEAM,
        pos: { x: C.x + 1.5 + i, z: C.z + (i % 2 ? 1 : -1) },
        zone: 0,
        level: 9,
      } as never);
    }
    world.rebuildGrid();
    world.abilities.get(caster)!.slots.R.rank = 1;
    // `castType: "dash"` ⇒ 客戶端的 `resolveCastTarget` 送的是 `dir`（AimResolver）。
    expect(castAbility(world, caster, "R", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");

    // ── 真的客戶端 ────────────────────────────────────────────────────────
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = new VfxSystem(scene, { entityPos: () => null });

    let fannedOut = 0;
    let framesWithArcOnAChain = 0;
    let nowMs = 1000;

    try {
      for (let tick = 0; tick < 90; tick++) {
        world.step(new Map());
        // 這一 tick 真的跳過的線段 —— 弧必須畫在它們之間。
        const segs: Seg[] = [];
        for (const ev of world.events) {
          if (!isFannedOutEvent(ev)) continue; // ⭐ 出貨的閘
          if (ev.type === "chainLightning") {
            fannedOut++;
            for (const s of (ev.data.segments ?? []) as Seg[]) segs.push(s);
          }
          // MatchRoom.deliverSimEvent 送的就是這三格，⛔ 沒有投影、沒有改名。
          fx.handleEvent({ type: ev.type, tick: ev.tick, data: ev.data } as never, nowMs);
        }
        nowMs += 1000 / 30; // 一個 sim tick
        fx.update(nowMs); // 亮度推進 + 壽命回收

        if (segs.length === 0) continue;
        // ⭐ 讀真的頂點：有沒有一條**亮著的**弧，兩端都貼在某一段真的跳躍上。
        for (const m of scene.meshes) {
          if (!m.name.startsWith("vfx-arc") || !m.isEnabled() || !m.isVisible) continue;
          const mat = m.material as unknown as { alpha?: number } | null;
          if (!mat || !(mat.alpha! > 0)) continue; // alpha 0 = 玩家看不到
          const p = m.getVerticesData(VertexBuffer.PositionKind);
          if (!p || p.length === 0) continue;
          const near = (x: number, z: number, tx: number, tz: number): boolean =>
            Math.hypot(x - tx, z - tz) <= NEAR;
          const onSomeChain = segs.some((s) => {
            let hitFrom = false;
            let hitTo = false;
            for (let i = 0; i < p.length; i += 3) {
              if (near(p[i]!, p[i + 2]!, s.x, s.z)) hitFrom = true;
              if (near(p[i]!, p[i + 2]!, s.x2, s.z2)) hitTo = true;
            }
            return hitFrom && hitTo;
          });
          if (onSomeChain) {
            framesWithArcOnAChain++;
            break;
          }
        }
      }
    } finally {
      fx.dispose();
      scene.dispose();
      engine.dispose();
    }

    // ① sim 真的把這個機制送上線（⛔ 不是「白名單裡有這個字串」）。
    expect(fannedOut).toBeGreaterThan(0);
    // ② ⭐ 承重：玩家的畫面上真的出現過一條連在兩個連鎖對象之間的弧。
    expect(framesWithArcOnAChain).toBeGreaterThan(0);
  }, 60000);
});
