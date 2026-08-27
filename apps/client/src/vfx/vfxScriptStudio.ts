/**
 * vfxScriptStudio — GH#838 特效工坊的**編輯器本體**（public/vfx-script-studio.html）。
 *
 * owner 2026-08-28（逐字，操作面的裁決）：
 * 「我要可以拖拉model,粒子特效進編輯器模擬遊戲畫面，用silder調大小、透明度、顏色、
 *  轉向、高度、動畫速度 等各種連續參數，盡量人類友善視覺直覺的操作方式來設定及
 *  模擬觀看全程」
 *
 * ⇒ 三個介面事實：
 *   ① **拖拉**：左側資源面板（模型／粒子，從出貨登錄表列的，⛔ 不是手寫清單）
 *      拖進畫面 ⇒ 落點換算成「相對施法者的前後/左右位移」寫進新段
 *   ② **slider**：選中段落 ⇒ 連續參數全是滑桿（大小/透明/顏色/轉向/高度/動畫速度…），
 *      **拖動即重放全程**（debounce 250ms → 熱換 → castOnce）
 *   ③ **儲存成 JSON**：權威 Zod 驗證在這一側（import 出貨的 `zVfxScriptDoc`，
 *      schema 單一住處）；存檔走 `/__vfxstudio/script`（dev-only middleware）
 *
 * 預覽鏈是**真的**：真 SimWorld 施放 → 真事件 → 真 `VfxSystem.handleEvent`
 * （裡面的 VfxScriptPlayer）。台子三個已知盲區照 beamAudition 修法逐字搬：
 *   施放包進 tick 內（castOnce 自帶）· ContentDb 三份綁定照序安裝 · vfxDoc 接登錄表。
 *
 * ⚠️ 出貨語意：存檔寫**工作樹**；出貨還要 `pnpm content:build` ＋ commit。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import {
  zVfxScriptDoc,
  VFX_SCRIPT_TRIGGERS,
  type VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`studio html 缺 #${id}`);
  return el;
};
const TICK_MS = 1000 / 30;

// ── 顏色（schema 是線性 RGB 0..1 三元組；UI 是 hex）────────────────────────
const rgb01ToHex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const hexToRgb01 = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(
    (v) => Math.round(v * 1000) / 1000,
  ) as [number, number, number];
};

// ── slider/欄位規格（資料驅動；⛔ 不逐段手刻表單）──────────────────────────
interface FieldSpec {
  key: string;
  label: string;
  kind: "range" | "select" | "text" | "color";
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** 這一格在此段上有沒有意義（例：anchor 只有 static 讀得到）。 */
  show?: (seg: Record<string, unknown>) => boolean;
  /** slider 拖到這個值時視為「清掉欄位」（回 schema 預設）。 */
  clearAt?: number;
}
const COMMON: FieldSpec[] = [
  { key: "on", label: "觸發", kind: "select", options: VFX_SCRIPT_TRIGGERS },
  { key: "atMs", label: "延遲 ms", kind: "range", min: 0, max: 5000, step: 10, clearAt: 0 },
];
const FIELDS: Record<VfxScriptSegment["kind"], FieldSpec[]> = {
  modelFx: [
    ...COMMON,
    { key: "modelKey", label: "模型", kind: "text" },
    { key: "path", label: "路徑", kind: "select", options: ["static", "forward", "toTarget", "radial", "orbit"] },
    { key: "anchor", label: "錨點", kind: "select", options: ["self", "point", "target"], show: (s) => s.path === "static" },
    { key: "scale", label: "大小", kind: "range", min: 0.05, max: 20, step: 0.05 },
    { key: "alpha", label: "透明度", kind: "range", min: 0, max: 1, step: 0.01 },
    { key: "tint", label: "顏色", kind: "color" },
    { key: "yawOffsetDeg", label: "轉向 °", kind: "range", min: -180, max: 180, step: 1, clearAt: 0 },
    { key: "heightU", label: "高度 u", kind: "range", min: 0, max: 20, step: 0.1, clearAt: 0 },
    { key: "offsetForwardU", label: "前後 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "offsetSideU", label: "左右 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "lifeSec", label: "存活 s", kind: "range", min: 0.1, max: 10, step: 0.1, show: (s) => s.path === "static" || s.path === "orbit" },
    { key: "speed", label: "速度 u/s", kind: "range", min: 0.5, max: 60, step: 0.5, show: (s) => s.path !== "static" },
    { key: "distance", label: "距離 u", kind: "range", min: 0.5, max: 60, step: 0.5, show: (s) => s.path !== "static" && s.path !== "toTarget" },
    { key: "count", label: "具數", kind: "range", min: 1, max: 24, step: 1, show: (s) => s.path === "static" || s.path === "radial" || s.path === "orbit", clearAt: 1 },
    { key: "spacing", label: "間距 u", kind: "range", min: 0, max: 10, step: 0.1, show: (s) => s.path === "static", clearAt: 0 },
    { key: "spinDegPerSec", label: "翻滾 °/s", kind: "range", min: -720, max: 720, step: 10, clearAt: 0 },
    { key: "clip", label: "動畫剪輯", kind: "text" },
    { key: "clipTimeScale", label: "動畫速度×", kind: "range", min: 0.05, max: 10, step: 0.05, show: (s) => typeof s.clip === "string" && s.clip.length > 0 },
    { key: "soundKey", label: "音效 key", kind: "text" },
  ],
  vfx: [
    ...COMMON,
    { key: "vfxId", label: "粒子文件", kind: "text" },
    { key: "at", label: "錨點", kind: "select", options: ["self", "target", "point", "bone"] },
    { key: "attach", label: "骨頭", kind: "text", show: (s) => s.at === "bone" },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0, max: 6, step: 0.1 },
    { key: "offsetForwardU", label: "前後 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "offsetSideU", label: "左右 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
  ],
  floatingText: [
    ...COMMON,
    { key: "text", label: "文字", kind: "text" },
    { key: "at", label: "錨點", kind: "select", options: ["caster", "target"] },
    { key: "colorRgb", label: "顏色", kind: "color" },
    { key: "sizeScale", label: "字級×", kind: "range", min: 0.5, max: 4, step: 0.1 },
    { key: "riseSpeed", label: "上浮速", kind: "range", min: 0, max: 5, step: 0.1 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.3, max: 5, step: 0.1 },
  ],
  screenFlash: [
    ...COMMON,
    { key: "colorRgb", label: "顏色", kind: "color" },
    { key: "peakAlpha", label: "最亮", kind: "range", min: 0.02, max: 0.8, step: 0.01 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.05, max: 2, step: 0.05 },
  ],
  screenShake: [
    ...COMMON,
    { key: "amplitude", label: "強度", kind: "range", min: 0.02, max: 1, step: 0.01 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.05, max: 2, step: 0.05 },
  ],
  sound: [...COMMON, { key: "soundKey", label: "音效 key", kind: "text" }],
};

export async function bootVfxScriptStudio(): Promise<void> {
  const status = $("status");
  const say = (msg: string, tone: "ok" | "err" | "dim" = "dim"): void => {
    status.textContent = msg;
    status.dataset.tone = tone;
  };

  const params = new URLSearchParams(location.search);
  const abilityInput = $("ability") as HTMLInputElement;
  abilityInput.value = params.get("ability") ?? "godie-h020.e";
  const abilityId = abilityInput.value.trim();

  // ── 場景 ───────────────────────────────────────────────────────────────────
  const canvas = $("view") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.024, 0.04, 1);
  new HemisphericLight("sun", new Vector3(0.3, 1, 0.2), scene).intensity = 0.9;
  const groundMat = new StandardMaterial("ground-mat", scene);
  groundMat.diffuseColor = new Color3(0.09, 0.1, 0.14);
  const ground = MeshBuilder.CreateGround("studio-ground", { width: 44, height: 30 }, scene);
  ground.material = groundMat;
  const camera = new FreeCamera("cam", new Vector3(0, 9, -14), scene);
  camera.attachControl(canvas, true);

  const mkBody = (x: number, z: number, isCaster: boolean): void => {
    const b = MeshBuilder.CreateBox(isCaster ? "caster" : "enemy", { width: 0.9, height: 1.85, depth: 0.6 }, scene);
    b.position.set(x, 0.925, z);
    const m = new StandardMaterial(`${b.name}-mat`, scene);
    m.diffuseColor = isCaster ? new Color3(0.85, 0.65, 0.3) : new Color3(0.4, 0.42, 0.52);
    b.material = m;
  };

  // ── 真 sim ＋ 真消費端 ─────────────────────────────────────────────────────
  say("載入內容與 sim…");
  const [
    { buildBeamAuditionWorld },
    { VfxSystem },
    { Models, VfxDefs, VfxScripts, Configs },
    { AssetManager },
    { modelFxDocFor },
    { setAbilityVfxBindings },
    { setFamilyTuning },
    { setAbilityArtBindings },
  ] = await Promise.all([
    import("./beamAuditionWorld"),
    import("./VfxSystem"),
    import("@ggd/shared/content/registries"),
    import("../render/AssetManager"),
    import("../render/modelFxRig"),
    import("../render/vfx/abilityLayers"),
    import("../render/vfx/w3xAbilityArt"),
    import("../render/vfx/abilityArtContent"),
  ]);

  const ENEMY_LINE = [
    { x: 10, z: 0 },
    { x: 12, z: 2 },
    { x: 12, z: -2 },
  ];
  const { world, castOnce, casterPos, enemyPos } = await buildBeamAuditionWorld(
    ENEMY_LINE,
    abilityId as never,
  );

  // ⛔ 順序逐字照抄 `ContentDb.load()`（beamAudition 盲區②）。
  setAbilityArtBindings((Configs.tryGet("vfx-ability-art") ?? null) as never);
  setAbilityVfxBindings((Configs.tryGet("ability-vfx-bindings") ?? null) as never);
  setFamilyTuning((Configs.tryGet("vfx-families") ?? null) as never);

  mkBody(casterPos.x, casterPos.z, true);
  for (const p of enemyPos) mkBody(p.x, p.z, false);
  ground.position.set(casterPos.x + 6, 0, casterPos.z);
  camera.position.set(casterPos.x + 6, 9, casterPos.z - 14);
  camera.setTarget(new Vector3(casterPos.x + 6, 1.0, casterPos.z));

  const assets = new AssetManager(scene);
  const vfx = new VfxSystem(scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
    modelDocFor: (k: string) => modelFxDocFor(Models.tryGet(k) ?? null),
    loadModelContainer: (p: string) => assets.load(p),
    vfxDoc: (key: string) => VfxDefs.tryGet(key) ?? null, // 盲區③
  } as never);

  let clockMs = 0;
  let acc = 0;
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      clockMs += TICK_MS;
      world.step(new Map());
      for (const ev of world.events) vfx.handleEvent(ev as never, clockMs);
    }
    vfx.update(clockMs);
    scene.render();
  });
  window.addEventListener("resize", () => engine.resize());

  // ── 文件狀態（單一真相：doc 物件；JSON/slider/chips 全從它 render）─────────
  let doc: VfxScriptDoc = zVfxScriptDoc.parse({
    id: abilityId,
    schema: "vfx-script@1",
    abilityId,
    segments: [{ kind: "floatingText", on: "castStart", text: "（示意段）" }],
  });
  let selIdx = 0;
  const editor = $("editor") as HTMLTextAreaElement;
  const issues = $("issues");

  const hotSwap = (): boolean => {
    const parsed = zVfxScriptDoc.safeParse(JSON.parse(JSON.stringify(doc)));
    if (!parsed.success) {
      issues.textContent = parsed.error.issues.map((i) => `· ${i.path.join(".")}: ${i.message}`).join("\n");
      say(`schema 不過（${parsed.error.issues.length} 條）`, "err");
      return false;
    }
    issues.textContent = "";
    VfxScripts.register(parsed.data as never);
    (vfx as unknown as { invalidateVfxScripts(): void }).invalidateVfxScripts();
    return true;
  };

  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  const preview = (): void => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (hotSwap()) {
        say("重放全程…", "dim");
        castOnce();
      }
    }, 250);
  };

  const syncJson = (): void => {
    editor.value = JSON.stringify(doc, null, 2);
  };

  const renderChips = (): void => {
    const box = $("chips");
    box.innerHTML = "";
    const order = doc.segments
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.on.localeCompare(b.s.on) || (a.s.atMs ?? 0) - (b.s.atMs ?? 0));
    for (const { s, i } of order) {
      const chip = document.createElement("div");
      chip.className = "chip" + (i === selIdx ? " sel" : "");
      const name =
        s.kind === "modelFx" ? s.modelKey : s.kind === "vfx" ? s.vfxId : s.kind === "floatingText" ? `「${s.text}」` : s.kind;
      chip.innerHTML = `<span class="kind">${s.kind}</span><span>${String(name).slice(0, 22)}</span><span class="t">${s.on}+${s.atMs ?? 0}ms</span><span class="del" title="刪除">✕</span>`;
      chip.onclick = () => {
        selIdx = i;
        renderChips();
        renderFields();
      };
      (chip.querySelector(".del") as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        doc.segments.splice(i, 1);
        if (doc.segments.length === 0)
          doc.segments.push({ kind: "floatingText", on: "castStart", text: "（空）" } as never);
        selIdx = Math.min(selIdx, doc.segments.length - 1);
        renderAll();
        preview();
      };
      box.appendChild(chip);
    }
  };

  const renderFields = (): void => {
    const host = $("fields");
    host.innerHTML = "";
    const seg = doc.segments[selIdx] as unknown as Record<string, unknown>;
    if (!seg) return;
    for (const f of FIELDS[(seg.kind as VfxScriptSegment["kind"]) ?? "sound"] ?? []) {
      if (f.show && !f.show(seg)) continue;
      const row = document.createElement("div");
      row.className = "field";
      const label = document.createElement("label");
      label.textContent = f.label;
      row.appendChild(label);
      const cur = seg[f.key];
      const commit = (val: unknown): void => {
        if (val === undefined) delete seg[f.key];
        else seg[f.key] = val;
        syncJson();
        renderChips();
        preview();
      };
      if (f.kind === "range") {
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(f.min ?? 0);
        input.max = String(f.max ?? 1);
        input.step = String(f.step ?? 0.01);
        const shown = typeof cur === "number" ? cur : (f.clearAt ?? f.min ?? 0);
        input.value = String(shown);
        const val = document.createElement("span");
        val.className = "val";
        val.textContent = typeof cur === "number" ? String(cur) : "（預設）";
        input.oninput = () => {
          const n = Number(input.value);
          val.textContent = String(n);
          commit(f.clearAt !== undefined && n === f.clearAt ? undefined : n);
        };
        row.appendChild(input);
        row.appendChild(val);
      } else if (f.kind === "select") {
        const sel = document.createElement("select");
        for (const o of f.options ?? []) {
          const opt = document.createElement("option");
          opt.value = o;
          opt.textContent = o;
          if (cur === o) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.onchange = () => {
          commit(sel.value);
          renderFields(); // show() 條件可能變了
        };
        row.appendChild(sel);
        row.appendChild(document.createElement("span"));
      } else if (f.kind === "color") {
        const input = document.createElement("input");
        input.type = "color";
        input.value = Array.isArray(cur) ? rgb01ToHex(cur as number[]) : "#ffffff";
        input.oninput = () => commit(hexToRgb01(input.value));
        row.appendChild(input);
        const clear = document.createElement("button");
        clear.textContent = "清";
        clear.title = "清掉＝用文件/模型自己的顏色";
        clear.onclick = () => {
          commit(undefined);
          renderFields();
        };
        row.appendChild(clear);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.value = typeof cur === "string" ? cur : "";
        input.onchange = () => commit(input.value.length ? input.value : undefined);
        row.appendChild(input);
        row.appendChild(document.createElement("span"));
      }
      host.appendChild(row);
    }
  };

  const renderAll = (): void => {
    renderChips();
    renderFields();
    syncJson();
  };

  // ── 左側資源面板（從出貨登錄表列，⛔ 不手寫清單）───────────────────────────
  let tab: "models" | "vfx" = "models";
  const renderPalette = (): void => {
    const list = $("res-list");
    const q = ($("res-filter") as HTMLInputElement).value.trim().toLowerCase();
    const ids = (tab === "models" ? Models.ids() : VfxDefs.ids())
      .filter((id) => !q || id.toLowerCase().includes(q))
      .slice(0, 250);
    list.innerHTML = "";
    for (const id of ids) {
      const el = document.createElement("div");
      el.className = "res";
      el.draggable = true;
      el.innerHTML = `${id}<small>${tab === "models" ? "拖進畫面＝static 模型段" : "拖進畫面＝粒子段"}</small>`;
      el.ondragstart = (e) => {
        e.dataTransfer?.setData("text/plain", JSON.stringify({ tab, id }));
      };
      list.appendChild(el);
    }
  };
  ($("tab-models") as HTMLButtonElement).onclick = () => {
    tab = "models";
    $("tab-models").classList.add("active");
    $("tab-vfx").classList.remove("active");
    renderPalette();
  };
  ($("tab-vfx") as HTMLButtonElement).onclick = () => {
    tab = "vfx";
    $("tab-vfx").classList.add("active");
    $("tab-models").classList.remove("active");
    renderPalette();
  };
  ($("res-filter") as HTMLInputElement).oninput = () => renderPalette();

  // ── 拖進畫面 ⇒ 落點換算成面向座標位移，加一段 ─────────────────────────────
  const stage = $("stage");
  stage.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage.classList.add("dragover");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragover"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("dragover");
    const raw = e.dataTransfer?.getData("text/plain");
    if (!raw) return;
    const { tab: srcTab, id } = JSON.parse(raw) as { tab: "models" | "vfx"; id: string };
    const rect = canvas.getBoundingClientRect();
    const pick = scene.pick(
      e.clientX - rect.left,
      e.clientY - rect.top,
      (m: AbstractMesh) => m.name === "studio-ground",
    );
    const p = pick?.pickedPoint;
    // 施法者面向固定 +x（beamAuditionWorld 設的）。播放器的定義：
    // `applyFacingOffset` 在 facing=(1,0) 時 x+=fwd、z-=side（+side＝面向右手邊）。
    // ⇒ 要落在 p：fwd＝p.x−caster.x、side＝caster.z−p.z。
    const fwd = p ? Math.round((p.x - casterPos.x) * 10) / 10 : 4;
    const side = p ? Math.round((casterPos.z - p.z) * 10) / 10 : 0;
    const seg: VfxScriptSegment =
      srcTab === "models"
        ? ({
            kind: "modelFx",
            on: "castStart",
            modelKey: id,
            path: "static",
            anchor: "self",
            lifeSec: 2,
            ...(fwd !== 0 ? { offsetForwardU: fwd } : {}),
            ...(side !== 0 ? { offsetSideU: side } : {}),
          } as never)
        : ({
            kind: "vfx",
            on: "castStart",
            vfxId: id,
            at: "self",
            durationSec: 1.5,
            ...(fwd !== 0 ? { offsetForwardU: fwd } : {}),
            ...(side !== 0 ? { offsetSideU: side } : {}),
          } as never);
    doc.segments.push(seg);
    selIdx = doc.segments.length - 1;
    renderAll();
    preview();
    say(`加了一段：${id}（前後 ${fwd}u）`, "ok");
  });

  // ── 載入／存檔／施放 ───────────────────────────────────────────────────────
  const template = (): VfxScriptDoc =>
    zVfxScriptDoc.parse({
      id: abilityId,
      schema: "vfx-script@1",
      abilityId,
      notes: "（JASS 出處：war3map.j:行號 —— 見 docs/_reports/vfx-editor-jass3_temp_20260828-0042.md）",
      segments: [{ kind: "floatingText", on: "castStart", text: "（示意段）" }],
    });

  const loadScript = async (): Promise<void> => {
    const res = await fetch(`/__vfxstudio/script?id=${encodeURIComponent(abilityId)}`);
    if (res.status === 404) {
      doc = template();
      say(`content/vfx-scripts/${abilityId}.json 不存在 —— 空白開始（存檔就會建立）`, "dim");
    } else if (!res.ok) {
      say(`載入失敗：${res.status}`, "err");
      return;
    } else {
      const parsed = zVfxScriptDoc.safeParse(await res.json());
      if (!parsed.success) {
        say("磁碟上那份 schema 不過 —— 進階區直接改", "err");
        return;
      }
      doc = parsed.data;
      say(`已載入 ${abilityId}（${doc.segments.length} 段）`, "ok");
    }
    selIdx = 0;
    renderAll();
    hotSwap();
  };

  const save = async (): Promise<void> => {
    if (!hotSwap()) return;
    const res = await fetch("/__vfxstudio/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doc.id, doc }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string; reminder?: string };
    if (!res.ok || !body.ok) {
      say(`存檔失敗：${body.error ?? res.status}`, "err");
      return;
    }
    say(`✓ 已存。${body.reminder ?? ""}`, "ok");
    castOnce();
  };

  // ⬆️ 回存主線（owner 2026-08-28：「編輯儲存完後可以回存到主線甚至間接到github」）
  // build＋commit＋push 由 dev middleware 代跑 —— 這裡只按、顯示逐步結果。
  const publish = async (): Promise<void> => {
    const btn = $("btn-publish") as HTMLButtonElement;
    btn.disabled = true;
    say("回存主線中：content:build → commit → push（build 要一陣子）…", "dim");
    try {
      const res = await fetch("/__vfxstudio/publish", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        clean?: boolean;
        message?: string;
        error?: string;
        log?: string;
      };
      if (body.ok) say(body.message ?? "✓ 已回存主線。", "ok");
      else {
        say(`回存失敗：${body.error ?? res.status}`, "err");
        if (body.log) issues.textContent = body.log;
      }
    } catch (err) {
      say(`回存失敗：${err instanceof Error ? err.message : String(err)}`, "err");
    } finally {
      btn.disabled = false;
    }
  };
  ($("btn-publish") as HTMLButtonElement).onclick = () => void publish();

  ($("btn-load") as HTMLButtonElement).onclick = () => void loadScript();
  ($("btn-save") as HTMLButtonElement).onclick = () => void save();
  ($("btn-cast") as HTMLButtonElement).onclick = () => {
    if (hotSwap()) castOnce();
  };
  ($("btn-reload") as HTMLButtonElement).onclick = () => {
    location.search = `?ability=${encodeURIComponent(abilityInput.value.trim())}`;
  };
  ($("btn-validate") as HTMLButtonElement).onclick = () => {
    try {
      const parsed = zVfxScriptDoc.safeParse(JSON.parse(editor.value));
      issues.textContent = parsed.success
        ? `✓ 合法 —— ${parsed.data.segments.length} 段`
        : parsed.error.issues.map((i) => `· ${i.path.join(".")}: ${i.message}`).join("\n");
    } catch (err) {
      issues.textContent = `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`;
    }
  };
  ($("btn-apply-json") as HTMLButtonElement).onclick = () => {
    try {
      const parsed = zVfxScriptDoc.safeParse(JSON.parse(editor.value));
      if (!parsed.success) {
        issues.textContent = parsed.error.issues.map((i) => `· ${i.path.join(".")}: ${i.message}`).join("\n");
        return;
      }
      doc = parsed.data;
      selIdx = Math.min(selIdx, doc.segments.length - 1);
      renderAll();
      preview();
    } catch (err) {
      issues.textContent = `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`;
    }
  };

  // scripts 清單進 datalist
  try {
    const res = await fetch("/__vfxstudio/scripts");
    if (res.ok) {
      const { scripts } = (await res.json()) as { scripts: { id: string }[] };
      const dl = $("script-ids");
      dl.innerHTML = "";
      for (const s of scripts) {
        const opt = document.createElement("option");
        opt.value = s.id;
        dl.appendChild(opt);
      }
    }
  } catch {
    /* middleware 缺席時 loadScript 的錯誤路會講 */
  }

  renderPalette();
  await loadScript();
  say(`就緒 —— ${abilityId}。拖資源進畫面、拖 slider、按 ▶ 全程觀看。`, "ok");
}

void bootVfxScriptStudio().catch((err) => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `啟動失敗：${err instanceof Error ? err.message : String(err)}`;
    status.dataset.tone = "err";
  }
  console.error(err);
});
