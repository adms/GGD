/**
 * owner 2026-08-19：「兩個 bot **在界外**並且**模型都沒畫出來但有施法特效**⋯
 * **過了一陣子才突然出現在場內**」（大聖杯洞窟，戰鬥回合一開場）。
 *
 * 根因：`EntityViewRegistry.sync` 以前把 `lastPos.set()` 寫在剔除的 `continue`
 * **後面**，所以被藏起來的身體，`posOf()` 會一直回**上一次看得到它的位置**。
 * 而 `posOf()` 是血條錨點（`GameApp.updateFrameBus`）與施法特效
 * （`VfxSystem.entityPos`）**共用**的座標來源 ⇒ 兩條路一起被釘在舊座標上，
 * 而回合交界時那個舊座標屬於**上一張場地**（中場站 arena.skeleton 的 x=-24）。
 *
 * ⛔ 不斷言座標數值、不斷言遮蔽該不該存在（那是 GH#324 的設計）。只問兩件機制：
 * ① 身體被藏起來時 `posOf()` 仍跟著權威位置 ② 被遮蔽的敵人不留下血條。
 * 突變（已驗）：`lastPos.set` 移回 `continue` 後面 → ① 紅，且回 `{x:-24}`。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";

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

/** 一名**敵方**英雄（`friendly` 不是 true ⇒ 遮蔽會作用在它身上）。 */
const foe = (x: number, z: number): EntityViewState => ({
  id: 7, kind: 0, seatId: 3, key: "champ.sela", teamId: 1, x, z, fx: 1, fz: 0, alive: true,
});

const syncAt = (reg: EntityViewRegistry, e: EntityViewState, wall: boolean, t: number): void =>
  reg.sync({
    entities: [e],
    poseFor: (x) => ({ x: x.x, z: x.z, fx: x.fx, fz: x.fz }),
    nowMs: t,
    dtMs: 16,
    loadModels: false,
    ...(wall ? { occlude: { cx: 0, cz: 0, blocked: (): boolean => true } } : {}),
  });

describe("牆後的身體不可以留下一個過期的座標 (owner 2026-08-19)", () => {
  it("被遮蔽剔除的英雄，posOf 仍跟著權威位置，而且不再掛血條", () => {
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    // 中場：看得見，站在上一張場地的位置
    syncAt(reg, foe(-24, 0), false, 0);
    expect(reg.isOccluded(7)).toBe(false);
    // 開戰：瞬移到新場地的出生點，一到就被牆擋住 ⇒ 身體不畫
    syncAt(reg, foe(19, -3), true, 16);
    expect(reg.isOccluded(7), "遮蔽沒生效，這條測試就沒在測它要測的東西").toBe(true);
    // ⭐ 承重：血條與施法特效都讀這個答案
    expect(reg.posOf(7), "被釘在上一張場地的座標上（= owner 看到的「界外」）").toEqual({
      x: 19,
      z: -3,
    });
  });
});
