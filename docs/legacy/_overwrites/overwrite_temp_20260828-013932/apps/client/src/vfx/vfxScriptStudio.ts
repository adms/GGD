/**
 * vfxScriptStudio — GH#838 特效工坊的**編輯器本體**（public/vfx-script-studio.html）。
 *
 * 左手：一份 `vfx-script@1` 的 JSON（權威 Zod 驗證在這一側 —— import 出貨的
 * `zVfxScriptDoc`，schema 單一住處）；右手：**真的**演出（真 SimWorld 施放 →
 * 真事件 → 真 `VfxSystem.handleEvent` → 裡面的 VfxScriptPlayer）。存檔走
 * `/__vfxstudio/script`（tools/vfx-forge/middleware.mjs，dev-only），存完當場
 * 熱換（VfxScripts.register ＋ invalidateVfxScripts）再施放一次。
 *
 * ⚠️ 台子的三個已知盲區照 beamAudition 的修法逐字搬（⛔ 不是重新發明）：
 *   ① 施放要包進 tick 內（`castOnce` 自帶）—— 不然 `abilityCast` 在被讀到之前
 *      就被下一個 `step()` 清掉（失敗形態⑧）
 *   ② `ContentDb.load()` 的三份綁定要照序安裝（晉升表 → 綁定表 → 家族調參）
 *   ③ `vfxDoc` 那一格要接出貨登錄表 —— 缺了它每一份 vfx@1 都掉 preset 退路
 *
 * ⚠️ 出貨語意提醒（middleware 的回應也會講一次）：存檔寫的是**工作樹**；
 * 出貨還要 `pnpm content:build` ＋ commit（bundle 是 build 的產物）。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`studio html 缺 #${id}`);
  return el;
};

const TICK_MS = 1000 / 30;

export async function bootVfxScriptStudio(): Promise<void> {
  const status = $("status");
  const say = (msg: string, tone: "ok" | "err" | "dim" = "dim"): void => {
    status.textContent = msg;
    status.dataset.tone = tone;
  };

  const params = new URLSearchParams(location.search);
  const abilityInput = $("ability") as HTMLInputElement;
  abilityInput.value = params.get("ability") ?? "godie-h020.e";

  // ── 場景（極簡：地板＋光＋替身盒；相機側後方 —— 證據相機在 audition，⛔ 不在這）─
  const canvas = $("view") as HTMLCanvasElement;
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.024, 0.04, 1);
  new HemisphericLight("sun", new Vector3(0.3, 1, 0.2), scene).intensity = 0.9;
  const groundMat = new StandardMaterial("ground-mat", scene);
  groundMat.diffuseColor = new Color3(0.09, 0.1, 0.14);
  const ground = MeshBuilder.CreateGround("ground", { width: 44, height: 30 }, scene);
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

  // ── 真 sim ＋ 真消費端（動態 import：只在 vite dev 下跑）───────────────────
  say("載入內容與 sim…");
  const abilityId = abilityInput.value.trim();
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
  const built = await buildBeamAuditionWorld(ENEMY_LINE, abilityId as never);
  const { world, castOnce, casterPos, enemyPos } = built;

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

  // ── sim 迴圈：30Hz step，事件逐 tick 全量餵出貨的 handleEvent ────────────────
  let clockMs = 0;
  let acc = 0;
  let last = performance.now();
  const eventHist: Record<string, number> = {};
  engine.runRenderLoop(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      clockMs += TICK_MS;
      world.step(new Map());
      for (const ev of world.events) {
        eventHist[ev.type] = (eventHist[ev.type] ?? 0) + 1;
        vfx.handleEvent(ev as never, clockMs);
      }
    }
    vfx.update(clockMs);
    scene.render();
  });

  // ── 編輯迴圈 ────────────────────────────────────────────────────────────────
  const editor = $("editor") as HTMLTextAreaElement;
  const issues = $("issues");

  const template = (id: string): string =>
    JSON.stringify(
      {
        id,
        schema: "vfx-script@1",
        abilityId: id,
        notes: "（JASS 出處：war3map.j:行號；換算依據 —— 見 docs/_reports/vfx-editor-jass3_temp_20260828-0042.md）",
        segments: [{ kind: "floatingText", on: "castStart", text: "（示意段）" }],
      },
      null,
      2,
    );

  const loadScript = async (): Promise<void> => {
    const id = abilityInput.value.trim();
    const res = await fetch(`/__vfxstudio/script?id=${encodeURIComponent(id)}`);
    if (res.status === 404) {
      editor.value = template(id);
      say(`content/vfx-scripts/${id}.json 不存在 —— 給了範本（存檔就會建立）`, "dim");
      return;
    }
    if (!res.ok) {
      say(`載入失敗：${res.status} ${await res.text()}`, "err");
      return;
    }
    editor.value = await res.text();
    say(`已載入 ${id}`, "ok");
  };

  const validate = (): ReturnType<typeof zVfxScriptDoc.safeParse> | null => {
    let raw: unknown;
    try {
      raw = JSON.parse(editor.value);
    } catch (err) {
      issues.textContent = `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`;
      say("JSON 壞掉", "err");
      return null;
    }
    const parsed = zVfxScriptDoc.safeParse(raw);
    if (!parsed.success) {
      issues.textContent = parsed.error.issues
        .map((i) => `· ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      say(`schema 不過（${parsed.error.issues.length} 條）`, "err");
      return parsed;
    }
    issues.textContent = `✓ 合法 —— ${parsed.data.segments.length} 段（${parsed.data.abilityId}）`;
    say("schema 綠", "ok");
    return parsed;
  };

  const save = async (): Promise<void> => {
    const parsed = validate();
    if (!parsed || !parsed.success) return;
    const doc = parsed.data;
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
    // ⭐ 熱換：登錄表換新 → 播放器索引重建 → 立刻放一次看結果。
    VfxScripts.register(doc as never);
    (vfx as unknown as { invalidateVfxScripts(): void }).invalidateVfxScripts();
    say(`✓ 已存 ${body.reminder ?? ""}`, "ok");
    castOnce();
  };

  ($("btn-load") as HTMLButtonElement).onclick = () => void loadScript();
  ($("btn-validate") as HTMLButtonElement).onclick = () => void validate();
  ($("btn-save") as HTMLButtonElement).onclick = () => void save();
  ($("btn-cast") as HTMLButtonElement).onclick = () => {
    say(`施放 ${abilityId}（事件統計看 console）`, "dim");
    console.info("[studio] eventHist so far:", { ...eventHist });
    castOnce();
  };
  ($("btn-reload") as HTMLButtonElement).onclick = () => {
    const id = abilityInput.value.trim();
    location.search = `?ability=${encodeURIComponent(id)}`;
  };

  // 既有 scripts 進 datalist（方便挑）
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
    /* middleware 缺席 ⇒ 503 —— loadScript 的錯誤路已經會講 */
  }

  await loadScript();
  window.addEventListener("resize", () => engine.resize());
  say(`就緒 —— ${abilityId}（放一次看預設演出，改 JSON 存檔即熱換）`, "ok");
}

void bootVfxScriptStudio().catch((err) => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `啟動失敗：${err instanceof Error ? err.message : String(err)}`;
    status.dataset.tone = "err";
  }
  console.error(err);
});
