/**
 * ⏱ vfx-fade-out-tail (GH#569) —— owner 2026-08-23 的**常設規定**：
 * 「fade out 尾段一律最多佔 0.5 秒後一定要清理乾淨」。
 *
 * 兩條斷言，各關一個方向：
 *  ① **掃全樹**：出貨的每一份 vfx，解析之後尾段都不超過**後台那一格**
 *     —— 上限從 `content/config/vfx-cleanup.json` 推導，⛔ 不抄 0.5
 *     （抄了就是第四個住處，而它沒有守衛）。
 *  ② **被測的是出貨的那一個**（失敗形態⑤）：真的走 `toParticleSystem`
 *     —— 那是整個 repo 唯一把 vfx@1 變成 Babylon 粒子系統的地方。夾子被拿掉時
 *     ①仍然是綠的（純函式自己還在），②會紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { zVfxCollectionDoc, type VfxDoc } from "@ggd/shared/content";
import { clampFadeOutTail, fadeOutTail, fadeOutTailSec } from "./fadeOut";
import { readVfxCleanupPolicy, vfxFadeOutMaxSec } from "./vfxCleanupPolicy";
import { toParticleSystem } from "./particleFactory";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const VFX_DIR = REPO + "content/vfx/";

/** 出貨的那一格（⛔ 不是字面值 0.5）。 */
const CAP = vfxFadeOutMaxSec(
  readVfxCleanupPolicy(JSON.parse(readFileSync(REPO + "content/config/vfx-cleanup.json", "utf8"))),
);

function shippedParticleDocs(): VfxDoc[] {
  const out: VfxDoc[] = [];
  for (const f of readdirSync(VFX_DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = zVfxCollectionDoc.parse(JSON.parse(readFileSync(VFX_DIR + f, "utf8")));
    if (doc.schema === "vfx@1") out.push(doc as VfxDoc);
  }
  return out;
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

describe("特效尾段 fade out 的常設上限 (vfx-fade-out-tail)", () => {
  it("出貨的每一份 vfx 解析之後,尾段都不超過後台那一格,而且透明之後不再活著", () => {
    cover("vfx-fade-out-tail");
    const docs = shippedParticleDocs();
    expect(docs.length).toBeGreaterThan(100); // 這棵樹真的被走過了
    const bad: string[] = [];
    for (const doc of docs) {
      const resolved = clampFadeOutTail(doc, CAP);
      const tail = fadeOutTail(resolved);
      if (!tail) continue; // 硬切,沒有 fade
      // 浮點：秒數是 1e-4 進位過的，容忍一個進位單位
      if (tail.tailSec > CAP + 1e-4) bad.push(`${doc.id} 尾段 ${tail.tailSec.toFixed(3)}s`);
      if (tail.deadSec > 1e-4) bad.push(`${doc.id} 透明後還活 ${tail.deadSec.toFixed(3)}s`);
    }
    expect(bad).toEqual([]);
  });

  it("夾子裝在出貨的解析入口上 —— toParticleSystem 建出來的系統真的比較短", () => {
    cover("vfx-fade-out-tail");
    // 一份 8 秒的匯入文件：前 0.4 秒全亮，之後 7.6 秒慢慢淡掉（sephboom 的形狀）
    const doc: VfxDoc = {
      id: "fx.test-long-fade",
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "burst",
      burstCount: 8,
      lifetimeSec: { min: 8, max: 8 },
      size: { start: 1, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      colorStops: [
        [0, [1, 1, 1, 1]],
        [0.05, [1, 0.5, 0.2, 1]],
        [1, [0.4, 0.1, 0, 0]],
      ],
      blendMode: "additive",
    };
    expect(fadeOutTailSec(doc)).toBeGreaterThan(CAP); // 前提：它本來就超標
    const ps = toParticleSystem(doc, scene);
    // 身體 0.4s + 尾段上限 —— 粒子在尾段結束的那一刻就死，⛔ 不是 8 秒後
    expect(ps.maxLifeTime).toBeLessThanOrEqual(0.4 + CAP + 1e-4);
    expect(ps.maxLifeTime).toBeLessThan(doc.lifetimeSec.max);
    ps.dispose();
  });
});
