/**
 * 🔆 **原作 additive 混合走得到畫面**（GH#767）—— **@visual-proof**
 *
 * ## 這條閘在問什麼（⛔ 不是「有沒有這個函式」）
 * 原作那一族特效（`filter_mode >= 3` 且無不透明底層）在 WC3 裡是 **additive**：
 * 光是**加**到背景上的。而 `tools/w3x-import/w3xlib/gltf.py` 的 `gltf_texture_luma()`
 * 檔頭**自己承認**它只是「approximates WC3 additive blending in **plain glTF BLEND**」——
 * 而 alpha 混合的結果**永遠 ≤ 兩者的最大值**，於是兩件原作會發生的事
 * **結構上不可能發生**：①暗地板上的光束非常亮 ②**兩層疊起來更亮**。
 *
 * ⭐ 量到的（20-03 約束與勝利之劍，2026-08-26 的驗收）：
 * 光束 lum 中位 **56–76** vs 原作擷圖 **246–254**（暗約 4 倍）；
 * 多層疊加暈/核 **0.63–1.05** vs 原作 **1.27–3.06**
 * ⇒ ⭐ 那**兩項驗收不是兩個缺陷**，是同一個缺陷的兩半。
 *
 * ## 為什麼要跑**出貨那條路**
 * 失敗形態⑤：手寫夾具量的是一個虛構通道。這裡的三條斷言全部從
 * **真的 .glb 位元組 → 真的 glTF 載入器 → 真的 `ModelFxRig.spawn()`** 走一遍，
 * 讀的是**最終掛在 mesh 上**的那份材質（`applyFxTint` 會 clone 再指回去 ——
 * 對原始素材寫的斷言不管有沒有生效都會過，見 `views/mobTint.test.ts` 檔頭）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）────────────────────────────────
 *  · `modelFxRig.ts::applyStockGlowAdditive()` 的 `mat["alphaMode"] = BJS_ALPHA_ONEONE`
 *    改回不設 → ① 紅：「發光材質仍然是 alpha 混合」。
 *    ⇒ 沒有它，#767 的驗收②④**結構上不可能過**，而畫面與「沒做」長得一模一樣。
 *  · GH#780：`BJS_ALPHA_ONEONE` 改回 `0`（v0.28.5 的原值 = `ALPHA_DISABLE`）→ ① 紅
 *    （expected 6, got 0）。⇒ 「黑色閃電」那個回歸再發生會當場被指名。
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelFxRig, setStockGlowAdditive } from "./modelFxRig";
import type { ModelFxSpawnEvent } from "./modelFxPath";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
/**
 * ⭐⭐ **從真的 Babylon 拿含義，⛔ 不抄字面值**（GH#780 的守衛半根因）：
 * 這一行在 2026-08-27 之前寫著 `const ALPHA_ONEONE = 0` —— 與實作**同一個錯值的
 * 第二個住處**，於是「發光材質是純加法」這條斷言綠著，而出貨的 `0` 其實是
 * `ALPHA_DISABLE`（關混合＋寫深度 ⇒ 黑底不透明畫出 ＝ owner 的「黑色閃電」）。
 * 引擎的常數表才是含義的唯一出處；實作端的字面值（不 import，避免耦合）由這裡對帳。
 */
const ALPHA_ONEONE = Constants.ALPHA_ONEONE;
const ALPHA_ADD = Constants.ALPHA_ADD;
const ALPHA_COMBINE = 2;

const WIRE: ModelFxSpawnEvent = {
  caster: 1 as never,
  modelKey: "fx.test.beam",
  path: "static",
  speed: 0,
  x: 0,
  z: 0,
  zone: 0,
  spinDegPerSec: 0,
  instances: [{ x: 0, z: 0, dx: 1, dz: 0, dist: 5, durationSec: 0.5 }],
};

/**
 * 出貨那條路：真 .glb → 真載入器 → 真 `spawn()`。回場景樹上**最終**那批素材。
 * `alpha` = 節點級透明度（出貨時由 `tpl-locust-orb.params.alpha.default` 展開進
 * 每一個 orb 節點，再經 `modelFxSpawn` 事件到 `spawn()` —— 與這裡同一條線）。
 */
async function spawnShipped(file: string, alpha?: number): Promise<PBRMaterial[]> {
  const scene = new Scene(new NullEngine());
  const bytes = readFileSync(join(REPO, "content/assets/models/imported", file));
  const container = await LoadAssetContainerAsync(
    `data:base64,${bytes.toString("base64")}`,
    scene,
    { pluginExtension: ".glb" },
  );
  container.removeAllFromScene();
  const rig = new ModelFxRig(scene, {
    resolveModel: () => ({ glbPath: `assets/models/imported/${file}`, scale: 1 }),
    loadContainer: () => Promise.resolve(container),
  });
  rig.spawn({
    ...WIRE,
    ...(alpha !== undefined ? { alpha } : {}),
    instances: [WIRE.instances[0]!],
  });
  await new Promise((r) => setTimeout(r, 0));
  return scene.meshes
    .map((m) => m.material)
    .filter((m): m is PBRMaterial => m instanceof PBRMaterial);
}

const lit = (m: PBRMaterial): boolean =>
  m.emissiveColor.r > 0 || m.emissiveColor.g > 0 || m.emissiveColor.b > 0;

const isW3xAddAlpha = (m: PBRMaterial): boolean => {
  const w3x = (m.metadata as { gltf?: { extras?: { w3x?: { blend?: unknown; filterMode?: unknown } } } })
    ?.gltf?.extras?.w3x;
  return w3x?.blend === "AddAlpha" || w3x?.filterMode === 4;
};

describe("stock glow 走原作的 additive 混合 (@visual-proof)", () => {
  it("① 出貨光束的長條核心仍是**純加法**（SRC+DEST），沒有為了魔法陣去背把整支光束調暗", async () => {
    setStockGlowAdditive(undefined); // 出貨預設
    // ⭐ monsoonbolttarget = GH#780 的回歸現場（拳四郎變身閃電，7/7 材質全 glow 分支）。
    for (const file of ["revivehuman.glb", "monsoonbolttarget.glb"]) {
      const mats = await spawnShipped(file);
      const glow = mats.filter(lit);
      // 前提自證：這一份 .glb 真的有發光材質。⛔ 沒有的話下面的結論一律作廢。
      expect(glow.length, `前提不成立：${file} 一份發光材質都沒有`).toBeGreaterThan(0);
      const fullAdditive = glow.filter((material) => material.alphaMode === ALPHA_ONEONE);
      expect(
        fullAdditive.length,
        `${file} 沒有任何長條核心保留 ONEONE，代表魔法陣去背規則把整支光束一起調暗了`,
      ).toBeGreaterThan(0);
      for (const m of fullAdditive) {
        expect(
          m.alphaMode,
          `${file}/${m.name} 的長條核心不是純加法（SRC+DEST）⇒ 疊兩層不會變亮`,
        ).toBe(ALPHA_ONEONE);
        // ⚠️ 只設 alphaMode 是「寫了但不會發生」：needAlphaBlending() 為 false 時
        //    混合模式那一格根本不會被讀。
        expect(m.transparencyMode, `${file}/${m.name} 沒解鎖成 ALPHABLEND ⇒ 上面那一格不會被讀`).toBe(
          ALPHA_COMBINE,
        );
      }
    }
  });

  it("② 開關關掉 ⇒ 逐格回到 2026-08-26 之前（止血閥真的可達）", async () => {
    setStockGlowAdditive(false);
    try {
      const mats = await spawnShipped("revivehuman.glb");
      for (const m of mats.filter(lit)) {
        expect(m.alphaMode, "止血閥翻了卻沒有回頭 ⇒ 這格開關是死的").not.toBe(ALPHA_ONEONE);
      }
    } finally {
      setStockGlowAdditive(undefined);
    }
  });

  it("④ 宣告了透明度（節點級 `alpha` < 1，locust-orb 家族預設 0.9）的發光材質走 **ALPHA_ADD**，⛔ 不是忽略 alpha 的 ONEONE", async () => {
    // ⭐ GH#767 的洞（owner 第三次報「Rider, 木乃香 魔法陣沒有去背」，2026-08-28）：
    // 地面魔法陣族（midchilder / oblivion / tome —— 2–3 片同平面 primitive ×
    // emissiveStrength 2 × albedo 同貼圖）在一律 ONEONE 下逐片全額 RGB 相加
    // ⇒ 疊爆成實心白。A/B 像素實測：ONEONE = 白色一大團；ALPHA_ADD／BLEND = 正確
    // 粉紫魔法陣。分工判準是**材質自己的宣告**：alpha < 1 ⇒ 混合模式必須讀 alpha
    // （WC3 fm3 的逐字 blendFunc 就是 (SRC_ALPHA, ONE) ＝ Babylon ALPHA_ADD）。
    setStockGlowAdditive(undefined);
    for (const file of ["oblivionaura.glb", "tomeofretrainingcaster.glb"]) {
      const mats = await spawnShipped(file, 0.9);
      const glow = mats.filter(lit);
      expect(glow.length, `前提不成立：${file} 一份發光材質都沒有`).toBeGreaterThan(0);
      for (const m of glow) {
        expect(
          m.alphaMode,
          `${file}/${m.name} 宣告了 alpha 0.9 卻仍是 ONEONE ⇒ alpha 逐位元被忽略 ＝ #669 rollback 開關是死的、魔法陣疊爆成白`,
        ).toBe(ALPHA_ADD);
        expect(m.alpha, `${file}/${m.name} 的節點級 alpha 沒乘進最終材質`).toBeCloseTo(0.9, 5);
        expect(
          m.transparencyMode,
          `${file}/${m.name} 沒解鎖成 ALPHABLEND ⇒ 混合模式那一格不會被讀`,
        ).toBe(ALPHA_COMBINE);
      }
    }
  });

  it("⑤ 魔法陣即使節點 alpha=1 仍讀貼圖 alpha，不能退化成實心發光方片", async () => {
    setStockGlowAdditive(undefined);
    for (const file of [
      "darkportaltarget.glb",
      "divinering.glb",
      "grandorcaura.glb",
      "grandundeadaura.glb",
      "midchildernanohaaura.glb",
      "oblivionaura.glb",
      "war3mapimported-poweraura.glb",
    ]) {
      const glow = (await spawnShipped(file)).filter(lit);
      expect(glow.length, `前提不成立：${file} 一份發光魔法陣材質都沒有`).toBeGreaterThan(0);
      const alphaShaped = glow.filter((material) => material.alphaMode === ALPHA_ADD);
      expect(
        alphaShaped.length,
        `${file} 的近正方形魔法陣沒有一片讀 PNG alpha，會整組退化成實心方片`,
      ).toBeGreaterThan(0);
      for (const material of alphaShaped) {
        expect(
          material.transparencyMode,
          `${file}/${material.name} 沒解鎖 ALPHABLEND，貼圖去背仍不會生效`,
        ).toBe(ALPHA_COMBINE);
      }
    }
  });

  it("⑥ 目前全部 14 份 WC3 AddAlpha GLB 都真的依貼圖 alpha 合成", async () => {
    setStockGlowAdditive(undefined);
    for (const file of [
      "blackhole1.glb",
      "crescent.glb",
      "darkportaltarget.glb",
      "doom.glb",
      "earthtornado2.glb",
      "frostnova.glb",
      "grandorcaura.glb",
      "grandundeadaura.glb",
      "herocloudcyd.glb",
      "markofchaostarget.glb",
      "minitypeflame.glb",
      "mirrorimagecaster.glb",
      "war3mapimported-poweraura.glb",
      "windmissle.glb",
    ]) {
      const addAlpha = (await spawnShipped(file)).filter(isW3xAddAlpha);
      expect(addAlpha.length, `前提不成立：${file} 沒載到 AddAlpha 材質`).toBeGreaterThan(0);
      for (const material of addAlpha) {
        expect(
          material.alphaMode,
          `${file}/${material.name} 的 WC3 AddAlpha metadata 被忽略，透明底會在實際合成時露出`,
        ).toBe(ALPHA_ADD);
        expect(material.transparencyMode, `${file}/${material.name} 沒解鎖 ALPHABLEND`).toBe(
          ALPHA_COMBINE,
        );
      }
    }
  });

  it("③ 不透明的身體材質**一格都不碰**（自發光全黑 ⇒ 跳過）", async () => {
    setStockGlowAdditive(undefined);
    const mats = await spawnShipped("heropika.glb");
    const body = mats.filter((m) => !lit(m));
    expect(body.length, "前提不成立：這份角色模型沒有全黑自發光的材質").toBeGreaterThan(0);
    for (const m of body) {
      expect(m.alphaMode, `${m.name} 是不透明身體，被改成加法會整個變成鬼影`).not.toBe(ALPHA_ONEONE);
    }
  });
});
