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
 *   ③ **只做試放**：2026-09-01 起，AI 候選改由 `/editor/vfx-forge` 提交後台批核；
 *      legacy studio 不再擁有 content 寫入或 publish 權限。
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
  // ⭐ GH#990 —— studio 編的是**作者形狀**（段落可含 `call`）；展開只在播放器那一側做
  type VfxScriptAuthoredDoc as VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`studio html 缺 #${id}`);
  return el;
};
const TICK_MS = 1000 / 30;

// ── 顏色。⚠️ 兩個慣例並存（content:build 抓過一次）：modelFx 的 `tint` 是
//    線性 0..1 浮點；floatingText/screenFlash 的 `colorRgb` 是 0..255 整數。
//    FieldSpec.color255 記著每一格是哪一種 —— ⛔ 不要憑欄位名猜。
const rgb01ToHex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const rgb255ToHex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const hexToRgb01 = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(
    (v) => Math.round(v * 1000) / 1000,
  ) as [number, number, number];
};
const hexToRgb255 = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

import { FIELDS, type FieldSpec } from "./vfxScriptFields";

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
  // ⚠️ `preserveDrawingBuffer` —— ⛔ 沒有它 `toDataURL` 在 WebGL 上讀到的是空的
//    （連拍證據會變成一排黑圖，而它看起來就像「特效沒出來」）。
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
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

  // 第一個敵人擺 4u —— targeted 近戰大招（超究）在施距內；後兩個遠一點給
  // 直線/波的視覺留空間。⚠️ 太遠 ⇒ castAbility 回 "approaching"（走過去），
  // ⛔ 不是施放 —— studio 首驗就撞過。
  const ENEMY_LINE = [
    { x: 4, z: 0 },
    { x: 10, z: 2 },
    { x: 12, z: -2 },
  ];
  // ⭐ 反應型技能（`effects: []` ＋ 只有 passive hooks，例：20-002 理想鄉EX 的
  //    `onReflectSuccess`）**自己不施放** —— 要施放的是把它的前提做出來的那一支
  //    （Avalon 20-04）。`?pre=` 指定它；缺席就照舊施放 `?ability=` 本人。
  const castId = params.get("pre") ?? abilityId;
  const { world, castOnce, casterId, casterPos, enemyPos, enemyIds } =
    await buildBeamAuditionWorld(ENEMY_LINE, castId as never);

  // ⛔ 順序逐字照抄 `ContentDb.load()`（beamAudition 盲區②）。
  setAbilityArtBindings((Configs.tryGet("vfx-ability-art") ?? null) as never);
  setAbilityVfxBindings((Configs.tryGet("ability-vfx-bindings") ?? null) as never);
  setFamilyTuning((Configs.tryGet("vfx-families") ?? null) as never);

  // ⭐⭐ 台子盲區（studio 首次連拍量到）：`spawnFighter` 把 `stats.sources` 設成
  //    **空陣列**且 `dirty:false` ⇒ `statRecomputeSystem` 不跑 ⇒ 英雄的**被動**
  //    （`passive.ranks[].hooks`）一條都沒安裝 ⇒ `fireHooks` 在 `sources` 上找不到
  //    任何東西 ⇒ 反應型技能的演出**逐位元等於不存在**，而畫面看起來只是「沒特效」。
  //    ⇒ 標成 dirty，讓出貨的重算把被動裝上去。
  const abx = world.abilities.get(casterId);
  if (abx?.exSlot) (abx.exSlot as { rank: number }).rank = 1; // EX 槽預設 rank 0 ⇒ 被動不裝
  const { syncAbilityPassives } = await import("@ggd/shared/sim/abilities/abilityPassives");
  syncAbilityPassives(world, casterId); // ⭐ 出貨路徑上把 passive.hooks 掛成 ModifierSource 的那一支
  const sc = world.stats.get(casterId);
  if (sc) sc.dirty = true;
  mkBody(casterPos.x, casterPos.z, true);
  for (const p of enemyPos) mkBody(p.x, p.z, false);
  ground.position.set(casterPos.x + 6, 0, casterPos.z);
  camera.position.set(casterPos.x + 6, 9, casterPos.z - 14);
  camera.setTarget(new Vector3(casterPos.x + 6, 1.0, casterPos.z));

  // 🎚️ GH#838 —— 粒子密度上限：studio **裝上同一份後台文件**，所以編輯器裡看到的
  //    密度就是上線的密度（owner 2026-08-28：「編輯器裡設定共同遵守上限值」）。
  //    ⛔ 不自己挑一個預覽用的數字 —— 那會讓工坊調得漂亮、上線被砍掉。
  const { setParticleDensityCaps, maxParticlesPerSystem, maxRatePerSystem } = await import(
    "./particleFactory"
  );
  setParticleDensityCaps(
    Configs.tryGet("vfx-budget") as
      | { maxParticlesPerSystem?: number; maxRatePerSystem?: number }
      | undefined,
  );

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
      try {
        world.step(new Map());
      } catch (err) {
        // castOnce 包在下一個 step 裡 —— 施放被拒（approaching/no-mana…）會在這裡
        // throw。⛔ 不能讓它殺掉 render loop：亮在狀態列，場景繼續跑。
        say(`施放失敗：${err instanceof Error ? err.message : String(err)}`, "err");
      }
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
      // ⭐ GH#990 —— 呼叫段沒有 `on`（排最前，chip 顯示 `call`）；展開只在播放器那一側做
      .sort((a, b) => (a.s.on ?? "").localeCompare(b.s.on ?? "") || (a.s.atMs ?? 0) - (b.s.atMs ?? 0));
    for (const { s, i } of order) {
      const chip = document.createElement("div");
      chip.className = "chip" + (i === selIdx ? " sel" : "");
      const name =
        s.kind === undefined ? s.call.subtype
        : s.kind === "modelFx" ? s.modelKey : s.kind === "vfx" ? s.vfxId : s.kind === "floatingText" ? `「${s.text}」` : s.kind;
      chip.innerHTML = `<span class="kind">${s.kind ?? "call"}</span><span>${String(name).slice(0, 22)}</span><span class="t">${s.on ?? "（子模組）"}+${s.atMs ?? 0}ms</span><span class="del" title="刪除">✕</span>`;
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
      } else if (f.kind === "heightCurve") {
        // ⭐ 三個 slider → [{t:0,h:0},{t:peak,h:H},{t:peak+hold,h:H},{t:land,h:0}]
        //    「升上去 → 停一下 → 掉下來」，正是 JASS SetUnitFlyHeightBJ 的節拍。
        const cur3 = Array.isArray(cur) ? (cur as { t: number; h: number }[]) : null;
        const peakH = cur3 ? Math.max(...cur3.map((k) => k.h)) : 0;
        const peakT = cur3 ? (cur3.find((k) => k.h === peakH)?.t ?? 0.4) : 0.4;
        const landT = cur3 ? (cur3[cur3.length - 1]?.t ?? 1.1) : 1.1;
        const wrap = document.createElement("div");
        wrap.style.gridColumn = "2 / span 2";
        const mk3 = (lab: string, v: number, min: number, max: number, step: number,
                     onSet: (n: number) => void): void => {
          const row = document.createElement("div");
          row.style.cssText = "display:grid;grid-template-columns:64px 1fr 44px;gap:4px;align-items:center";
          const l = document.createElement("label");
          l.textContent = lab;
          l.style.cssText = "color:var(--dim);font-size:11px";
          const inp = document.createElement("input");
          inp.type = "range";
          inp.min = String(min);
          inp.max = String(max);
          inp.step = String(step);
          inp.value = String(v);
          const out = document.createElement("span");
          out.className = "val";
          out.textContent = String(v);
          inp.oninput = () => {
            out.textContent = inp.value;
            onSet(Number(inp.value));
          };
          row.append(l, inp, out);
          wrap.appendChild(row);
        };
        let H = peakH;
        let P = peakT;
        let L = landT;
        const rebuild = (): void => {
          if (H <= 0) {
            commit(undefined); // 高度 0 ＝ 沒有升空（清掉欄位）
            return;
          }
          const hold = Math.max(0.05, (L - P) * 0.4);
          commit([
            { t: 0, h: 0 },
            { t: Math.round(P * 100) / 100, h: Math.round(H * 10) / 10 },
            { t: Math.round((P + hold) * 100) / 100, h: Math.round(H * 10) / 10 },
            { t: Math.round(Math.max(P + hold + 0.05, L) * 100) / 100, h: 0 },
          ]);
        };
        mk3("升到多高", H, 0, 25, 0.1, (n) => {
          H = n;
          rebuild();
        });
        mk3("何時到頂 s", P, 0.05, 5, 0.05, (n) => {
          P = n;
          rebuild();
        });
        mk3("何時落地 s", L, 0.1, 8, 0.05, (n) => {
          L = n;
          rebuild();
        });
        row.appendChild(wrap);
      } else if (f.kind === "color") {
        const input = document.createElement("input");
        input.type = "color";
        input.value = Array.isArray(cur)
          ? (f.color255 ? rgb255ToHex : rgb01ToHex)(cur as number[])
          : "#ffffff";
        input.oninput = () => commit((f.color255 ? hexToRgb255 : hexToRgb01)(input.value));
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

  // ── 📸 連拍證據（?capture=1）—— 天譴式：量尺先自證，再決定性 frame-step ────
  //    ⛔ 不用 rAF（它跟著螢幕跑，同一段演出每次擷到的時刻都不一樣）。
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d", { willReadFrequently: true });

  const readRuler = (): { w: number; h: number; bright: number; lit: number } => {
    // ⚠️ **先 render 再讀** —— 少了這一行讀到的是「上一幀」，而校準的第一個方向
    //    （全亮 quad 在）就會量到 0 ⇒ 量尺自證失敗。這正是 auditionCalibrate
    //    檔頭點名的坑之一，⭐ 而它在 studio 首次連拍時當場咬到我。
    scene.render();
    const w = canvas.width;
    const h = canvas.height;
    measureCanvas.width = w;
    measureCanvas.height = h;
    if (!mctx) return { w, h, bright: 0, lit: 0 };
    mctx.drawImage(canvas, 0, 0);
    const px = mctx.getImageData(0, 0, w, h).data;
    let bright = 0;
    let lit = 0;
    for (let i = 0; i + 2 < px.length; i += 4) {
      const v = Math.max(px[i]!, px[i + 1]!, px[i + 2]!);
      if (v > 200) bright++;
      if (v > 96) lit++;
    }
    return { w, h, bright, lit };
  };

  async function runCapture(totalTicks: number, everyTicks: number): Promise<void> {
    const { calibrateTwoWay } = await import("./auditionCalibrate");
    engine.stopRenderLoop(); // ⭐ 決定性：接下來每一幀都是我推的
    say("量尺自證中（全亮 quad 在／不在，兩個方向）…", "dim");
    let control = 0;
    try {
      control = await calibrateTwoWay({ scene, camera, rulers: { canvas: readRuler } });
    } catch (err) {
      say(`⛔ 量尺校準失敗 —— 這一頁的結論作廢：${err instanceof Error ? err.message : String(err)}`, "err");
      return;
    }
    const sheet = $("contact");
    sheet.innerHTML = `<div class="cap-head">📸 ${abilityId} —— 量尺 control=${control} 亮像素（兩方向已驗）</div>`;
    sheet.style.display = "block";
    castOnce();
    const shots: { t: string; bright: number; png: string }[] = [];
    // `?hitAt=<tick>[,<tick>…]` —— 敵人在這些 tick 各打施法者一發（⭐ 反彈/格擋
    // 那一族的**前提**：沒有人打你就沒有東西可以反彈）。走出貨的 `damageQueue`，
    // ⛔ 不是自己算傷害。
    const hitAt = new Set(
      (params.get("hitAt") ?? "")
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n)),
    );
    let clk = 0;
    for (let t = 0; t < totalTicks; t++) {
      if (hitAt.has(t)) {
        const attacker = enemyIds[0];
        if (attacker !== undefined) {
          world.damageQueue.push({
            source: attacker,
            target: casterId,
            amount: Number(params.get("hitAmount") ?? 400),
            type: world.damageRules.defaultAbilityDamageType,
            crit: false,
            origin: "audition:hit",
          } as never);
        }
      }
      clk += TICK_MS;
      try {
        world.step(new Map());
      } catch {
        /* 施放被拒已在別處回報 */
      }
      for (const ev of world.events) vfx.handleEvent(ev as never, clk);
      vfx.update(clk);
      scene.render();
      if (t % everyTicks !== 0) continue;
      const r = readRuler();
      const cell = document.createElement("figure");
      cell.className = "cap-cell";
      const img = document.createElement("img");
      // ⚠️ 縮圖 ＋ JPEG —— 一份全尺寸 PNG 接觸表是 4MB，而它要進版控當耐久證據。
      //    ⭐ 亮像素是從**全尺寸**畫面量的（上面那一行），⛔ 不是從縮圖 ——
      //    縮圖只是給人看的，數字才是判準。
      const thumb = document.createElement("canvas");
      const tw = 360;
      thumb.width = tw;
      thumb.height = Math.max(1, Math.round((canvas.height / canvas.width) * tw));
      thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      // ⚠️ **PNG，⛔ 不是 JPEG** —— #669 的批次驗收頁（`tools/review/features.mjs`
      //    的 `scanSequences`）只認 `.png`。⭐ 這一格是**它的判準**，⛔ 不是我的
      //    偏好：改我這一側輸出，不去放寬那條掃描（那會讓下一個人寫別的格式）。
      //    縮到 360px 之後 PNG 也只有一格 ~20KB。
      img.src = thumb.toDataURL("image/png");
      const cap = document.createElement("figcaption");
      cap.textContent = `t=${(t / 30).toFixed(2)}s · 亮 ${r.bright}`;
      cell.appendChild(img);
      cell.appendChild(cap);
      sheet.appendChild(cell);
      shots.push({ t: (t / 30).toFixed(2), bright: r.bright, png: img.src });
      await new Promise((res) => setTimeout(res, 0)); // 讓瀏覽器把 png 編碼完
    }
    // 📸 落成檔案 —— ⛔ 只活在分頁裡的證據，捲過去就沒了（第零守則：留歷史紀錄）。
    const stamp = (params.get("stamp") ?? "run").replace(/[^A-Za-z0-9-]/g, "");
    try {
      const res = await fetch("/__vfxstudio/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abilityId, control, stamp, frames: shots }),
      });
      const body = (await res.json()) as { ok?: boolean; path?: string; peak?: number; error?: string };
      say(
        body.ok
          ? `📸 連拍完成 ${shots.length} 格（control=${control}，峰值 ${body.peak}）→ ${body.path}`
          : `連拍完成但報告沒落地：${body.error ?? res.status}`,
        body.ok ? "ok" : "err",
      );
    } catch (err) {
      say(`連拍完成但報告沒落地：${err instanceof Error ? err.message : String(err)}`, "err");
    }
  }

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
    say("此舊工作台只保留試放與連拍。請到 /editor/vfx-forge 提交 AI 候選，再由後台人工批核。", "err");
  };

  // 2026-09-01：AI 變更不得由舊工作台直接 commit/push。
  const publish = async (): Promise<void> => {
    say("已取消舊工作台回存主線；只有後台人工核准的精確 hash 可以 Promote。", "err");
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
  // ⭐ 上限印在畫面上 —— 一個生效中的天花板如果沒有人看得到，它就會被讀成
  //    「我調的參數沒有用」（fail-open 沒錯，靜默才是缺陷）。
  const capEl = $("caps");
  capEl.textContent = `🎚️ 粒子上限（後台 config.vfx-budget@1）：單個特效 ${maxParticlesPerSystem()} 顆 · 每秒 ${maxRatePerSystem()} 顆`;
  say(`就緒 —— ${abilityId}。拖資源進畫面、拖 slider、按 ▶ 全程觀看。`, "ok");

  // ?capture=1 ⇒ 直接進連拍（總 tick / 每幾 tick 一格 可由 query 調）
  if (params.get("capture")) {
    const total = Number(params.get("ticks") ?? 150);
    const every = Number(params.get("every") ?? 10);
    await runCapture(Number.isFinite(total) ? total : 150, Number.isFinite(every) ? every : 10);
  }
}

void bootVfxScriptStudio().catch((err) => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `啟動失敗：${err instanceof Error ? err.message : String(err)}`;
    status.dataset.tone = "err";
  }
  console.error(err);
});
