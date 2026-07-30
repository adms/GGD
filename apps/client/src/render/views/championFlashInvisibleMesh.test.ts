/**
 * GH#226 / GH#227 —— 「看不見的網格不可以被閃光畫成實心色塊」。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛在守什麼
 * ---------------------------------------------------------------------------
 * owner 2026-07-29 回報了兩件事，查下去是**同一個根因**：
 *
 *   GH#226「藤井八雲腳底下 一直出現巨型矩形紅色 特效很干擾」
 *   GH#227「臭作武器有白色奇怪遮罩」
 *
 * `mesh.renderOverlay`(#3/#64 的挨打閃光)不是走材質的 shader，它走 Babylon 的
 * `OutlineRenderer`，而那支 render 只讀 mesh 上的兩個欄位：
 *
 *     effect.setColor4("color", mesh.overlayColor, mesh.overlayAlpha)
 *     （@babylonjs/core/Rendering/outlineRenderer.js，useOverlay 分支）
 *
 * 材質的 `alpha` 與 mesh 的 `visibility` **完全不參與**。所以 WC3 mdx→glb 轉檔
 * 留下來的 TeamGlow 佔位面(`baseColorFactor:[0,0,0,0]`、`alphaMode:BLEND`，
 * 平常看不見)只要被推進 `flashMeshes`，一挨打就會變成一片實心純色多邊形。
 *
 * 量到的（直接讀 glTF 的 JSON chunk，2026-07-30）：287 個出貨 glb 裡 76 個帶著
 * `baseColorFactor[3] === 0` 的圖元，共 166 片；其中 18 個是英雄身體模型。
 * 兩位苦主的實測尺寸(模型原生單位，正規化前)：
 *
 *   Hpal.glb  (godie-hpal 藤井八雲 / IllidanEvil) —— 10 片，含
 *       TeamGlow7  2.109 × 0.000 × 2.109  @ y=0.066   ← 腳底的水平方片
 *       TeamGlow1  1.991 × 0.049 × 1.991  @ y=0.108   ← 同上，第二片
 *   Orkn.glb  (godie-orkn 臭作 / HeroShadowHunter) —— 1 片，
 *       TeamGlow3  0.105 × 0.564 × 1.759  @ y=0.406   ← 位置就在武器上
 *
 * Hpal 原生高約 1.92u，#150 正規化到 1.8u 之後那張方片約 1.98 世界單位見方 ——
 * 「巨型矩形」不是形容詞，是量出來的。
 *
 * ---------------------------------------------------------------------------
 * 為什麼用真的出貨 .glb，而不是自己捏一個假容器
 * ---------------------------------------------------------------------------
 * 第⑤號故障形態：手寫一個 `alpha = 0` 的假材質，測到的是「我自己捏的東西」，
 * 而這個缺陷的前提是「**出貨的資產真的長這樣**」。所以 fixture 就是
 * `content/assets/models/imported/picacugy.glb`(godie-o02l 神騎寶貝-皮卡丘 的
 * 本體模型，git 追蹤中)，由真的 glTF loader 載進 NullEngine。
 *
 * `data/blizzard-overlay/` 是 git-ignore 的執行期資產，CI 上不存在，所以八雲與
 * 臭作那兩個檔案是**存在才跑**；但出貨那一條永遠會跑，而且 `KNOWN_DEFECTIVE`
 * 的前提斷言會在資產被修好/換掉時大聲紅掉，而不是靜靜地變成空測試。
 *
 * ---------------------------------------------------------------------------
 * 斷言讀的是最終物件
 * ---------------------------------------------------------------------------
 * 判斷「這塊網格畫不畫得出來」讀的是 `mesh.material`(而不是載入時記下來的那個
 * 材質物件)—— `applyModelTint` 會 clone 材質再指回 `mesh.material`，對原始材質
 * 寫的斷言不管有沒有生效都會過(CLAUDE.md 第 5 條)。閃光那一側讀的也是 Babylon
 * 真的會送進 shader 的 `mesh.renderOverlay` / `mesh.overlayAlpha`，不是任何簿記
 * 旗標。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ModelDoc } from "@ggd/shared/content";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import type { AssetManager } from "../AssetManager";

const REPO = resolve(__dirname, "../../../../..");

/**
 * 三個受害者。第一個是**出貨內容**(永遠跑)，後兩個是 owner 實際回報的兩隻英雄，
 * 檔案在 git-ignore 的 overlay 裡，本機有就跑。
 */
const CASES = [
  {
    hero: "godie-o02l 神騎寶貝 - 皮卡丘 (出貨內容)",
    file: "content/assets/models/imported/picacugy.glb",
    shipped: true,
  },
  {
    hero: "GH#226 godie-hpal 藤井八雲 (腳底紅方塊)",
    file: "data/blizzard-overlay/models/Hpal.glb",
    shipped: false,
  },
  {
    hero: "GH#227 godie-orkn 臭作 (武器白遮罩)",
    file: "data/blizzard-overlay/models/Orkn.glb",
    shipped: false,
  },
] as const;

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

const ID = 226;
const GLB_KEY = "test.body";

const docFor = (): ModelDoc =>
  ({
    id: "model.test",
    schema: "model@1",
    glbPath: "assets/models/test.glb",
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    },
  }) as ModelDoc;

/** The REAL shipped .glb, through the REAL glTF loader. */
async function realContainer(relPath: string): Promise<AssetContainer> {
  const bytes = readFileSync(resolve(REPO, relPath));
  const c = await LoadAssetContainerAsync(`data:base64,${bytes.toString("base64")}`, scene, {
    pluginExtension: ".glb",
  });
  c.removeAllFromScene(); // exactly what LoadAssetContainerAsync leaves behind
  return c;
}

const champ = (): EntityViewState =>
  ({
    id: ID,
    kind: 0,
    seatId: 0,
    key: GLB_KEY,
    teamId: 1,
    x: 0,
    z: 0,
    fx: 0,
    fz: 1,
    alive: true,
    flags: 0,
  }) as EntityViewState;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Every mesh under the view — the ones the flash walks. */
const bodyMeshes = (root: { getChildMeshes(d: boolean): AbstractMesh[] }): AbstractMesh[] =>
  root.getChildMeshes(false);

/** READ THE FINAL OBJECT: whatever material the mesh is wearing right now. */
const matAlphaOf = (m: AbstractMesh): number => {
  const mat = m.material as { alpha?: number } | null;
  return typeof mat?.alpha === "number" ? mat.alpha : 1;
};

describe("GH#226/#227 挨打閃光不可以畫在畫不出來的網格上", () => {
  for (const { hero, file, shipped } of CASES) {
    const present = existsSync(resolve(REPO, file));
    if (!shipped && !present) continue; // overlay is git-ignored runtime state

    it(`${hero}: alpha=0 的 TeamGlow 佔位面挨打時不得開 renderOverlay`, async () => {
      const container = await realContainer(file);
      const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;
      const reg = new EntityViewRegistry(scene, assets, { modelDocFor: () => docFor() });

      reg.sync({
        entities: [champ()],
        poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
        nowMs: 0,
        dtMs: 16,
        loadModels: true,
      });
      await settle();

      const view = reg.getChampionView(ID)!;
      const meshes = bodyMeshes(view.root);
      const invisible = meshes.filter((m) => matAlphaOf(m) <= 0);
      const visible = meshes.filter((m) => matAlphaOf(m) > 0);

      // PREMISE — 這個資產真的帶著看不見的面。資產哪天被修好或換掉，這一行會紅，
      // 而不是讓整條守衛靜悄悄變成「什麼都沒測」。
      expect(
        invisible.length,
        `${file} 應該至少有一片 alpha=0 的網格(這條守衛的前提)`,
      ).toBeGreaterThan(0);
      expect(visible.length, "身體本身必須有畫得出來的網格").toBeGreaterThan(0);

      // ── 挨一記魔法傷害(紅色閃光) ─────────────────────────────────────────
      view.flash([1, 0.2, 0.2], 100, 80, 0.6);
      view.update("idle", 100, 16, 0);

      for (const m of invisible) {
        expect(m.renderOverlay, `${m.name} 是看不見的面,不可以被閃光點亮`).toBe(false);
      }
      // 而且真的身體**有**被點亮 —— 否則「全部關掉」也會讓上面那圈綠。
      const lit = visible.filter((m) => m.renderOverlay);
      expect(lit.length, "身體本身必須有閃光").toBeGreaterThan(0);
      for (const m of lit) expect(m.overlayAlpha).toBeCloseTo(0.6 * matAlphaOf(m), 5);

      // ── 閃光結束 ──────────────────────────────────────────────────────────
      view.update("idle", 400, 16, 0);
      for (const m of [...invisible, ...lit]) expect(m.renderOverlay).toBe(false);

      reg.dispose();
    }, 30000);
  }

  it("半透明的身體只閃到它自己的不透明度(overlay 不可以比本體還實)", async () => {
    // 第二個方向:不是只有 alpha=0 才錯。#220 的死亡溶解會把身體降到 0.35,
    // 而 overlay pass 對 `visibility` 也是視而不見的,所以一具正在消散的屍體
    // 挨打會閃出一具全實心的身體。這條把「乘上去」釘住。
    const container = await realContainer(CASES[0].file);
    const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;
    const reg = new EntityViewRegistry(scene, assets, { modelDocFor: () => docFor() });
    reg.sync({
      entities: [champ()],
      poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
      nowMs: 0,
      dtMs: 16,
      loadModels: true,
    });
    await settle();

    const view = reg.getChampionView(ID)!;
    // WHICH meshes the flash actually owns is private to the view (`flashMeshes`
    // holds the body, NOT the team ring / blob shadow). Find them by flashing
    // once — reading the real behaviour instead of guessing at names.
    view.flash([1, 1, 1], 100, 80, 0.8);
    view.update("idle", 100, 16, 0);
    const lit = bodyMeshes(view.root).filter((m) => m.renderOverlay);
    expect(lit.length, "身體必須有網格參與閃光").toBeGreaterThan(0);

    // now dissolve them (#220) and flash again
    for (const m of lit) m.visibility = 0.25;
    view.flash([1, 1, 1], 300, 80, 0.8);
    view.update("idle", 300, 16, 0);
    for (const m of lit) {
      expect(m.overlayAlpha, m.name).toBeCloseTo(0.8 * 0.25 * matAlphaOf(m), 5);
    }
    reg.dispose();
  }, 30000);
});
