/**
 * chainLightningAudition —— `public/chain-lightning-audition.html` 背後的場景。
 *
 * ⭐ **它存在的理由是一句 owner 的話**（2026-08-24）：
 * > 「閃電特效**還是沒上線**⋯我用**飛鼠天譴** 什麼閃電都沒看到」
 * > 「你可以**拍照給我** 飛鼠先生 在周圍**至少十個敵人**時 施展天譴
 * >  周圍十個連鎖閃電**互相傳遞給下一個周圍單位**的擷圖」
 * > 「理論上**連續擷圖** 可以看到 十個連鎖閃電**陸續傳遞**給其他十個單位」
 *
 * ⇒ 這一頁的交付物是**一組截圖**，而截圖要能當證據，它就必須是**真的那條路**：
 *
 *   真的 `SimWorld`（出貨的 sim）
 *     → 真的 65-04 天譴（出貨的 `content/abilities/godie-udea.r.json`）
 *       → sim 真的 `world.emit("chainLightning", { segments })`
 *         → 真的 `VfxSystem.handleEvent`（出貨的那一支，⛔ 不是抄一份）
 *           → 真的 `ArcBoltFx` 在 Babylon 場景裡建出弧帶
 *
 * ⛔ **沒有任何一段是假的。** 這一頁刻意**不**自己造 `segments`：那樣畫得出弧
 * 只證明渲染器活著，⛔ 證明不了 owner 那一發技能會不會發光（失敗形態⑤ ——
 * 被測的不是出貨的那個）。
 *
 * ⭐ **逐 tick 步進**是 owner 第二句話要的東西：連鎖是每 `jumpIntervalSec`
 * 跳一次（65-04 是 0.05 秒 ＝ 每 1.5 tick 一跳），所以「陸續傳遞」只有在
 * 把時鐘釘住、一格一格走的時候才看得到。
 *
 * ⛔ 出貨的 app 沒有任何東西 import 這一支（`public/*.html` 不是 build entry）。
 *
 * ⚠️ **台子自己的兩個坑（`calibrate()` 存在的理由 —— 量尺要先被驗過）**：
 *   ① **canvas 的背後緩衝預設是 300×150**（HTML 規格的預設），CSS 只是把它放大 ——
 *      不 resize 就在 300×150 下算圖，一條 0.17 世界單位寬的弧比一個像素還細，
 *      於是「看不見」是台子造成的，⛔ 不是遊戲（2026-08-24 我就是這樣誤判了一輪）。
 *   ② **`readPixels` 讀到的是上一幀**（swap 前讀緩衝）—— 抓五幀逐位元相同的那次
 *      就是它。⇒ `calibrate()` 先 render 兩次再讀；截圖走 `CreateScreenshotAsync`
 *      （重繪到 render target），不吃這個坑。
 *   ⇒ 頁面載入時 `calibrate()` 會放一片全亮 quad、render、readPixels 斷言亮像素>0
 *      —— 量尺自己先量一次已知會亮的東西。它失敗 ⇒ 這一頁之後量到的每一個
 *      「看不見」都不可信（是台子壞了，⛔ 不是特效壞了）。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

export interface ChainAuditionHandle {
  /** 施放一次 65-04 天譴（重置場面）。 */
  cast(): Promise<void>;
  /** 往前走 n 個 sim tick，把新事件餵進 VfxSystem。回傳這一段畫了幾條弧。 */
  step(ticks: number): number;
  /** 目前的讀數（給 HUD 與截圖自動化）。 */
  stats(): {
    tick: number;
    enemies: number;
    /** sim 到目前為止發了幾則 chainLightning */
    emitted: number;
    /** 客戶端到目前為止畫了幾條弧（ArcBoltFx 的 activeCount 峰值） */
    arcsActive: number;
    arcsDrawn: number;
  };
  readonly scene: Scene;
  /**
   * ⭐ **量尺校準**：放一片全亮 quad → render ×2 → readPixels → 斷言亮像素 > 0
   * → 移除 quad → 回傳亮像素數。頁面載入時自動跑一次；失敗 ⇒ 拋錯
   * （頁面的錯誤框會接住）。⇒ 之後任何「量到 0 亮像素」才有資格叫特效缺陷。
   */
  calibrate(): Promise<number>;
  /**
   * ⭐ 存一張 PNG（base64，⛔ 不含 `data:` 前綴）。
   * ⚠️ 走 Babylon 的 `CreateScreenshotAsync`（重繪到 render target），
   * ⛔ 不吃「`readPixels` 讀到上一幀」那個時序坑 —— 我用後者抓五幀，五張逐位元相同。
   * ⚠️ 它要等下一幀 ⇒ 這一頁**必須有 render loop**，否則永遠不 resolve。
   */
  snapshot(): Promise<string>;
  /**
   * ⛔ 診斷用（只在這一頁）：事件型別直方圖 ＋ sim 佇列，用來指出斷在哪一段。
   */
  debug(): {
    eventTypes: Record<string, number>;
    queue: number;
    casterMana: number;
    abilityR: unknown;
  };
  dispose(): void;
}

/** 敵人環半徑（格）。65-04 的 `radius` 是 8.0 ⇒ 擺 6 格確保全部進圈。 */
const RING_R = 6;

export async function startChainLightningAudition(
  canvas: HTMLCanvasElement,
  enemyCount = 10,
): Promise<ChainAuditionHandle> {
  // ⚠️ canvas 的**背後緩衝**預設是 300×150（HTML 的預設），而 CSS 只是把它放大 ——
  // ⇒ 不 resize 的話這一頁在 300×150 下算圖，一條 0.17 世界單位寬的弧**比一個像素還細**，
  // 於是「看不見」是這個台子造成的，⛔ 不是遊戲。（2026-08-24 我就是這樣誤判了一輪。）
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

  const camera = new FreeCamera("cam", new Vector3(0, 15, -15), scene);
  camera.setTarget(new Vector3(0, 1.2, 0));
  camera.minZ = 0.1;
  const light = new HemisphericLight("l", new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.5;

  const ground = MeshBuilder.CreateGround("g", { width: 40, height: 40 }, scene);
  const gm = new StandardMaterial("gm", scene);
  gm.diffuseColor = new Color3(0.07, 0.075, 0.09);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  // ── 站位替身（⛔ 只是為了看得出「弧連到誰」，⛔ 不參與 sim）──────────────
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

  const ring: { x: number; z: number }[] = [];
  for (let i = 0; i < enemyCount; i++) {
    const a = (i / enemyCount) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * RING_R, z: Math.sin(a) * RING_R });
  }

  // ── 真的 sim ＋ 真的客戶端消費端 ────────────────────────────────────────
  // ⚠️ 動態 import：這一頁只在 `vite dev` 下跑，而這些模組很大。
  const [{ buildAuditionWorld }, { VfxSystem }] = await Promise.all([
    import("./chainLightningAuditionWorld"),
    import("./VfxSystem"),
  ]);

  const { world, castOnce, casterId, casterPos, enemyPos } = await buildAuditionWorld(ring);

  // ⚠️ **座標要用 sim 的那一套。** 競技場 zone 的中心不在原點（x≈-37），而弧的
  // 端點是 sim 給的世界座標 ⇒ 替身擺在原點的話，弧會畫在 37 格外的鏡頭外面。
  // （我第一版就是這樣，畫面上什麼都看不到而計數器說有 3 條 —— 那正是
  //  「⛔ 不要用計數器代替眼睛」的反例。）
  mkBody(casterPos.x, casterPos.z, true);
  for (const p of enemyPos) mkBody(p.x, p.z, false);
  ground.position.set(casterPos.x, 0, casterPos.z);
  camera.position.set(casterPos.x, 15, casterPos.z - 15);
  camera.setTarget(new Vector3(casterPos.x, 1.2, casterPos.z));

  const vfx = new VfxSystem(scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
  } as never);

  /**
   * 場上「正在發光的弧帶」數 —— ⭐ 讀**真的 Babylon 網格**（可見且有頂點），
   * ⛔ 不讀 VfxSystem 自己的計數器（那是失敗形態⑦：掃屬性代替掃行為）。
   * 判準與 `chainLightningArc.test.ts` 同一套。
   */
  const arcMeshCount = (): number =>
    scene.meshes.filter(
      // `ArcBoltFx` 的弧帶名字逐字是 `vfx-arc`，閒置時 `setEnabled(false)`
      // ⇒ 「開著的 vfx-arc」就是「這一刻畫面上真的有幾條電」。
      (m) => m.name === "vfx-arc" && m.isEnabled() && m.getTotalVertices() > 0,
    ).length;

  let emitted = 0;
  let arcsDrawn = 0;
  let seen = 0;
  let clockMs = 0;

  /**
   * ⚠️ `SimWorld.step()` 的**第一行就把 `events` 清空**（`SimWorld.ts:1582`）——
   * ⇒ 事件是**逐 tick 的**，⛔ 不是累積的。所以這裡每 tick 讀完整份，
   * ⛔ 不可以拿一個游標去索引（我第一版就是這樣，量到的數字直接少一個量級）。
   */
  const drainEvents = (): number => {
    let drew = 0;
    const evs = world.events as readonly { type: string; tick: number; data: unknown }[];
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]!;
      if (ev.type === "chainLightning") emitted++;
      seen++;
      const before = arcMeshCount();
      // ⭐ **出貨的那一支** handleEvent —— ⛔ 沒有第二份實作。
      vfx.handleEvent(ev as never, clockMs);
      const after = arcMeshCount();
      if (after > before) drew += after - before;
    }
    arcsDrawn += drew;
    return drew;
  };

  /**
   * 量尺校準（見檔頭「台子自己的兩個坑」）。全亮 quad 貼在鏡頭正前方：
   * emissive 純白 + disableLighting ⇒ 不管燈光怎麼擺它都必須亮。
   * 它量到 0 ⇒ 壞的是台子（canvas 尺寸／相機／readPixels 時序），⛔ 不是特效。
   */
  const calibrate = async (): Promise<number> => {
    const quad = MeshBuilder.CreatePlane("calib-quad", { size: 4 }, scene);
    const qm = new StandardMaterial("calib-mat", scene);
    qm.emissiveColor = new Color3(1, 1, 1);
    qm.disableLighting = true;
    quad.material = qm;
    quad.parent = camera;
    quad.position.set(0, 0, 5);
    try {
      // ⚠️ 坑②：readPixels 會讀到上一幀 ⇒ 先 render **兩次**再讀。
      scene.render();
      scene.render();
      const w = engine.getRenderWidth();
      const h = engine.getRenderHeight();
      const buf = (await engine.readPixels(0, 0, w, h)) as Uint8Array;
      let bright = 0;
      for (let i = 0; i + 2 < buf.length; i += 4) {
        if (Math.max(buf[i]!, buf[i + 1]!, buf[i + 2]!) > 200) bright++;
      }
      if (bright <= 0) {
        throw new Error(
          `calibrate(): 全亮 quad 在 ${w}×${h} 的畫面上量到 0 個亮像素 —— ` +
            "量尺本身壞了（canvas 背後緩衝 300×150？readPixels 讀到上一幀？相機沒對到？）。" +
            "這一頁之後量到的任何「看不見」都不可信,先修台子。",
        );
      }
      return bright;
    } finally {
      quad.dispose();
      qm.dispose();
      scene.render(); // 把移除 quad 之後的畫面畫回來，⛔ 不讓校準圖殘留進下一張截圖
    }
  };

  const handle: ChainAuditionHandle = {
    calibrate,
    async cast(): Promise<void> {
      seen = 0;
      emitted = 0;
      arcsDrawn = 0;
      clockMs = 0;
      castOnce();
    },
    step(ticks: number): number {
      let drew = 0;
      for (let i = 0; i < ticks; i++) {
        world.step(new Map());
        clockMs += 1000 / 30;
        drew += drainEvents();
        vfx.update(clockMs);
      }
      scene.render();
      return drew;
    },
    stats() {
      return {
        tick: world.tick,
        enemies: enemyCount,
        emitted,
        arcsActive: arcMeshCount(),
        arcsDrawn,
      };
    },
    scene,
    async snapshot(): Promise<string> {
      // ⚠️ `CreateScreenshotAsync` 的實作住在 `screenshotTools`，⛔ 不在 `Misc/tools`
      //    —— 只 import 後者會拿到「needs to be imported before」那句 side-effect 錯誤。
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
      const hist: Record<string, number> = {};
      for (const e of world.events as readonly { type: string }[]) hist[e.type] = (hist[e.type] ?? 0) + 1;
      const q = (world as unknown as { chainLightning?: unknown[] }).chainLightning;
      const hp = world.health.get(casterId as never);
      const ab = world.abilities.get(casterId as never) as unknown as
        | { slots?: Record<string, unknown> }
        | undefined;
      return {
        eventTypes: hist,
        queue: Array.isArray(q) ? q.length : -1,
        casterMana: hp ? (hp as { mana: number }).mana : -1,
        abilityR: ab?.slots?.R,
      };
    },
    dispose(): void {
      scene.dispose();
      engine.dispose();
    },
  };
  // ⚠️ **要有 render loop。** 沒有的話 `Tools.CreateScreenshotAsync` 會等下一幀
  //    而永遠不 resolve（我踩過，卡住 30 秒逾時）。逐 tick 步進仍然由 `step()`
  //    決定，這條迴圈只負責把當前狀態持續畫出來。
  engine.runRenderLoop(() => scene.render());
  return handle;
}
