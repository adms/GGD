/**
 * ROUND-BOUNDARY CLEANUP (task #16 / #259) —— owner:「戰鬥開始前/結束 特效、
 * 物件單位是否都有清理乾淨的機制？」
 *
 * ⚠️ 這個檔案刻意**不**去斷言「dispose 有沒有被呼叫」。那種守衛什麼都證明不了：
 * 它只是把實作重寫一遍。這裡量的是玩家真的付得出代價的東西 ——
 * **Babylon 場景裡有多少個 ParticleSystem / mesh**，也就是每一張 frame 要被
 * 走訪多少次。判準是：
 *
 *   (a) 這個數字不可以隨著回合數單調成長；
 *   (b) 一次回合切換之後，它要回到「什麼都還沒打」的基線。
 *
 * 修之前實測（同一支 harness，四回合、每回合 40 種效果）：
 *   40 → 80 → 120 → 160，中間閒置 30 秒也不會掉。
 * 唯一的回收路徑是 `dispose()`，而 `dispose()` 只在整個 GameApp 被銷毀時呼叫。
 *
 * 為什麼「每回合出現的效果種類會變多」不是造假的前提：英雄升級解鎖 R/EX、
 * 第 3 回合起殭屍加入、每回合換地圖（#145），一場比賽看過的 vfx doc id
 * 就是一直在增加的；而 pool 是 per-doc-id 的 free-list，只長不縮。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// QualityController 這個 singleton 在 import 期就會碰 localStorage — stub 掉
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem } from "./VfxSystem";
import { W3xCastFx } from "./W3xCastFx";
import { RoundVfxLifecycle } from "../render/roundVfxLifecycle";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

function burstDoc(id: string): VfxDoc {
  return {
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    mode: "burst",
    burstCount: 8,
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
  };
}

function makeVfx(): VfxSystem {
  return new VfxSystem(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key) => burstDoc(key),
    localEntityId: () => 1,
    teamOf: () => 0,
  });
}

/** 場景的每幀成本代理量：要被走訪的 ParticleSystem 與 mesh 數。 */
function sceneLoad(): { systems: number; meshes: number } {
  return { systems: scene.particleSystems.length, meshes: scene.meshes.length };
}

/**
 * 跑「一個回合」：`variety` 種不同的技能特效各打幾次，加上一堆命中。
 * `round` 讓每回合的技能組不同 —— 這正是英雄升級/換地圖/殭屍加入造成的。
 */
function playRound(vfx: VfxSystem, round: number, startMs: number, variety = 40): number {
  let now = startMs;
  for (let i = 0; i < variety * 3; i++) {
    const hit: EventMessage = {
      tick: i,
      type: "hitImpact",
      data: { source: 100 + i, target: 200 + i, amount: 120, x: i % 9, z: (i * 3) % 9 },
    } as unknown as EventMessage;
    vfx.handleEvent(hit, now);
    const spawn: EventMessage = {
      tick: i,
      type: "vfxSpawn",
      data: { x: i % 9, z: (i * 3) % 9, vfxId: `fx.r${round}-a${i % variety}` },
    } as unknown as EventMessage;
    vfx.handleEvent(spawn, now);
    now += 16;
    vfx.update(now);
  }
  // 回合之間的商店時間：證明「等一等自己就會掉」是不成立的
  now += 30_000;
  vfx.update(now);
  return now;
}

describe("每幀成本不隨回合單調成長 (round-vfx-cleanup)", () => {
  it("四個回合之後，場景裡的 particle system 數回到第一回合的水準", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    const baseline = sceneLoad();
    let now = 1000;
    const after: { systems: number; meshes: number }[] = [];
    for (let round = 1; round <= 4; round++) {
      now = playRound(vfx, round, now);
      after.push(sceneLoad());
      vfx.resetForRound(); // ← 回合邊界
      now += 5_000;
    }

    // 每一回合都確實有東西被畫出來（否則下面的「沒成長」是空話）
    for (const a of after) expect(a.systems).toBeGreaterThan(baseline.systems);

    // 核心斷言：第 4 回合的峰值不比第 1 回合高 —— 沒有跨回合累積
    expect(after[3]!.systems).toBeLessThanOrEqual(after[0]!.systems);
    expect(after[3]!.meshes).toBeLessThanOrEqual(after[0]!.meshes);
    vfx.dispose();
  });

  it("一次回合切換之後，particle system 數回到「什麼都還沒打」的基線", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    const baseline = sceneLoad();
    playRound(vfx, 1, 1000);
    expect(sceneLoad().systems).toBeGreaterThan(baseline.systems);

    vfx.resetForRound();
    // 這裡只釘 particle system：它是**每個 doc id 各長一條、只長不縮**的那一層。
    expect(sceneLoad().systems).toBe(baseline.systems);
    vfx.dispose();
  });

  it("mesh 數在第二回合之後完全不動 —— 那些共用池是有上限的，不是漏的", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    let now = playRound(vfx, 1, 1000);
    vfx.resetForRound();
    const afterFirst = sceneLoad().meshes;
    now = playRound(vfx, 2, now + 5000);
    vfx.resetForRound();
    // HitSpark 的 impact composer、Telegraph 的 mesh free-list、焦痕池都有
    // per-key 上限：第一回合把它們填滿之後，第二回合一個都不該多出來。
    // 這條斷言的方向是「不准再長」，不是「必須歸零」—— 歸零只會讓下一回合
    // 第一次揮刀重新配置一次。
    expect(sceneLoad().meshes).toBe(afterFirst);
    vfx.dispose();
  });

  it("清場之後這一層還能用 —— 下一回合照樣畫得出東西", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    playRound(vfx, 1, 1000);
    vfx.resetForRound();
    // 池子是 lazy 的，清掉之後下一次 play() 必須重建而不是回傳 null
    const ps = vfx.play(burstDoc("fx.after-reset"), 1, 2, 200_000);
    expect(ps).not.toBeNull();
    expect(scene.particleSystems.length).toBeGreaterThan(0);
    vfx.dispose();
  });
});

describe("W3x rig 的池子也在回合邊界被還回去 (round-vfx-cleanup)", () => {
  /**
   * rig（promoted cast 走的那條路）有它**自己**的 per-doc-id free-list，跟
   * VfxSystem 的池子是兩回事：`W3xEmitterRig.totalSystems` 是「這個 rig 蓋過、
   * 還沒被銷毀的所有 ParticleSystem」，它自己的註解就叫它 leak canary。
   * 上面那組 VfxSystem 的測試碰不到這條路（synthetic doc 不會被 promote），
   * 所以這裡直接對 W3xCastFx 下手。
   */
  function streamDoc(id: string): VfxDoc {
    return {
      id,
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "continuous",
      rate: 40,
      lifetimeSec: { min: 0.3, max: 0.8 },
      size: { start: 0.5, end: 0.1 },
      color: { start: [1, 0.7, 0.3, 1], end: [1, 0.2, 0, 0] },
      blendMode: "additive",
    };
  }

  it("整個 rig 被還回去，leak canary 歸零、場景也歸零", () => {
    cover("round-vfx-cleanup");
    const before = scene.particleSystems.length;
    const fx = new W3xCastFx(scene, { getQualityScale: () => 1 });
    const played = fx.play("fx.promoted", [streamDoc("fx.p1"), streamDoc("fx.p2")], 0, 1, 0, 1000);
    expect(played).toBe(true);
    expect(fx.rigBuilt).toBe(true);
    expect(fx.rigTotalSystems).toBeGreaterThan(0);
    expect(scene.particleSystems.length).toBeGreaterThan(before);

    fx.resetForRound();
    expect(fx.rigTotalSystems).toBe(0);
    expect(fx.liveCount).toBe(0);
    expect(scene.particleSystems.length).toBe(before);

    // …而且下一回合還能再打（rig 是 lazy 重建的，不是被永久關掉）
    expect(fx.play("fx.promoted", [streamDoc("fx.p1")], 0, 1, 0, 60_000)).toBe(true);
    expect(fx.rigBuilt).toBe(true);
    fx.dispose();
  });
});

describe("回合邊界偵測驅動真的清場 (round-vfx-cleanup)", () => {
  /**
   * 這一段把 `RoundVfxLifecycle`（GameApp 每一幀餵 phase 的那個物件）接到
   * **真的** VfxSystem 上，跑一段真實的 phase 序列，然後量真的場景。
   * GameApp 本身無法在 headless 建構（Babylon engine / canvas / socket），
   * 所以未被覆蓋的只剩 GameApp 建構子裡那一行接線。
   */
  it("champSelect → combat → resolution → intermission → combat 各清一次，且場景每次回到基線", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    const life = new RoundVfxLifecycle(vfx);
    const baseline = sceneLoad();
    let now = 1000;

    life.sync("champSelect");
    expect(life.resetCount).toBe(0); // 選角不是戰鬥邊界

    life.sync("combat"); // 開打前
    expect(life.resetCount).toBe(1);
    now = playRound(vfx, 1, now);
    expect(sceneLoad().systems).toBeGreaterThan(baseline.systems);

    life.sync("combat"); // 同一格 phase 的後續幀不可以重複清
    expect(life.resetCount).toBe(1);
    expect(sceneLoad().systems).toBeGreaterThan(baseline.systems);

    life.sync("resolution"); // 戰鬥結束 → 殘留不准帶進商店
    expect(life.resetCount).toBe(2);
    expect(sceneLoad().systems).toBe(baseline.systems);

    life.sync("intermission");
    expect(life.resetCount).toBe(2); // 商店裡的 phase 變化不是戰鬥邊界

    life.sync("combat"); // 下一回合開打前
    expect(life.resetCount).toBe(3);
    now = playRound(vfx, 2, now + 1000);
    life.sync("resolution");
    expect(sceneLoad().systems).toBe(baseline.systems);
    vfx.dispose();
  });

  it("掉封包（phase 空字串）不算離開戰鬥 —— 不會在連線抖動時白清一場", () => {
    cover("round-vfx-cleanup");
    const vfx = makeVfx();
    const life = new RoundVfxLifecycle(vfx);
    life.sync("combat");
    expect(life.resetCount).toBe(1);
    playRound(vfx, 1, 1000);
    const during = sceneLoad().systems;
    life.sync(""); // 這一幀沒有 state
    life.sync("");
    expect(life.resetCount).toBe(1);
    expect(sceneLoad().systems).toBe(during); // 場上的東西原封不動
    life.sync("combat"); // 連線回來，還在同一場
    expect(life.resetCount).toBe(1);
    vfx.dispose();
  });
});
