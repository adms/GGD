/**
 * 🎇 **@visual-proof** —— GH#842：「常常打一打，動畫就消失沒有播完」（owner 2026-08-28）。
 *
 * ── 為什麼**還要**一條（既有三支守衛都是綠的）─────────────────────────────
 * `hardCapRefire.test.ts` / `refireClockRollback.test.ts` 釘的是**碼表的語意**，
 * 而它們兩支都跑在**自己手寫的 `fakePs`** 上（`isAlive: () => true` 的假物件）——
 * 那是 CLAUDE.md 點名的**失敗形態⑤：被測的不是出貨的那個**。
 * 它們證明得了「`noteVfxRefired()` 這個函式的語意是對的」，
 * ⛔ 證明不了「**玩家眼前那一發真的還在場上**」。
 *
 * ⇒ 這一條走**出貨的那條路**：真的 `VfxSystem`、真的 `toParticleSystem`、
 *   真的池化（`MAX_POOL_PER_DOC` free-list ＋ LRU 偷）、真的 `VfxSystem.update()`
 *   （硬上限掃描就住在它裡面，:2705）。終端量是 Babylon 自己的
 *   **`getActiveCount()` —— 場上真的有幾顆粒子**。
 *
 * ── ⭐ 驗的是**第二次**演出，⛔ 不是第一次 ────────────────────────────────
 * 第一次永遠是對的（碼表剛按下）。缺陷只在**池化重燃**時發作：
 * 從池子拿回來的 emitter ⛔ 不排空 ⇒ `isAlive()` 一直 true ⇒ 碼表**繼承前一發
 * 的年齡** ⇒ 第 N 發在「第 1 發點燃後三秒」那一刻被 `stop()+reset()` 砍頭。
 * ⇒ 所以量的是「**剛剛點燃的那一發，掃描跑完之後場上還剩幾顆粒子**」的最小值。
 *
 * ── ⚠️ 量尺先自證（⛔ 單邊校準不算）────────────────────────────────────────
 * CLAUDE.md：「一把只驗過單邊的尺，不算自證過⋯已知**有**的量得到 **且**
 * 已知**沒有**的量不到」。⇒ 同一支情境跑**兩遍**：
 *   · `vfxRefireClock = "performance"`（出貨）⇒ 每一發都還在場上（min > 0）
 *   · `vfxRefireClock = "emitter"`（rollback ＝ 2026-08-28 之前）⇒ **量得到那個 0**
 * 兩邊讀數相同 ⇒ 這把尺是瞎的，測試自己會紅（`toBe(0)` 那一條就是 sentinel）。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";

// QualityController 在 import 期就碰 localStorage（同 vfxHardCap.test.ts 的慣例）
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { VfxSystem } from "./VfxSystem";
import { vfxHardMaxLifeSec } from "./vfxCleanupPolicy";
import { resetVfxRefireClockCache, VFX_REFIRE_CLOCK_GLOBAL } from "./vfxCleanupPolicy";

/**
 * 一發近戰打擊的形狀：burst、粒子活得比**重燃間隔**久 ⇒ 池化實例
 * ⛔ 從來不排空。那正是 owner 說的「打一打」——⛔ 不是隨機，是**負載相依**。
 */
const HIT: VfxDoc = {
  id: "fx.test-842-hit",
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.4 },
  mode: "burst",
  burstCount: 24,
  lifetimeSec: { min: 1.5, max: 1.5 },
  size: { start: 0.4, end: 0.1 },
  color: { start: [1, 0.8, 0.4, 1], end: [1, 0.4, 0.1, 0] },
  blendMode: "additive",
};

const REFIRE_MS = 250; // 每 0.25 秒打中一次
const CTX = { entityPos: (): null => null };

interface CombatReading {
  /** 「剛點燃的那一發，掃描跑完之後場上還剩幾顆粒子」的**最小值** */
  minActiveAfterSweep: number;
  /** 剛點燃的那一發，掃描跑完之後**發射器已經被停掉**的次數 */
  stoppedAfterSweep: number;
  /** 跨過上限門檻之後，還量到幾發（⛔ 母體是空的話上面那個 min 沒有意義） */
  samplesPastCap: number;
  /** 硬上限掃描這一場總共強制回收幾次 */
  reclaimed: number;
}

/**
 * 連續戰鬥 —— **完全走出貨的那條路**（`play()` → 池化 → `update()` → 掃描）。
 *
 * ⚠️ 跑到 **上限的兩倍**：出貨那一格是 `vfxHardMaxLifeSec`（⚠️ owner 2026-08-23
 * 同日把它從 3 改到 4 再改到 **5** 秒）—— ⛔ 這裡**讀後台那一格**，不寫死 3，
 * 否則哪天 owner 再調一次，這條守衛就會在一個永遠到不了的門檻上空轉。
 */
function sustainedCombat(): CombatReading {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const vfx = new VfxSystem(scene, CTX);
  const capMs = vfxHardMaxLifeSec() * 1000;

  let minActiveAfterSweep = Number.POSITIVE_INFINITY;
  let stoppedAfterSweep = 0;
  let samplesPastCap = 0;
  const before = new Set<object>(scene.particleSystems);

  for (let t = 0; t <= capMs * 2; t += REFIRE_MS) {
    // ① 打中 —— 出貨的播放入口（池化 free-list ＋ LRU 偷都在它裡面）
    const ps = vfx.play(HIT, 0, 0, t) as ParticleSystem | null;
    expect(ps, "⛔ 出貨的 play() 沒有給出粒子系統 —— 這條情境是空轉的").not.toBeNull();
    // ② 讓 burst 真的生出粒子（NullEngine 沒有 render loop，手動推兩格）
    for (const p of scene.particleSystems) {
      if (before.has(p)) continue;
      (p as ParticleSystem).animate(true);
      (p as ParticleSystem).animate(true);
    }
    // ③ 出貨的每幀更新 —— ⏳ 三秒硬上限掃描就住在這裡（VfxSystem.ts:2705）
    vfx.update(t);
    // ④ 終端量：**玩家眼前剛剛炸開的那一發**，掃描跑完還剩幾顆粒子在飛
    if (t >= capMs) {
      samplesPastCap++;
      minActiveAfterSweep = Math.min(minActiveAfterSweep, ps!.getActiveCount());
      // `isStarted()` false ⇒ 這顆發射器**不會再生粒子**了（stop() 的那一半）
      if (!ps!.isStarted()) stoppedAfterSweep++;
    }
  }

  const reclaimed = (vfx as unknown as { vfxHardCapReclaims: number }).vfxHardCapReclaims;
  vfx.dispose();
  scene.dispose();
  engine.dispose();
  return {
    minActiveAfterSweep: Number.isFinite(minActiveAfterSweep) ? minActiveAfterSweep : -1,
    stoppedAfterSweep,
    samplesPastCap,
    reclaimed,
  };
}

const g = globalThis as unknown as Record<string, unknown>;

describe("🎇 GH#842 出貨路徑：連續戰鬥中，**第二發之後**的特效真的還在場上 (@visual-proof)", () => {
  afterEach(() => {
    delete g[VFX_REFIRE_CLOCK_GLOBAL];
    resetVfxRefireClockCache();
  });

  it("⭐ 出貨檔位（performance）—— 每一發炸開之後場上都還有粒子", () => {
    resetVfxRefireClockCache(); // 出貨預設，⛔ 不設任何 override
    const r = sustainedCombat();
    // 母體不是空的（⛔ 沒有它，下面那條在 -1 上永遠綠）
    expect(r.samplesPastCap, "⛔ 三秒門檻之後一發都沒量到 —— 情境沒有跑到那裡").toBeGreaterThan(4);
    expect(
      r.minActiveAfterSweep,
      "⛔ 有一發在掃描跑完之後場上一顆粒子都不剩 —— 那正是「打一打動畫就消失沒播完」",
    ).toBeGreaterThan(0);
    expect(r.reclaimed, "⛔ 連續戰鬥中有演出被強制回收").toBe(0);
  });

  it("🔁 量尺自證：翻回 rollback 檔位（emitter）⇒ **量得到**那一發消失", () => {
    // ⚠️ 這一半是 `calibrate()`：已知**沒有**的要量不到。兩邊讀數一樣 ⇒ 尺是瞎的。
    g[VFX_REFIRE_CLOCK_GLOBAL] = "emitter";
    resetVfxRefireClockCache();
    const r = sustainedCombat();
    expect(r.samplesPastCap).toBeGreaterThan(4);
    expect(
      r.minActiveAfterSweep,
      "⛔ 舊行為下**沒有**量到演出被砍頭 —— 這把尺對缺陷是瞎的，上面那條綠燈不算數",
    ).toBe(0);
    expect(r.reclaimed, "舊行為下應該真的有東西被強制回收").toBeGreaterThan(0);
  });
});
