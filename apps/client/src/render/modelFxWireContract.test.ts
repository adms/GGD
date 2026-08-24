/**
 * ⛔⛔ GH#606 / GH#607 —— **sim 送的酬載，客戶端真的畫得出來，而且擺得對**。
 *
 * ── 為什麼舊守衛是綠的（兩次）──────────────────────────────────────────────
 * ① #606 之前：`modelFxRig.test.ts` 跑的是**它自己造的** `ModelFxMotionSpec`，
 *    而出貨路徑送的是 `{ caster, modelKey, instances, … }`（失敗形態⑤）。
 * ② ⭐ #607 之前：**這一支自己**注入了 `resolveModel: () => ({ glbPath: "x.glb" })`
 *    —— 一份測試手寫的模型文件。於是「出貨的 `modelDocFor` 把 `fxLongAxis` /
 *    `fxSpawnHeight` 挑掉了」在這裡**不可能被看見**：被測的還是不是出貨的那個。
 *    量到的後果：owner 逐字要的「**90 度橫放的 beam**」從第一天起就沒有生效過。
 *
 * ⇒ 這一條**整條線都用出貨的東西**：出貨內容 → 出貨技能 → 真的 `modelFxSpawn`
 *   → **出貨的 `modelDocFor` 接縫**（`modelFxDocFor` ⊕ 出貨的 `Models` 登錄表）
 *   → 真的 `VfxSystem`（⛔ 不是直接戳 rig —— 那會跳過 `VfxContext` 的投影）
 *   → **出貨的場景樹**上量姿態。
 *   ⛔ 一個座標、一個角度、一個出貨數值都不抄（第二守則：驗機制不驗數字）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— 把 `GameApp.ts` 的接縫改回舊寫法
 *    （`{ glbPath: doc.glbPath, scale: doc.scale }`）等價的形狀：在這裡把
 *    `modelFxDocFor(d)` 換成 `{ glbPath: d.glbPath, scale: d.scale }`
 *      → 紅：「⛔ 長軸沒有被擺到行進方向上 —— 這正是 #607 的形狀:
 *        expected 0.00000 to be close to 1」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ContentLoader } from "@ggd/shared/content/loader";
// ⭐ 出貨夾具的檔案樹退路會把 `_index.json`（產物，主 session 統一重生成）先跟
//    真的目錄對帳 —— 09-04 綁的新 model doc 在 sync 之前也載得到。
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { VfxSystem } from "../vfx/VfxSystem";
import { modelFxDocFor } from "./modelFxRig";
import type { ModelFxLongAxis } from "./modelFxPath";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
// 悟空 09-04 龜派氣功 —— owner 2026-08-22 逐字點名的四支經典橫放光束砲之一。
const CASTER = "godie-ogrh" as ChampionId;
const SUBJECT = "godie-ogrh.r";
const LOCAL: Record<ModelFxLongAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 施放出貨的那一支，回傳 sim **真的**送上線的那一則 `modelFxSpawn`。 */
function realWirePayload(): ModelFxSpawnEvent {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const def = Abilities.tryGet(SUBJECT as AbilityId);
  expect(def, `${SUBJECT} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [], origin: `ability:${SUBJECT}`, rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ 施放事件要在下一次 step() **之前**讀（step 第一行清空 events）。
  const ev = world.events.find((e) => e.type === "modelFxSpawn");
  expect(ev, "出貨的龜派氣功沒有發出 modelFxSpawn —— 標本失效了").toBeDefined();
  return ev!.data as unknown as ModelFxSpawnEvent;
}

describe("modelFxSpawn 的線路契約（GH#606 · GH#607）", () => {
  it("出貨接縫餵出貨模型：模型生得出來、沿 sim 的線走、而且長軸躺在行進方向上", () => {
    const wire = realWirePayload();
    const scene = new Scene(new NullEngine());
    // ⭐ **出貨的那一個 `modelDocFor`**（`GameApp.ts` 逐字同一個運算式），
    //    ⛔ 不是測試手寫的一份文件 —— 那正是這一支上一版看不見 #607 的原因。
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      modelDocFor: (k) => modelFxDocFor(Models.tryGet(k)),
      loadModelContainer: () => Promise.resolve(null),
    });
    vfx.handleEvent({ type: "modelFxSpawn", data: wire } as unknown as EventMessage, 0);

    const axisNode = scene.transformNodes.find((n) => n.name.startsWith("modelfx-axis-"));
    expect(axisNode, "⛔ 一具模型都沒生出來 —— 這正是 #606 的形狀").toBeDefined();

    const inst = wire.instances[0]!;
    const declared = Models.tryGet(wire.modelKey)?.fxLongAxis;
    expect(declared, `${wire.modelKey} 沒有宣告 fxLongAxis —— 標本失效了`).toBeDefined();
    // ⭐ 「烘出來的長軸躺在行進方向上了嗎」。⛔ 不驗正負號（長軸是**線**不是箭頭），
    //    ⛔ 也不驗角度數字 —— 缺陷是 |cos| 恆等於 0，機制在不在一眼看得出來。
    const world = Vector3.TransformNormal(
      LOCAL[declared as ModelFxLongAxis],
      axisNode!.computeWorldMatrix(true),
    ).normalize();
    const along = new Vector3(inst.dx, 0, inst.dz).normalize();
    expect(
      Math.abs(Vector3.Dot(world, along)),
      "⛔ 長軸沒有被擺到行進方向上 —— 這正是 #607 的形狀（fxLongAxis 在接縫上被挑掉）",
    ).toBeCloseTo(1, 5);

    vfx.dispose();
  });

  it("接縫⛔ 不投影：進去哪一份 model@1，出來就是**同一份**", () => {
    // ⚠️ `fxSpawnHeight` 出貨樹目前一份都沒填（ABSENT = 0 = 今天的行為），所以它
    //    沒有辦法用畫面驗 —— 而它與 `fxLongAxis` 是**同一個**缺陷（接縫挑欄位）。
    // ⇒ 這一條釘的是「⛔ 不要有投影」本身：一份新的 fx 欄位加進 `model@1` 時，
    //    接縫**零行接線**就該讓它走到播放端。同一性一旦被換成手抄的字面值就紅。
    const doc = Models.all()[0];
    expect(doc, "出貨樹一份 model@1 都沒有 —— 內容載入失敗了").toBeDefined();
    expect(
      modelFxDocFor(doc!),
      "⛔ 接縫又開始挑欄位了 —— #607 的形狀（那一次挑掉的是 fxLongAxis/fxSpawnHeight）",
    ).toBe(doc);
  });
});
