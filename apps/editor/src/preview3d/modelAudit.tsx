/**
 * 🔬 #1265 模型預覽驗收台（dev-only，入口 `apps/editor/model-audit.html`）。
 *
 * owner 2026-09-15（逐字）：「檢查一下 129個模型已經入庫可在後台下拉選單選擇並預覽 (開票)」
 *
 * ⭐ 被測的是**出貨的那一個**（第二守則形態⑤）：
 *   · 預覽 → 真的 `ModelPanel`，參數照抄後台 `apps/admin/src/ui/ModelPreview.tsx`
 *     （`autoPlay="idle"`、`normalizeBody: true`）
 *   · 後台下拉清單 → 真的 `readModelVersionCatalog`（`apps/admin/src/contentApi.ts`）
 *   · 編輯器清單 → 真的 `bundledHeroCatalog.modelIds`（`heroBodyModelIds` 的出貨規則）
 * ⛔ 不是 `apps/client/public/ou99-model-shots.html` —— 那一頁是 three.js＋自己算相機，
 *   ⛔ 不走 hiddenPrimitives／yaw／normalizedModelScale，量到的不是後台畫出來的那一顆。
 *
 * ⭐ 量尺的兩個已知陷阱（CLAUDE.md 記過）：
 *   ① 畫布**沒有** `preserveDrawingBuffer`（`BabylonCanvas.tsx` 的 `new Engine(canvas, true, {stencil:false})`）
 *     ⇒ `toDataURL()` 會讀到清空的緩衝 ⇒ 一律在 `scene.onAfterRenderObservable` **那一幀裡**讀像素。
 *   ② 載入失敗時 `ModelPanel` **不會**移除上一顆模型（只顯示錯誤字）⇒ 像素會量到上一顆 ⇒
 *     成敗一律看 DOM 的 `.preview3d-error`，⛔ 不看像素。
 * 量之前關掉地板網格 `ground-grid`（碰撞圓柱預設就是關的）⇒ 非背景像素＝模型本身。
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { ModelPanel } from "./ModelPanel";
import { readModelVersionCatalog } from "../../../admin/src/contentApi";
import { bundledHeroCatalog } from "../hero/catalog";
import "../styles.css";

/** `BabylonCanvas` 的 clearColor [0.09, 0.1, 0.13] × 255。 */
const BG = [23, 26, 33] as const;
const NONBG_DELTA = 6; // 與 batch3/4 那把尺相同的門檻
const LIT = 60;
const TIMEOUT_MS = 45_000; // 有些 GLB 在軟體算繪下解碼 >20 秒（ValhallaPanel.tsx 檔頭）
const THUMB = 128; // 接觸表縮圖邊長（中央正方形裁切）

export interface AuditResult {
  id: string;
  status: "ready" | "load-error" | "doc-invalid" | "doc-missing" | "timeout";
  error?: string;
  meshes: number;
  nonBackgroundPixels: number;
  litPixels: number;
  frame: [number, number];
  ms: number;
  thumb?: string;
}

let setDocOuter: (doc: Record<string, unknown> | null) => void = () => undefined;

function App(): React.JSX.Element {
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  setDocOuter = setDoc;
  return (
    <div style={{ width: 480 }}>
      {doc ? <ModelPanel doc={doc} autoPlay="idle" appearance={{ normalizeBody: true }} /> : <p>idle</p>}
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(pred: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const v = pred();
    if (v) return v;
    await sleep(50);
  }
  return null;
}

function stage(): { engine: Engine; scene: Scene } | null {
  const engine = EngineStore.LastCreatedEngine as Engine | null;
  const scene = engine?.scenes[0];
  return engine && scene && !engine.isDisposed ? { engine, scene } : null;
}

const errorText = (): string | null => document.querySelector(".preview3d-error")?.textContent ?? null;
const liveRoots = (scene: Scene) => scene.transformNodes.filter((n) => n.name === "editor-model-root" && !n.isDisposed());

/** 在**那一幀裡**讀像素並算數；順便縮一張 96px 的縮圖給報告的接觸表。 */
function measure(engine: Engine, scene: Scene, thumb: boolean, thumbPx = THUMB): Promise<Pick<AuditResult, "nonBackgroundPixels" | "litPixels" | "frame" | "thumb">> {
  const grid = scene.getMeshByName("ground-grid");
  const gridWas = grid?.isEnabled() ?? false;
  grid?.setEnabled(false);
  return new Promise((resolve) => {
    void (async () => {
    // ⛔⛔ 2026-09-15 第一輪量到 24 顆「ready、有網格、非背景像素剛好 0」，而最慢的 5 顆全在裡面
    //   ⇒ 材質（內嵌 PNG 非同步解碼、shader 編譯）還沒 ready 時 Babylon 會**靜默跳過**那些網格
    //   （CLAUDE.md 記過的量尺陷阱）。⇒ 先等整個場景 ready，再算繪。
    //   ⚠️ 而那一輪的校準是綠的 —— 正控制那顆又小又快，⛔ 證明不了慢的那一族。
    await Promise.race([scene.whenReadyAsync(), sleep(20_000)]);
    // ⚠️ 內建瀏覽器面板隱藏時 rAF 被節流 ⇒ 等 onAfterRenderObservable 會等不到下一幀。
    // ⇒ 手動算繪幾次再**在同一個 JS 任務裡**讀像素（中間沒有 present／clear），⛔ 不依賴畫面更新。
    for (let i = 0; i < 4; i++) scene.render(); // 讓 fitModelInView 與第一個動作姿勢落定
    {
      const w = engine.getRenderWidth();
      const h = engine.getRenderHeight();
      void engine.readPixels(0, 0, w, h).then((view) => {
        grid?.setEnabled(gridWas);
        const px = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        let nb = 0;
        let lit = 0;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
          if (Math.max(Math.abs(r - BG[0]), Math.abs(g - BG[1]), Math.abs(b - BG[2])) > NONBG_DELTA) nb++;
          if (Math.max(r, g, b) > LIT) lit++;
        }
        let dataUrl: string | undefined;
        if (thumb) {
          const full = document.createElement("canvas");
          full.width = w;
          full.height = h;
          const ctx = full.getContext("2d")!;
          const img = ctx.createImageData(w, h);
          for (let y = 0; y < h; y++) {
            const src = (h - 1 - y) * w * 4; // WebGL 由下往上
            img.data.set(px.subarray(src, src + w * 4), y * w * 4);
          }
          ctx.putImageData(img, 0, 0);
          // ⚠️ 畫面是 956×516 —— 直接縮成正方形會把模型壓扁。
          // ⇒ 裁**中央正方形**（fitModelInView 會把模型置中）再縮到 THUMB px，長寬比不變。
          const side = Math.min(w, h);
          const small = document.createElement("canvas");
          small.width = thumbPx;
          small.height = thumbPx;
          small.getContext("2d")!.drawImage(full, (w - side) / 2, (h - side) / 2, side, side, 0, 0, thumbPx, thumbPx);
          dataUrl = small.toDataURL("image/jpeg", 0.7);
        }
        resolve({ nonBackgroundPixels: nb, litPixels: lit, frame: [w, h], thumb: dataUrl });
      });
    }
    })();
  });
}

async function auditDoc(
  id: string,
  doc: Record<string, unknown> | null,
  thumb = true,
  pose?: { clip: string; seconds: number },
  thumbPx = THUMB,
): Promise<AuditResult> {
  const t0 = performance.now();
  const base = { id, meshes: 0, nonBackgroundPixels: 0, litPixels: 0, frame: [0, 0] as [number, number] };
  if (!doc) return { ...base, status: "doc-missing", ms: 0 };
  const before = stage();
  const prevRoots = new Set(before ? liveRoots(before.scene) : []);
  setDocOuter(doc);
  await sleep(400); // ModelPanel 的 debounce 250ms ＋ effect 清掉上一顆的錯誤字
  const outcome = await waitFor(() => {
    const err = errorText();
    if (err?.startsWith("Doc invalid")) return { kind: "doc-invalid" as const, err };
    if (err?.startsWith("GLB load failed")) return { kind: "load-error" as const, err };
    const s = stage();
    const root = s ? liveRoots(s.scene).find((n) => !prevRoots.has(n)) : undefined;
    return root ? { kind: "ready" as const, root } : null;
  }, TIMEOUT_MS);
  if (!outcome) return { ...base, status: "timeout", ms: Math.round(performance.now() - t0) };
  if (outcome.kind !== "ready") return { ...base, status: outcome.kind, error: outcome.err, ms: Math.round(performance.now() - t0) };
  const s = stage()!;
  if (pose) {
    // GH#1186：停在「某個動作的第幾秒」再拍 —— 逐動作顯示／隱藏只有這樣量得到
    const groups = s.scene.animationGroups;
    const g = [...groups].reverse().find((x) => x.name === pose.clip);
    if (!g) {
      return { ...base, status: "doc-invalid", error: `找不到動作「${pose.clip}」`, ms: Math.round(performance.now() - t0) };
    }
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    groups.forEach((x) => x.stop());
    g.start(false, 1.0, g.from, g.to);
    g.goToFrame(g.from + pose.seconds * fps);
    g.pause();
  }
  const m = await measure(s.engine, s.scene, thumb, thumbPx);
  return {
    ...base,
    ...m,
    status: "ready",
    meshes: outcome.root.getChildMeshes(false).length,
    ms: Math.round(performance.now() - t0),
  };
}

async function fetchDoc(id: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/content-api/models/${encodeURIComponent(id)}`);
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
}

declare global {
  interface Window {
    __auditReady?: boolean;
    /** 背景批次：`__runBatch(ids)` 立即返回，進度看 `__batch`（工具呼叫有 45 秒上限，⛔ 不要 await 整批）。 */
    __runBatch: (ids: string[]) => void;
    __batch: { total: number; done: number; running: boolean; current?: string };
    __cal?: { negative: AuditResult; positive: AuditResult; ok: boolean };
    __startCalibrate: () => void;
    __audit: (id: string, thumb?: boolean) => Promise<AuditResult>;
    __auditPose: (id: string, clip: string, seconds: number, thumbPx?: number) => Promise<AuditResult>;
    __calibrate: () => Promise<{ negative: AuditResult; positive: AuditResult; ok: boolean }>;
    __catalog: () => Promise<{ admin: string[]; adminError: string | null; editor: string[] }>;
    __results: AuditResult[];
  }
}

window.__results = [];
/**
 * GH#1186：停在某個動作的第幾秒再拍（逐動作顯示／隱藏只有這樣量得到）。
 * ⚠️ 連續兩次拍**同一個 glbPath** 會乾等到 TIMEOUT_MS：ModelPanel 看到路徑沒變就不重新載入，
 *    等不到新的 editor-model-root ⇒ 排工作時讓 A／B 兩顆交錯。
 */
window.__auditPose = (id, clip, seconds, thumbPx = 256) =>
  fetchDoc(id).then((doc) => auditDoc(id, doc, true, { clip, seconds }, thumbPx));
window.__audit = async (id, thumb = true) => {
  const r = await auditDoc(id, await fetchDoc(id), thumb);
  window.__results.push(r);
  return r;
};

/**
 * ⭐ 兩個方向都要驗（CLAUDE.md「一把只驗過單邊的尺，不算自證過」）：
 *   · 負控制**先跑**（場景裡還沒有任何模型）：不存在的 glbPath ⇒ 必須 load-error 且 0 個非背景像素
 *   · 正控制：batch3/4 那把尺量過的 ou99.287871 ⇒ 必須 ready 且非背景像素明顯大於 0
 */
window.__calibrate = async () => {
  const bad = {
    id: "audit.negative-control",
    schema: "model@1",
    glbPath: "assets/models/__audit__/does-not-exist.glb",
    scale: 1,
    collisionRadius: 0.55,
    clipMap: { idle: "Stand", run: "Walk", attack: "Attack", cast: "Attack", hurt: "Stand", death: "Death" },
  };
  const negative = await auditDoc("audit.negative-control", bad, false);
  const s = stage();
  const negPixels = s ? (await measure(s.engine, s.scene, false)).nonBackgroundPixels : -1;
  const negativeResult = { ...negative, nonBackgroundPixels: negPixels };
  const positive = await auditDoc("ou99.287871", await fetchDoc("ou99.287871"), false);
  // ⭐ 第二個正控制刻意挑**最慢**的一顆（第一輪 722ms、被量成 0 像素）—— 快的那顆證明不了材質非同步那一族
  const heavy = await auditDoc("ou99.469191", await fetchDoc("ou99.469191"), false);
  const ok =
    negativeResult.status === "load-error" && negPixels === 0 &&
    positive.status === "ready" && positive.nonBackgroundPixels > 1000 &&
    heavy.status === "ready" && heavy.nonBackgroundPixels > 1000;
  return { negative: negativeResult, positive: { ...positive, heavy } as AuditResult, ok };
};

window.__startCalibrate = () => {
  window.__cal = undefined;
  void window.__calibrate().then((c) => {
    window.__cal = c;
  });
};

/**
 * ⚠️ 批次跑到一半分頁曾被重新載入（2026-09-15 第一輪：結果在記憶體裡全丟、也不知道是哪一顆）。
 * ⇒ 每顆結果**當下**寫進 localStorage；跑之前先寫下「正在跑哪一顆」——
 *   頁面若在那一顆上崩潰，重開後 `__inflight()` 會指名它（⭐ 那本身就是一筆驗收結果：這顆會讓預覽崩潰）。
 */
const LS_RESULTS = "audit1265.results";
const LS_INFLIGHT = "audit1265.inflight";
const loadStored = (): Record<string, AuditResult> => {
  try {
    return JSON.parse(localStorage.getItem(LS_RESULTS) ?? "{}") as Record<string, AuditResult>;
  } catch {
    return {};
  }
};
const store = (r: AuditResult) => {
  const all = loadStored();
  all[r.id] = r;
  try {
    localStorage.setItem(LS_RESULTS, JSON.stringify(all));
  } catch {
    // 配額滿 ⇒ 至少留下沒有縮圖的那份
    all[r.id] = { ...r, thumb: undefined };
    localStorage.setItem(LS_RESULTS, JSON.stringify(all));
  }
};

declare global {
  interface Window {
    __stored: () => Record<string, AuditResult>;
    __inflight: () => string | null;
    __clearStored: () => void;
  }
}
window.__stored = loadStored;
window.__inflight = () => localStorage.getItem(LS_INFLIGHT);
window.__clearStored = () => {
  localStorage.removeItem(LS_RESULTS);
  localStorage.removeItem(LS_INFLIGHT);
};

window.__batch = { total: 0, done: 0, running: false };
window.__runBatch = (ids) => {
  if (window.__batch.running) return;
  const done = loadStored();
  const todo = ids.filter((id) => !done[id]);
  window.__batch = { total: todo.length, done: 0, running: true };
  void (async () => {
    for (const id of todo) {
      window.__batch.current = id;
      localStorage.setItem(LS_INFLIGHT, id);
      store(await window.__audit(id, true));
      localStorage.removeItem(LS_INFLIGHT);
      window.__batch.done++;
    }
    window.__batch.running = false;
    window.__batch.current = undefined;
  })();
};

window.__catalog = async () => {
  const admin = await readModelVersionCatalog();
  return { admin: admin.ids, adminError: admin.error, editor: bundledHeroCatalog.modelIds };
};

createRoot(document.getElementById("root")!).render(<App />);
// ModelPanel 只在第一次 __audit／__calibrate 時才掛上（引擎也是那時才建）⇒ 這裡只代表「函式已就緒」
window.__auditReady = true;
