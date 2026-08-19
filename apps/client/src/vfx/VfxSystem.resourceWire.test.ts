/**
 * 兩條「資源被改寫了而畫面上沒有人說」的線（GH#406 / GH#411）。
 *
 * ⚠️ 失敗形態②，而且**兩端**都要驗才成立：伺服器端事件要在
 * `FANNED_OUT_EVENT_TYPES` 裡（不在＝白名單靜默丟掉），客戶端要由**出貨的**
 * `VfxSystem.handleEvent` 真的產出浮動文字（⛔ 不是自己手寫一份
 * `pushCombatText` —— 那是失敗形態⑤）。只驗一半的話兩種壞法都會綠。
 * ⭐ scope 一律用**出貨預設**（`team`）：只在 `all` 底下畫得出來的數字不存在。
 */
import { it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { frameBus, clearCombatText } from "../frameBus";
import { VfxSystem } from "./VfxSystem";

let engine: NullEngine;
let scene: Scene;
let vfx: VfxSystem;
const LOCAL = 1;
const FOE = 2;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  vfx = new VfxSystem(scene, {
    entityPos: (id) => ({ x: id, z: 0 }),
    localEntityId: () => LOCAL,
    teamOf: (id) => (id === LOCAL ? 0 : 1),
  });
});
afterAll(() => {
  vfx.dispose();
  scene.dispose();
  engine.dispose();
});
beforeEach(() => clearCombatText());

const ev = (type: string, data: Record<string, unknown>): EventMessage => ({ type, tick: 1, data });
const live = (): typeof frameBus.combatText => frameBus.combatText.filter((e) => e.active);

/** 兩個名字都必須真的過得了線 —— 沒有這一半，下面的斷言驗的是死線路。 */
it("both events cross the wire (FANNED_OUT, and resourceSwap is no longer server-only)", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(HERE, "../../../game-server/src/net/eventFanout.ts"), "utf8");
  const cut = src.indexOf("export const SERVER_ONLY_EVENT_TYPES");
  expect(cut, "eventFanout.ts 不再宣告 SERVER_ONLY_EVENT_TYPES").toBeGreaterThan(-1);
  const fanned = src.slice(0, cut);
  for (const name of ["manaSpend", "resourceSwap"]) {
    expect(fanned.includes(`"${name}",`), `${name} 不在 FANNED_OUT_EVENT_TYPES 裡`).toBe(true);
    expect(src.slice(cut).includes(`"${name}",`), `${name} 還被列成 server-only`).toBe(false);
  }
});

it("GH#406 交換筆記本：兩具身上各一個變化量，方向相反，都說「交換」", () => {
  vfx.handleEvent(
    ev("resourceSwap", {
      caster: LOCAL, target: FOE, resource: "health",
      fromCaster: 572.5, toCaster: 679.2, fromTarget: 676, toTarget: 575.3,
    }),
    1000,
  );
  const byBody = new Map(live().map((e) => [e.targetId, e.label ?? ""]));
  expect([...byBody.keys()].sort()).toEqual([LOCAL, FOE]);
  // ⛔ 不可以只說「治療」或「傷害」—— sim 那一側正是為了這個理由拒絕發那兩則。
  expect(byBody.get(LOCAL)).toMatch(/^交換 \+/);
  expect(byBody.get(FOE)).toMatch(/^交換 -/);
});

it("GH#411 扣魔：付錢的那具身上一個**減號**（`mana` category 自己的字首是 +）", () => {
  vfx.handleEvent(ev("manaSpend", { target: LOCAL, source: FOE, amount: 30 }), 1000);
  expect(live().map((e) => [e.category, e.label])).toEqual([["mana", "-30"]]);
});
