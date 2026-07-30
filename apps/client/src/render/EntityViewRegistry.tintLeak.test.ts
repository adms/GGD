/**
 * #262 —— 「洩漏的粒子/mesh 回收」的第一條:**成長階級的 tint clone 材質**。
 *
 * owner 的症狀是「越打越鈍」「一場就很燙」。單調成長的成本才會長成那個樣子,
 * 固定成本(LOD、FPS 上限)不會。這個檔案量的就是單調成長。
 *
 * ⚠️ 斷言讀的是 `scene.materials.length` —— **Babylon 場景上真的還在的物件數**,
 * 不是這個 class 自己的任何計數器(第⑦種故障:掃屬性代替掃行為)。
 * `releaseModelTint` 把材質還回去之後 `Material.dispose()` 會把自己從
 * `scene.materials` 移掉,所以這個數字就是「每一張 frame 的材質表有多長」。
 *
 * 修之前實測(同一支 harness,10 具身體 × 6 回合):
 *   30 → 60 → 90 → 120 → 150 → 180,完美線性,而且 `registry.dispose()`
 *   之後仍然是 180。
 *
 * 成因(不是理論,是 `retireChampion` 的那一行條件):
 *   `if (this.tinted.get(id)?.tint) releaseModelTint(view.root)`
 *   —— clone 不是只有「有 w3x 顏色」才會產生。`applyTint` 走的是
 *   `composeGrowth(tint, tier)`,只要成長階級 > 0(#244 黑泥吞噬,殭屍每一場
 *   都在餵),`tint === null` 的英雄一樣被 clone 一輪材質。113 位裡 93 位就是
 *   `tint === null`,於是那一群的 clone 從來沒有被歸還過。
 *
 * 突變驗證:把 `retireChampion` 的 `releaseModelTint(view.root)` 改回舊的
 * `if (this.tinted.get(id)?.tint) releaseModelTint(view.root)`,第一條測試
 * 立刻紅(180 !== 0)。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

function body(id: number, flags: number): EntityViewState {
  return {
    id,
    kind: 0,
    seatId: 0,
    key: "champ.sela",
    teamId: 1,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive: true,
    flags,
  };
}

/**
 * 出貨路徑的 tint 解析器。回 `null` = 「這個英雄查過了,他沒有 w3x 顏色」——
 * 113 位裡的 93 位。回 `undefined` 才是「還不知道」(applyTint 會重試)。
 * 這個區別就是缺陷所在,所以 harness 必須忠實地回 null。
 */
function registryWithUntintedRoster(): EntityViewRegistry {
  const reg = new EntityViewRegistry(scene, new AssetManager(scene));
  (reg as unknown as { content: { championTintFor?: () => null } }).content.championTintFor =
    () => null;
  return reg;
}

/** 一個回合:10 具身體出生 → 吃到 tier 2 → 全部離場(id 每回合都是新的)。 */
function playRound(reg: EntityViewRegistry, round: number, startMs: number): number {
  let now = startMs;
  const ids = Array.from({ length: 10 }, (_, i) => round * 1000 + i);
  const at = (flags: number): EntityViewState[] => ids.map((id) => body(id, flags));
  for (const flags of [0, ENTITY_FLAG.MUD_SWELL, ENTITY_FLAG.MUD_BOSS]) {
    reg.sync({ entities: at(flags), poseFor: passthrough, nowMs: now, dtMs: 16, loadModels: false });
    now += 16;
  }
  reg.sync({ entities: [], poseFor: passthrough, nowMs: now, dtMs: 16, loadModels: false });
  return now + 16;
}

describe("成長階級的 tint clone 材質在角色退場時被歸還 (vfx-leak-reclaim)", () => {
  it("六回合之後 scene.materials 回到基線 —— 不是「比第一回合低」,是歸零", () => {
    cover("vfx-leak-reclaim");
    const reg = registryWithUntintedRoster();
    const baseline = scene.materials.length;
    let now = 0;
    const residual: number[] = [];
    for (let round = 1; round <= 6; round++) {
      now = playRound(reg, round, now);
      residual.push(scene.materials.length);
    }
    // 每一回合結束後場上都不該留下任何材質。修之前這裡是 30/60/90/120/150/180。
    expect(residual).toEqual([baseline, baseline, baseline, baseline, baseline, baseline]);
    reg.dispose();
    expect(scene.materials.length).toBe(baseline);
  });

  it("不是「都沒畫」的空話 —— 活著的時候材質確實存在", () => {
    cover("vfx-leak-reclaim");
    const reg = registryWithUntintedRoster();
    const baseline = scene.materials.length;
    reg.sync({
      entities: [body(1, ENTITY_FLAG.MUD_BOSS)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    // 一具身體在場 → clone 材質真的被建出來了(否則上面那條「歸零」毫無意義)
    const live = scene.materials.length;
    expect(live).toBeGreaterThan(baseline);
    reg.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(scene.materials.length).toBe(baseline);
    reg.dispose();
  });

  it("有 w3x 顏色的英雄也一樣歸零 —— 修這個沒有把原本會過的那條弄壞", () => {
    cover("vfx-leak-reclaim");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    (reg as unknown as {
      content: { championTintFor?: () => { tint: [number, number, number] } };
    }).content.championTintFor = () => ({ tint: [0.8, 0.2, 0.2] });
    const baseline = scene.materials.length;
    reg.sync({ entities: [body(7, 0)], poseFor: passthrough, nowMs: 0, dtMs: 16, loadModels: false });
    expect(scene.materials.length).toBeGreaterThan(baseline);
    reg.sync({ entities: [], poseFor: passthrough, nowMs: 16, dtMs: 16, loadModels: false });
    expect(scene.materials.length).toBe(baseline);
    reg.dispose();
  });
});
