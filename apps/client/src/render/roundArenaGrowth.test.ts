/**
 * ⭐【換場地不可以留下垃圾】GH#559 —— owner 2026-08-22 的「越玩越 LAG」。
 *
 * > 「一樣還是**越玩越LAG**⋯請你徹底清查 找到 root cause」
 * > 「有個可能是 我曾經回報**地圖載入地面是黑的**，那之後才這樣，
 * >   所以有可能是做**載入優化**時搞爛的」
 *
 * ⭐ 他的猜測是對的方向（GH#536 的地面載入優化那一批），而量到的根因是**它旁邊那一條**：
 * `buildArena` 在 zone 迴圈**外面**無條件 `new` 了 `obstacleMat` / `obstacleRimMat`，
 * 卻只在「這個 zone 真的有那一種障礙物」時才把它指派給 mesh：
 *   · `box` / `segment` → 只用 `obstacleMat`
 *   · `circle` 的地面環 → 只用 `obstacleRimMat`
 * 而 `disposeArena` 的回收靠的是 `mesh.dispose(false, true)`（第二個參數是
 * `disposeMaterialAndTextures`）—— **只收得到有主人的那幾顆**。
 * ⇒ 一張沒有圓形障礙的場地，每次換圖留下 2 顆孤兒材質。**而地圖每回合換（task #145）。**
 *
 * 量到的（修之前，8 個回合逐輪換圖）：
 *   `mesh 0 / node 0 / particleSystem 0`（全部乾淨）而
 *   `scene.materials` = 1 → 1 → 1 → 3 → 3 → 5 → 7 → **9**　⛔ 單調成長，沒有上界。
 *
 * ── ⭐ 為什麼斷言「**等於**第 1 回合」而不是「小於某個門檻」──────────────
 * 門檻會隨出貨場地數漂掉，而「**常數**」正是這個缺陷的定義本身。
 * 這與 `roundGrowthIsBounded.test.ts`（modelFx free-list）是同一條規矩。
 *
 * ⚠️ `scene.textures` **刻意不釘常數**：那是 `groundTextureCache` 跨回合共用的四張
 * 地面 PNG（GH#536 的正解，⛔ 不是洩漏），它有界（每個 `style@uvScale` 一組，
 * 出貨 13 張圖）。⭐ 它應不應該有上限是**另一張票**（第一守則:那要是一格後台旋鈕），
 * ⛔ 不在這條守衛的管轄內 —— 這裡只釘「換場地留下的**孤兒**」。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `ArenaScene.disposeArena` 拿掉 `for (const mat of handles.materials) mat.dispose();`
 *    → FAIL：`R8 材質數要等於 R1`，收到 `9` 期望 `1`。改回來 → 綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDoc } from "@ggd/shared/content";
import { buildArena, disposeArena } from "./ArenaScene";

const ROUNDS = 8;

describe("換場地不留孤兒 (arena-round-growth-559)", () => {
  it(`★ 逐輪換圖 ${ROUNDS} 次，殘留的材質/mesh/節點**等於**第 1 回合`, () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const dir = fileURLToPath(new URL("../../../../content/arenas/", import.meta.url));
    // ⛔ 出貨的場地文件，⛔ 不是手寫的夾具 —— 「哪一張圖有圓形障礙」正是這個缺陷
    // 的觸發條件，而手寫夾具會讓它逐位元消失（失敗形態⑤：被測的不是出貨的那個）。
    const docs = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as ArenaDoc)
      .filter((d) => (d as { schema?: string }).schema?.startsWith("arena"));
    expect(docs.length, "一張出貨場地都沒掃到 ⇒ 下面整條在對空集合放行").toBeGreaterThan(3);

    const load = (round: number): { mat: number; mesh: number; node: number } => {
      const doc = docs[(round - 1) % docs.length]!;
      const h = buildArena(scene, arenaDefFromDoc(doc), (doc as { groundStyle?: string }).groundStyle);
      disposeArena(scene, h);
      return { mat: scene.materials.length, mesh: scene.meshes.length, node: scene.transformNodes.length };
    };

    const first = load(1);
    for (let r = 2; r <= ROUNDS; r++) {
      const now = load(r);
      expect(now.mat, `R${r} 材質數要等於 R1 —— 每回合換圖留下孤兒材質 = 越玩越 LAG`).toBe(first.mat);
      expect(now.mesh, `R${r} mesh 數要等於 R1`).toBe(first.mesh);
      expect(now.node, `R${r} 節點數要等於 R1`).toBe(first.node);
    }
    scene.dispose();
    engine.dispose();
  }, 300000);
});
