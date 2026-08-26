/**
 * ⭐【非等向縮放】`spawnModelFx.scaleAxis` 的承重守衛（GH#702）。
 *
 * @visual-proof
 *
 * ── 為什麼這一條存在（量到的，⛔ 不是感想）────────────────────────────────
 * owner 2026-08-25：「你已經知道是**單個大型光束並非間距排列**，是哪裡走歪讓你
 * 又把約束勝利之劍等光束砲家族又變成間距排列？」
 *
 * 把 `count` 修回 1 之後剩下的問題是**形狀**：出貨的
 * `content/assets/models/imported/revivehuman.glb` 包圍盒是
 * **10.751 × 16.757 × 10.751**（長寬比 **1.56 : 1**），而 `modelFxRig` 在 2026-08-26
 * 之前只有 `root.scaling.setAll(...)` ⇒ 等向放大一顆方塊還是一顆方塊。
 * 參考擷圖（`docs/_reference/w3x-shots/saber/`）上那條光束目測 **~10 : 1**。
 * ⇒ 原作那條又長又窄的光帶住在 `.mdx` 的 `PRE2`（粒子）chunk 裡，而
 * `convert_stock_model.py` 只轉 geoset（ReviveHuman / FragDriller / Awaken 三份
 * 實測 `skipped_chunks` 皆含 `PRE2`）—— GGD 只拿得到核心。
 *
 * ⚠️⚠️ ⛔ **這一格引用不到任何一行 JASS**：WC3 的 `SetUnitScale(u,x,y,z)` 只讀
 * 第一個參數，而這一族在 `war3map.j` 寫下的三軸值逐字相同（j:31908 · j:32326 ·
 * j:32328 · j:47758）⇒ 原作是**等向**的。它是一個**演出決定**，出處是 owner
 * 2026-08-23「這四個經典總是要看到**橫放的光束砲**吧」＋ 上面那個量到的缺口。
 *
 * ── 它驗的是「玩家看得到的形狀」，⛔ 不是「有沒有呼叫 set」──────────────────
 * NullEngine 畫不出像素，所以終點量的是**出貨場景樹上的世界座標**：把一具
 * 已知尺寸的替身掛在真的 `axis` 節點底下，量它在**行進方向**與**橫向**上的
 * 世界跨距。⇒ 「這道光束在畫面上是不是細長的」被翻成一個靜態可判的不變量。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · ⭐ 承重線 —— `modelFxRig.ts` 把 `root.scaling.set(s*ax[0], s*ax[1], s*ax[2])`
 *    改回 `root.scaling.setAll(s)`（＝撤銷整個機制）
 *      → 紅：「⛔ 光束沒有被拉長：沿行進軸 X.XX vs 橫向 X.XX（比值 1.00）」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { zEffectDef } from "@ggd/shared/content/schema/effects/index";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { VfxSystem } from "../vfx/VfxSystem";
import { modelFxDocFor } from "./modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

/** ⭐ 長軸沿 **+Y** 的替身 —— 與 `w3x.stock.revivehuman` 的 `fxLongAxis:"y"` 同一根。 */
const PROXY = { width: 1, height: 4, depth: 1 };

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 真鏈：真 Zod → 真 sim → 真 VfxSystem → 出貨場景樹。回傳 (axis 節點, 行進單位向量)。 */
function renderNode(node: Record<string, unknown>): {
  scene: Scene;
  vfx: VfxSystem;
  axis: TransformNode;
  dir: { x: number; z: number };
} {
  const def = zEffectDef.parse(node);
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: "godie-ogrh" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  // 面向刻意**不是**軸對齊 —— 世界跨距要靠投影量，軸對齊會讓錯的實作也過。
  world.transform.get(caster)!.facing = { x: 0.6, z: 0.8 };
  world.step(new Map());
  runEffects([def as EffectDef], {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: "ability:test.scaleaxis",
    rng: world.rng,
  } satisfies EffectContext);
  const ev = world.events.find((e) => e.type === "modelFxSpawn");
  expect(ev, "⛔ 沒有發出 modelFxSpawn").toBeDefined();
  const wire = ev!.data as unknown as ModelFxSpawnEvent;
  const inst = wire.instances[0]!;

  const scene = new Scene(new NullEngine());
  const vfx = new VfxSystem(scene, {
    entityPos: () => null,
    modelDocFor: (k) => modelFxDocFor(Models.tryGet(k)),
    loadModelContainer: () => Promise.resolve(null),
  });
  vfx.handleEvent({ type: "modelFxSpawn", data: wire } as unknown as EventMessage, 0);
  const axis = scene.transformNodes.find((n) => n.name.startsWith("modelfx-axis-"));
  expect(axis, "⛔ 出貨場景樹上沒有 axis 節點 —— 一具模型都沒生出來（失敗形態⑧）").toBeDefined();
  return { scene, vfx, axis: axis!, dir: { x: inst.dx, z: inst.dz } };
}

/** 替身在 `dir` 與其法線上的**世界**跨距（⛔ 不讀 scaling 屬性，讀真的頂點）。 */
function spanAlong(axis: TransformNode, dir: { x: number; z: number }): { along: number; lateral: number } {
  const box = MeshBuilder.CreateBox("proxy", PROXY, axis.getScene());
  box.parent = axis;
  const pos = box.getVerticesData(VertexBuffer.PositionKind)!;
  const m = box.computeWorldMatrix(true);
  const n = { x: -dir.z, z: dir.x };
  let aMin = Infinity, aMax = -Infinity, lMin = Infinity, lMax = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const w = Vector3.TransformCoordinates(new Vector3(pos[i]!, pos[i + 1]!, pos[i + 2]!), m);
    const a = w.x * dir.x + w.z * dir.z;
    const l = w.x * n.x + w.z * n.z;
    if (a < aMin) aMin = a;
    if (a > aMax) aMax = a;
    if (l < lMin) lMin = l;
    if (l > lMax) lMax = l;
  }
  box.dispose();
  return { along: aMax - aMin, lateral: lMax - lMin };
}

describe("spawnModelFx.scaleAxis（GH#702：一道光束，⛔ 不是一顆方塊）", () => {
  const BASE = {
    kind: "spawnModelFx",
    shape: "single",
    path: "static",
    modelKey: "w3x.stock.revivehuman",
    lifeSec: 2,
    scale: 2,
  } as const;

  it("⭐ 承重：第三格沿**行進軸**把模型拉長，橫向一格都不動", () => {
    const flat = renderNode({ ...BASE });
    const s0 = spanAlong(flat.axis, flat.dir);
    flat.vfx.dispose();

    const long = renderNode({ ...BASE, scaleAxis: [1, 1, 4] });
    const s1 = spanAlong(long.axis, long.dir);
    long.vfx.dispose();

    // ⭐ 缺席 ⇒ 等向 ⇒ 與 setAll 逐位元同義（一鍵 rollback 的那一半）。
    expect(s0.along / s0.lateral, "⛔ 沒有 scaleAxis 時就已經不是等向了").toBeCloseTo(
      PROXY.height / PROXY.width,
      5,
    );
    // ⭐ 終點：沿行進軸的世界跨距 ×4，而橫向**逐位元不動**。
    expect(
      s1.along / s0.along,
      `⛔ 光束沒有被拉長：沿行進軸 ${s1.along.toFixed(2)} vs ${s0.along.toFixed(2)}（比值 ${(s1.along / s0.along).toFixed(2)}）`,
    ).toBeCloseTo(4, 5);
    expect(s1.lateral, "⛔ 第三格漏到橫向去了 —— 那是把方塊變大,不是把光束拉長").toBeCloseTo(
      s0.lateral,
      5,
    );
    // ⭐ 讀得成一道光束：長寬比要比參考擷圖的量級（~10:1）同一個數量級。
    expect(s1.along / s1.lateral, "⛔ 拉完還是一顆方塊").toBeGreaterThan(8);
  });

  it("上界／型別在載入時就擋下來（⛔ 不是到了客戶端才靜靜夾掉）", () => {
    expect(zEffectDef.safeParse({ ...BASE, scaleAxis: [1, 1, 9] }).success, "9 > 上界 8").toBe(false);
    expect(zEffectDef.safeParse({ ...BASE, scaleAxis: [1, 1, 0] }).success, "0 = 整具壓成零厚度").toBe(false);
    expect(zEffectDef.safeParse({ ...BASE, scaleAxis: [1, 4] }).success, "少一格").toBe(false);
    expect(zEffectDef.safeParse({ ...BASE, scaleAxis: [1, 1, 4] }).success, "合法的三格要過").toBe(true);
  });
});
