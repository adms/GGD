/**
 * fxTintAudition —— **GH#697 的終端證據台**：`spawnModelFx.tint` 在**真的畫面上**
 * 有沒有把顏色換掉。
 *
 * ⭐ 它回答的是**唯一**的驗收問題：「玩家看到的是紅的還是藍的」。
 * ⛔ 不是「`applyFxTint` 有沒有被呼叫」、⛔ 也不是「亮像素多了幾個」——
 * 一個把整具模型調暗的錯誤修法會讓亮像素數變好看，而顏色照樣是藍的。
 * ⇒ 這一頁量的是**逐通道**：同一份 glb 併排兩具，左邊不著色、右邊 `tint:[1,0,0]`，
 * 讀回 `R/B` 比值。缺陷在的時候兩邊**一模一樣**。
 *
 * ── 鏈路（⛔ 沒有任何一段是這一頁造的）─────────────────────────────────────
 *   出貨的 `content/models/w3x.stock.monsoonbolttarget.json`
 *   → 出貨的 `content/assets/models/imported/monsoonbolttarget.glb`
 *   → 真的 Babylon glTF 載入器 → 真的 `ModelFxRig.spawn()`（節點級 `tint`，GH#693）
 *   → 真的 `applyFxTint` → 真的 WebGL 幀 → `getImageData` 逐通道加總。
 *
 * ── ⭐ 量尺先自證（CLAUDE.md 👁 節 · 洞 d：「量尺自己會說謊」）──────────────
 * `calibrate()` 用**已知的**兩個底色各渲一幀（純紅、純藍）再讀回來。
 * 讀不到正確的通道順序 ⇒ 這一頁之後的每一個結論**一律作廢**。
 * ⚠️ 我在別的量測上踩過兩次相反的結論（背後緩衝尺寸、讀到上一幀），所以校準
 * 是**程式**，⛔ 不是「記得先看一眼」。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { ModelFxRig } from "./modelFxRig";

/** 一半畫面的逐通道讀數。 */
export interface HalfReadout {
  /** 亮起來的像素數（max(R,G,B) > 48） */
  lit: number;
  /** 亮像素的通道均值（0…255） */
  r: number;
  g: number;
  b: number;
  /** ⭐ 驗收看的就是這個：紅/藍。藍色閃電 ≈ 0.2；染紅之後應該 ≫ 1 */
  rOverB: number;
}

const MODEL_DOC = "/content/models/w3x.stock.monsoonbolttarget.json";
const LIT = 48;

function readHalf(canvas: HTMLCanvasElement, side: "left" | "right"): HalfReadout {
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);
  const x0 = side === "left" ? 0 : Math.floor(w / 2);
  const d = ctx.getImageData(x0, 0, Math.floor(w / 2), h).data;
  let lit = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i]!;
    const G = d[i + 1]!;
    const B = d[i + 2]!;
    if (Math.max(R, G, B) <= LIT) continue;
    lit++;
    r += R;
    g += G;
    b += B;
  }
  if (lit === 0) return { lit: 0, r: 0, g: 0, b: 0, rOverB: 0 };
  return {
    lit,
    r: +(r / lit).toFixed(1),
    g: +(g / lit).toFixed(1),
    b: +(b / lit).toFixed(1),
    rOverB: +(r / Math.max(1, b)).toFixed(3),
  };
}

export interface FxTintAuditionResult {
  /** 量尺自證：純紅底 / 純藍底各讀一次。任一條不成立 ⇒ 全部結論作廢 */
  calibration: { red: HalfReadout; blue: HalfReadout; ok: boolean };
  /** 逐幀（tick）的左右讀數 */
  rows: { tick: number; plain: HalfReadout; tinted: HalfReadout }[];
  /** PNG data-URL 擷圖 */
  shots: { name: string; png: string }[];
  notes: string[];
}

/**
 * 跑一次驗收：回逐通道讀數 ＋ 擷圖。
 * `tint` 預設 `[1,0,0]`（出貨 `godie-u00l.r` 那一格的值）。
 */
export async function runFxTintAudition(
  canvas: HTMLCanvasElement,
  tint: readonly [number, number, number] = [1, 0, 0],
): Promise<FxTintAuditionResult> {
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const cam = new FreeCamera("cam", new Vector3(0, 6, -22), scene);
  cam.setTarget(new Vector3(0, 5, 0));
  new HemisphericLight("sun", new Vector3(0, 1, 0), scene);

  const notes: string[] = [];

  // ── ⭐ 量尺自證：底色是已知的，讀回來必須是同一個通道 ────────────────────
  const control = (c: Color4): HalfReadout => {
    scene.clearColor = c;
    scene.render();
    scene.render(); // ⚠️ 兩幀 —— 第一幀可能讀到上一幀（我踩過）
    return readHalf(canvas, "left");
  };
  const red = control(new Color4(0.8, 0, 0, 1));
  const blue = control(new Color4(0, 0, 0.8, 1));
  const ok = red.lit > 0 && blue.lit > 0 && red.rOverB > 4 && blue.rOverB < 0.25;
  scene.clearColor = new Color4(0, 0, 0, 1);
  if (!ok) notes.push("⛔ 量尺自證失敗 —— 底下每一個讀數都不可信");

  // ── 出貨的模型文件（⛔ 不在這裡手寫 glbPath/scale）────────────────────────
  const doc = (await (await fetch(MODEL_DOC)).json()) as {
    glbPath: string;
    scale?: number;
    clipMap?: Record<string, string>;
  };
  const url = `/content/${doc.glbPath}`;
  let container: AssetContainer | null = null;
  const rig = new ModelFxRig(scene, {
    resolveModel: () => ({ glbPath: doc.glbPath, scale: doc.scale ?? 1, clipMap: doc.clipMap }),
    loadContainer: async () => {
      container ??= await LoadAssetContainerAsync(url, scene, { pluginExtension: ".glb" });
      container.removeAllFromScene();
      return container;
    },
  });

  /** 一具站著不動的實例（`dist:0`）—— 顏色的驗收⛔ 不需要位移。 */
  const at = (x: number, paint?: readonly [number, number, number]) => ({
    caster: 1 as never,
    modelKey: "w3x.stock.monsoonbolttarget",
    path: "radial" as const,
    speed: 0,
    x,
    z: 0,
    zone: 0,
    scale: 10,
    clip: "idle",
    ...(paint ? { tint: paint } : {}),
    instances: [{ x, z: 0, dx: 1, dz: 0, dist: 0, durationSec: 6 }],
  });

  rig.spawn(at(-6)); // 左：⛔ 不著色（對照組）
  rig.spawn(at(6, tint)); // 右：這一發的 tint
  // glb 是非同步載入的 —— 讓回填跑完（`ensureContainer` 的 ①c）
  await new Promise((r) => setTimeout(r, 400));

  const rows: FxTintAuditionResult["rows"] = [];
  const shots: FxTintAuditionResult["shots"] = [];
  for (let tick = 0; tick <= 60; tick++) {
    rig.tick(1000 / 60);
    scene.render();
    if (tick === 0 || tick === 20 || tick === 40 || tick === 60) {
      scene.render();
      rows.push({ tick, plain: readHalf(canvas, "left"), tinted: readHalf(canvas, "right") });
      shots.push({ name: `tick${tick}`, png: canvas.toDataURL("image/png") });
    }
  }

  rig.dispose();
  scene.dispose();
  engine.dispose();
  return { calibration: { red, blue, ok }, rows, shots, notes };
}
