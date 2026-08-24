/**
 * GH#661 —— 【暴走移動拖曳光束】的**出貨鏈**守衛。
 *
 * owner 2026-08-24：「暴走狀態**追加身體移動拖曳光束特效**」，而在這一批之前
 * 他的回報是「**還是沒有**」⇒ ⛔ 這條守衛刻意**一個環節都不假造**：
 *
 *   出貨的技能 JSON  → sim **真的** emit 站（`spawnVfxEffect`）
 *   → 出貨的 `EventMessage` → **真的** `VfxSystem.handleEvent`
 *   → 出貨的緞帶文件 → 畫面上真的有沒有東西（`isDrawing`）
 *
 * ⚠️ 三種它刻意排除的失敗形態：
 *  · ⑤ 被測的不是出貨的那個 —— `vfxId` / `durationSec` / `at` **從
 *    `content/abilities/godie-e00r.passive.json` 讀出來**，⛔ 不是字面值。
 *  · ⑧ 消費端存在但消費不到 —— 酬載由 `spawnVfxEffect.apply` 產生，
 *    ⛔ 不是測試自己拼一份 `{ caster, x, z }`（那正是 GH#606 那一族的形狀）。
 *  · ② 算出來但畫不出來 —— 斷言讀 `isDrawing`（緞帶自己「這一幀有沒有可見的
 *    亮度」），⛔ 不是「有沒有一個物件」。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { RibbonDefs, type RibbonDoc } from "@ggd/shared/content";
import { spawnVfxEffect } from "@ggd/shared/sim/effects/spawnVfx";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { frameBus, type ChampionAnchor } from "../frameBus";

const CONTENT = join(__dirname, "../../../../content");
const HERO = 7;
const FRAME_MS = 16;

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
beforeEach(() => frameBus.champions.clear());
afterEach(() => frameBus.champions.clear());

/** 從**出貨的**天生技裡撈出那一發拖曳心跳（⛔ 不是測試自己寫的節點）。 */
function shippedTrailEffect(): { vfxId: string; at?: string; durationSec?: number } {
  const doc: unknown = JSON.parse(
    readFileSync(join(CONTENT, "abilities/godie-e00r.passive.json"), "utf-8"),
  );
  const found: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    const r = n as Record<string, unknown>;
    if (r["kind"] === "spawnVfx" && String(r["vfxId"]).startsWith("fx.trail.")) found.push(r);
    for (const v of Object.values(r)) walk(v);
  };
  walk(doc);
  expect(
    found.length,
    "出貨的 59-00 暴走天生技裡找不到拖曳心跳（`spawnVfx` 指向一份 fx.trail.*）—— " +
      "改了 tools/skill-remake/heroes/godie-e00r.py 之後忘了跑 skillremake:json？",
  ).toBe(1);
  return found[0] as { vfxId: string; at?: string; durationSec?: number };
}

/** 出貨的那份緞帶文件（⛔ 不是測試捏的） */
function shippedRibbon(id: string): RibbonDoc {
  return JSON.parse(readFileSync(join(CONTENT, `vfx/${id}.json`), "utf-8")) as RibbonDoc;
}

/** 用 sim **真的** emit 站產生一則心跳事件。 */
function beat(eff: object, x: number, z: number, tick: number): EventMessage {
  const out: EventMessage[] = [];
  const world = {
    transform: new Map([[HERO, { pos: { x, z } }]]),
    emit: (type: string, data: Record<string, unknown>): void => void out.push({ type, tick, data }),
  };
  // ⚠️ 後兩個是 `BakeList` / `RunList`（`spawnVfx` 沒有巢狀酬載,用不到它們）,
  //    ⛔ 但簽章上有 —— 少傳就是 tsc 的紅,而那正是這條守衛要騎的真簽章。
  const unused = ((): never => {
    throw new Error("spawnVfx 不該遞迴任何巢狀效果");
  }) as never;
  spawnVfxEffect.apply(
    eff as never,
    { world, caster: HERO, targets: [], point: undefined } as never,
    unused,
    unused,
  );
  expect(out.length, "sim 沒有發出 vfxSpawn —— 心跳整條斷了").toBe(1);
  return out[0]!;
}

function anchor(id: number): ChampionAnchor {
  return {
    entityId: id,
    name: `#${id}`,
    teamId: 0,
    championId: "godie-e00r",
    isLocal: false,
    alive: true,
    hpPct: 0.1,
    shieldPct: 0,
    manaPct: 1,
    worldX: 0,
    worldZ: 0,
    pose: { sx: 0, sy: 0, visible: true },
    cast: null,
  };
}

describe("暴走的移動拖曳光束真的畫在畫面上 (GH#661)", () => {
  it("心跳→跟著身體移動→變亮；站著不亮；心跳停→當場清乾淨", () => {
    cover("vfx-move-trail");
    const eff = shippedTrailEffect();
    const ribbon = shippedRibbon(eff.vfxId);
    expect(ribbon.schema, "拖曳文件必須是 ribbon@1 —— 客戶端的判準就是這一格").toBe("ribbon@1");
    RibbonDefs.register(ribbon);

    const pos = { x: 0, z: 0 };
    const ctx: VfxContext = { entityPos: (id) => (id === HERO ? { ...pos } : null) };
    const vfx = new VfxSystem(scene, ctx);
    frameBus.champions.set(HERO, anchor(HERO));

    let now = 1000;
    let tick = 0;
    /** 一幀：先送這一幀該有的心跳，再走身體、再 update。 */
    const frame = (dx: number, withBeat: boolean): void => {
      if (withBeat) vfx.handleEvent(beat(eff, pos.x, pos.z, ++tick), now);
      pos.x += dx;
      now += FRAME_MS;
      vfx.update(now);
    };

    // ① 站著不動（心跳照來）——⛔ 不可以有拖曳（不然它就變成一團黏在身上的光）
    for (let i = 0; i < 12; i++) frame(0, i % 16 === 0);
    expect(vfx.moveTrailLayer.docIdFor(HERO), "心跳來了卻沒有被認領").toBe(eff.vfxId);
    expect(vfx.moveTrailLayer.isDrawing(HERO), "站著不動卻拖出光束").toBe(false);

    // ② 跑起來（~7.5 u/s，SWING_ON_SPEED 3 之上）—— 這一刻畫面上要真的有東西
    for (let i = 0; i < 20; i++) frame(0.12, i % 16 === 0);
    expect(
      vfx.moveTrailLayer.isDrawing(HERO),
      "身體在移動，而拖曳光束一個像素都沒畫（緞帶量的是相對速度而不是絕對速度？）",
    ).toBe(true);

    // ③ 暴走結束 = 心跳停。hold（出貨 0.4 秒）之內必須乾淨，⛔ 不是淡出到永遠
    const holdMs = Math.round((eff.durationSec ?? 0.4) * 1000);
    expect(holdMs, "hold 必須在 #569 的 0.5 秒之內").toBeLessThanOrEqual(500);
    for (let i = 0; i < 3; i++) frame(0.12, false);
    expect(vfx.moveTrailLayer.activeCount, "心跳才剛停就已經拆掉了（會斷格閃爍）").toBe(1);
    now += holdMs;
    vfx.update(now);
    expect(vfx.moveTrailLayer.activeCount, "暴走結束了拖曳還留在場上（#569）").toBe(0);

    vfx.dispose();
    RibbonDefs.clear();
  });
});
