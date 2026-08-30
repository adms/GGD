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
 * 的年齡** ⇒ 第 N 發在「第 1 發點燃後 `vfxHardMaxLifeSec` 秒」那一刻被
 * `stop()+reset()` 砍頭。⚠️ 那一格**不是 3** —— owner 2026-08-23 同日把它從
 * 3 改到 4 再改到 **5**，所以這條守衛**讀後台那一格**，⛔ 不寫死秒數。
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
import {
  resetVfxRefireClockCache,
  vfxHardMaxLifeSec,
  VFX_REFIRE_CLOCK_GLOBAL,
} from "./vfxCleanupPolicy";

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
  /**
   * ⭐ **終端量**：這份文件的池化實例**加起來**，場上粒子數在**單一一幀**掉最多幾顆。
   *
   * ⚠️ 為什麼是「掉幾顆」而不是「剩幾顆」：粒子自然到期是**一顆一顆**掉的，
   * 而硬上限的 `stop()+reset()` 是把**一整發**（`burstCount` 顆）在同一幀丟掉 ——
   * ⭐ 那正是玩家說的「動畫**消失**沒播完」。⛔ 而「剩幾顆」量不到它：
   * 被砍掉的那一顆發射器下一幀就被重新點燃，讀數又補回去了（量到過：i0 在
   * t=5000 被砍到 0，t=5250 又是 24 —— **看起來完全正常**）。
   */
  biggestOneFrameDrop: number;
  /** 一發的顆數（＝「一整發消失」的門檻，⛔ 不寫死 24） */
  burstSize: number;
  /**
   * ⭐ **第二個軸**：掃描跑完那一刻，有幾個池化發射器被留在 `isStarted() === false`。
   * ⚠️ `isStarted()` 是 false 就代表它**不會再生任何粒子** —— 上面那個「掉了幾顆」
   * 量的是**已經在飛的**被丟掉，這一格量的是**接下來不會再有**。兩個軸都要。
   */
  stoppedAfterSweep: number;
  /** 跨過上限門檻之後量到幾幀（⛔ 母體是空的話上面那個讀數沒有意義） */
  samplesPastCap: number;
  /** 硬上限掃描這一場總共強制回收幾次（⭐ 出貨路徑自己的計數器） */
  reclaimed: number;
  /** 逐格讀數（⭐ 紅的時候印出來 —— 一個沒有數字的失敗訊息要再跑一輪才查得動） */
  trace: string;
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

  let biggestOneFrameDrop = 0;
  let stoppedAfterSweep = 0;
  let samplesPastCap = 0;
  let prevTotal: number | null = null;
  let burstSize = 0;
  const trace: string[] = [];
  const before = new Set<object>(scene.particleSystems);

  /** 這份文件的池化實例（⛔ 不含 VfxSystem 自己開機就有的那些）現在總共幾顆粒子。 */
  const onScreenTotal = (): number => {
    let n = 0;
    for (const p of scene.particleSystems) {
      if (before.has(p)) continue;
      n += (p as ParticleSystem).getActiveCount();
    }
    return n;
  };

  for (let t = 0; t <= capMs * 2; t += REFIRE_MS) {
    // ① 打中 —— 出貨的播放入口（池化 free-list ＋ LRU 偷都在它裡面）
    const ps = vfx.play(HIT, 0, 0, t) as ParticleSystem | null;
    expect(ps, "⛔ 出貨的 play() 沒有給出粒子系統 —— 這條情境是空轉的").not.toBeNull();
    burstSize = Math.max(burstSize, ps!.manualEmitCount);
    // ② 讓 burst 真的生出粒子（NullEngine 沒有 render loop，手動推兩格）
    for (const p of scene.particleSystems) {
      if (before.has(p)) continue;
      (p as ParticleSystem).animate(true);
      (p as ParticleSystem).animate(true);
    }
    // ③ 出貨的每幀更新 —— ⏳ 硬上限掃描就住在這裡（VfxSystem.ts:2705）
    vfx.update(t);
    // ④ 終端量：這一幀畫面上的粒子比上一幀少了幾顆
    const total = onScreenTotal();
    if (t >= capMs) {
      samplesPastCap++;
      if (prevTotal !== null) biggestOneFrameDrop = Math.max(biggestOneFrameDrop, prevTotal - total);
      // ⭐ 被掃描 stop() 掉的發射器 ⇒ 它**不會再生粒子**（可見性的另一半）。
      // ⚠️ Babylon 要**再推一格**才把「停了而且空了」翻成 `isStarted() === false`
      //    （`thinParticleSystem.js`：`if (this._stopped) { if (!this._alive)
      //    { this._started = false; } }` 住在 `animate()` 裡）——⇒ 這裡推的這一格
      //    就是真實 render loop 的下一幀，⛔ 不是為了讓斷言好過。
      for (const p of scene.particleSystems) {
        if (before.has(p)) continue;
        (p as ParticleSystem).animate(true);
      }
      let stoppedNow = 0;
      for (const p of scene.particleSystems) {
        if (before.has(p)) continue;
        if (!(p as ParticleSystem).isStarted()) stoppedNow++;
      }
      stoppedAfterSweep += stoppedNow;
      trace.push(`${t}:${total}${stoppedNow ? `!${stoppedNow}` : ""}`);
    }
    prevTotal = total;
  }

  const reclaimed = (vfx as unknown as { vfxHardCapReclaims: number }).vfxHardCapReclaims;
  vfx.dispose();
  scene.dispose();
  engine.dispose();
  return {
    biggestOneFrameDrop,
    burstSize,
    stoppedAfterSweep,
    samplesPastCap,
    reclaimed,
    trace: trace.join(" "),
  };
}

const g = globalThis as unknown as Record<string, unknown>;

describe("🎇 GH#842 出貨路徑：連續戰鬥中，**第二發之後**的特效真的還在場上 (@visual-proof)", () => {
  afterEach(() => {
    delete g[VFX_REFIRE_CLOCK_GLOBAL];
    resetVfxRefireClockCache();
  });

  it("⭐ 出貨檔位（performance）—— ⛔ 沒有任何一整發在同一幀從畫面上消失", () => {
    resetVfxRefireClockCache(); // 出貨預設，⛔ 不設任何 override
    const r = sustainedCombat();
    // 母體不是空的（⛔ 沒有這兩條，下面那條在一個空跑的情境上永遠綠）
    expect(r.samplesPastCap, "⛔ 上限門檻之後一幀都沒量到 —— 情境沒有跑到那裡").toBeGreaterThan(4);
    expect(r.burstSize, "⛔ 一發零顆粒子 —— 這條情境是空轉的").toBeGreaterThan(0);
    expect(
      r.biggestOneFrameDrop,
      `⛔ 有一整發（≥${r.burstSize} 顆）在同一幀從畫面上消失 —— 那正是「打一打動畫就消失沒播完」\n  逐格(t:場上粒子數)：${r.trace}`,
    ).toBeLessThan(r.burstSize);
    expect(
      r.stoppedAfterSweep,
      `⛔ 掃描把發射器留在 isStarted()===false —— 它接下來一顆粒子都不會生\n  逐格(t:場上粒子數,!N = N 顆已停)：${r.trace}`,
    ).toBe(0);
    expect(r.reclaimed, "⛔ 連續戰鬥中有演出被硬上限強制回收（出貨路徑自己的計數器）").toBe(0);
  });

  it("🔁 量尺自證：翻回 rollback 檔位（emitter）⇒ **量得到**那一整發消失", () => {
    // ⚠️ 這一半是 `calibrate()`：已知**沒有**的要量不到。兩邊讀數一樣 ⇒ 尺是瞎的。
    g[VFX_REFIRE_CLOCK_GLOBAL] = "emitter";
    resetVfxRefireClockCache();
    const r = sustainedCombat();
    expect(r.samplesPastCap).toBeGreaterThan(4);
    expect(
      r.biggestOneFrameDrop,
      `⛔ 舊行為下**沒有**量到整發消失 —— 這把尺對缺陷是瞎的，上面那條綠燈不算數\n  逐格(t:場上粒子數)：${r.trace}\n  reclaimed=${r.reclaimed}`,
    ).toBeGreaterThanOrEqual(r.burstSize);
    expect(
      r.stoppedAfterSweep,
      "⛔ 舊行為下**沒有**量到發射器被 stop() —— 這把尺在第二個軸上也是瞎的",
    ).toBeGreaterThan(0);
    expect(r.reclaimed, "舊行為下應該真的有演出被強制回收").toBeGreaterThan(0);
  });
});
