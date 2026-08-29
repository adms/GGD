/**
 * ⚡🌈 GH#549 —— 「反彈成功」的**七彩閃電爆炸**真的長在被反彈者身上。
 *
 * owner 2026-08-22:「理想鄉被反彈的敵方單位 身上要有明顯的**七彩閃電爆炸**⋯
 * 不然都不知道發生什麼事情**有沒有反擊成功**」。
 *
 * ⭐ 讀的是**出貨的那一份** `content/abilities/godie-e002.**r**.json`（失敗形態⑤）——
 * 夾具自己手寫一個 vfxId 的話，出貨 JSON 改指到別份文件它照樣是綠的。
 * ⚠️ 2026-08-23 從 `.ex` 換成 `.r`：反彈是 **R**（20-04 永恆的理想鄉）做的，
 *   回饋跟著反彈走，⛔ 不跟著「反彈成功之後那一支追打技能」走
 *   —— 否則 EX 沒解鎖的那一整場，反彈成功與失敗在畫面上一模一樣。
 * ⛔ 沒有一個顏色值／長度／道數進斷言（第二守則：驗機制不驗數字）。
 *
 * 突變（一批一條，最承重）：`VfxSystem` 的 `case "vfxSpawn"` 裡那個
 * `for (const req of reflectArcBurstPlan(...))` 迴圈刪掉 → ① 紅（場上零條弧）。
 *
 * ⚠️⚠️ **上面點名的檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-e002.r.json`
 *   · `content/abilities/godie-e002.**r**.json` 是 **skillremake:json** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh skillremake:json`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     batch1.py 從 tools/skill-remake/heroes/<英雄>.py **整份重建** ⇒ 任何欄位手改都會消失。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { reflectArcBurstPlan, REFLECT_ARC_CUES } from "./reflectArcBurst";

const R_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../content/abilities/godie-e002.r.json",
);

/** 出貨文件的 `onReflectSuccess` 頂層那一發 `spawnVfx` 的 id（⛔ 不是字面值）。 */
function shippedBurstVfxId(): string {
  const doc = JSON.parse(readFileSync(R_PATH, "utf8")) as {
    effects: { hooks?: { on: string; effects: { kind: string; vfxId?: string }[] }[] }[];
  };
  const hook = doc.effects
    .flatMap((e) => e.hooks ?? [])
    .find((h) => h.on === "onReflectSuccess")!;
  const spawn = hook.effects.find((e) => e.kind === "spawnVfx");
  expect(spawn?.vfxId, "出貨的反彈成功不再噴任何演出文件").toBeTruthy();
  return spawn!.vfxId!;
}

let engine: NullEngine;
let scene: Scene;
let fx: VfxSystem;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  fx = new VfxSystem(scene, { entityPos: () => null });
});
afterEach(() => {
  fx.dispose();
  scene.dispose();
  engine.dispose();
});

const AT = { x: 5, z: -2 };

/** 場上活著的弧帶，逐條回它離某個座標最近的頂點距離。 */
function arcDistancesTo(p: { x: number; z: number }): number[] {
  const out: number[] = [];
  for (const m of scene.meshes) {
    if (!m.name.startsWith("vfx-arc") || !m.isEnabled()) continue;
    const v = m.getVerticesData(VertexBuffer.PositionKind);
    if (!v) continue;
    let best = Infinity;
    for (let i = 0; i < v.length; i += 3) best = Math.min(best, Math.hypot(v[i]! - p.x, v[i + 2]! - p.z));
    out.push(best);
  }
  return out;
}

function spawn(vfxId: string): void {
  fx.handleEvent({ type: "vfxSpawn", tick: 9, data: { vfxId, x: AT.x, z: AT.z, caster: 3 } }, 0);
}

describe("🌈 反彈成功 → 被反彈者身上炸開一團七彩閃電", () => {
  it("① 出貨技能的那一發演出，在場上長出從那個座標往外炸的弧", () => {
    expect(arcDistancesTo(AT)).toHaveLength(0);
    const id = shippedBurstVfxId();
    expect(REFLECT_ARC_CUES[id], `出貨指的演出 ${id} 不在反彈弧表上 —— 玩家看不到閃電`).toBeDefined();

    spawn(id);
    const d = arcDistancesTo(AT);
    const fromCentre = d.filter((v) => v < 0.4).length;
    expect(fromCentre, "場上沒有任何一條從被反彈者身上出發的弧").toBeGreaterThanOrEqual(
      REFLECT_ARC_CUES[id]!.count,
    );
  });

  it("② 七彩 —— 每一道弧的色相互不相同，⛔ 不是同一個顏色畫 N 次", () => {
    const id = shippedBurstVfxId();
    const plan = reflectArcBurstPlan(id, AT, 7, 1);
    const hues = new Set(plan.map((r) => r.tint.join(",")));
    expect(hues.size, "所有弧同色 = 那不是七彩，是一團").toBe(plan.length);
  });

  it("③ 表上沒有的演出文件 ⛔ 不長弧（⛔ 不是每一發特效都配一團閃電）", () => {
    spawn("fx.thorn");
    expect(arcDistancesTo(AT)).toHaveLength(0);
  });
});
