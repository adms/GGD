/**
 * #394 owner「**32支投射物 請接上正確的特效**」—— 飛行姿態真的到得了畫面嗎。
 *
 * ===========================================================================
 * 動手前量到的缺陷（這條測試就是它的守衛）
 * ===========================================================================
 * 2026-08-19，數 git HEAD（⛔ 不是工作區）：**32 支技能 + 3 張增益卡**用
 * `spawnProjectile`，一共只指向 **15 個** `projectileId`（出貨 20 份
 * `projectile@1`）。它們的 vfx 文件**可以**填 `orient`（#366/#377/#379），而
 * 飛行段**一格都不讀** —— `orient` 只被 `vfx/particleFactory.toParticleSystem`
 * 消費，`ProjectileView` 是自己 `new ParticleSystem` 的。於是一道 `pierce: true`
 * 的貫穿波和一發平砍在畫面上是**同一支頭朝前的飛鏢**（`setPose` 只寫 `rotation.y`）。
 *
 * ⭐ **姿態掛在 15 個彈道上、⛔ 不是 32 支技能上**，因為「這一顆飛彈長什麼樣」是
 * 飛彈的性質不是技能的性質（第零守則⑨：N 個同型 = K 個模板 + 一張表）。
 * 32 → 15 的收斂是內容本來就有的：`imported.wave.*` / `imported.bolt.*` 就是那張表。
 *
 * ===========================================================================
 * 為什麼斷言讀 Babylon 手上那顆 `TransformNode`
 * ===========================================================================
 * 這修的是第②號故障（算出來但沒送到）。一條「`resolveProjectileFlight` 回傳
 * 90°」的測試，在 `setPose` 那三行被刪掉之後照樣全綠。
 *
 * ===========================================================================
 * 突變驗證（每一條都真的跑過）
 * ===========================================================================
 *   · `setPose` 的 `+ f.yawOffset` / `rotation.x = -f.pitch` / roll 三行拿掉
 *     （＝把整個修法從渲染樹撤銷）→ 「姿態真的寫進 Babylon」紅。
 *   · `EntityViewRegistry` 的 `projectileFlightFor?.(e.key)` 改成 `null`
 *     （＝view 層對了但註冊表沒送 —— 第⑤號故障的形狀）→ 「註冊表真的把
 *     flight 送到 view」紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { zProjectileDoc, type ProjectileDoc } from "@ggd/shared/content/schema/projectile";
import { Projectiles } from "@ggd/shared/sim/content/registry";
import type { ProjectileId } from "@ggd/shared/ids";
import { ProjectileView } from "./ProjectileView";
import { EntityViewRegistry } from "../EntityViewRegistry";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const DEG = Math.PI / 180;

/** 出貨的 `projectile@1`，過**出貨的 Zod**（⛔ 不手寫夾具 —— 第⑤號故障）。 */
function shipped(): ProjectileDoc[] {
  const dir = root("content/projectiles");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => zProjectileDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

let engine: NullEngine;
let scene: Scene;
const SHIPPED = shipped();

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** 沿 +Z 飛 `len` 個世界單位（方位角 0），回傳彈體 pivot 的最終旋轉。 */
function flyNorth(view: ProjectileView, len: number): { x: number; y: number; z: number } {
  view.setPose(0, 0);
  view.setPose(0, len);
  const r = view.bodyPivot.rotation;
  // `+ 0` 把 `-0` 收成 `0` —— `-f.pitch` 在 pitch=0 時給的是 `-0`，而
  // `toEqual` 分得出兩者。這是格式，⛔ 不是要驗的性質。
  return { x: r.x + 0, y: r.y + 0, z: r.z + 0 };
}

describe("#394 投射物的飛行姿態真的到得了畫面 (projectile-flight-orient)", () => {
  it("前提：出貨內容真的有分姿態（側身 / 抬頭 / 自轉都各有人用）", () => {
    // 這條守「下面那些不是恆真」。哪天姿態表被清空，先紅的是它，而且訊息說得清楚。
    const f = SHIPPED.map((d) => d.flight).filter((x): x is NonNullable<typeof x> => !!x);
    expect(f.some((x) => x.yawOffsetDeg), "沒有任何一發是側身的 —— 貫穿波仍是飛鏢").toBeTruthy();
    expect(f.some((x) => x.pitchDeg), "沒有任何一發是抬頭的").toBeTruthy();
    expect(f.some((x) => x.rollDegPerUnit), "沒有任何一發會自轉").toBeTruthy();
    // 自轉只在**非旋轉對稱**的彈體上看得見（第一·五守則：不放空宣稱）
    for (const d of SHIPPED) {
      if (d.flight?.rollDegPerUnit) {
        expect(d.meshShape, `${d.id} 在旋轉對稱的彈體上宣稱自轉 —— 畫面上不會有事發生`).toBe("shard");
      }
    }
  });

  it("⭐ 姿態真的寫進 Babylon —— yaw 疊在行進方向上、pitch 抬頭、roll 依距離累積", () => {
    const v = new ProjectileView(scene);
    // 沒有姿態的那一發 = 升級前的畫面：鼻朝行進方向、水平、不自轉
    v.activate(null, "bolt", 0.5, null);
    const level = flyNorth(v, 4);
    expect(level).toEqual({ x: 0, y: 0, z: 0 });

    // 側身 90°（貫穿波的新月）
    v.activate(null, "shard", 0.9, { yawOffsetDeg: 90 });
    expect(flyNorth(v, 4).y).toBeCloseTo(90 * DEG, 6);

    // 抬頭 35°（從地面竄出的石刺）。Rx 把鼻子（pivot +Z）往 −Y 倒 ⇒ 負號才是抬頭
    v.activate(null, "shard", 0.9, { pitchDeg: 35 });
    expect(flyNorth(v, 4).x).toBeCloseTo(-35 * DEG, 6);

    // 自轉：**每飛一個單位** 300° ⇒ 飛 4 個單位 = 1200°，而且飛得越遠轉越多
    v.activate(null, "shard", 0.5, { rollDegPerUnit: 300 });
    expect(flyNorth(v, 4).z).toBeCloseTo(1200 * DEG, 6);
    v.activate(null, "shard", 0.5, { rollDegPerUnit: 300 });
    expect(flyNorth(v, 2).z).toBeCloseTo(600 * DEG, 6);

    // 池化重用：上一發的姿態不可以留在下一發身上
    v.activate(null, "bolt", 0.5, null);
    expect(flyNorth(v, 4)).toEqual({ x: 0, y: 0, z: 0 });
    v.dispose();
  });

  it("註冊表真的把 flight 送到 view —— 不是只有 view 自己會用", () => {
    for (const d of SHIPPED) Projectiles.register(d.id as ProjectileId, d as never);
    const reg = new EntityViewRegistry(scene, { load: async () => null } as never, {
      // GameApp 用的同一個運算式（真的 registry），⛔ 不是手寫的表
      projectileFlightFor: (key: string) => Projectiles.tryGet(key as ProjectileId)?.flight ?? null,
    } as never);
    const broadside = SHIPPED.find((d) => d.flight?.yawOffsetDeg)!;
    const yawOf = (key: string, id: number): number => {
      const before = new Set(scene.transformNodes);
      reg.sync({
        entities: [{ id, kind: 1, key, seatId: -1 }],
        poseFor: () => ({ x: 0, z: 0, yaw: 0 }),
        loadModels: false,
      } as never);
      const pivot = scene.transformNodes.find((n) => !before.has(n) && n.name.endsWith("-pivot"));
      expect(pivot, `${key} 沒有讓註冊表生出一個新的彈道 view`).toBeTruthy();
      // 第二幀才有運動差可以算方位（第一幀只記位置）
      reg.sync({
        entities: [{ id, kind: 1, key, seatId: -1 }],
        poseFor: () => ({ x: 0, z: 4, yaw: 0 }),
        loadModels: false,
      } as never);
      return pivot!.rotation.y;
    };
    expect(
      yawOf(broadside.id, 1),
      `${broadside.id} 的側身姿態沒有經過註冊表送到 view`,
    ).toBeCloseTo(broadside.flight!.yawOffsetDeg! * DEG, 6);
    expect(yawOf("basic-attack", 2), "沒有姿態的彈道被憑空轉了一個角度").toBe(0);
  });
});
