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
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
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
/** Babylon `Constants.ALPHA_ONEONE`（`SRC+DEST`，⛔ 不乘 alpha）/ `Material.MATERIAL_ALPHABLEND`。 */
const ALPHA_ONEONE = 0;
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

/** 出貨那條路：真 .glb → 真載入器 → 真 `spawn()`。回場景樹上**最終**那批素材。 */
async function spawnShipped(file: string): Promise<PBRMaterial[]> {
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
  rig.spawn({ ...WIRE, instances: [WIRE.instances[0]!] });
  await new Promise((r) => setTimeout(r, 0));
  return scene.meshes
    .map((m) => m.material)
    .filter((m): m is PBRMaterial => m instanceof PBRMaterial);
}

const lit = (m: PBRMaterial): boolean =>
  m.emissiveColor.r > 0 || m.emissiveColor.g > 0 || m.emissiveColor.b > 0;

describe("stock glow 走原作的 additive 混合 (@visual-proof)", () => {
  it("① 出貨光束的發光材質是**純加法**（SRC+DEST），⛔ 不是 alpha 混合、⛔ 也不是 ALPHA_ADD", async () => {
    setStockGlowAdditive(undefined); // 出貨預設
    const mats = await spawnShipped("revivehuman.glb");
    const glow = mats.filter(lit);
    // 前提自證：這一份 .glb 真的有發光材質。⛔ 沒有的話下面的結論一律作廢。
    expect(glow.length, "前提不成立：revivehuman.glb 一份發光材質都沒有").toBeGreaterThan(0);
    for (const m of glow) {
      expect(
        m.alphaMode,
        `${m.name} 不是純加法（SRC+DEST）⇒ 疊兩層不會變亮；⚠️ 若是 1（ALPHA_ADD）代表又乘了 luma-key 搬進 alpha 的亮度`,
      ).toBe(ALPHA_ONEONE);
      // ⚠️ 只設 alphaMode 是「寫了但不會發生」：needAlphaBlending() 為 false 時
      //    混合模式那一格根本不會被讀。
      expect(m.transparencyMode, `${m.name} 沒解鎖成 ALPHABLEND ⇒ 上面那一格不會被讀`).toBe(
        ALPHA_COMBINE,
      );
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
