/**
 * BabylonPreviewController — 鑄技工坊「即時試放」的**畫面那一半**（GH#174）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這個檔案存在的理由，一句話
 * ═══════════════════════════════════════════════════════════════════════════
 * `PreviewController.mount()` 在此之前是**一行註解**：
 *
 *     mount(_canvas) { /* renderless stub — BabylonPreview will own … *​/ }
 *
 * 於是工坊第 3 步「即時試放」的 UI 自己掛著一句免責聲明（「不是 3D 放招 ——
 * 3D 預覽仍是 P2」）。⚠️ 那句話**是誠實的**，所以它不是缺陷 —— 缺陷是它已經
 * 誠實了一整年。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 三條硬規則，全部來自 GH#174 的 body，⛔ 一條都不是我挑的
 * ═══════════════════════════════════════════════════════════════════════════
 * ① **同一個介面**。回傳的東西就是 `PreviewController`，所以呼叫端（ForgeStudio /
 *    PreviewPanel）換掉的只有一個 `create*` 的名字，⛔ 不是一條分岔的程式路徑。
 *    ⭐ 而且**資料那一半一行都不重寫** —— 這支控制器持有一個
 *    `createSimPreviewController()` 並把每一支資料方法**原樣轉發**。
 *    ⛔ 任何「Babylon 版自己算一次 finalStats」的寫法都是失敗形態⑤：
 *    被測的（sim 版）不會是出貨的（Babylon 版）。
 *
 * ② **一顆 Engine、一顆 Scene**，`dispose()` 全收。⛔ 不是每次 `previewChampion`
 *    都建一顆 —— 那正是編輯器側欄開著十分鐘之後顯示卡變成暖爐的形狀。
 *
 * ③ **放招走 `IntentFrame`，⛔ 不戳 effectRunner。** 這一條在資料那一半
 *    （`PreviewController.castAbility`）已經做完了，這裡只負責把它吐出來的
 *    `events` 畫成畫面。⭐ 也就是說：**畫面上看到的每一發，都是 sim 真的收下的
 *    那一發** —— 沒有第二條「預覽專用」的施法路徑可以跟出貨分岔。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 還沒做完的那一半（⛔ 不要讀成「已經是遊戲畫面了」）
 * ═══════════════════════════════════════════════════════════════════════════
 * GH#174 要的最終形態是「重用 `apps/client` 的 render/*（ArenaScene / Lighting /
 * CameraRig），⛔ 不要 fork」。這一版重用的是**特效工廠**
 * （`preview3d/particles.ts` → `apps/client/src/vfx/particleFactory`，相對路徑
 * 跨 app 匯入，那條路 2026-07 就已經開了）與 `preview3d/stage.ts` 的地面格線，
 * ⛔ **還沒有**接上 `ArenaScene` / `CameraRig` / `VfxSystem` 的預告圈與投射物。
 * ⇒ 卡片上的措辭必須說出這個差距。ForgeStudio 的文案照這一段寫。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";

import type { CollectionName, ModelDoc, VfxDoc } from "@ggd/shared/content";
import { api } from "../api/client";
import { createGroundGrid } from "../preview3d/stage";
import { loadGlbContainer } from "../preview3d/loadGlb";
import { burstNow, toParticleSystem } from "../preview3d/particles";
import {
  createSimPreviewController,
  type CastPreviewOptions,
  type CastPreviewTrace,
  type PreviewController,
  type ReactionPreviewTrace,
} from "./PreviewController";

/** 舞台的可調旋鈕。⚠️ 每一格都是決策點，所以它們有名字，⛔ 不散在函式裡。 */
export interface BabylonPreviewOptions {
  /**
   * 建 Engine 的工廠。⭐ **這一格就是這支控制器可測的理由**：測試餵 `NullEngine`
   * （無畫布、無 GPU），出貨餵真的 `Engine`。⛔ 沒有這一格的話，唯一能驗證
   * 「mount 真的建了場景 / dispose 真的收乾淨」的方法是開一顆瀏覽器。
   */
  createEngine?: (canvas: HTMLCanvasElement) => Engine;
  /** 取一份內容文件。預設走編輯器自己的 content-api；測試餵樁。 */
  fetchDoc?: <T>(collection: CollectionName, id: string) => Promise<T>;
  /** 場景清除色（編輯器面板的深色底）。 */
  clearColor?: readonly [number, number, number, number];
}

/** `PreviewController` 加上**看得到內部狀態**的幾格 —— 給守衛與偵錯用。 */
export interface BabylonPreviewController extends PreviewController {
  /** 目前的場景；未 mount 時 null。 */
  readonly scene: Scene | null;
  /** 這顆場景現在活著幾個粒子系統（⚠️ 洩漏就是這個數字只增不減）。 */
  readonly liveParticleSystems: number;
  /** 最近一次試放**畫出來**的特效 id，照順序。⛔ 不是「技能宣稱要播的」。 */
  readonly playedVfx: readonly string[];
  /** 等到所有非同步載入（glb / vfx 文件）都落地 —— 守衛用，⛔ 出貨不需要。 */
  settled(): Promise<void>;
}

const DPR_CAP = 2;

/**
 * 一個粒子系統活多久就被回收（秒）。
 *
 * ⚠️ 這個數字存在的理由不是美觀，是**洩漏**：`toParticleSystem` 每呼叫一次就建一顆
 * `ParticleSystem`，而作者在工坊裡一分鐘會按十次試放。沒有這一格，場景會單調地
 * 長大到卡死，而畫面上**看起來完全正常**（每一發都有特效）—— 失敗形態②的反面：
 * 東西送到了，卻沒有人把它收走。
 */
export const PREVIEW_VFX_TTL_SEC = 3;

export function createBabylonPreviewController(
  opts: BabylonPreviewOptions = {},
): BabylonPreviewController {
  // ⭐ 資料那一半**整個**委派出去，⛔ 一行都不重寫（規則①）。
  const data = createSimPreviewController();
  const fetchDoc = opts.fetchDoc ?? (<T>(c: CollectionName, id: string) => api.doc<T>(c, id));
  const createEngine =
    opts.createEngine ??
    ((canvas: HTMLCanvasElement) => {
      const engine = new Engine(canvas, true, { stencil: false }, false);
      engine.setHardwareScalingLevel(1 / Math.min(globalThis.devicePixelRatio || 1, DPR_CAP));
      return engine;
    });

  let engine: Engine | null = null;
  let scene: Scene | null = null;
  let body: AssetContainer | null = null;
  const live: { ps: ParticleSystem; dieAt: number }[] = [];
  const played: string[] = [];
  /** 所有在飛的非同步工作 —— `settled()` 等的就是它。 */
  let pending: Promise<unknown> = Promise.resolve();
  let simSeconds = 0;

  const track = (p: Promise<unknown>): void => {
    // ⚠️ `.catch` 一定要掛上：一份查不到的 model doc 不可以把整個編輯器
    //   變成一個 unhandled rejection。⭐ 但它也不可以**安靜**（fail-open 的那條
    //   守則）—— 所以錯誤留在 console，而 `playedVfx` 不會多出一筆假的成功。
    pending = pending.then(() => p.catch((e) => console.warn("[forge-preview]", e)));
  };

  const teardownBody = (): void => {
    body?.dispose();
    body = null;
  };

  const teardownScene = (): void => {
    teardownBody();
    for (const l of live) l.ps.dispose();
    live.length = 0;
    engine?.stopRenderLoop();
    scene?.dispose();
    engine?.dispose();
    scene = null;
    engine = null;
    simSeconds = 0;
  };

  /** 到期的粒子系統收掉。由 `stepFixed` 推動 —— ⛔ 不掛在 `setInterval` 上。 */
  const reap = (): void => {
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i]!.dieAt <= simSeconds) {
        live[i]!.ps.dispose();
        live.splice(i, 1);
      }
    }
  };

  const playVfxDoc = (doc: VfxDoc, at: Vector3): void => {
    if (!scene) return;
    const ps = toParticleSystem(doc, scene);
    ps.emitter = at.clone();
    burstNow(ps, doc);
    live.push({ ps, dieAt: simSeconds + PREVIEW_VFX_TTL_SEC });
    played.push(doc.id);
  };

  const playVfxById = (vfxId: string, at: Vector3): void => {
    if (!scene) return;
    track(
      fetchDoc<VfxDoc>("vfx", vfxId).then((doc) => {
        playVfxDoc(doc, at);
      }),
    );
  };

  const loadBody = (modelKey: string): void => {
    if (!scene) return;
    track(
      fetchDoc<ModelDoc>("models", modelKey).then(async (doc) => {
        if (!scene) return;
        const container = await loadGlbContainer(scene, doc.glbPath);
        if (!scene) {
          container.dispose();
          return;
        }
        teardownBody();
        container.addAllToScene();
        body = container;
        for (const m of container.meshes as AbstractMesh[]) m.isPickable = false;
      }),
    );
  };

  const renderTraceVfx = (trace: Pick<CastPreviewTrace, "accepted" | "events">): void => {
    if (!scene || !trace.accepted) return;
    const at = new Vector3(0, 1, 0);
    for (const event of trace.events) {
      const id = event.data["vfxId"] ?? event.data["vfxKey"];
      if (typeof id === "string" && id !== "") playVfxById(id, at);
    }
  };

  return {
    get scene() {
      return scene;
    },
    get liveParticleSystems() {
      return live.length;
    },
    get playedVfx() {
      return played;
    },
    settled() {
      return pending.then(() => undefined);
    },

    mount(canvas) {
      // ⭐ 重掛一定先收乾淨 —— 規則②。⛔ 不是「已經有了就不動」：
      //   換一張畫布卻沿用舊 Engine 會畫到一張沒有人看得到的 canvas 上。
      teardownScene();
      if (canvas === null) return;
      engine = createEngine(canvas);
      scene = new Scene(engine);
      scene.clearColor = new Color4(...(opts.clearColor ?? [0.09, 0.1, 0.13, 1]));
      const camera = new ArcRotateCamera(
        "forge-orbit",
        -Math.PI / 2.5,
        Math.PI / 3,
        8,
        new Vector3(0, 1, 1.5),
        scene,
      );
      camera.lowerRadiusLimit = 1;
      camera.upperRadiusLimit = 60;
      camera.wheelDeltaPercentage = 0.02;
      // ⚠️ 只有真的 DOM 元素才掛滑鼠控制。守衛跑在 node 上（`NullEngine` + 一個
      // 假畫布），而 `attachControl` 會直接對元素 `addEventListener` —— 少了這一行，
      // 「mount 到底有沒有建出場景」就只能開瀏覽器才驗得到。
      if (typeof (canvas as Partial<HTMLCanvasElement>).addEventListener === "function") {
        camera.attachControl(canvas, true);
      }
      const hemi = new HemisphericLight("forge-hemi", new Vector3(0.2, 1, 0.1), scene);
      hemi.intensity = 0.75;
      hemi.groundColor = new Color3(0.25, 0.24, 0.3);
      new DirectionalLight("forge-sun", new Vector3(-0.4, -1, -0.35), scene).intensity = 0.9;
      createGroundGrid(scene, 16, 1);
      engine.runRenderLoop(() => scene?.render());
    },

    dispose() {
      teardownScene();
      played.length = 0;
      data.dispose();
    },

    previewChampion(def, o) {
      const out = data.previewChampion(def, o);
      loadBody(def.modelKey);
      return out;
    },

    previewAbility(champion, slot, o) {
      return data.previewAbility(champion, slot, o);
    },

    /**
     * ⭐ **畫面完全跟著 `trace.events` 走。** 沒有第二條施法路徑：sim 沒有喊
     * `abilityCast`，這裡就一個粒子都不會生 —— 於是「編輯器裡放得出來、遊戲裡
     * 按下去沒反應」這個組合在**構造上**不可能發生。
     */
    castAbility(champion, slot, o?: CastPreviewOptions): CastPreviewTrace {
      const trace = data.castAbility(champion, slot, o);
      renderTraceVfx(trace);
      return trace;
    },

    triggerReflectSuccess(champion, abilityId, o): ReactionPreviewTrace {
      const trace = data.triggerReflectSuccess(champion, abilityId, o);
      renderTraceVfx(trace);
      return trace;
    },

    triggerPassiveAbility(champion, abilityId, o): ReactionPreviewTrace {
      const trace = data.triggerPassiveAbility(champion, abilityId, o);
      renderTraceVfx(trace);
      return trace;
    },

    previewItem(item, on, o) {
      return data.previewItem(item, on, o);
    },

    previewAugment(aug, on, o) {
      return data.previewAugment(aug, on, o);
    },

    spawnVfx(vfxKey) {
      data.spawnVfx(vfxKey);
      playVfxById(vfxKey, new Vector3(0, 1, 0));
    },

    stepFixed(ticks) {
      data.stepFixed(ticks);
      simSeconds += ticks / 30;
      reap();
    },
  };
}
