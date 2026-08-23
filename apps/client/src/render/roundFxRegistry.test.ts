/**
 * GH#337 —— 回合邊界清的是**整張註冊表**，不是一個物件。
 *
 * owner 2026-08-17:「場地莫名其妙的特效又回來了 是不是又沒清乾淨」。
 *
 * ⚠️ 這一支存在的理由，是既有的 `vfx/VfxSystem.roundReset.test.ts` **無法**發現
 * 這個缺陷:它自己 `new RoundVfxLifecycle(vfx)`,也就是複製了出貨接線的**形狀**
 * 卻沒有複製它的**內容**(出貨的 GameApp 也只塞了一個 target,另外四個 FX 從來
 * 沒被清過)。那是失敗形態⑤。
 *
 * 所以這裡兩個東西**都用出貨的那一個**:
 *   · 場景型 FX 由 `createRoundFx()` 建 —— ⛔ 測試裡一個都不自己 new;
 *   · 邊界由 `RoundVfxLifecycle.sync(phase)` 驅動 —— ⛔ 不直接呼叫 resetForRound。
 * 量的是玩家真的付得出代價的東西:`scene.particleSystems` / `scene.meshes`
 * (每一幀要被走訪幾次),⛔ 不是「有沒有呼叫到 dispose」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// QualityController 這個 singleton 在 import 期就會碰 localStorage — stub 掉
vi.mock("./QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { createRoundFx, RoundFxRegistry, type RoundFx } from "./roundFxRegistry";
import { CLEANUP_EDGES, RoundVfxLifecycle } from "./roundVfxLifecycle";

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

/** WhirlwindFx 出貨綁定表裡真的存在的那一支（無名的 modelKey 是 no-op）。 */
const ZORO = "imported.heromusashimiyamoto";

function doc(id: string, mode: "burst" | "continuous"): VfxDoc {
  return {
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...(mode === "burst" ? { mode, burstCount: 8 } : { mode, rate: 30 }),
  } as VfxDoc;
}

/** ⭐ 出貨的組裝點。⛔ 這裡不 new 任何一個 FX —— 那正是既有守衛犯的錯。 */
function makeFx(): RoundFx {
  return createRoundFx(scene, {
    vfx: {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: (key) => doc(key, "burst"),
      localEntityId: () => 1,
      teamOf: () => 0,
    },
    ambient: {
      bindingsFor: (key) => [{ vfx: `amb.${key}` }],
      vfxDocFor: (id) => (id.startsWith("amb.") ? doc(id, "continuous") : null),
      ribbonDocFor: () => null,
    },
    // 必填（GH#546）—— 這兩支不驗開關視覺，回 0 = 一律關。
    // ⭐ 它刻意是必填:少了它「開關型技能的手部特效不掛」會靜靜發生。
    ambientToggleMask: () => 0,
    fireRing: { vfxDocFor: () => null },
    victory: { cameraFor: () => null },
    whirlwind: { createTexture: () => null }, // headless: 不解圖
  });
}

/** 每幀成本代理量。 */
function load(): { systems: number; meshes: number } {
  return { systems: scene.particleSystems.length, meshes: scene.meshes.length };
}

/**
 * 跑一個回合。⚠️ 每回合用**不同的 doc id / modelKey** —— 那不是為了製造洩漏，
 * 那是真實情況:英雄升級解鎖 R/EX、第 3 回合起殭屍加入、**每回合換地圖**(#145)。
 * per-doc-id 的 free-list 正是因此只長不縮。
 */
function playRound(fx: RoundFx, round: number, startMs: number): number {
  let now = startMs;
  for (let i = 0; i < 16; i++) {
    fx.vfx.handleEvent(
      { tick: i, type: "vfxSpawn", data: { x: i % 7, z: i % 5, vfxId: `fx.r${round}-a${i}` } } as unknown as EventMessage,
      now,
    );
    now += 16;
    fx.vfx.update(now);
  }
  // 常駐特效：這一回合的模型上場又下場 → 進 AmbientVfx 的 per-doc-id free-list
  fx.ambient.attach(round, `model-r${round}`, new TransformNode(`hero-r${round}`, scene));
  fx.ambient.tick(now, 16);
  fx.ambient.sweep(new Set<number>());
  // 龍捲風：同樣上場又下場 → 進漏斗 free-list
  fx.whirlwind.sync(round, ZORO, new TransformNode(`zoro-r${round}`, scene), "cast", now);
  fx.whirlwind.tick(now, 16);
  fx.whirlwind.sweep(new Set<number>());
  // 火圈：燒到一半
  fx.fireRing.tick(now, 16, {
    phase: "combat",
    fireRingTicks: 10,
    fireRingRadius: 4,
    zone: { x: 0, z: 0, r: 10 },
  });
  // 回合勝利煙火 —— 它是在 combat → resolution 的那一幀發射的
  fx.victoryFx.playRoundVolley(now, round);
  return now;
}

describe("回合邊界對整張註冊表扇出 (round-vfx-cleanup)", () => {
  it("兩個回合之後場上的每幀成本沒有成長 —— 不是只有 VfxSystem 被清", () => {
    cover("round-vfx-cleanup");
    const fx = makeFx();
    const life = new RoundVfxLifecycle(fx.registry);

    life.sync("combat");
    let now = playRound(fx, 1, 1000);
    const during = load();
    life.sync("resolution");
    life.sync("combat");
    const afterFirst = load();

    // 這一回合真的有東西被畫出來（否則下面的「沒成長」是空話）
    expect(during.systems).toBeGreaterThan(afterFirst.systems);

    now = playRound(fx, 2, now + 5_000);
    life.sync("resolution");
    life.sync("combat");
    const afterSecond = load();

    // 核心斷言：第二回合結束後，場景不比第一回合結束後更重。
    // ⚠️ 只清 VfxSystem 的話,AmbientVfx 的 free-list 會多留一組
    // (`amb.model-r2` 的 ParticleSystem + emitter Mesh) → 兩條都會紅。
    expect(afterSecond.systems).toBe(afterFirst.systems);
    expect(afterSecond.meshes).toBeLessThanOrEqual(afterFirst.meshes);
  });

  it("⭐ leave 不清煙火、enter 才清 —— 兩側一起清等於刪掉 #235", () => {
    cover("round-vfx-cleanup");
    const fx = makeFx();
    const life = new RoundVfxLifecycle(fx.registry);

    life.sync("combat");
    playRound(fx, 1, 1000); // 最後一件事就是回合勝利煙火發射

    life.sync("resolution"); // 這一幀煙火剛出生 —— ⛔ 不可以被清掉
    expect(fx.victoryFx.active).toBe(true);

    life.sync("combat"); // 下一回合開打 —— 上一回合的殘火在這裡收
    expect(fx.victoryFx.active).toBe(false);
  });
});

/**
 * ⭐ GH#560 —— owner 2026-08-22：「不管是**出口**還是**入口**還是**每回合進商店前**」
 * 「你**寧願多次清理乾淨開始回合 也不要漏清到**」。
 *
 * 在此之前只有中間那兩個邊界，而出口走的是 `GameApp.dispose()` 裡**另一份手抄的
 * 清單**（20 幾項 vs 註冊表 5 項）—— 差集就是「每回合沒有人清」的那一批。
 */
describe("GH#560 四個清理邊界走同一份清單 (round-vfx-cleanup)", () => {
  it("⭐ 預設四個邊界全跑；只跑部分邊界的每一列都寫得出理由", () => {
    cover("round-vfx-cleanup");
    const roster = makeFx().registry.roster;
    const everywhere = roster.filter((e) => e.edges.length === CLEANUP_EDGES.length);
    // 承重的那一批共用池真的四個邊界都跑（⛔ 少一個 = 那個邊界沒有人清）
    expect(everywhere.map((e) => e.name)).toEqual(
      expect.arrayContaining(["vfx", "ambient", "whirlwind", "fireRing", "vfxSoundLayer"]),
    );
    for (const e of roster) {
      // ⛔ 一列沒有理由的例外，跟 GH#560 之前那兩份手抄清單是同一件事
      if (e.edges.length < CLEANUP_EDGES.length) {
        expect(e.why.length, `${e.name} 少跑邊界卻沒有寫理由`).toBeGreaterThan(20);
      } else {
        expect(e.why, `${e.name} 四個邊界都跑就不必寫理由`).toBe("");
      }
    }
  });

  it("⭐ 出口（離場）真的把共用池還回去 —— ⛔ 不是只有回合邊界", () => {
    cover("round-vfx-cleanup");
    const fx = makeFx();
    const life = new RoundVfxLifecycle(fx.registry);
    life.sync("combat");
    playRound(fx, 1, 1000);
    const during = load();
    life.exit(); // ＝ `GameApp.dispose()` 裡的那一行
    expect(during.systems, "離場沒有把發射器還回去").toBeGreaterThan(load().systems);
    expect(fx.registry.errorCount, fx.registry.lastErrorText).toBe(0);
  });

  it("一列擲例外不會帶走它後面每一列，但**會被數出來**（⛔ 靜默才是缺陷）", () => {
    cover("round-vfx-cleanup");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ran: string[] = [];
    const r = new RoundFxRegistry()
      .add("boom", () => {
        throw new Error("x");
      })
      .add("after", () => ran.push("after"));
    r.resetForRound("exit");
    expect(ran).toEqual(["after"]);
    expect(r.errorCount).toBe(1);
    warn.mockRestore();
  });
});
