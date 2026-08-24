/**
 * beamAudition —— `public/beam-audition.html` 背後的場景（GH#673 光束砲終端驗收）。
 *
 * ⭐ **它存在的理由**：owner 2026-08-24 問「beam 相關的都修正完了嗎」。
 * 行為修了（`path:"static"` ＋朝向＋ lifeSec 2s）、模型重烘了（netherstrike 的
 * baseColorFactor 不再全零）—— ⛔ 但依照 CLAUDE.md 👁 節（天譴的教訓），
 * 在**終端像素證據**存在之前，那些都只能叫「鏈路已接上，⛔ 未驗收」。
 *
 * ⇒ 這一頁的交付物是**一組截圖＋逐張亮像素數**，而截圖要能當證據，它就必須是
 * **真的那條路**：
 *
 *   真的 `SimWorld`（出貨的 sim）
 *     → 真的 09-04 龜派氣功（出貨的 `content/abilities/godie-ogrh.r.json`，
 *       `preset:"tpl-beam-roll"` 在載入時由 `modelFxPreset` 補齊）
 *       → sim 真的 `world.emit("modelFxSpawn", …)`（cast resolve ≈37 tick 後）
 *         → 真的 `VfxSystem.handleEvent`（出貨的那一支，⛔ 不是抄一份）
 *           → 真的 `ModelFxRig` 從**出貨的 `Models` 登錄表 ＋ 出貨的 `AssetManager`**
 *             載入 `netherstrike.glb` 畫在 Babylon 場景裡
 *
 * ⛔ **沒有任何一段是假的。** 特別是 `modelDocFor` / `loadModelContainer` 兩個
 * 接縫走的是 GameApp 同一份（`modelFxDocFor` ⊕ `Models` ⊕ `AssetManager`）——
 * #607 的教訓逐字就是「接縫上手挑欄位把 `fxLongAxis` 丟掉」，所以這一頁⛔ 不
 * 自己組 model doc。
 *
 * ⚠️ 台子的量尺坑照抄 `chainLightningAudition`（`calibrate()` 存在的理由）：
 *   ① canvas 背後緩衝預設 300×150 —— 要 resize；
 *   ② `readPixels` 讀到上一幀 —— 先 render ×2 再讀；
 *   ③ 材質沒 ready 時 render 靜默跳過 mesh —— 量已知亮的 control 前先
 *      `forceCompilationAsync`。
 *   ⇒ 頁面載入時 `calibrate()` 先量一次已知會亮的 quad；它失敗 ⇒ 這一頁之後
 *      量到的每一個「看不見」都不可信。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

/** 敵人沿施放方向（+x）排成一直線的偏移。 */
const ENEMY_LINE: readonly { x: number; z: number }[] = [
  { x: 4, z: 0 },
  { x: 7, z: 0 },
  { x: 10, z: 0 },
];

/**
 * 出貨的 09-04 兩層蝗蟲群（GH#688 Phase 5 pilot）：
 * 主體＝原作 h007 的 ReviveHuman（節點自己的 `modelKey`，模板 count 6 沿線）、
 * 火柱＝原作 h006 的 FlameStrike1（沿線 ×6 的第二個 spawnModelFx 節點）。
 */
const BEAM_MODEL_KEYS = ["w3x.stock.revivehuman", "w3x.stock.flamestrike1"];

export interface BeamMeshStat {
  name: string;
  enabled: boolean;
  x: number;
  y: number;
  z: number;
  /** root 底下所有子 mesh 的頂點總數 —— **0 = 空節點**（幾何從來沒接上） */
  vertices: number;
  /** yaw（度）—— 長軸要躺在施放方向上 */
  yawDeg: number;
}

export interface BeamAuditionHandle {
  /** 施放一次 09-04（重置冷卻與魔力 —— 只有這一頁這樣做）。 */
  cast(): Promise<void>;
  /** 往前走 n 個 sim tick，把新事件餵進 VfxSystem。回傳這一段收到幾則 modelFxSpawn。 */
  step(ticks: number): number;
  stats(): {
    tick: number;
    /** sim 到目前為止發了幾則 modelFxSpawn */
    modelFxSpawns: number;
    /** 場上 beam 根節點（活的 + 池子裡的） */
    beams: BeamMeshStat[];
  };
  /** ⭐ render ×2 → readPixels → 數亮像素。beam 出現的幀要遠大於基線。 */
  measure(): Promise<{ w: number; h: number; bright: number; lit: number }>;
  /** ⭐ 量尺校準（同 chainLightningAudition —— 量不到已知亮的 control ⇒ 一切作廢）。 */
  calibrate(): Promise<number>;
  /** 存一張 PNG（base64，⛔ 不含 `data:` 前綴）。走 `CreateScreenshotAsync`。 */
  snapshot(): Promise<string>;
  /** 診斷：事件型別直方圖 ＋ 施法者狀態。 */
  debug(): { eventTypes: Record<string, number>; casterMana: number };
  readonly scene: Scene;
  dispose(): void;
}

export async function startBeamAudition(canvas: HTMLCanvasElement): Promise<BeamAuditionHandle> {
  // ⚠️ 坑①：canvas 背後緩衝預設 300×150，CSS 只是放大 —— 不 resize 就是在
  // 300×150 下算圖，「看不見」會是台子造成的，⛔ 不是遊戲。
  const fit = (): void => {
    canvas.width = Math.max(640, canvas.clientWidth || 1280);
    canvas.height = Math.max(360, canvas.clientHeight || 720);
  };
  fit();
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.resize();
  window.addEventListener("resize", () => {
    fit();
    engine.resize();
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.03, 0.035, 0.05, 1);

  const camera = new FreeCamera("cam", new Vector3(0, 12, -12), scene);
  camera.minZ = 0.1;
  const light = new HemisphericLight("l", new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.5;

  const ground = MeshBuilder.CreateGround("g", { width: 44, height: 44 }, scene);
  const gm = new StandardMaterial("gm", scene);
  gm.diffuseColor = new Color3(0.07, 0.075, 0.09);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  // ── 站位替身（只為了看得出光束沿誰的連線，⛔ 不參與 sim）────────────────
  const bodyMat = new StandardMaterial("bm", scene);
  bodyMat.diffuseColor = new Color3(0.22, 0.24, 0.3);
  bodyMat.specularColor = Color3.Black();
  const casterMat = new StandardMaterial("cm", scene);
  casterMat.diffuseColor = new Color3(0.35, 0.3, 0.16);
  casterMat.specularColor = Color3.Black();
  const mkBody = (x: number, z: number, isCaster: boolean): void => {
    const b = MeshBuilder.CreateCylinder(
      isCaster ? "caster" : "enemy",
      { height: 1.85, diameter: 0.84 },
      scene,
    );
    b.position.set(x, 0.925, z);
    b.material = isCaster ? casterMat : bodyMat;
  };

  // ── 真的 sim ＋ 真的客戶端消費端（動態 import：只在 vite dev 下跑）────────
  const [{ buildBeamAuditionWorld }, { VfxSystem }, { Models }, { AssetManager }, { modelFxDocFor }] =
    await Promise.all([
      import("./beamAuditionWorld"),
      import("./VfxSystem"),
      import("@ggd/shared/content/registries"),
      import("../render/AssetManager"),
      import("../render/modelFxRig"),
    ]);

  const { world, castOnce, casterId, casterPos, enemyPos } = await buildBeamAuditionWorld(ENEMY_LINE);

  // ⚠️ 座標用 sim 的那一套（zone 中心 x≈-37，⛔ 不是原點）。
  mkBody(casterPos.x, casterPos.z, true);
  for (const p of enemyPos) mkBody(p.x, p.z, false);
  ground.position.set(casterPos.x + 6, 0, casterPos.z);
  // 從側後方看：光束沿 +x 橫著飛，側視最能看出「橫放」與「不位移」。
  camera.position.set(casterPos.x + 6, 9, casterPos.z - 14);
  camera.setTarget(new Vector3(casterPos.x + 6, 1.0, casterPos.z));

  const assets = new AssetManager(scene);
  const vfx = new VfxSystem(scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
    // ⭐ **出貨的兩個接縫**（GameApp:903-904 同一份）：`modelFxDocFor` ⊕ 出貨的
    //    `Models` 登錄表 ⊕ 出貨的 `AssetManager`。⛔ 手挑欄位（#607）在這裡
    //    重演的話，這一頁量到的就會跟玩家看到的一樣 —— 那正是要量的東西。
    modelDocFor: (k: string) => modelFxDocFor(Models.tryGet(k) ?? null),
    loadModelContainer: (p: string) => assets.load(p),
  } as never);

  /** 場上的 beam 根節點（`modelfx-<modelKey>-<serial>`，⛔ 不含 axis 子節點與 glb 複製節點）。 */
  const beamStats = (): BeamMeshStat[] =>
    scene.transformNodes
      .filter((n) => BEAM_MODEL_KEYS.some((k) => n.name.startsWith(`modelfx-${k}-`)))
      .map((n) => {
        let vertices = 0;
        for (const m of n.getChildMeshes(false)) vertices += m.getTotalVertices();
        return {
          name: n.name,
          enabled: n.isEnabled(),
          x: n.position.x,
          y: n.position.y,
          z: n.position.z,
          vertices,
          yawDeg: (n.rotation.y * 180) / Math.PI,
        };
      });

  let modelFxSpawns = 0;
  let clockMs = 0;
  const eventHist: Record<string, number> = {};

  /**
   * ⚠️ `SimWorld.step()` 的第一行就清空 `events` ⇒ 事件是逐 tick 的。
   * 每 tick 讀完整份餵進**出貨的** handleEvent，⛔ 不拿游標索引。
   */
  const drainEvents = (): number => {
    let got = 0;
    const evs = world.events as readonly { type: string; tick: number; data: unknown }[];
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]!;
      eventHist[ev.type] = (eventHist[ev.type] ?? 0) + 1;
      if (ev.type === "modelFxSpawn") {
        modelFxSpawns++;
        got++;
      }
      vfx.handleEvent(ev as never, clockMs);
    }
    return got;
  };

  const countBright = (buf: Uint8Array): { bright: number; lit: number } => {
    let bright = 0;
    let lit = 0;
    for (let i = 0; i + 2 < buf.length; i += 4) {
      const v = Math.max(buf[i]!, buf[i + 1]!, buf[i + 2]!);
      if (v > 200) bright++;
      if (v > 96) lit++;
    }
    return { bright, lit };
  };

  const measure = async (): Promise<{ w: number; h: number; bright: number; lit: number }> => {
    // ⚠️ 坑②：readPixels 讀到上一幀 ⇒ 先 render 兩次再讀。
    scene.render();
    scene.render();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const buf = (await engine.readPixels(0, 0, w, h)) as Uint8Array;
    return { w, h, ...countBright(buf) };
  };

  const calibrate = async (): Promise<number> => {
    const quad = MeshBuilder.CreatePlane("calib-quad", { size: 4 }, scene);
    const qm = new StandardMaterial("calib-mat", scene);
    qm.emissiveColor = new Color3(1, 1, 1);
    qm.disableLighting = true;
    quad.material = qm;
    quad.parent = camera;
    quad.position.set(0, 0, 5);
    try {
      // ⚠️ 坑③：材質沒 ready 時 render 靜默跳過 mesh ⇒ 先等編譯完成再量。
      await qm.forceCompilationAsync(quad);
      const m = await measure();
      if (m.bright <= 0) {
        throw new Error(
          `calibrate(): 全亮 quad 在 ${m.w}×${m.h} 的畫面上量到 0 個亮像素 —— ` +
            "量尺本身壞了。這一頁之後量到的任何「看不見」都不可信，先修台子。",
        );
      }
      return m.bright;
    } finally {
      quad.dispose();
      qm.dispose();
      scene.render(); // 移除 quad 之後畫回來，⛔ 不讓校準圖殘留進截圖
    }
  };

  const handle: BeamAuditionHandle = {
    calibrate,
    measure,
    async cast(): Promise<void> {
      castOnce();
    },
    step(ticks: number): number {
      let got = 0;
      for (let i = 0; i < ticks; i++) {
        world.step(new Map());
        clockMs += 1000 / 30;
        got += drainEvents();
        vfx.update(clockMs);
      }
      scene.render();
      return got;
    },
    stats() {
      return { tick: world.tick, modelFxSpawns, beams: beamStats() };
    },
    async snapshot(): Promise<string> {
      // ⚠️ `CreateScreenshotAsync` 住 `screenshotTools`（side-effect import）。
      const [{ Tools }] = await Promise.all([
        import("@babylonjs/core/Misc/tools"),
        import("@babylonjs/core/Misc/screenshotTools"),
      ]);
      scene.render();
      const data = await Tools.CreateScreenshotAsync(engine, camera, {
        width: canvas.width,
        height: canvas.height,
      });
      return String(data).replace(/^data:image\/png;base64,/, "");
    },
    debug() {
      const hp = world.health.get(casterId as never);
      return { eventTypes: { ...eventHist }, casterMana: hp ? (hp as { mana: number }).mana : -1 };
    },
    scene,
    dispose(): void {
      scene.dispose();
      engine.dispose();
    },
  };
  // ⚠️ 要有 render loop —— 沒有的話 `CreateScreenshotAsync` 永遠不 resolve。
  engine.runRenderLoop(() => scene.render());
  await calibrate();
  return handle;
}
