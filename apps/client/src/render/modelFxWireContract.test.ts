/**
 * ⛔⛔ GH#606 —— **sim 送的酬載，客戶端真的畫得出來**（跨 sim／client 邊界的一條線）。
 *
 * ── 為什麼舊守衛是綠的 ──────────────────────────────────────────────────────
 * `modelFxRig.test.ts` 一直在跑 `rig.spawn(SPEC, AT)` —— 一個**它自己造的**
 * `ModelFxMotionSpec`。而出貨路徑從來沒有那樣呼叫過：sim 送
 * `{ caster, modelKey, instances, … }`，客戶端讀 `ev.data.spec`（零個寫入端）。
 * ⇒ 兩邊從第一天起就對不上，而守衛驗的是**第三種**形狀（第二守則失敗形態⑤：
 * 被測的不是出貨的那個）。同期的 `performanceEventsHaveConsumers` 也是綠的，
 * 因為它只問「這個事件有沒有一個 `case`」—— 有；⛔ 它不問那個 case 的**第一行**
 * 會不會立刻 `break`。
 *
 * ⇒ 這一條**只驗一件事**：跑**出貨的**技能 → 拿**真的** `modelFxSpawn` 事件 →
 * 餵進**真的** `ModelFxRig` → **有模型生出來，而且它沿著 sim 算的那條線走**。
 * ⛔ 一個座標、一個秒數、一個出貨數值都不抄（第二守則：驗機制不驗數字）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— 把 `VfxSystem.ts` 的消費端改回舊寫法
 *    （`const p = ev.data.spec as …; if (!p) break;`）等價的形狀：
 *    在 rig 這一側把 `spawn()` 的 `ev.instances` 換成 `(ev as {spec?:never}).spec`
 *      → 紅：「⛔ 一具模型都沒生出來 —— 這正是 #606 的形狀: expected 0 to be
 *        greater than 0」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ModelFxSpawnEvent } from "@ggd/shared/sim/effects/spawnModelFx";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { ModelFxRig } from "./modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
// 悟空 09-04 龜派氣功 —— owner 2026-08-22 逐字點名的四支經典橫放光束砲之一。
const CASTER = "godie-ogrh" as ChampionId;
const SUBJECT = "godie-ogrh.r";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
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

describe("modelFxSpawn 的線路契約（GH#606）", () => {
  it("sim 送的那一份，客戶端真的生得出模型而且沿它自己算的線走", () => {
    const wire = realWirePayload();
    const rig = new ModelFxRig(new Scene(new NullEngine()), {
      resolveModel: () => ({ glbPath: "x.glb" }),
      loadContainer: () => Promise.resolve(null),
    });

    const made = rig.spawn(wire);
    expect(made, "⛔ 一具模型都沒生出來 —— 這正是 #606 的形狀").toBeGreaterThan(0);
    expect(made).toBe(wire.instances.length);

    // ⭐ 「有沒有沿著 sim 那條線走」，⛔ 不問走到哪一格：
    //    起點必須**逐位元**等於 sim 給的起點（客戶端不可以自己從施法者重算），
    //    而推進之後必須離起點更遠 —— 位移方向與 sim 的 (dx,dz) 同號。
    const inst = wire.instances[0]!;
    const node = rig.livePositions()[0]!;
    expect(node.x).toBe(inst.x);
    expect(node.z).toBe(inst.z);

    rig.tick((inst.durationSec * 1000) / 2);
    const mid = rig.livePositions()[0]!;
    expect(Math.sign(mid.x - inst.x) || 0).toBe(Math.sign(inst.dx) || 0);
    expect(Math.sign(mid.z - inst.z) || 0).toBe(Math.sign(inst.dz) || 0);

    rig.dispose();
  });
});
