/**
 * 👻 guardian-source-cue (GH#567) —— owner 2026-08-23:「場上打贏可以補血的物件
 * 也會攻擊英雄，但沒有明顯的動作跟投射物指引⋯看起來只會覺得有隱形英雄在打我」。
 *
 * 缺的**不是**傷害、也不是預告圈（圈一直都在，畫在你腳下）—— 缺的是「誰打的」。
 * 所以這條守衛問的就是那一句：`guardianMark` 進來之後，場上有沒有**同時**出現
 * ① 落點圈 ② 一條從守衛到目標的視覺物 ③ 守衛自己動了一下。
 *
 * ⛔ 不掃字串（失敗形態⑥）：真的建一個 `VfxSystem`、真的餵一則事件。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem } from "./VfxSystem";
import { clearGuardianRecoils, guardianRecoilAt } from "./guardianRecoilBus";
import { RECOIL_IDENTITY, WAKE_MS, volleyPoint, volleyTiming } from "./guardianVolley";

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

const GUARDIAN = 7;
const TOWER = { x: -6, z: 2 };
const VICTIM = { x: 4, z: -3 };
const CTX = {
  entityPos: (id: number): { x: number; z: number } | null => (id === GUARDIAN ? TOWER : null),
};

function markEvent(tick: number, impactTick: number): EventMessage {
  return {
    type: "guardianMark",
    tick,
    data: { id: GUARDIAN, targets: [VICTIM], radius: 3, impactTick },
  } as unknown as EventMessage;
}

describe("守衛塔的來源指引 (guardian-source-cue)", () => {
  it("guardianMark ⇒ 落點圈 + 一條從守衛飛向目標的投射物 + 守衛自己伸縮一下", () => {
    cover("guardian-source-cue");
    clearGuardianRecoils();
    const vfx = new VfxSystem(scene, CTX);
    expect(vfx.groundTelegraphCount).toBe(0);
    expect(vfx.guardianBoltCount).toBe(0);

    vfx.handleEvent(markEvent(100, 130), 1000); // 30 ticks 的預告窗口

    // ① 圈 ② 球 —— ⭐ 兩個一起，這正是這張票的內容（圈本來就有，球是缺的那一半）
    expect(vfx.groundTelegraphCount).toBe(1);
    expect(vfx.guardianBoltCount).toBe(1);
    // ③ 守衛自己動了（`GuardianView.update` 每幀讀這張表）
    expect(guardianRecoilAt(GUARDIAN, 1010)).not.toEqual(RECOIL_IDENTITY);

    vfx.dispose();
    clearGuardianRecoils();
  });

  it("球在窗口結束的那一刻到站,而且是從塔飛向被攻擊方 —— ⛔ 不是憑空出現在腳下", () => {
    cover("guardian-source-cue");
    const windupMs = 900;
    const { launchMs, flightMs } = volleyTiming(windupMs);
    // 蓄力 + 飛行 = 窗口本身：球與預告圈說同一句話
    expect(launchMs + flightMs).toBeCloseTo(windupMs, 6);
    const from = { x: TOWER.x, y: 1.9, z: TOWER.z };
    const to = { x: VICTIM.x, y: 0.35, z: VICTIM.z };
    expect(volleyPoint(from, to, 0).x).toBeCloseTo(TOWER.x, 6);
    expect(volleyPoint(from, to, 1).x).toBeCloseTo(VICTIM.x, 6);
    const mid = volleyPoint(from, to, 0.5);
    expect(mid.x).toBeCloseTo((TOWER.x + VICTIM.x) / 2, 6);
    expect(mid.y).toBeGreaterThan(Math.max(from.y, to.y)); // 拋物線，不是雷射
  });

  it("guardianWake 有消費端了 —— 在 GH#567 之前它是零消費端", () => {
    cover("guardian-source-cue");
    clearGuardianRecoils();
    const vfx = new VfxSystem(scene, CTX);
    vfx.handleEvent(
      { type: "guardianWake", tick: 1, data: { id: GUARDIAN, x: TOWER.x, z: TOWER.z } } as unknown as EventMessage,
      500,
    );
    expect(guardianRecoilAt(GUARDIAN, 500 + WAKE_MS * 0.3)).not.toEqual(RECOIL_IDENTITY);
    // …而且它會自己過期（一張只長不縮的表就是 GH#270 那一族）
    expect(guardianRecoilAt(GUARDIAN, 500 + WAKE_MS + 1)).toEqual(RECOIL_IDENTITY);
    vfx.dispose();
    clearGuardianRecoils();
  });
});
