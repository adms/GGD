/**
 * ⭐【定點 3D 模型】`path:"static"` 的出貨鏈守衛（#649 類④）。
 *
 * 原作 266 具 dummy 有 **238 具站著不動**（89%，`DUMMY_ORB_MAP.json`）——
 * `CreateUnit` → `AddSpecialEffect` → `UnitApplyTimedLife`，⛔ 一次
 * `SetUnitPosition` 都沒有 —— 而它擋住 60 支技能。
 *
 * ── 這一條走**真的鏈**（GH#606 的教訓，⛔ 不是自造夾具）────────────────────
 * 真的 Zod 閘（`zEffectDef` 含 refine）→ 真的 `SimWorld`＋`runEffects` →
 * 真的 `modelFxSpawn` 酬載 → **出貨的 `modelDocFor` 接縫**＋出貨的 `Models`
 * 登錄表（`imported.midchildernanohaaura`，正是先導技能 godie-hvsh.r 騎英魔法陣
 * 的那一份模型）→ 真的 `VfxSystem` → **出貨場景樹上的世界矩陣**。
 * ⛔ 不驗數字（lifeSec 3 是夾具參數，斷言全部對「同一份輸入」比，不抄字面值）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `sim/effects/spawnModelFx.ts` static 分支的
 *    `const p = at ?? origin;` 改成 `const p = origin;`（錨點被無聲丟掉）
 *      → 紅：「⛔ static 的錨點沒有被讀 —— 模型長在施法者腳下,不在施放點上」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
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
// 施放的地板點 —— 刻意**不是**施法者腳下，錨點沒被讀時兩者才分得開。
const P = { x: C.x + 4, z: C.z - 2 };
// 先導證據最全的那一具（騎英魔法陣：world-point · 3 秒 · 模型已在出貨樹）。
const NODE = {
  kind: "spawnModelFx",
  shape: "single",
  path: "static",
  anchor: "point",
  modelKey: "imported.midchildernanohaaura",
  lifeSec: 3,
};

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

describe('spawnModelFx path:"static"（#649）', () => {
  it("Zod 收得下 → sim 送一具不動的實例在施放點 → 出貨接縫畫在同一點，tick 後不位移", () => {
    // ① 真的 Zod 閘 —— 作者寫得出這個節點（refine 全部放行）。
    const def = zEffectDef.parse(NODE);

    // ② 真的 sim —— 事件酬載是唯一的傷害/畫面契約。
    const world = new SimWorld(SKELETON_ARENA, 1);
    const caster = spawnChampion(world, {
      championId: "godie-ogrh" as ChampionId,
      seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());
    runEffects([def as EffectDef], {
      world, caster, rank: 1, targets: [], point: { ...P },
      origin: "ability:test.static", rng: world.rng,
    } satisfies EffectContext);
    const ev = world.events.find((e) => e.type === "modelFxSpawn");
    expect(ev, "static 施放沒有發出 modelFxSpawn").toBeDefined();
    const wire = ev!.data as unknown as ModelFxSpawnEvent;
    expect(wire.instances).toHaveLength(1);
    const inst = wire.instances[0]!;
    // ⚠️ 2026-08-24 前提更新（`2705f145`）：**不動 ≠ 沒有方向**。原作那十具 dummy
    //    沿一條線擺（A0D5@32322），光束砲原地開火時長軸仍要指著開火方向 ⇒
    //    static 現在**送 `dir`**（給客戶端算 yaw），⛔ 不動的保證改由 `travel/dist=0`
    //    承擔（`travelled = dist × frac = 0` ⇒ 位置逐位元不動）。
    //    ⇒ 這一條從「不帶方向」改成「帶方向也**推不動**」—— 後者才是玩家看得到的性質。
    expect(inst.dist, "⛔ static 的實例帶著非零 travel —— 它會位移").toBe(0);
    expect({ x: inst.x, z: inst.z }, "⛔ static 的錨點沒有被讀 —— 模型長在施法者腳下,不在施放點上").toEqual(P);
    expect(inst.durationSec, "⛔ lifeSec 沒有走到線路上 —— 這一具會當場消失").toBeCloseTo(NODE.lifeSec, 5);

    // ③ 真的客戶端 —— 出貨接縫＋出貨模型文件＋出貨場景樹。
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      modelDocFor: (k) => modelFxDocFor(Models.tryGet(k)),
      loadModelContainer: () => Promise.resolve(null),
    });
    vfx.handleEvent({ type: "modelFxSpawn", data: wire } as unknown as EventMessage, 0);
    const root = scene.transformNodes.find((n) => n.name.startsWith("modelfx-") && !n.name.startsWith("modelfx-axis-"));
    expect(root, "⛔ 一具模型都沒生出來 —— #606 的形狀").toBeDefined();
    const at0 = root!.computeWorldMatrix(true).getTranslation();
    expect({ x: at0.x, z: at0.z }).toEqual(P);
    // 壽命中段推進 —— 定點模型**一格都不准動**（這正是這個 path 存在的理由）。
    vfx.update(0);
    vfx.update(400);
    const at1 = root!.computeWorldMatrix(true).getTranslation();
    expect(root!.isEnabled(), "壽命還沒到就被收掉了").toBe(true);
    expect({ x: at1.x, z: at1.z }, "⛔ static 的模型在移動").toEqual(P);
    vfx.dispose();
  });

  /**
   * ⭐【沿線 N 具】#673-④／GH#688 Phase 4+5 —— 原作的光束/火柱是**一次擺出一條線**
   * （`A03S` 09-04 的 h006 `loop i=1..6 × 200`）。走與上面同一條真鏈：
   * 真 Zod → 真 sim → **出貨的 09-04**（含 preset 解析）→ 線路上的實例座標。
   *
   * ── 突變紀錄（一批一條，挑最承重的那一行）──────────────────────────────
   *  · ⭐ 承重線 —— `sim/effects/spawnModelFx.ts` static 分支的沿線迴圈改成
   *    `for (let k = 0; k < 1; k++)`（N 具退化成單具）
   *      → 紅：「09-04 的沿線層只擺出 1 具 —— #673-④ 的機制被撤銷了」
   */
  it("⭐ #673-④ 沿線 N 具：count×spacing 等距、出貨的 09-04 兩層各 6 具", () => {
    // ① 機制本身：真 Zod → 真 sim。
    const def = zEffectDef.parse({ ...NODE, anchor: "point", count: 6, spacing: 2 });
    const world = new SimWorld(SKELETON_ARENA, 1);
    const caster = spawnChampion(world, {
      championId: "godie-ogrh" as ChampionId,
      seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());
    runEffects([def as EffectDef], {
      world, caster, rank: 1, targets: [], point: { ...P },
      origin: "ability:test.line", rng: world.rng,
    } satisfies EffectContext);
    const wire = world.events.find((e) => e.type === "modelFxSpawn")!.data as unknown as ModelFxSpawnEvent;
    expect(wire.instances, "count 沒有被讀 —— 整條線退化成 1 具").toHaveLength(6);
    // 錨點→P，方向＝origin→P 的單位向量；第 k 具在 P + dir×spacing×k（第 0 具在錨點）。
    const L = Math.hypot(P.x - C.x, P.z - C.z);
    const dir = { x: (P.x - C.x) / L, z: (P.z - C.z) / L };
    wire.instances.forEach((inst, k) => {
      expect(inst.x, `第 ${k} 具的 x 不在線上`).toBeCloseTo(P.x + dir.x * 2 * k, 5);
      expect(inst.z, `第 ${k} 具的 z 不在線上`).toBeCloseTo(P.z + dir.z * 2 * k, 5);
      expect(inst.dist, "沿線的定點實例不可以位移").toBe(0);
      expect(inst.durationSec).toBeCloseTo(NODE.lifeSec, 5);
    });

    // ② 出貨的 09-04（pilot）：兩層蝗蟲群 —— 主體 ReviveHuman（模板 count 6）＋
    //    火柱 FlameStrike1（節點 count 6），⛔ 不驗字面值以外的數字。
    const ability = Abilities.tryGet("godie-ogrh.r" as never) as { effects?: EffectDef[] } | null;
    expect(ability, "出貨內容裡沒有 godie-ogrh.r").toBeTruthy();
    world.transform.get(caster)!.facing = { x: 1, z: 0 };
    world.step(new Map());
    runEffects(ability!.effects ?? [], {
      world, caster, rank: 1, targets: [], origin: "ability:godie-ogrh.r", rng: world.rng,
    } satisfies EffectContext);
    const evs = world.events
      .filter((e) => e.type === "modelFxSpawn")
      .map((e) => e.data as unknown as ModelFxSpawnEvent);
    const byKey = new Map(evs.map((e) => [e.modelKey, e]));
    for (const key of ["w3x.stock.revivehuman", "w3x.stock.flamestrike1"]) {
      const ev = byKey.get(key);
      expect(ev, `09-04 沒有生出 ${key} 那一層`).toBeDefined();
      expect(ev!.instances.length, `09-04 的 ${key} 層只擺出 ${ev!.instances.length} 具`).toBe(6);
      const xs = ev!.instances.map((i) => i.x).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++)
        expect(xs[k]! - xs[k - 1]!, `${key} 相鄰兩具的間距不是等距`).toBeCloseTo(xs[1]! - xs[0]!, 5);
    }
  });

  it("refine 的閘：缺 lifeSec／填 speed／非 static 填 anchor 都在載入時被擋", () => {
    const { lifeSec: _omit, ...noLife } = NODE;
    expect(zEffectDef.safeParse(noLife).success, "沒有 lifeSec 的 static 不可以過").toBe(false);
    expect(zEffectDef.safeParse({ ...NODE, speed: 10 }).success, "static 沒有人讀 speed").toBe(false);
    expect(
      zEffectDef.safeParse({ ...NODE, path: "forward", speed: 10, distance: 6, anchor: "point" }).success,
      "只有 static 讀得到 anchor",
    ).toBe(false);
    // ⭐ #673-④ 的兩道新閘：N 具沒間距＝退化成 1 具；間距沒 N 具＝沒人讀的數字。
    expect(zEffectDef.safeParse({ ...NODE, count: 6 }).success, "static N 具一定要有 spacing").toBe(false);
    expect(
      zEffectDef.safeParse({ ...NODE, path: "forward", speed: 10, distance: 6, spacing: 2 }).success,
      "只有 static+count≥2 讀得到 spacing",
    ).toBe(false);
  });
});
