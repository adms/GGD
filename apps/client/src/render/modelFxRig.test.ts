/**
 * 三個新特效通道的**一條**薄守衛（體驗層 ⇒ ⛔ 不開對抗輪，第零守則⑦）。
 *
 * 驗的是三條**承重線**，⛔ 不是三組數字：
 *   ① `ModelFxRig` 壽命到之後真的**回收**進 free-list，重放時**重用**（池子不長大）
 *      —— 拿掉 `release()` 的入池，或拿掉 `acquire()` 的 `free.pop()`，這一條就紅。
 *      這是 #131（孤兒發射器卡在場中央）在模型通道上的同一個形狀。
 *   ② `prefers-reduced-motion` 下震動**不會**送到相機（無障礙硬要求）。
 *   ③ 克勞德一次七刀 ⇒ 七個字同時進得去、事後**整池回收**（⛔ 不是每次 new）。
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelFxRig } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "./modelFxPath";
import { ScreenFxLayer } from "../vfx/ScreenFxLayer";
import { FloatingTextFx } from "../vfx/FloatingTextFx";

/**
 * ⭐ **線路形狀**（GH#606）—— `radial count:3`，三個方向由 sim 解算完送來。
 * ⛔ 舊版這裡是 `ModelFxMotionSpec` ＋ `facingRad`，而出貨路徑從來不產生它。
 */
const WIRE: ModelFxSpawnEvent = {
  caster: 1 as never,
  modelKey: "fx.test.orb",
  path: "radial",
  speed: 10,
  x: 0,
  z: 0,
  zone: 0,
  spinDegPerSec: 720,
  instances: [
    { x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: 0.866, dist: 5, durationSec: 0.5 },
    { x: 0, z: 0, dx: -0.5, dz: -0.866, dist: 5, durationSec: 0.5 },
  ],
};
const VIEWER = { isCaster: true, isVictim: true };

describe("moving-model FX rig", () => {
  it("壽命到就回收，重放時重用同一批節點（⛔ 池子不長大）", () => {
    const scene = new Scene(new NullEngine());
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => Promise.resolve(null),
    });

    expect(rig.spawn(WIRE)).toBe(3);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0);

    // 走完全程 → 到期
    rig.tick(2000);
    expect(rig.liveCount).toBe(0);
    expect(rig.pooledCount).toBe(3); // ← 回收發生了

    rig.spawn(WIRE);
    expect(rig.liveCount).toBe(3);
    expect(rig.pooledCount).toBe(0); // ← 重用發生了（⛔ 沒有新造）

    rig.resetForRound();
    expect(rig.liveCount).toBe(0);
    rig.dispose();
  });
});

describe("screen FX", () => {
  it("reduced-motion 下震動不送到相機，一般情況下會送", () => {
    const sent: number[] = [];
    const opts = { host: null, addShake: (a: number) => sent.push(a) };
    const spec = { amplitude: 0.2, durationSec: 0.3 };
    expect(new ScreenFxLayer({ ...opts, reducedMotion: true }).shake(spec, VIEWER)).toBe(false);
    expect(new ScreenFxLayer({ ...opts, reducedMotion: false }).shake(spec, VIEWER)).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe("floating text", () => {
  it("同一點七發全部進得去且分道，到期整池回收", () => {
    const fx = new FloatingTextFx();
    const poolSize = fx.entries.length; // ⛔ 不抄字面值（第二守則:驗機制不驗數字）
    for (let i = 1; i <= 7; i++) expect(fx.spawn({ text: `${i}Hit`, x: 0, y: 2, z: 0 })).toBe(true);
    expect(fx.liveCount).toBe(7);
    expect(new Set(fx.entries.filter((e) => e.active).map((e) => e.lane)).size).toBe(7);
    for (let i = 0; i < 40; i++) fx.tick(100);
    expect(fx.liveCount).toBe(0);
    expect(fx.entries).toHaveLength(poolSize); // 池是固定的，⛔ 沒有長大
  });
});

/**
 * ⭐【顏色】`model@1.fxTint` —— owner 2026-08-23 逐字：「作為**翻轉角度的蝗蟲群單位**
 * **通常大小跟顏色都有再做調整**，務必檢查，**避免出現很小顏色又不對的氣功砲**」。
 *
 * 兩條，⛔ 都不驗「顏色等於某個 RGB」（第二守則：驗機制不驗數字）：
 *  ① **著色真的到得了畫面** —— 讀**最終**素材物件（clone 之後指回去的那一份），
 *     ⛔ 不讀我們餵進去的那一份（`views/mobTint.test.ts` 檔頭記的那個陷阱）。
 *  ② **每一個出貨的 `fxTint` 都引用得到來源** —— 逐份比對原作普查
 *     `UNIT_TINTS.json`（w3u → 基底 → `UnitUI.slk` 解出來的頂點色）。
 *     ⛔ 沒有這一條，任何人都可以挑一個好看的 RGB 塞進出貨文件。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · ⭐ 承重線 —— `modelFxRig.ts::acquire()` 拿掉 `if (doc.fxTint) applyFxTint(...)`
 *      → 紅：「fxTint 沒有到達畫面」。⇒ 沒有它，38-002「黑」龍波就不是黑的，
 *      而 `content:build` 與每一條既有守衛**全綠**（第一·五守則的形狀）。
 */
describe("model fx tint", () => {
  it("① 著色乘進最終素材（⛔ 不是我們餵進去的那一份）", async () => {
    const scene = new Scene(new NullEngine());
    const src = new StandardMaterial("src", scene);
    src.diffuseColor = new Color3(1, 1, 1);
    const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    mesh.material = src;
    const container = new AssetContainer(scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);

    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1, fxTint: [0, 0, 0] }),
      loadContainer: () => Promise.resolve(container),
    });
    // ⚠️ 第一發把載入踢起來 —— `ensureContainer` 走 promise，await 之後容器 resolve，
    //    GH#673-① 的回填會把這一具補上幾何（含 fxTint —— 回填走同一份 `fillGeometry`）。
    //    第二發仍刻意超過池子造新的，讓「造新＋容器已載」那條路也被著色驗到。
    rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
    await new Promise((r) => setTimeout(r, 0));
    rig.tick(2000);
    expect(rig.spawn(WIRE)).toBe(3);

    // ⭐ 從**出貨的場景樹**上撈，⛔ 不是靠一個只有測試會呼叫的存取器（失敗形態⑤）。
    const painted = scene.meshes.filter((m) => m !== mesh && m.material);
    expect(painted.length, "一具著色過的網格都沒有進場景樹").toBeGreaterThan(0);
    for (const m of painted) {
      const c = (m.material as StandardMaterial).diffuseColor;
      expect([c.r, c.g, c.b], "fxTint 沒有到達畫面").toEqual([0, 0, 0]);
    }
    // ⛔ 原始素材不可以被就地改掉（它是整個容器共用的）。
    expect([src.diffuseColor.r, src.diffuseColor.g, src.diffuseColor.b]).toEqual([1, 1, 1]);
    rig.dispose();
  });

  it("③ fxAlpha 乘進最終素材的 alpha 並解鎖混合（⛔ 不是 visibility 開關）", async () => {
    // GH#688 Phase 4 機制②：alpha 是缺口表裡唯一「兩側都空白」的欄 —— 原作只存在
    // runtime（57 個 SetUnitVertexColorBJ 呼叫點），這一格是模型級恆定半透明那一半。
    const scene = new Scene(new NullEngine());
    const src = new StandardMaterial("src", scene);
    const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
    mesh.material = src;
    const container = new AssetContainer(scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1, fxAlpha: 0.5 }),
      loadContainer: () => Promise.resolve(container),
    });
    rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
    await new Promise((r) => setTimeout(r, 0));
    const painted = scene.meshes.filter((m) => m !== mesh && m.material);
    expect(painted.length, "一具套過 fxAlpha 的網格都沒有進場景樹").toBeGreaterThan(0);
    for (const m of painted) {
      const mat = m.material as StandardMaterial & { transparencyMode?: number };
      expect(mat.alpha, "fxAlpha 沒有到達畫面 —— 半透明的 dummy 以全不透明出場").toBeCloseTo(0.5, 5);
      // 素材沒被鎖成 OPAQUE（StandardMaterial 無 transparencyMode 欄則略過）。
      if (mat.transparencyMode !== undefined && mat.transparencyMode !== null)
        expect(mat.transparencyMode).toBe(2);
    }
    expect(src.alpha, "⛔ 原始素材被就地改掉了（容器共用）").toBe(1);
    rig.dispose();
  });

  it("② 每一個出貨 fxTint 都引用得到原作普查的一列", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const census: Record<string, { tint: number[]; model: string }> = JSON.parse(
      readFileSync(join(root, "tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json"), "utf8"),
    ).units;
    const known = new Set(Object.values(census).map((u) => JSON.stringify(u.tint.map(Number))));
    const dir = join(root, "content/models");
    let checked = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { fxTint?: number[] };
      if (!doc.fxTint) continue;
      checked++;
      expect(known, `${f} 的 fxTint 不在原作普查裡 —— ⛔ 出貨顏色不可以自己挑`).toContain(
        JSON.stringify(doc.fxTint.map(Number)),
      );
    }
    expect(checked, "沒有任何一份文件宣告 fxTint —— 這一格是死的").toBeGreaterThan(0);
  });
});

/**
 * ⭐ GH#673-① —— 首發空殼回填的守衛。BA lane 的像素證據
 * （`docs/_reports/beam_visual-proof_20260824-2240`）：glb 未載時 acquire 回空 root，
 * 而「幾何晚幾幀補進來」那句註解**沒有任何人兌現**；空殼 release 進池子後被
 * pop 直接重用 ⇒ **首發與第二發都整發看不見**（modelKey 首次出現的那一回合 =
 * owner 開遊戲驗證按的那一發）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · `modelFxRig.ts::ensureContainer()` 拿掉容器 resolve 後的回填迴圈（①c）
 *    → a 紅：「首發那具在 glb 載完後仍是 0 頂點」。
 */
describe("GH#673-① 首發空殼回填（⛔ 不是永遠空殼循環）", () => {
  const oneShot: ModelFxSpawnEvent = { ...WIRE, instances: [WIRE.instances[0]!] };
  /** 從**出貨的場景樹**數每一個 beam 根節點的頂點（0 = 空殼），⛔ 不靠測試用存取器。 */
  const beamVerts = (scene: Scene): number[] =>
    scene.transformNodes
      .filter((n) => n.name.startsWith(`modelfx-${WIRE.modelKey}-`))
      .map((n) => n.getChildMeshes(false).reduce((s, m) => s + m.getTotalVertices(), 0));
  const mkRig = (scene: Scene) => {
    let resolveLoad!: (c: AssetContainer | null) => void;
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("geo", { size: 1 }, scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const rig = new ModelFxRig(scene, {
      resolveModel: () => ({ glbPath: "assets/models/x.glb", scale: 1 }),
      loadContainer: () => new Promise((r) => (resolveLoad = r)),
    });
    return { rig, finishLoad: async () => { resolveLoad(container); await new Promise((r) => setTimeout(r, 0)); } };
  };

  it("a. 容器載完的當下，還活著的首發空殼被回填幾何", async () => {
    const scene = new Scene(new NullEngine());
    const { rig, finishLoad } = mkRig(scene);
    rig.spawn(oneShot); // glb 還在串流 ⇒ 空殼準時上場（刻意的，⛔ 不是等載完再生）
    expect(beamVerts(scene), "前提不成立：此刻應該還是空殼").toEqual([0]);
    await finishLoad();
    expect(
      beamVerts(scene)[0],
      "首發那具在 glb 載完後仍是 0 頂點 —— 玩家第一次施放永遠看不到光束",
    ).toBeGreaterThan(0);
    rig.dispose();
  });

  it("b. 池子裡的空殼在重用時補幾何 —— 第二發不再看不見", async () => {
    const scene = new Scene(new NullEngine());
    const { rig, finishLoad } = mkRig(scene);
    rig.spawn(oneShot);
    rig.tick(2000); // 容器還沒到就到期 ⇒ 空殼進 free-list
    expect(rig.pooledCount).toBe(1);
    await finishLoad(); // 容器到了，但殼在池子裡（⛔ 不在 live）⇒ 回填輪不到它
    rig.spawn(oneShot); // 重用那個殼 —— acquire 要在這裡補
    expect(
      beamVerts(scene).some((v) => v > 0),
      "重用的池中空殼沒有補幾何 —— 第二發（glb 已載好幾秒）照樣整發看不見",
    ).toBe(true);
    rig.dispose();
  });
});
