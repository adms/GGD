/**
 * GH#270 —— 「一次性發射器不會隨回合成長」的守衛。
 *
 * owner 2026-08-04 用 v0.9.33 的診斷面板在**真的線上對局**量到線性洩漏：
 *
 *     Round 2 → 144 個發射器 / 2,819 顆活粒子
 *     Round 4 → 266 個發射器 / 5,975 顆活粒子
 *
 * ⚠️ 這個檔案刻意**不**斷言「有沒有呼叫 purge()」。那種守衛只是把實作抄一遍，
 * 而且對第③種故障（可以從渲染樹刪掉但測試還是全綠）完全沒有鑑別力。這裡量的
 * 是 owner 量的**同一個量**：`sampleVfxEmitters()` 讀回來的 `total`，也就是
 * 診斷面板上那個數字，來源是真的 Babylon `scene.particleSystems`。
 *
 * ── 為什麼既有的 `VfxSystem.roundReset.test.ts` 對這個是綠的 ───────────────
 * 它每一拳都用同一個 `amount: 120`、沒有 `profile`，所以打擊感共用池
 * （`ImpactComposer` → `BurstPool`）自始至終只有**一組 key**。而那個池子的
 * key 是 `${intensity}/${tint}/${layer}` —— **tint 烘在 key 裡**。真的一場比賽
 * 會一直遇到新的 tint（每支技能的 `tintOfDoc`、block/counter/magic/ice 各自的
 * 常數、EX 施法、擊殺），所以「每個 key 上限 4 個」根本不是上界：
 * **key 的數量本身沒有上界**。下面的 harness 就是把這一點餵進去。
 *
 * ── 為什麼用 `animate(true)` 推進粒子 ──────────────────────────────────────
 * NullEngine 沒有 GL，`ParticleSystem.isReady()` 永遠 false，所以 `animate()`
 * 與 `scene.render()` 在這裡**一顆粒子都不會生、也不會老**（實測寫在
 * `render/vfx/w3xPureEmitterOnScreen.test.ts` 的檔頭）。preWarm 分支跑同一套
 * 發射/老化邏輯，只是用固定步長取代 animation ratio 並跳過 GL 就緒檢查 ——
 * 也就是「引擎是好的」那一側，正是要模擬的那一側。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// QualityController 這個 singleton 在 import 期就會碰 localStorage — stub 掉
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSystem } from "./VfxSystem";
import { HitSpark, impactComposerFor } from "./HitSpark";
import { sampleVfxEmitters, type VfxDebugScene } from "../vfxDebugBus";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  extraSparks.length = 0;
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
    burstCount: 16,
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 0.6, 0.2, 1], end: [1, 1, 1, 0] },
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

/** owner 的面板讀的就是這一個數字。 */
function emitterCount(): number {
  return sampleVfxEmitters(scene as unknown as VfxDebugScene, 5000).total;
}

const KINDS = ["hit", "heavy", "magic", "ice", "counter", "block"] as const;
const DMG = ["physical", "magic", "true"] as const;

/**
 * 跑一個回合。`round` 決定這一回合**新出現**的技能顏色 —— 英雄升級解鎖 R/EX、
 * 第 3 回合起殭屍加入、每回合換地圖，一場比賽看過的 tint 就是一直在增加的，
 * 而每一個新 tint 在打擊感池裡是 3 個新 key（白光/火花/煙）× 每 key 4 個實例。
 */
function playRound(vfx: VfxSystem, round: number, startMs: number, frames = 150): number {
  let now = startMs;
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      // 這一回合場上出現過的技能顏色（EX 施法 / 擊殺走 `tintOfDoc`，量化到 0.25
      // 步長）。**種類隨回合累積**：英雄升級解鎖 R/EX、第 3 回合起殭屍加入、
      // 每回合換地圖 —— 第 4 回合看得到的顏色是第 1 回合的四倍，而打擊感池的
      // key 把顏色烘在裡面。這正是「每個 key 上限 4 個」不構成上界的地方。
      const n = i % (round * 5);
      const tint: [number, number, number] = [1, 0.25 * (n % 5), 0.25 * (Math.floor(n / 5) % 5)];
      vfx.handleEvent(
        {
          tick: f,
          type: "hitImpact",
          data: {
            source: 100 + (i % 12),
            target: 200 + (i % 12),
            amount: 120,
            x: i % 9,
            z: (i * 3) % 9,
            dmgType: DMG[i % DMG.length],
            profile: { sparkKind: KINDS[i % KINDS.length], hitstopMs: 0, shake: 0, flashMs: 0 },
          },
        } as unknown as EventMessage,
        now,
      );
      if (i % 5 === 0) {
        // EX 施法的分層爆點。**這一行就是缺陷的來源**：`VfxSystem.layeredPop`
        // 對 EX 施法傳的是 `tintOfDoc(doc)`，也就是**那一支技能自己的顏色**，
        // 而顏色是共用打擊感池的 key 的一部分。這裡直接 `new HitSpark(...)` 是
        // 因為那正是 `layeredPop` 做的事（同一個 class、同一個 per-Scene
        // composer），而走 `abilityCast` 事件需要一整個註冊好的技能表 ——
        // 那會把這條守衛變成在測內容而不是在測回收機制。
        extraSparks.push(new HitSpark(scene, i % 9, (i * 3) % 9, now, "ex", 260, tint));
        vfx.handleEvent(
          {
            tick: f,
            type: "vfxSpawn",
            data: { x: i % 9, z: (i * 3) % 9, vfxId: `fx.r${round}-a${i % 10}` },
          } as unknown as EventMessage,
          now,
        );
      }
    }
    now += 16;
    vfx.update(now);
    for (const s of extraSparks) s.update(now);
    for (let j = extraSparks.length - 1; j >= 0; j--) if (extraSparks[j]!.done) extraSparks.splice(j, 1);
    for (const ps of scene.particleSystems) (ps as ParticleSystem).animate(true);
  }
  return now;
}

/**
 * 模擬 `VfxSystem.sparks` —— EX 爆點的把手清單。回合邊界時 `resetForRound()`
 * 會把它清空（`this.sparks = []`），所以這裡也要清，否則測的就不是出貨行為。
 */
const extraSparks: HitSpark[] = [];

/** 回合之間的商店時間：證明「等一等自己就會掉」不是這個缺陷的解法。 */
function intermission(vfx: VfxSystem, startMs: number): number {
  let now = startMs;
  for (let f = 0; f < 60; f++) {
    now += 500;
    vfx.update(now);
    for (const ps of scene.particleSystems) (ps as ParticleSystem).animate(true);
  }
  return now;
}

describe("GH#270 一次性發射器不隨回合成長", () => {
  /**
   * 守衛（乙）——「發射器為什麼不被回收」。
   *
   * 突變驗證（2026-08-04，三步都跑過）：
   *   1. 綠：24 → 24 → 24 → 24（成長率 0）。
   *   2. 把 `VfxSystem.resetForRound()` 裡的
   *      `if (purgeImpactPoolOnRoundEnd(policy)) impactComposerFor(this.scene).purge();`
   *      刪掉 → 紅：**68 → 77 → 84 → 93，成長率 +8.33 個發射器／回合**。
   *   3. 改回來 → 綠（24 → 24 → 24 → 24）。
   */
  it("四回合之後，回合邊界的發射器數沒有比第一回合多", () => {
    cover("gh270-one-shot-emitter-budget");
    const vfx = makeVfx();
    let now = 1000;
    const atBoundary: number[] = [];
    const inCombat: number[] = [];
    for (let round = 1; round <= 4; round++) {
      now = playRound(vfx, round, now);
      inCombat.push(emitterCount());
      // ⚠️ 順序就是出貨的順序：`RoundVfxLifecycle.sync()` 在 phase 從 combat
      // 翻掉的**那一幀**就清，不是等商店逛完才清。以前這裡把 30 秒商店時間排在
      // resetForRound 之前，於是閒置回收器有足夠時間把池子收乾淨，
      // 「回合邊界有沒有清」就變得看不出來 —— 那是一條對缺陷沒有鑑別力的守衛。
      vfx.resetForRound();
      extraSparks.length = 0; // 出貨的 resetForRound() 也把 `this.sparks` 清空
      atBoundary.push(emitterCount());
      now = intermission(vfx, now);
      now += 5_000;
    }

    // 前提：每一回合真的有東西被畫出來，否則下面的「沒成長」是空話
    for (const n of inCombat) expect(n).toBeGreaterThan(0);

    // 斷言的是**機制**不是數字（出貨值一調就過期的斷言不是守衛）：
    // 回合邊界之後留下的發射器數，**不可以跟著回合走**。第 4 回合場上出現過
    // 的技能顏色是第 1 回合的四倍，所以任何「殘骸量正比於顏色種類」的池子
    // 都會在這裡露出來 —— 修之前實測 24 → 43 → 58 → 67（成長率 +14.3/回合），
    // 修之後 24 → 24 → 24 → 24（成長率 0）。
    //
    // 那個常數 24 是刻意**不被斷言**的：它是血/打擊回饋那兩個池子，它們的 key
    // 是有限的列舉（`SparkKind` × `dmgType`），本來就有界，而且 `resetForRound`
    // 刻意留著它們（丟掉只是讓下一回合第一次揮刀重新配置）。把 24 寫進斷言
    // 就是把一個實作細節變成第四個「出貨值住處」。
    const detail = `回合邊界發射器數: ${atBoundary.join(" → ")}`;
    const first = atBoundary[0]!;
    const last = atBoundary[atBoundary.length - 1]!;
    const growthPerRound = (last - first) / (atBoundary.length - 1);
    expect(growthPerRound, detail).toBeLessThanOrEqual(0);
  });

  /**
   * 守衛（甲/fail-safe）—— 硬上限。
   *
   * 就算之後又有人新增一個沒人管的池子，成長也只會撞到這條線。而且**撞到時
   * 說得出來**：`oneShotEvictionCount` 會往上跳（CLAUDE.md：靜默夾掉才是缺陷）。
   *
   * 突變驗證（2026-08-04，三步都跑過）：
   *   1. 綠：池子 ≤ 12，驅逐數 = 夾掉的數量。
   *   2. 把 `BurstPool.trimIdleTo` 的第一行改成 `return 0`（＝上限形同不存在）
   *      → 紅：`expected 44 to be less than or equal to 12`。
   *   3. 改回來 → 綠。
   */
  it("硬上限把打擊感池夾住，而且驅逐數會被說出來（不是靜默的）", () => {
    cover("gh270-one-shot-emitter-cap");
    const vfx = makeVfx();
    // 上限與掃描間隔是後台可調的；測試不去改 config（那會變成在測出貨值），
    // 而是**直接呼叫**同一支被出貨路徑呼叫的 API，證明它真的會夾。
    const composer = impactComposerFor(scene);
    let now = 1000;
    now = playRound(vfx, 1, now, 60);
    const beforeCap = composer.pooledCount;
    expect(beforeCap, "harness 沒有把池子撐開，下面的夾子等於沒被測到").toBeGreaterThan(12);

    // 讓所有粒子過期（夾子只回收閒置的實例 —— 正在飛的爆點不准憑空消失）
    now += 5_000;
    for (const ps of scene.particleSystems) (ps as ParticleSystem).animate(true);
    const evicted = composer.trimIdleTo(12, now);

    expect(composer.pooledCount).toBeLessThanOrEqual(12);
    expect(evicted, "夾掉了但沒有回報數量 = 靜默的上限").toBe(beforeCap - composer.pooledCount);
  });

  /**
   * 守衛（甲）—— 共用打擊感池的回收器**不是**只在有活的 HitSpark 時才跑。
   *
   * 修之前 `ImpactComposer.update()` 唯一的呼叫者是 `HitSpark.update()`，也就是
   * 「至少還有一拳的把手活著」時才被打點。戰鬥一安靜（正是殘骸該被收走的時候）
   * 它就停了。這一條餵一段**完全沒有新事件**的時間，然後要求池子縮下去。
   *
   * 突變驗證（2026-08-04，三步都跑過）：
   *   1. 綠：安靜 30 秒後池子回到 0。
   *   2. 把 `VfxSystem.update()` 的 `impactComposerFor(this.scene).update(nowMs);`
   *      刪掉 → 紅：`安靜 30 秒後仍是 44（開打時 44）` —— 一個都沒少。
   *   3. 改回來 → 綠。
   */
  it("戰鬥安靜之後，閒置的打擊感發射器仍然會被回收", () => {
    cover("gh270-composer-pumped-without-sparks");
    const vfx = makeVfx();
    const composer = impactComposerFor(scene);
    let now = 1000;
    now = playRound(vfx, 1, now, 60);
    const busy = composer.pooledCount;
    expect(busy).toBeGreaterThan(0);
    // 一個事件都不再進來，只是時間在走（商店時間）
    now = intermission(vfx, now);
    expect(composer.pooledCount, `安靜 30 秒後仍是 ${composer.pooledCount}（開打時 ${busy}）`).toBe(0);
  });
});
