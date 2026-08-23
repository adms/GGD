/**
 * GH#647 —— 「普通殭屍不畫腳下影子」真的發生在**出貨的那條鏈**上。
 *
 * owner 2026-08-24:「殭屍波的普通殭屍不必畫血條跟陰影 節省效能」。
 *
 * 驗的是機制、走真的東西(⛔ 不是自造 payload 餵消費端 —— 失敗形態 ⑤):
 * `mobVisualJson`(出貨序列化) → `parseMobVisualJson`(出貨解碼) →
 * `mobShadowSuppressedFor`(決策) → `EntityViewRegistry.sync`(出貨接線) →
 * **Babylon 場景裡那顆 shadow mesh 最後的 isEnabled()**(讀最終物件)。
 *
 * 突變紀錄:EntityViewRegistry 的 `view.setShadowSuppressed(…)` 那一行改成
 * `view.setShadowSuppressed(false)` ⇒ ①紅(普通殭屍的影子還亮著)。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ENTITY_KIND, ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { mobVisualJson, parseMobVisualJson, type MobRules } from "@ggd/shared/sim/mobs";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import { mobShadowSuppressedFor } from "./mobShadow";

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

const mob = (id: number, flags = 0, kind: number = ENTITY_KIND.MOB): EntityViewState => ({
  id, kind, seatId: 0, key: "champ.godie-zombiex", teamId: 0,
  x: 0, z: 0, fx: 0, fz: 1, alive: true, flags,
});

/** 出貨鏈:序列化 → 解碼 → 決策縫 → registry → 場景。 */
const syncWith = (rules: MobRules | null, e: EntityViewState): boolean => {
  const table = parseMobVisualJson(mobVisualJson(rules));
  const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
    mobShadowSuppressedFor: (s) => mobShadowSuppressedFor(s, table),
  });
  reg.sync({
    entities: [e],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs: 0,
    dtMs: 16,
    loadModels: false,
  });
  const shadow = reg
    .getChampionView(e.id)!
    .root.getChildMeshes(false)
    .find((m) => m.name === `champ-${e.id}-shadow`)!;
  return shadow.isEnabled();
};

describe("GH#647 普通殭屍不畫腳下影子(省 60 顆 alpha 圓盤)", () => {
  it("出貨值:普通殭屍的 shadow mesh 是關的;精英與冠軍照畫", () => {
    cover("mob-shadow-suppressed");
    expect(syncWith(null, mob(9301))).toBe(false); // 普通殭屍 —— 不畫
    expect(syncWith(null, mob(9302, ENTITY_FLAG.MOB_ELITE))).toBe(true); // 精英照畫
    expect(syncWith(null, mob(9303, 0, 0))).toBe(true); // 冠軍不歸這張表管
  });

  it("後台開關翻成 true(舊行為)⇒ 走完出貨序列化/解碼後,普通殭屍影子回來", () => {
    cover("mob-shadow-rollback");
    const rules = { tintStrength: 0.65, normalMobShadow: true } as unknown as MobRules;
    expect(syncWith(rules, mob(9304))).toBe(true);
    // 而沒帶這一格的舊表(壞 JSON 同理)降級到出貨值:不畫 —— 不是把功能打開
    expect(parseMobVisualJson("{}").normalMobShadow).toBe(false);
  });
});
