/**
 * 📏【光束砲家族】**畫面上的長度 ≈ 卡面上的射程**（GH#767 · GH#721）。
 *
 * @visual-proof `docs/_reports/beamshape_visual-proof_20260827-0600/`（HEAD=1ec4d916）
 *
 * ── 為什麼既有的兩條閘都蓋不到這一格 ──────────────────────────────────────
 * · `modelFxScaleAxis.test.ts` 驗的是**比值**（沿行進軸 vs 橫向 ⇒ 「不是方塊」）。
 *   ⛔ 它對 `scaleAxis:[1,1,8]` 一樣是綠的 —— 一道打得到 8 單位、卻畫了 36 單位的光束，
 *   在那條閘上長得跟正確的一模一樣。
 * · `fxLongAxisVisibleGeometry.test.ts` 驗的是**模型自己**（宣告的長軸由可見幾何撐出來）。
 *   ⛔ 它不知道這一具模型被哪一支技能用、也不知道那支技能打得到多遠。
 * ⇒ 兩條都在問**名詞**；這一條問的是**關係**：`模型 × doc.scale × 節點 scale × scaleAxis`
 *   這條乘法鏈的終點，要落在這支技能自己宣告的傷害距離上。
 *
 * ── 這個不變量是量出來的，⛔ 不是我挑的門檻（2026-08-27，HEAD=1ec4d916）───────
 * 出貨的 9 個 `tpl-beam-roll` 節點，`渲染長度 ÷ 宣告射程` 逐支：
 *   20-03 ×2 **1.000**（13.99 / 14）· 59-04 **1.000**（8.25 / 8.25）· 90-04 ×2 **0.999**
 *   · 08-03 ×2 **1.001**（12.01 / 12）· 09-04 ×2 **1.002**
 * ⇒ 全家族**已經**對齊到 0.2% 以內。那不是巧合 —— `tpl-beam-roll` 的 description 逐字
 *   把它寫成選 `scaleAxis` 的理由（「渲染長度 ≈ 這一支自己打得到的距離」），
 *   ⛔ 但在此之前**沒有任何東西**在守它。第一·五守則：卡面與畫面互相說謊 = 缺陷。
 *
 * ── 突變紀錄（一批一條，最承重的那一行）────────────────────────────────────
 *  · `modelFxRig.ts` 的 `root.scaling.set(s*ax[0], s*ax[1], s*ax[2])` 改回
 *    `root.scaling.setAll(s)`（＝撤銷 `scaleAxis`）
 *      → 本檔紅：9 個節點的比值同時掉到 **0.28–0.37**，訊息逐支指名技能與兩個數字。
 *    ⚠️ 與 `modelFxScaleAxis` 同一行，⛔ 但**不是**同一個宣稱：那一條說「有被拉長」，
 *      這一條說「**拉到對的長度**」。sentinel（下面第一條）證明後者不是前者的同義詞。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
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
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { VfxSystem } from "../vfx/VfxSystem";
import { modelFxDocFor } from "./modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 畫面長度允許離宣告射程多遠。出貨實測全在 ±0.2% 內 ⇒ ±30% 是**很鬆**的柵欄。 */
const TOLERANCE = 0.3;

type Node = Record<string, unknown>;

// ── .glb 的 rest-pose 包圍盒（⛔ 不掃字串，逐位元解 glTF JSON chunk）───────────
type Gltf = {
  meshes?: { primitives?: { attributes?: Record<string, number> }[] }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; scale?: number[] }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  accessors?: { min?: number[]; max?: number[] }[];
};

function boxExtents(rel: string): [number, number, number] {
  const buf = readFileSync(join(CONTENT, rel));
  let off = 12;
  let g: Gltf = {};
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) g = JSON.parse(buf.subarray(off, off + len).toString("utf8")) as Gltf;
    off += len;
  }
  const nodes = g.nodes ?? [];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const visit = (idx: number, o0: number[], s0: number[]): void => {
    const n = nodes[idx];
    if (!n) return;
    const t = n.matrix ? [n.matrix[12] ?? 0, n.matrix[13] ?? 0, n.matrix[14] ?? 0] : (n.translation ?? [0, 0, 0]);
    const s = n.scale ?? [1, 1, 1];
    const o = [0, 1, 2].map((k) => o0[k]! + (t[k] ?? 0) * s0[k]!);
    const sc = [0, 1, 2].map((k) => s0[k]! * (s[k] ?? 1));
    if (n.mesh !== undefined)
      for (const prim of g.meshes?.[n.mesh]?.primitives ?? []) {
        const acc = g.accessors?.[prim.attributes?.["POSITION"] ?? -1];
        if (!acc?.min || !acc.max) continue;
        for (const k of [0, 1, 2]) {
          lo[k] = Math.min(lo[k]!, o[k]! + acc.min[k]! * sc[k]!, o[k]! + acc.max[k]! * sc[k]!);
          hi[k] = Math.max(hi[k]!, o[k]! + acc.min[k]! * sc[k]!, o[k]! + acc.max[k]! * sc[k]!);
        }
      }
    for (const c of n.children ?? []) visit(c, o, sc);
  };
  for (const r of g.scenes?.[g.scene ?? 0]?.nodes ?? nodes.map((_, i) => i)) visit(r, [0, 0, 0], [1, 1, 1]);
  return [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
}

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 真鏈：出貨節點 → 真 sim → 真 VfxSystem → 真 modelFxRig → **世界跨距**（⛔ 不讀 scaling 屬性）。 */
function renderedLength(node: Node): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: "godie-ogrh" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  // ⚠️ 面向刻意不軸對齊 —— 軸對齊會讓「把長度算到錯的軸上」的實作也過。
  world.transform.get(caster)!.facing = { x: 0.6, z: 0.8 };
  world.step(new Map());
  runEffects([node as unknown as EffectDef], {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: "ability:test.beamreach",
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
  const axis = scene.transformNodes.find((n) => n.name.startsWith("modelfx-axis-")) as TransformNode | undefined;
  expect(axis, "⛔ 出貨場景樹上沒有 axis 節點 —— 一具模型都沒生出來（失敗形態⑧）").toBeDefined();

  // 替身 = 這一份 .glb 真的包圍盒（⛔ 不是一顆假想的單位方塊）。
  const doc = Models.tryGet(String(node["modelKey"]))!;
  const [ex, ey, ez] = boxExtents((doc as { glbPath: string }).glbPath);
  const box = MeshBuilder.CreateBox("proxy", { width: ex, height: ey, depth: ez }, scene);
  box.parent = axis!;
  const pos = box.getVerticesData(VertexBuffer.PositionKind)!;
  const m = box.computeWorldMatrix(true);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const w = Vector3.TransformCoordinates(new Vector3(pos[i]!, pos[i + 1]!, pos[i + 2]!), m);
    const a = w.x * inst.dx + w.z * inst.dz;
    if (a < min) min = a;
    if (a > max) max = a;
  }
  vfx.dispose();
  return max - min;
}

/** 這支技能自己宣告打得到多遠：有傷害線就用線長，否則用 `range`。 */
function declaredReach(ability: Record<string, unknown>): number | undefined {
  let line: number | undefined;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return void o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    if (r["kind"] === "damageLine" && typeof r["length"] === "number") line ??= r["length"];
    Object.values(r).forEach(walk);
  };
  walk(ability["effects"]);
  return line ?? (typeof ability["range"] === "number" ? ability["range"] : undefined);
}

/** 出貨的每一個 `tpl-beam-roll` 節點（preset 已在載入時展開 ⇒ 這裡讀到的就是玩家吃到的）。 */
function shippedBeamNodes(): { id: string; name: string; node: Node; reach: number }[] {
  const out: { id: string; name: string; node: Node; reach: number }[] = [];
  for (const a of Abilities.all() as unknown as Record<string, unknown>[]) {
    const reach = declaredReach(a);
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return void o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const r = o as Record<string, unknown>;
      if (r["kind"] === "spawnModelFx" && r["preset"] === "tpl-beam-roll" && r["scaleAxis"] !== undefined && reach)
        out.push({ id: String(a["id"]), name: String(a["name"] ?? ""), node: r, reach });
      Object.values(r).forEach(walk);
    };
    walk(a["effects"]);
  }
  return out;
}

describe("光束砲：畫面長度 ≈ 卡面射程（GH#767 · 第一·五守則）", () => {
  it("★ sentinel：拿掉 scaleAxis 的同一個節點**一定要**被抓到（⛔ 這條閘不可以是空的）", () => {
    const one = shippedBeamNodes()[0];
    expect(one, "⛔ 出貨內容裡一個 tpl-beam-roll 節點都找不到 —— 這條閘的母體是空的").toBeDefined();
    const flat = renderedLength({ ...one!.node, scaleAxis: undefined }) / one!.reach;
    expect(
      Math.abs(flat - 1) > TOLERANCE,
      `⛔ 量尺壞了：拿掉 scaleAxis 之後比值仍是 ${flat.toFixed(3)} —— 它分不出「有拉長」與「沒拉長」`,
    ).toBe(true);
  });

  it("⭐ 承重：出貨的每一個光束砲節點，渲染長度都落在宣告射程的 ±30% 內", () => {
    const bad: string[] = [];
    for (const b of shippedBeamNodes()) {
      const ratio = renderedLength(b.node) / b.reach;
      if (Math.abs(ratio - 1) > TOLERANCE)
        bad.push(
          `${b.id}（${b.name}）· 模型 ${String(b.node["modelKey"])}：` +
            `畫面 ${(ratio * b.reach).toFixed(2)} vs 卡面 ${b.reach} ⇒ 比值 ${ratio.toFixed(3)}`,
        );
    }
    expect(
      bad,
      "⛔ 這幾支技能的光束畫得比它打得到的距離長/短太多 —— 卡面與畫面互相說謊：\n  " + bad.join("\n  "),
    ).toEqual([]);
  });
});
