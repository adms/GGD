/**
 * 💨 **@visual-proof** —— GH#660：「飛上天的粒子」幾秒之後**場上真的一顆都沒有**。
 *
 * owner 2026-08-24：「每次施法會淡出飛上天的粒子特效 淡出時間可以縮短，
 * 我**不喜歡天空有殘留特效**」。
 *
 * ⭐ 為什麼這一條量的是**活著的粒子數**而不是文件欄位（GH#660 第 4 點逐字）：
 * 「向上飄的粒子就算 alpha 到 0，如果發射器還在噴，天空就還有東西 ⇒ 要驗的是
 * **幾秒之後場上這一族的粒子數回到 0**，⛔ 不是 alpha 曲線的最後一格是 0」。
 * ⇒ 走**出貨的** `toParticleSystem`（唯一的解析入口）＋ **出貨的**那份文件，
 * 用 Babylon 自己的模擬把粒子推到時間軸上再數。
 *
 * 突變（**真的跑過**）：把 `particleFactory` 傳給 `clampFadeOutTail` 的第三個參數
 * 改成 `Infinity`（＝回到只夾最後一段）⇒ 第一條紅：
 * `expected 27 to be +0` —— 0.736 秒時天上還有 **27 顆**。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { dissipateWindow, fadeOutTailSec } from "./fadeOut";
import { readVfxCleanupPolicy, vfxDissipateMaxSec, vfxFadeOutMaxSec } from "./vfxCleanupPolicy";
import { burstNow, toParticleSystem } from "./particleFactory";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
/** 出貨的那兩格（⛔ 不是字面值 —— 抄了就是第四個住處）。 */
const POLICY = readVfxCleanupPolicy(
  JSON.parse(readFileSync(REPO + "content/config/vfx-cleanup.json", "utf8")),
);
const CAP = vfxDissipateMaxSec(POLICY);
/** owner 看到的那一族：施法時飛上天再淡掉的那串（`gravityY > 0` ＝ 往上）。 */
const RISING = "fx.fam.dissipate.physical.s125";

function shipped(id: string): VfxDoc {
  return zVfxDoc.parse(JSON.parse(readFileSync(REPO + `content/vfx/${id}.json`, "utf8")));
}

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

/** 放一次，推進 `sec` 秒（`updateSpeed` 0.016/步），回傳場上還活著幾顆。 */
function aliveAfter(doc: VfxDoc, sec: number, dissipateMaxSec?: number): number {
  const ps: ParticleSystem = toParticleSystem(doc, scene, {
    createTexture: () => null, // NullEngine：不解圖
    ...(dissipateMaxSec === undefined ? {} : { dissipateMaxSec }),
  });
  ps.start();
  expect(burstNow(ps, doc)).toBeGreaterThan(0); // 前提：它真的噴出東西了
  for (let i = 0; i < Math.ceil(sec / 0.016) + 1; i++) ps.animate(true);
  const alive = ps.particles.length;
  ps.dispose();
  return alive;
}

describe("💨 收尾上限：飛上天的粒子真的從畫面上消失 (@visual-proof)", () => {
  it("出貨那一族：整段收尾 ≤ 後台那一格,而且到期時場上一顆都不剩", () => {
    const doc = shipped(RISING);
    const authored = dissipateWindow(doc)!;
    // 前提①：它本來就超標，而且 GH#569 那道閘**量不到**它（0.443 < 0.5）
    expect(authored.tailSec).toBeGreaterThan(CAP);
    expect(fadeOutTailSec(doc)).toBeLessThanOrEqual(vfxFadeOutMaxSec(POLICY));
    // 終點：身體（還在最亮的那一段）＋ 上限之後，場上活著的粒子 = 0
    const gone = authored.bodySec + CAP;
    expect(aliveAfter(doc, gone)).toBe(0);
    // ⭐ 而且是**這道夾子**讓它們消失的：上限拉到 8（止血閥）時同一刻還有粒子
    expect(aliveAfter(doc, gone, 8)).toBeGreaterThan(0);
  });

  it("常駐特效不受影響 —— 一個持續 5 秒的光環⛔ 不該被砍成 0.5 秒", () => {
    const aura: VfxDoc = {
      ...shipped(RISING),
      id: "fx.test-aura",
      ambient: true, // ＝「常駐」的資料住處（`markVfxPersistent` 讀的也是它）
      lifetimeSec: { min: 5, max: 5 },
    };
    // alpha 一樣會走到 0（看得見 → 看不見），但那 5 秒是技能本體不是殘留
    expect(aliveAfter(aura, 5 * 0.6)).toBeGreaterThan(0);
  });
});
