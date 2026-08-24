/**
 * babylonStrips —— asset-review.html（#664）的渲染那一半。
 *
 * ⭐ 走**出貨的路徑**，⛔ 不自己抄一份參數翻譯：
 *   · vfx@1 → `toParticleSystem()` / `burstNow()`（對局用的同一個 factory）；
 *   · glb → `AssetManager`（ChampionView / StorePreview 用的同一個載入器，
 *     含 LOD 解析與 byte cache）；
 *   · 場景 → `startCastPillarAudition()` 的那一顆（真的 Engine、競技場視角的
 *     相機、暗地板 —— 「這裡看到的就是對局裡看到的」）。
 *
 * ⚠️ 這個檔案刻意**一行 @babylonjs import 都沒有**：`architecture.test.ts`
 * 的閘規定只有 `render/*` 與 `vfx/*` 可以碰 Babylon（imperative canvas 留在
 * render seam 後面）。這裡全部透過那兩個目錄既有的出口（audition handle 暴露
 * 的 `scene`、AssetManager 的 container）操作 —— 既守住閘，也正好是
 * 「⛔ 不要自己抄一份」的形狀。
 *
 * ⚠️ 節流：**一次只跑一格**由呼叫端（assetReviewApp 的 job queue）保證；
 * 這裡只有一顆共用 engine（`ensure()` 惰性建立），逐格輪流用。
 */
import { startCastPillarAudition, type CastPillarAuditionHandle } from "../vfx/castPillarAudition";
import { toParticleSystem, burstNow } from "../vfx/particleFactory";
import { AssetManager } from "../render/AssetManager";
import type { VfxDoc } from "@ggd/shared/content";

type AuditionScene = CastPillarAuditionHandle["scene"];

const CELL_W = 120;
const CELL_H = 84;
const VFX_FRAMES = 7;
const MODEL_FRAMES = 8;
/** 粒子擺放的高度（地板上方一點，跟技能命中點差不多）。 */
const FX_POS = { x: 0, y: 1.2, z: 0 };

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function waitFrames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await nextFrame();
}

async function waitUntil(deadlineMs: number): Promise<void> {
  while (performance.now() < deadlineMs) await nextFrame();
}

function makeStrip(frames: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CELL_W * frames;
  c.height = CELL_H;
  c.className = "strip";
  return c;
}

export interface ReplayHandle {
  dispose(): void;
}

/**
 * 共用的一顆 Babylon engine（惰性）＋校正量尺＋兩種 strip。
 * `host` 是頁面上一個看不見（offscreen 定位）但仍在 DOM 的容器。
 */
export class StripStudio {
  private handle: CastPillarAuditionHandle | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private assets: AssetManager | null = null;
  /** null = 還沒校正；true/false = calibrate() 的結論。 */
  calibrationOk: boolean | null = null;

  constructor(private readonly host: HTMLElement) {}

  private ensure(): { scene: AuditionScene; canvas: HTMLCanvasElement; assets: AssetManager } {
    if (this.handle === null || this.canvas === null || this.assets === null) {
      const c = document.createElement("canvas");
      c.style.width = "480px";
      c.style.height = "360px";
      this.host.appendChild(c);
      this.canvas = c;
      this.handle = startCastPillarAudition(c);
      this.assets = new AssetManager(this.handle.scene);
    }
    return { scene: this.handle.scene, canvas: this.canvas, assets: this.assets };
  }

  /**
   * 量尺校正（#664 的規定）：畫一片**已知亮**的 quad，readback 斷言讀得到
   * 亮像素。失敗 ⇒ 這一頁後面每一條「看起來沒東西」的結論都不算數。
   *
   * 已知亮的 quad ＝ audition 場景既有的 40×40 地板，把它的 StandardMaterial
   * `emissiveColor` 暫時打成純白（⛔ 不 import Babylon —— 改的是現成 material
   * 實例上的 Color3，走完整個 mesh 渲染管線），讀完再改回來。
   */
  async calibrate(): Promise<boolean> {
    const { scene } = this.ensure();
    const ground = scene.getMeshByName("ground");
    const mat = (ground?.material ?? null) as {
      emissiveColor?: { r: number; g: number; b: number };
    } | null;
    const e = mat?.emissiveColor;
    if (e === undefined) {
      this.calibrationOk = false;
      return false;
    }
    const prev = { r: e.r, g: e.g, b: e.b };
    e.r = 1;
    e.g = 1;
    e.b = 1;
    try {
      await waitFrames(3); // audition 的 render loop 自己在跑，等它畫到
      return (this.calibrationOk = this.countBrightPixels() > 0);
    } finally {
      e.r = prev.r;
      e.g = prev.g;
      e.b = prev.b;
    }
  }

  private countBrightPixels(): number {
    const { canvas } = this.ensure();
    const snap = document.createElement("canvas");
    snap.width = canvas.width;
    snap.height = canvas.height;
    const ctx = snap.getContext("2d");
    if (ctx === null || snap.width === 0 || snap.height === 0) return 0;
    ctx.drawImage(canvas, 0, 0);
    const d = ctx.getImageData(0, 0, snap.width, snap.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i] ?? 0) > 160 && (d[i + 1] ?? 0) > 160) n++;
    }
    return n;
  }

  private snapInto(ctx: CanvasRenderingContext2D, cell: number): void {
    const { canvas } = this.ensure();
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, cell * CELL_W, 0, CELL_W, CELL_H);
  }

  /** vfx@1 → 6–8 幀動畫條（現場渲染，⛔ 不是預存圖）。 */
  async vfxStrip(doc: VfxDoc): Promise<HTMLCanvasElement> {
    const { scene } = this.ensure();
    const strip = makeStrip(VFX_FRAMES);
    const ctx = strip.getContext("2d");
    if (ctx === null) throw new Error("strip canvas 拿不到 2d context");
    const ps = toParticleSystem(doc, scene, { position: { ...FX_POS } });
    try {
      ps.start();
      burstNow(ps, doc); // burst 文件發一發；continuous 文件是 no-op(0)
      // 取樣窗：burst 蓋滿一次生命週期；continuous 先暖 120ms 再掃 1.3s。
      const t0 = performance.now();
      const windowMs =
        doc.mode === "burst" ? Math.max(500, doc.lifetimeSec.max * 1000 * 1.15) : 1300;
      const startMs = doc.mode === "burst" ? 30 : 120;
      for (let i = 0; i < VFX_FRAMES; i++) {
        await waitUntil(t0 + startMs + (i / (VFX_FRAMES - 1)) * windowMs);
        this.snapInto(ctx, i);
      }
    } finally {
      ps.stop();
      ps.dispose();
    }
    return strip;
  }

  /** glb（content 相對路徑）→ 8 幀 turntable 條。 */
  async modelStrip(glbPath: string): Promise<HTMLCanvasElement> {
    const { scene, assets } = this.ensure();
    const container = await assets.load(glbPath);
    if (container === null) throw new Error(`載不到 glb：/content/${glbPath}`);
    const entries = container.instantiateModelsToScene((n) => `review-${n}`);
    const strip = makeStrip(MODEL_FRAMES);
    const ctx = strip.getContext("2d");
    if (ctx === null) throw new Error("strip canvas 拿不到 2d context");
    try {
      const rootNode = entries.rootNodes[0];
      if (rootNode === undefined) throw new Error(`${glbPath} 沒有根節點`);
      // glTF 的根一定是 TransformNode；rootNodes 的宣告型別是 Node，補回去
      const root = rootNode as unknown as TurntableRoot;
      normalizeForTurntable(root);
      entries.animationGroups[0]?.start(true);
      for (let i = 0; i < MODEL_FRAMES; i++) {
        root.rotation.y = (i / MODEL_FRAMES) * Math.PI * 2;
        await waitFrames(2);
        this.snapInto(ctx, i);
      }
    } finally {
      for (const g of entries.animationGroups) g.dispose();
      for (const n of entries.rootNodes) n.dispose();
      for (const s of entries.skeletons) s.dispose();
    }
    return strip;
  }
}

/**
 * 把任意大小的 glb 縮放/平移到 audition 相機（(0,11.5,-12.5)→(0,1.6,0)）看得
 * 舒服的位置：最長邊 ≈3.4 世界單位、中心落在 y≈1.7 的 Y 軸上。
 * ⚠️ 只做乘法與就地改 position/rotation —— glTF 根節點的 -z scaling（RH→LH）
 * 要保留，⛔ 不可以整組覆寫。
 */
function normalizeForTurntable(root: {
  scaling: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  rotationQuaternion: unknown;
  getHierarchyBoundingVectors(): {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}): void {
  (root as { rotationQuaternion: null }).rotationQuaternion = null;
  const b = root.getHierarchyBoundingVectors();
  const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  const s = 3.4 / (size > 1e-4 ? size : 1);
  root.scaling.x *= s;
  root.scaling.y *= s;
  root.scaling.z *= s;
  root.position.x = -((b.min.x + b.max.x) / 2) * s;
  root.position.z = -((b.min.z + b.max.z) / 2) * s;
  root.position.y = 1.7 - ((b.min.y + b.max.y) / 2) * s;
}

/** modal 的 live 重播（vfx）。每個 modal 一顆自己的 engine，關掉就 dispose。 */
export function openVfxReplay(canvas: HTMLCanvasElement, doc: VfxDoc): ReplayHandle {
  const h = startCastPillarAudition(canvas);
  const ps = toParticleSystem(doc, h.scene, { position: { ...FX_POS } });
  ps.start();
  let timer: number | null = null;
  if (doc.mode === "burst") {
    burstNow(ps, doc);
    timer = window.setInterval(
      () => burstNow(ps, doc),
      Math.max(900, doc.lifetimeSec.max * 1000 + 250),
    );
  }
  return {
    dispose(): void {
      if (timer !== null) window.clearInterval(timer);
      ps.dispose();
      h.dispose(); // scene + engine 一起收
    },
  };
}

/** modal 的 live 重播（glb turntable，連續旋轉）。 */
export function openModelReplay(canvas: HTMLCanvasElement, glbPath: string): ReplayHandle {
  const h = startCastPillarAudition(canvas);
  const assets = new AssetManager(h.scene);
  let disposed = false;
  void assets.load(glbPath).then((container) => {
    if (disposed || container === null) return;
    const entries = container.instantiateModelsToScene((n) => `replay-${n}`);
    const root = entries.rootNodes[0];
    if (root === undefined) return;
    normalizeForTurntable(root);
    entries.animationGroups[0]?.start(true);
    h.scene.onBeforeRenderObservable.add(() => {
      root.rotation.y += 0.018;
    });
  });
  return {
    dispose(): void {
      disposed = true;
      h.dispose(); // scene dispose 連 instantiate 出來的東西與 observer 一起收
    },
  };
}
