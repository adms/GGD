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
 *   ⑥ ⭐ **池化的那一具已經到期** —— 於是 A/B 的「改前」那張圖是全黑的，
 *      而它會被讀成「改前完全看不見」。⚠️ 這一坑**量尺自己分不出來**：
 *      「畫不出來」與「台上根本沒東西」在像素上一模一樣。
 *   ⇒ `calibrate()` 量**兩個方向**（見 `auditionCalibrate.ts`）：
 *      已知**亮** ⇒ 量得到；把它拿掉 ⇒ 量到的**嚴格變少**。
 *      ⛔ 只驗前者的尺不算自證過 —— 一支永遠回大數字的壞尺會通過它（GH#768）。
 *
 * ⭐⭐ GH#768 AC#1 —— **自證發生在出讀數的那一刻**，⛔ 不是頁面載入時那一次。
 * 坑④⑤⑥全部是**中途才發生**的（分頁被切走、視窗縮過、那一具回池了），
 * 所以一次開頁校準證明不了三分鐘後那一個讀數。⇒ `measure()` 每一次都先跑
 * `calibrate()`，證不過就**擲例外**（⛔ 不是回 0 繼續跑 —— 一個回得出來的 0
 * 會被讀成「看不見」，而一個例外不會）。`probeDocs()` 同理：它整批走 `readRaw()`，
 * 所以在拍對照幀**之前**先自證一次。
 * ⭐ 坑⑥寫進**讀數本身**：每一次 `measure()` 一起回 `liveBeams` / `liveVertices`
 * ⇒ 「`lit:0` ＋ `liveBeams:0`」＝台上沒東西，「`lit:0` ＋ `liveBeams>0`」＝真的畫不出來。
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

/** 一次**自證過**的讀數（GH#768）。⛔ 沒有自證過的讀數不會被交出來 —— 它會擲例外。 */
export interface BeamMeasurement {
  w: number;
  h: number;
  /** 「亮」的像素數 —— ⭐ 門檻**只住 `countBright()`**（⛔ 這裡不抄那個數字）。 */
  bright: number;
  /** 「有顏色」的像素數 —— 同上，門檻在 `countBright()`。 */
  lit: number;
  /**
   * ⭐ 坑⑥的分母：這一幀台上**還活著**的 beam 根節點數。
   * `lit:0 ＋ liveBeams:0` = 台上沒東西（⛔ 不是「畫不出來」）。
   */
  liveBeams: number;
  /** 同上的頂點總數。`liveBeams>0 ＋ liveVertices:0` = 空節點（幾何從來沒接上）。 */
  liveVertices: number;
}

/** `pumpTicks` 的三個階段 —— 拆開只為了讓守衛驗得到**順序**（⛔ 這一支不吃 Babylon）。 */
export interface TickPump {
  /** 推進 sim 一格。⚠️ `SimWorld.step()` 的**第一行**是 `this.events.length = 0`。 */
  readonly step: () => void;
  /** 把**這一 tick 的**整份 `events` 餵進出貨消費端，回傳其中幾則是 `modelFxSpawn`。 */
  readonly drain: () => number;
  /** 這一 tick 收尾（`vfx.update(clockMs)`）。 */
  readonly settle: () => void;
}

/**
 * ⭐ GH#715 **第五道縫** —— 施法的事件不會被下一個 `step()` 的清空吃掉。
 *
 * `SimWorld.step()` 的第一行就清空 `events` ⇒ 一則事件只在**它自己那一 tick**
 * 存在。把 `drain()` 移到迴圈**外面**（或拿一個游標去索引）⇒ 除了最後一 tick
 * 以外**每一則都會消失** —— 而 09-04 的 `abilityCast`（家族藝術／`vfxKey`／`sfxKey`
 * 唯一的載體）在第一個 tick 內、`modelFxSpawn` 在 cast resolve ≈37 tick，
 * ⭐ 兩則都落在中間。⇒ 頁面量到 0，⚠️ 而那個 0 看起來就是「這支技能沒有視覺」。
 *
 * ⚠️ 這是**承重**的那一道：另外四道縫（`setAbilityArtBindings` ⊕
 * `setAbilityVfxBindings` ⊕ `setFamilyTuning` ⊕ ctx 帶 `vfxDoc`）全部補齊時，
 * 這一道破掉仍然讓整頁每一個讀數都是 0，⛔ 而沒有任何東西會紅。
 */
export function pumpTicks(ticks: number, p: TickPump): number {
  let got = 0;
  for (let i = 0; i < ticks; i++) {
    p.step();
    got += p.drain(); // ⛔ 這一行**必須**在迴圈裡 —— 移出去就是上面整段的病
    p.settle();
  }
  return got;
}

/**
 * ⭐ GH#768 AC#1 —— **一次讀數 = 一次自證 ＋ 那一幀**，⛔ 順序不可以顛倒。
 *
 * 票文的病逐字是「`engine.readPixels()` 在滿版亮幀回 0，**而結論照樣被採信**」。
 * ⇒ 自證失敗時**呼叫端一個數字都拿不到**：一個回得出來的 0 會被讀成「看不見」，
 * 而一個例外不會。⛔ 所以這裡是 `await certify()` **在前**、`read()` 在後 ——
 * 顛倒過來就等於「先量了再說，量完才發現尺是瞎的」，而那個數字已經被寫進報告了。
 */
export async function certifiedRead<T>(
  certify: () => Promise<unknown>,
  read: () => Promise<T>,
): Promise<T> {
  await certify();
  return read();
}

/**
 * 「亮」與「有顏色」的**唯一**門檻住這裡（⛔ 呼叫端不抄那兩個數字）。
 *
 * ⭐ GH#768 AC#2 —— 2026-08-26 那一張**滿版黃光**的幀被量成 `lit: 0`。
 * 那個缺陷有兩半：① GPU 讀回一塊空的緩衝（要真 GPU 才驗得到）
 * ② **數的那一半** —— 而②是靜態可判的，所以它在這裡，而且守衛餵得到它。
 * ⚠️ 黃 = `(255,255,0)`：`max` 是 255（⇒ bright），**平均**是 170（⇒ 只算 lit）
 * —— 也就是說一個看起來很無害的「max 改成平均」會讓滿版黃光的 `bright` 掉一半，
 * ⛔ 而它不會有任何東西紅。⇒ 兩個方向都要有守衛（滿版黃 ⇒ 數得到；全黑 ⇒ 數到 0）。
 */
export function countBright(buf: Uint8Array): { bright: number; lit: number } {
  let bright = 0;
  let lit = 0;
  for (let i = 0; i + 2 < buf.length; i += 4) {
    const v = Math.max(buf[i]!, buf[i + 1]!, buf[i + 2]!);
    if (v > 200) bright++;
    if (v > 96) lit++;
  }
  return { bright, lit };
}

/** `measure()` 的三個零件 —— ⭐ **注入**進來，⛔ 不是關在 `createBeamAudition()` 的閉包裡。 */
export interface CertifiedMeasureDeps {
  /** 這一次讀數**之前**要跑的自證。⛔ 它 reject ⇒ 呼叫端一個數字都拿不到。 */
  readonly certify: () => Promise<unknown>;
  /** ⛔ **沒有自證過的**像素讀數。 */
  readonly readPixels: () => Promise<Pick<BeamMeasurement, "w" | "h" | "bright" | "lit">>;
  /** 坑⑥的分母：這一幀台上還活著的 beam（⇒ 分得出「台上沒東西」與「畫不出來」）。 */
  readonly census: () => Pick<BeamMeasurement, "liveBeams" | "liveVertices">;
}

/**
 * ⭐⭐ GH#768 —— `measure()` 的**組裝**，抽出來是為了讓守衛驗得到**行為**。
 *
 * ⚠️ 在此之前 `measure` 是 `createBeamAudition()` 裡的一個區域常數 ⇒ 唯一驗得到它的
 * 手段是**掃字串**（「那一行還在嗎」）。⛔ 掃字串擋得住「有人把那一行刪掉」，
 * 擋不住「有人把它接錯」—— 而 2026-08-26 的缺陷正是**接線**層的：量到 0 照樣交出去。
 * ⇒ 這一支可注入 ⇒ 餵一個**會 reject 的** `certify`，就能證明呼叫端**一個數字都拿不到**
 * （失敗形態⑥的反面：驗行為，⛔ 不是驗「檔案裡有沒有提到這個名字」）。
 *
 * `opts.certify === false` 是連拍時的一鍵回頭（第〇·六守則：⭐ **預設啟動**，
 * ⛔ 而測試只做預設那一邊）。
 */
export function makeCertifiedMeasure(
  deps: CertifiedMeasureDeps,
): (opts?: { certify?: boolean }) => Promise<BeamMeasurement> {
  const read = async (): Promise<BeamMeasurement> => ({
    ...(await deps.readPixels()),
    ...deps.census(),
  });
  return (opts) => (opts?.certify === false ? read() : certifiedRead(deps.certify, read));
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
  /**
   * ⭐ **先自證，再讀那一幀**（GH#768 AC#1）。自證不過 ⇒ **擲例外**，⛔ 不是回 0。
   * @param opts.certify `false` ⇒ 跳過這一次的自證（⭐ 連拍時的 rollback 開關；
   *   預設 `true`，⛔ 這一頁是 dev-only 台子所以開關住參數，不是後台三個住處）。
   */
  measure(opts?: { certify?: boolean }): Promise<BeamMeasurement>;
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
  const [{ setAbilityVfxBindings }, { setFamilyTuning }, { setAbilityArtBindings }, { Configs, VfxScripts }] =
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

  // ⭐⭐ GH#974 —— **把 script 那一層攤在窗外**（診斷出口）。
  //
  // ⚠️ ⭐ 這一頁的檔頭已經記過一次同型的盲區（GH#699：出貨組合根安裝兩份設定
  //   而這一頁手抄時漏了）。⇒ ⭐ 這一次不再多抄一行**手抄的安裝**，
  //   而是把**已經接好的那條路**攤出來讓人問得到問題：
  //   `VfxSystem` 建構子自己就 `new VfxScriptPlayer({…})`（`VfxSystem.ts:854`），
  //   ⛔ 所以 script 播放器在這一頁**本來就是活的** —— 缺的只是**看得見**。
  //
  // ⚠️ 而「看不見」正是 #974 拖這麼久的原因：
  //   唯一會渲染的治具**問不出** script 有沒有跑、跑了幾段、掉了幾段。
  (globalThis as Record<string, unknown>)["__ggdScripts"] = {
    /** 出貨登錄表裡有幾份 script（0 ⇒ 這一頁根本沒載到那個集合）。 */
    count: () => VfxScripts.all().length,
    ids: () => VfxScripts.all().map((d) => (d as { abilityId?: string }).abilityId ?? "?"),
    /** 這一支技能今天有沒有 script。 */
    has: (abilityId: string) => VfxScripts.all().some((d) => (d as { abilityId?: string }).abilityId === abilityId),
    /** ⭐ 那一格開關（播放器的 `enabled()` 讀的就是它）。 */
    enabled: () => (Configs.tryGet("vfx-scripts") as { enabled?: boolean } | undefined)?.enabled,
    /** ⭐ 掉段帳本 —— **誰、哪一段、為什麼沒播**（讀了就清空）。 */
    drops: async () => (await import("./VfxScriptPlayer")).takeScriptSegmentDrops(),
  };

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

  /**
   * ⛔ **沒有自證過的**引擎讀數 —— 只給 `calibrate()` 當「尺 A」用。
   * ⚠️ 坑②：readPixels 讀到上一幀 ⇒ 先 render 兩次再讀。
   */
  const readEngine = async (): Promise<{ w: number; h: number; bright: number; lit: number }> => {
    scene.render();
    scene.render();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const buf = (await engine.readPixels(0, 0, w, h)) as Uint8Array;
    return { w, h, ...countBright(buf) };
  };

  /** ⭐ 坑⑥（池化的那一具已經到期）寫進讀數本身，⛔ 不是寫進註解。 */
  const liveCensus = (): { liveBeams: number; liveVertices: number } => {
    let liveBeams = 0;
    let liveVertices = 0;
    for (const b of beamStats()) {
      if (!b.enabled) continue;
      liveBeams++;
      liveVertices += b.vertices;
    }
    return { liveBeams, liveVertices };
  };

  /**
   * ⭐ GH#768 AC#1：**先自證，再讀那一幀**。量不到已知亮的 control ⇒ 擲例外
   * （訊息逐字含「這台量尺的一切結論作廢」），⛔ 不是回 0 讓呼叫端當成「看不見」。
   *
   * ⭐ 組裝住 `makeCertifiedMeasure()`（模組層、可注入）⇒ 這一段的**行為**被守衛
   * 釘著，⛔ 而這裡剩下的只是「哪三個零件接上去」。
   * ⚠️ `certify` 必須是**惰性的** thunk：`calibrate` 是下面才宣告的 `const`（TDZ）。
   */
  const measure = makeCertifiedMeasure({
    certify: () => calibrate(),
    readPixels: readEngine,
    census: liveCensus,
  });

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
        // 尺 A：`readEngine()` —— `measure()` 出 A/B 亮像素讀數用的那把
        // ⛔ 這裡**不可以**放 `measure()`：它自己會先跑 `calibrate()` ⇒ 無窮遞迴。
        "engine.readPixels": () => readEngine(),
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
    // ⭐ GH#768 AC#1 —— **出讀數的那一刻**才自證，⛔ 不是開頁時那一次。
    // 這一整批差分讀數全部走 `readRaw()`；尺瞎掉的話每一份都會被讀成
    // 「這份 vfx@1 文件是空的」，而那正是 #711 已經發生過一次的誤判。
    await calibrate();
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
      // ⭐ GH#715 第五道縫走 `pumpTicks`（唯一住處，⛔ 這裡不再自己寫迴圈）——
      //    drain **每一 tick 都要跑**，⛔ 不是整段跑完再讀一次。
      const got = pumpTicks(ticks, {
        step: () => {
          world.step(new Map());
          clockMs += 1000 / 30;
        },
        drain: drainEvents,
        settle: () => vfx.update(clockMs),
      });
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
