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
 *   ④ ⭐ **分頁被隱藏 ⇒ `requestAnimationFrame` 整個不跑**（2026-08-27 lane LAG 量到
 *      12 秒 0 幀）—— 而「0 幀」與「這個特效不會動」量起來一模一樣；
 *   ⑤ ⭐ **縮視窗之後 canvas 的背後緩衝沒跟著變**（同上）—— 於是 `readPixels` 讀的是
 *      一塊與畫面對不起來的舊尺寸緩衝。
 *   ⇒ 頁面載入時 `calibrate()` 量**兩個方向**（見 `auditionCalibrate.ts`）：
 *      已知**亮** ⇒ 量得到；把它拿掉 ⇒ 量到的**嚴格變少**。
 *      ⛔ 只驗前者的尺不算自證過 —— 一支永遠回大數字的壞尺會通過它（GH#768）。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { setStockGlowAdditive } from "../render/modelFxRig";
import { calibrateTwoWay } from "./auditionCalibrate";

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
const BEAM_MODEL_KEYS = [
  "w3x.stock.revivehuman",
  "w3x.stock.flamestrike1",
  /** GH#691 蝗蟲群視覺第一批 —— `o00E` 那一族（17 個生成點）共用的那一份。 */
  "w3x.stock.monsoonbolttarget",
];

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

/** 一份 `vfx@1` 文件在一種背景下的差分讀數（見 `BeamAuditionHandle.probeDocs`）。 */
export interface DocProbeReading {
  id: string;
  backdrop: "void" | "lit";
  /** 對照幀（沒有粒子）→ 有粒子，**任一通道差 ≥ 1** 的像素數。⭐ 混色模式中立。 */
  changed: number;
  /** Σ|Δ|（三通道合計）—— 「動了多少」，⛔ 不是「亮了多少」。 */
  sumAbsDelta: number;
  /** 既有的亮度尺，留著是為了跟 GH#699 的舊讀數對得上。 */
  lit: number;
  bright: number;
  /** 對照幀自己的亮度（背景基線）。 */
  baseLit: number;
  /** 這一份文件峰值時場上活著的粒子數 —— 0 = 它根本沒生出來。 */
  particles: number;
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
  /**
   * 🎚 **逐份 `vfx@1` 文件的差分讀數**（GH#711）。⛔ 不是「數亮像素」。
   *
   * ⚠️⚠️ 為什麼非要多一把尺：`bright/lit` 只問「畫面**變亮**了嗎」，而
   * `blendMode: "modulate"` 在算術上**只會變暗**（`out = dst·(1−δ)`）⇒ 一支
   * 完全正常的 modulate emitter 在這台**近黑**背景上永遠讀 0，
   * 而那個 0 是**台子的**性質，⛔ 不是那份文件的性質（CLAUDE.md 👁 節洞 d：
   * 量尺自己會說謊 —— GH#711 的缺陷本人就是被同一種「白＝沒東西」的直覺造出來的）。
   *
   * ⇒ 這一支量的是**差分**：先拍一張沒有粒子的對照幀，再拍有粒子的，
   * 數「有幾個像素跟對照幀不一樣」與「總共差了幾個 code value」。
   * 加法與乘法在這把尺上**可比**，因為兩者都是「對每個像素的改變量」。
   *
   * `backdrop`：`"void"` = 台子原本的近黑背景；`"lit"` = 相機正前方一面
   * 中灰（dst≈128）幕布 —— **modulate 只有在有東西可以乘的時候才存在**，
   * 而真的一場比賽裡粒子畫在地板與單位上，⛔ 不是畫在虛空裡。
   */
  probeDocs(
    docIds: readonly string[],
    opts?: { backdrop?: "void" | "lit"; frames?: number },
  ): Promise<DocProbeReading[]>;
  /** 存一張 PNG（base64，⛔ 不含 `data:` 前綴）。走 `CreateScreenshotAsync`。 */
  snapshot(): Promise<string>;
  /** 診斷：事件型別直方圖 ＋ 施法者狀態。 */
  debug(): { eventTypes: Record<string, number>; casterMana: number };
  readonly scene: Scene;
  dispose(): void;
}


export async function startBeamAudition(
  canvas: HTMLCanvasElement,
  /** ⭐ GH#691 —— 驗收哪一支技能。省略 ⇒ 09-04（今天的行為逐位元不變）。 */
  abilityId?: string,
  /**
   * 🔆 GH#767 —— A/B 用：`false` ⇒ 這一頁強制走**舊的** glTF BLEND。
   * 省略 ⇒ 跟出貨一樣（讀後台那一格 `config.vfx-cleanup@1.stockGlowAdditive`）。
   * ⛔ 這只影響**這一頁**：它是驗收台子，⛔ 不是遊戲路徑上的第二個住處。
   */
  stockGlowAdditive?: boolean,
): Promise<BeamAuditionHandle> {
  // ⚠️ 一定要在第一具模型被 spawn **之前**設 —— 材質是在 spawn 當下決定的。
  if (stockGlowAdditive !== undefined) setStockGlowAdditive(stockGlowAdditive);
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
  const [
    { buildBeamAuditionWorld },
    { VfxSystem },
    { Models, VfxDefs },
    { AssetManager },
    { modelFxDocFor },
  ] =
    await Promise.all([
      import("./beamAuditionWorld"),
      import("./VfxSystem"),
      import("@ggd/shared/content/registries"),
      import("../render/AssetManager"),
      import("../render/modelFxRig"),
    ]);

  const { world, castOnce, casterId, casterPos, enemyPos } = await buildBeamAuditionWorld(
    ENEMY_LINE,
    abilityId as never,
  );

  // ⛔⛔ GH#699 MARK lane 的**第二個台子盲區**：出貨的組合根 `ContentDb.load()`
  // 在載完內容之後**安裝兩份設定**（`setAbilityVfxBindings` ⊕ `setFamilyTuning`，
  // `ContentDb.ts:369/379`，順序是它逐字要求的），而這一頁只跑 `ensureContentLoaded()`
  // ⇒ 那兩格從來沒被安裝 ⇒ `w3xArtFor()` 對**每一支**技能都回 undefined ⇒
  // `playCastVfx` 的第 1／2 級（原作 emitter 整組交給 `W3xEmitterRig`）
  // **一次都沒有走過**，每一次讀數都掉進第 4 級的 `fx.prim.*` 退路。
  // ⇒ 實測（2026-08-26）：`godie-n01g.ex`（`mark` 家族）在這兩行之前場上
  //   **0 個** `w3xfx-*` 粒子系統；補上之後 **3 個**
  //   （`markofchaostarget.p00/p01/p02`）＋家族主 emitter，峰值 96,988 亮像素。
  // ⇒ ⭐ 也就是說：在這兩行之前，這一頁**從來沒有量到過任何一支技能的原作藝術**。
  const [{ setAbilityVfxBindings }, { setFamilyTuning }, { setAbilityArtBindings }, { Configs }] =
    await Promise.all([
      import("../render/vfx/abilityLayers"),
      import("../render/vfx/w3xAbilityArt"),
      import("../render/vfx/abilityArtContent"),
      import("@ggd/shared/content/registries"),
    ]);
  // ⛔ 順序逐字照抄 `ContentDb.load()`：晉升表 → 綁定表 → `setFamilyTuning`
  //    （檔頭寫著順序反了會鑄出一份空的家族文件）。
  setAbilityArtBindings((Configs.tryGet("vfx-ability-art") ?? null) as never);
  setAbilityVfxBindings((Configs.tryGet("ability-vfx-bindings") ?? null) as never);
  setFamilyTuning((Configs.tryGet("vfx-families") ?? null) as never);

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
    // ⛔⛔ GH#699 MARK lane 量到的**第三個台子盲區**（⛔ 不是遊戲的缺陷）：
    // 出貨的組合根（`GameApp.ts:890`）逐字是 `vfxDoc: (key) => this.contentDb.vfxFor(key)`，
    // 而這一頁**從來沒有這一格** ⇒ `VfxSystem.doc()` 的 `this.ctx.vfxDoc?.(key)`
    // 永遠 `undefined` ⇒ **每一份 `vfx@1` 粒子文件在這一頁上都查不到**，
    // 於是每一次讀數都靜靜地掉進 `HitSpark`／`vfx-preset-*` 的退路階梯。
    // ⇒ 量到的（2026-08-26）：`godie-hart.r` 真的發了 **2 則 `vfxSpawn`**
    //   （`fx.w3x.stock.thunderclapcaster.p00` ＋ `…warstompcaster.p00`），
    //   而場上的粒子系統名字裡**一個 `w3x` 都沒有** —— 全是 preset 退路。
    // ⇒ ⭐ 也就是說：在這一行之前，`beam-audition.html` 的**每一份視覺證據**
    //   只涵蓋 `spawnModelFx`（glb rig）＋ preset 退路，⛔ **從來沒有任何一份
    //   `vfx@1` 粒子文件被這一頁證明過**（量尺自己會說謊，CLAUDE.md 👁 節洞 d）。
    // ⛔ 這裡**不自己組 doc**（#607 手挑欄位的教訓）：走出貨的同一份登錄表。
    vfxDoc: (key: string) => VfxDefs.tryGet(key) ?? null,
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

  /**
   * ⭐ GH#768 —— 校準走 `calibrateTwoWay`（唯一住處），而且**兩把尺都要驗**。
   *
   * ⚠️⚠️ 在此之前這裡只跑 `measure()`（非同步的 `engine.readPixels`），
   * 而 `probeDocs()` 出的每一份讀數用的是 `readRaw()`（同步的 `gl.readPixels`）
   * ⇒ ⛔ **真正在出讀數的那把尺從來沒有被校準過**。
   * 一把沒被校準的尺量到 0，與「這份文件是空的」長得一模一樣。
   */
  const calibrate = (): Promise<number> =>
    calibrateTwoWay({
      scene,
      camera,
      rulers: {
        // 尺 A：`measure()` —— A/B 亮像素比較用的那把
        "engine.readPixels": () => measure(),
        // 尺 B：`readRaw()` —— ⭐ `probeDocs()` 每一份 vfx@1 文件的讀數用的那把
        "gl.readPixels": () => {
          const r = readRaw();
          return { w: r.w, h: r.h, ...countBright(r.buf) };
        },
      },
    });

  /**
   * render ×2 → **同步** GL readback（坑②：不 render 兩次會讀到上一幀）。
   *
   * ⚠️ ⛔ 刻意**不用** `engine.readPixels()`：那一支是非同步的，它的 fence 在
   * 一個**隱藏的**分頁裡靠被節流到 1 秒的 timer 輪詢 ⇒ 實測**每次讀回要 ~1 秒**，
   * 一組 A/B 就要跑掉好幾分鐘。`preserveDrawingBuffer: true` 讓預設 framebuffer
   * 讀得到，所以同步讀是安全的（⛔ 這是台子的權宜，⛔ 不是出貨路徑）。
   */
  const readRaw = (): { w: number; h: number; buf: Uint8Array } => {
    scene.render();
    scene.render();
    const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { w, h, buf };
  };

  let probeSerial = 0;
  const probeDocs = async (
    docIds: readonly string[],
    opts?: { backdrop?: "void" | "lit"; frames?: number },
  ): Promise<DocProbeReading[]> => {
    const backdrop = opts?.backdrop ?? "void";
    const frames = opts?.frames ?? 24;
    const { toParticleSystem, burstNow } = await import("./particleFactory");
    const prevConstDelta = scene.useConstantAnimationDeltaTime;
    scene.useConstantAnimationDeltaTime = true;
    let curtain: ReturnType<typeof MeshBuilder.CreatePlane> | null = null;
    let curtainMat: StandardMaterial | null = null;
    if (backdrop === "lit") {
      // ⭐ 中灰幕布：modulate 是**乘**上去的，沒有 dst 就沒有效果可量。
      curtain = MeshBuilder.CreatePlane("probe-curtain", { size: 400 }, scene);
      curtainMat = new StandardMaterial("probe-curtain-mat", scene);
      curtainMat.emissiveColor = new Color3(0.5, 0.5, 0.5);
      curtainMat.disableLighting = true;
      curtain.material = curtainMat;
      curtain.parent = camera;
      curtain.position.set(0, 0, 40);
      await curtainMat.forceCompilationAsync(curtain);
    }
    const target = camera.getTarget().clone();
    const out: DocProbeReading[] = [];
    try {
      const base = readRaw();
      const baseCounts = countBright(base.buf);
      for (const id of docIds) {
        const doc = (await (await fetch(`/content/vfx/${id}.json`)).json()) as never;
        const ps = toParticleSystem(doc, scene, {
          name: `probe-${id}`,
          position: { x: target.x, y: target.y, z: target.z },
          // ⭐⭐ 每一份文件用**自己**的 Texture 實例（快取破壞 query）。
          // ⚠️ 量到的（2026-08-26）：兩份文件共用同一張貼圖時，**後量的那一份
          // 永遠讀 0 個粒子、0 個像素** —— 前一個 ParticleSystem 被 dispose 之後，
          // 走同一個貼圖快取項的下一個系統就 `isReady()` 永遠 false。
          // ⇒ p02 / p03 都指向 `smoke_09`，於是排在後面的那一份被判成「看不見」。
          // ⛔ 那是台子的 0，⛔ 不是文件的 0（洞 d：量尺自己會說謊）。
          createTexture: (url, sc) => new Texture(`${url}?probe=${probeSerial++}`, sc),
        });
        ps.emitter = target.clone();
        // ⭐⭐ 等貼圖真的 ready 再開始量。⚠️ Babylon 的 ParticleSystem 在貼圖
        // 還沒解碼完之前**一顆都不畫**，而那個「0 個像素」與「這份文件是空的」
        // 長得一模一樣（CLAUDE.md 👁 節洞 d）。⛔ 用事件等，⛔ 不用 timer ——
        // 隱藏分頁的 setTimeout 被夾到 1 秒。
        const ptex = ps.particleTexture as Texture | null;
        if (ptex && !ptex.isReady()) {
          await new Promise<void>((res) => {
            ptex.onLoadObservable.addOnce(() => res());
          });
        }
        ps.start();
        // ⭐⭐ `mode:"burst"` 的文件 **`start()` 之後一顆都不會生** —— 出貨路徑
        // 逐字是 `W3xEmitterRig.ts:489` 的 `if (em.doc.mode === "burst") burstNow(...)`。
        // ⚠️ 第一版漏了這一行，於是 p02/p03/p05 三份 burst 文件全部量到「0 顆粒子、
        // 0 個像素」——⛔ 那是台子的洞，⛔ 不是文件的性質（洞 d 本人，這次是我）。
        burstNow(ps, doc as never, 1);
        let best: DocProbeReading = {
          id,
          backdrop,
          changed: -1,
          sumAbsDelta: 0,
          lit: 0,
          bright: 0,
          baseLit: baseCounts.lit,
          particles: 0,
        };
        for (let f = 0; f < frames; f++) {
          // ⭐ `useConstantAnimationDeltaTime`（下面設的）讓每一次 `render()`
          // 固定推進 16ms ⇒ 取樣是**確定性**的，⛔ 不靠 wall-clock、⛔ 不靠分頁
          // 有沒有被瀏覽器節流（背景分頁的 setTimeout 被夾到 1 秒，量到過）。
          scene.render();
          scene.render();
          const cur = readRaw();
          let changed = 0;
          let sum = 0;
          for (let i = 0; i + 2 < cur.buf.length; i += 4) {
            const d =
              Math.abs(cur.buf[i]! - base.buf[i]!) +
              Math.abs(cur.buf[i + 1]! - base.buf[i + 1]!) +
              Math.abs(cur.buf[i + 2]! - base.buf[i + 2]!);
            if (d > 0) changed++;
            sum += d;
          }
          if (changed > best.changed) {
            const c = countBright(cur.buf);
            best = {
              id,
              backdrop,
              changed,
              sumAbsDelta: sum,
              lit: c.lit,
              bright: c.bright,
              baseLit: baseCounts.lit,
              particles: ps.getActiveCount(),
            };
          }
        }
        out.push(best);
        ps.stop();
        // ⭐⭐ `dispose()` **預設連貼圖一起 dispose**（`disposeTexture = true`），
        // 而 Babylon 的貼圖快取之後會把**同一個已死的實例**發還給下一個系統
        // ⇒ 它 `isReady()` 回 true、GL 資源卻沒了 ⇒ 那一份文件量到 0 個像素。
        // ⚠️ 量到的（2026-08-26）：p02 與 p03 共用 `smoke_09`，先量的那一份正常、
        // 後量的那一份**永遠是 0** —— 又一個「台子的 0」冒充「文件的 0」。
        ps.dispose(false);
        // 讓上一份的殘留粒子走完，⛔ 不讓它汙染下一份的差分
        for (let k = 0; k < 8; k++) scene.render();
      }
    } finally {
      curtain?.dispose();
      curtainMat?.dispose();
      scene.useConstantAnimationDeltaTime = prevConstDelta;
      scene.render();
    }
    return out;
  };

  const handle: BeamAuditionHandle = {
    calibrate,
    measure,
    probeDocs,
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
