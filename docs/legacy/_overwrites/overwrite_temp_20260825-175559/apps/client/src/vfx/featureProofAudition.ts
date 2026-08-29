/**
 * featureProofAudition —— 四批「玩家看得到嗎」的**終端像素證據**台子
 * （GH#694 天氣 · GH#696 幻之匕首噴血 · GH#677 脫困 · GH#659 火圈立即縮）。
 *
 * ⭐ 存在的理由是 CLAUDE.md 👁 節（飛鼠先生天譴的教訓）：
 * 「鏈路已接上」⛔ 不等於「做完」。四批的**行為**守衛都已經綠了很久，而
 * `docs/_review/feature-verdicts.json` 的登記閘要的是**連續圖片 ＋ 逐張亮像素** ——
 * 一組真的渲染出來的畫面，⛔ 不是「事件有送」。
 *
 * ⛔ 每一批都走**出貨的那條路**（失敗形態⑤：被測的不是出貨的那個）：
 *   · 天氣  ：出貨 `weatherPolicy()`（讀 `Configs`）→ 出貨 `weatherLookFor()`（含每場擲骰）
 *             → 出貨 `buildRain()` / `buildFogBanks()`
 *   · 匕首  ：出貨 `SimWorld` 真對打 → 出貨 `godie-i039` 的 passive 真的擲中 3%
 *             → sim 真的 `vfxSpawn` → 出貨 `VfxSystem`
 *   · 脫困  ：出貨 `SimWorld.step()` 的分離 pass ＋ `stuckEscape` 保險絲
 *             → sim 真的 `floatingText` → 出貨 `VfxSystem`
 *   · 火圈  ：出貨 `fireRingRulesFromConfig()` ＋ `fireRingSystem`（跑在 `world.step()` 裡）
 *             → 出貨 `FireRingFx`
 *
 * ⚠️ 三個量尺坑照抄 `beamAudition`（`calibrate()` 存在的理由）：
 *   ① canvas 背後緩衝預設 300×150 —— 要 resize；
 *   ② `readPixels` 讀到上一幀 —— 先 render ×2 再讀；
 *   ③ 材質沒 ready 時 render 靜默跳過 mesh —— 量已知亮的 control 前先
 *      `forceCompilationAsync`。
 *   ⇒ `calibrate()` 量不到那顆已知會亮的 quad ⇒ **這一頁之後的每一個「看不見」
 *      都不可信**，整批結論作廢。
 *
 * ⚠️ 替身（圓柱）只是**看得出誰在哪**的觀景窗：它們的座標**逐 tick 從 sim 的
 * `world.transform` 讀**，⛔ 不是台子自己編的動畫。真正被量的東西（雨滴、血花、
 * 火圈帶、浮字）沒有一個是這一頁畫的。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";

/** 一張證據圖的量測結果（`frames.md` 逐列就是它）。 */
export interface ProofFrame {
  label: string;
  note: string;
  /** max(R,G,B) > 200 的像素數 */
  bright: number;
  /** max(R,G,B) > 96 的像素數 */
  lit: number;
  /** max(R,G,B) > 32 的像素數 —— 半透明的東西（雨）只過得了這一道 */
  faint: number;
}

export interface ProofRun {
  scenario: string;
  /** 量尺自證：全亮 quad 的亮像素數（0 ⇒ 整批作廢） */
  calibrate: number;
  width: number;
  height: number;
  frames: ProofFrame[];
  /** 每一批自己的關鍵讀數（座標、半徑、觸發 tick…） */
  facts: Record<string, unknown>;
}

// ───────────────────────────── 台子（共用） ─────────────────────────────

interface Stage {
  scene: Scene;
  camera: FreeCamera;
  measure(): Promise<{ bright: number; lit: number; faint: number; w: number; h: number }>;
  calibrate(): Promise<number>;
  /** 量 → 截圖 → POST 給 `shot-sink`。⛔ 不回傳 base64（那會塞爆工具輸出）。 */
  capture(label: string, note: string): Promise<ProofFrame>;
  /** 等 n 個真的畫面幀（粒子系統吃的是牆鐘 delta，⛔ 不是 sim tick）。 */
  waitFrames(n: number): Promise<void>;
  /** ⭐ 第一張截圖之前一定要等：材質沒編完 `render()` 會靜默跳過那顆 mesh。 */
  ready(): Promise<void>;
  size(): { w: number; h: number };
  dispose(): void;
}

function countBright(buf: Uint8Array): { bright: number; lit: number; faint: number } {
  let bright = 0;
  let lit = 0;
  let faint = 0;
  for (let i = 0; i + 2 < buf.length; i += 4) {
    const v = Math.max(buf[i]!, buf[i + 1]!, buf[i + 2]!);
    if (v > 200) bright++;
    if (v > 96) lit++;
    // ⭐ 第三道門檻是**必要的**，⛔ 不是裝飾：出貨的雨 `rainAlpha 0.22` 疊在深色
    //    地板上只有 ~55/255 —— 它在畫面上看得見，卻永遠過不了 lit 的 96。
    //    只量兩道門檻的話，一場真的在下的雨會被報成「零像素」。
    if (v > 32) faint++;
  }
  return { bright, lit, faint };
}

function makeStage(canvas: HTMLCanvasElement, sinkUrl: string, frames: ProofFrame[]): Stage {
  // ⚠️ 坑①：背後緩衝預設 300×150，CSS 只是放大。
  canvas.width = Math.max(960, canvas.clientWidth || 1280);
  canvas.height = Math.max(540, canvas.clientHeight || 720);
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.resize();
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.03, 0.035, 0.05, 1);
  /**
   * ⭐ **粒子時間 = 我畫了幾幀**，⛔ 不是牆鐘（Babylon `scene.useConstantAnimationDeltaTime`
   * ⇒ 每一次 `render()` 固定推進 16ms）。
   * ⚠️ 這一格是被踩出來的：血花的壽命是 **0.22–0.62 秒**，而「量 → PNG 編碼 → POST」
   * 一張圖就要 0.3–0.8 秒 ⇒ 用牆鐘的話，**第二張圖上血就已經散光了**，
   * 於是一個好好的特效會被量成「只有出生那一幀看得到」。
   */
  scene.useConstantAnimationDeltaTime = true;
  const camera = new FreeCamera("cam", new Vector3(0, 12, -12), scene);
  camera.minZ = 0.1;
  const light = new HemisphericLight("l", new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.62;

  /**
   * 畫一幀。⚠️ `beginFrame()/endFrame()` **不可以省** —— 那是 Babylon 的 render loop
   * 每一幀做的事，而 GPU 粒子（`GPUParticleSystem`）的雙緩衝與 `_frameId` 靠它推進。
   * 只叫 `scene.render()` 的話，一場 1,200 滴的雨在畫面上是**零像素**。
   */
  const renderFrame = (): void => {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  };

  const measure = async (): Promise<{ bright: number; lit: number; faint: number; w: number; h: number }> => {
    // ⚠️ 坑②：readPixels 讀到上一幀 ⇒ 先 render 兩次再讀。
    renderFrame();
    renderFrame();
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
      // ⚠️ 坑③：材質沒 ready 時 render 靜默跳過 mesh。
      await qm.forceCompilationAsync(quad);
      const m = await measure();
      if (m.bright <= 0) {
        throw new Error(
          `calibrate(): 全亮 quad 在 ${m.w}×${m.h} 上量到 0 個亮像素 —— 量尺壞了，` +
            "這一批之後量到的任何「看不見」都不可信。",
        );
      }
      return m.bright;
    } finally {
      quad.dispose();
      qm.dispose();
      renderFrame();
    }
  };

  /**
   * 推進 n 幀。⛔ 沒有 render loop —— 這一頁自己畫，所以「幀」是可數的。
   * ⚠️ 每 8 幀讓出一次事件迴圈：貼圖/著色器是**非同步**載入的，不讓出的話
   * 它們永遠不會完成，而畫面上就會少東西（坑③的第三種樣子）。
   */
  const waitFrames = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) {
      renderFrame();
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 0));
  };

  const capture = async (label: string, note: string): Promise<ProofFrame> => {
    const m = await measure();
    // ⭐ `preserveDrawingBuffer: true` ⇒ 直接從 canvas 取 PNG。
    //    ⛔ 不走 `Tools.CreateScreenshotAsync` —— 那一支要有 render loop 才 resolve，
    //    而 render loop 正是「粒子時間跟著牆鐘跑」的來源（見上面那一段）。
    const b64 = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    const res = await fetch(`${sinkUrl}/${label}.png`, { method: "POST", body: b64 });
    if (!res.ok) throw new Error(`shot-sink 拒收 ${label}.png：${res.status}`);
    const frame: ProofFrame = { label, note, bright: m.bright, lit: m.lit, faint: m.faint };
    frames.push(frame);
    return frame;
  };

  return {
    scene,
    camera,
    measure,
    calibrate,
    capture,
    waitFrames,
    size: () => ({ w: engine.getRenderWidth(), h: engine.getRenderHeight() }),
    async ready(): Promise<void> {
      // ⚠️ 坑③的第二種樣子：**第一張**截圖最容易踩到 —— 材質還在編譯時
      // `render()` 靜默跳過那顆 mesh ⇒ 基線量到 0，而畫面上明明有東西。
      await scene.whenReadyAsync();
      await waitFrames(4);
    },
    dispose(): void {
      // ⚠️ 這一支跑在 `finally` 裡 ⇒ 它擲例外會**吃掉整批的結果**。
      // Babylon 7.54 的 `GPUParticleSystem.dispose()` 在某些狀態下會擲
      // TypeError（`_releaseBuffers`），而 `scene.dispose()` 會逐個叫它。
      for (const ps of [...scene.particleSystems]) {
        try {
          ps.stop();
          ps.dispose();
        } catch {
          /* 台子的清理失敗⛔ 不可以變成「這一批量不到」 */
        }
      }
      try {
        scene.dispose();
      } catch {
        /* 同上 */
      }
      engine.dispose();
    },
  };
}

/** 深色地板（讓亮的東西是被量的那個，⛔ 不是背景）。 */
function makeGround(scene: Scene, cx: number, cz: number, size: number): void {
  const ground = MeshBuilder.CreateGround("g", { width: size, height: size }, scene);
  const gm = new StandardMaterial("gm", scene);
  gm.diffuseColor = new Color3(0.06, 0.065, 0.08);
  gm.specularColor = Color3.Black();
  ground.material = gm;
  ground.position.set(cx, 0, cz);
}

/**
 * 一具替身圓柱。⚠️ 它只是觀景窗；座標一律從 sim 讀。
 * ⭐ 自發光是**量尺的需要**，⛔ 不是美術：純漫反射在 0.62 環境光下只有 ~66/255，
 * 落在 lit 門檻（96）底下 ⇒ 整組畫面量到 0，而畫面上明明看得到人。
 */
function makeBody(scene: Scene, name: string, tint: Color3): TransformNode {
  const b = MeshBuilder.CreateCylinder(name, { height: 1.85, diameter: 1.2 }, scene);
  const m = new StandardMaterial(`${name}-m`, scene);
  m.diffuseColor = tint;
  m.emissiveColor = tint.scale(0.55);
  m.specularColor = Color3.Black();
  b.material = m;
  return b;
}

// ───────────────────────────── 內容載入（共用） ─────────────────────────────

/**
 * ⭐ 量的是**工作樹的出貨檔案**（同 `beamAuditionWorld` 的理由）：`bundle.json`
 * 是 `content:build` 的產物，而併行批次裡它只由主 session 最後統一重生成 ⇒
 * bundle-first 的預設載入會把這一頁釘在上一次 build 的內容上。
 */
async function loadWorkingTreeContent(): Promise<void> {
  const [{ ensureContentLoaded }, { HttpContentSource }] = await Promise.all([
    import("../content/bootContent"),
    import("@ggd/shared/content"),
  ]);
  const source = new HttpContentSource({
    baseUrl: "/content",
    fetchFn: (input, init) => fetch(input, init),
  });
  await ensureContentLoaded({ source, disableOverlay: true });
}

// ───────────────────────── ① 天氣：無雨 → 下雨 → 起霧 ─────────────────────────

/**
 * GH#694 / #676。⚠️ 雨是**機率制**（`rainChance` 出貨 0.3）⇒ 這一頁用
 * `rainChance: 1` **強制**擲中並固定 seed —— ⛔ 不是「把雨打開」，走的仍然是
 * 出貨的 `weatherLookFor()` 擲骰分支（`chance>=1 ⇒ 必下` 是它自己的精確分支）。
 */
async function runWeather(st: Stage): Promise<Record<string, unknown>> {
  await loadWorkingTreeContent();
  const [{ weatherPolicy }, { weatherLookFor }, { buildRain }, { buildFogBanks }, { SKELETON_ARENA }] =
    await Promise.all([
      import("../render/weather"),
      import("@ggd/shared/content"),
      import("./WeatherRainFx"),
      import("../render/weatherFogBanks"),
      import("@ggd/shared/sim/world/ArenaDef"),
    ]);

  const SEED = 7919;
  const ON = { wetGround: true, puddles: true, fog: true } as const;
  const shipped = weatherPolicy();
  const zone = SKELETON_ARENA.zones[0]!;
  const zones = [{ center: zone.center, boundaryRadius: zone.boundaryRadius }];
  const cx = zone.center.x;
  const cz = zone.center.z;

  makeGround(st.scene, cx, cz, zone.boundaryRadius * 2.4);
  for (let i = 0; i < 3; i++) {
    const b = makeBody(st.scene, `w-body-${i}`, new Color3(0.3, 0.32, 0.4));
    b.position.set(cx - 4 + i * 4, 0.925, cz + 2);
  }
  // 側視、稍微仰角：雨柱橫過整個畫面，⛔ 不是俯視只看得到地板。
  st.camera.position.set(cx, 4.5, cz - 18);
  st.camera.setTarget(new Vector3(cx, 3.2, cz + 2));

  const root = new TransformNode("weather-root", st.scene);
  const facts: Record<string, unknown> = { seed: SEED, shippedRainChance: shipped.rainChance };
  /**
   * ⚠️ **停止＋等它落完**，⛔ 不是 `dispose()`：Babylon 7.54 的 `GPUParticleSystem`
   * 在還沒送過一整幀就 dispose 會在 `_releaseBuffers` 擲 TypeError（實測），
   * 而那個例外會把整批量測帶走 —— 台子的清理失敗⛔ 不可以變成「這一批量不到」。
   * 一滴的壽命 = 雨柱高 / 落速 ≈ 1.1 秒 ⇒ 等 80 幀，畫面上一滴都不剩。
   */
  let live: { stop(): void } | null = null;
  const clear = async (): Promise<void> => {
    if (live === null) return;
    live.stop();
    live = null;
    // 一滴的壽命 ≈ 雨柱高/落速 ≈ 1 秒 ＝ 60 幀（固定 16ms/幀）⇒ 100 幀後一滴不剩。
    await st.waitFrames(100);
  };

  /** 一格：政策 × 場地 → 出貨的 look → 出貨的 buildRain。 */
  const rainStep = async (
    label: string,
    note: string,
    arenaId: string,
    chance: number,
    waitFrames: number,
  ): Promise<void> => {
    await clear();
    const policy = { ...shipped, rainChance: chance };
    const look = weatherLookFor(policy, arenaId, ON, SEED);
    let handle: ReturnType<typeof buildRain> = null;
    let threw: string | null = null;
    try {
      handle = buildRain(st.scene, root, arenaId, zones, { policy, look }, 1);
    } catch (e) {
      // ⛔ 出貨呼叫點（`ArenaScene.buildArena`）**沒有** try/catch —— 這裡包起來
      //    是為了**把例外拍下來**，⛔ 不是為了讓它看起來沒事。
      threw = e instanceof Error ? e.message : String(e);
    }
    facts[label] = {
      arenaId,
      chance,
      rain: look.rain,
      kind: look.kind,
      built: handle !== null,
      threw,
    };
    if (handle) live = { stop: () => handle!.ps.stop() };
    await st.waitFrames(waitFrames);
    if (handle) {
      // 診斷：「雨看不見」到底是沒建、沒開始、沒粒子，還是畫不出來 —— ⛔ 不要用猜的。
      const ps = handle.ps as unknown as {
        isStarted?: () => boolean;
        isReady?: () => boolean;
        getActiveCount?: () => number;
        particleTexture?: { isReady?: () => boolean } | null;
      };
      Object.assign(facts[label] as Record<string, unknown>, {
        gpu: handle.gpu,
        columnY: handle.columnY,
        started: ps.isStarted?.(),
        psReady: ps.isReady?.(),
        active: ps.getActiveCount?.(),
        texReady: ps.particleTexture?.isReady?.(),
      });
    }
    await st.capture(label, threw === null ? note : `${note}｜⛔ buildRain 擲例外：${threw}`);
  };

  await st.ready();
  await st.capture("w0_baseline_no_weather", "基線：地板＋三具替身，沒有任何天氣層");
  await rainStep(
    "w1_chance0_no_rain",
    "rainChance 0 ⇒ 出貨擲骰必不中 ⇒ buildRain 回 null（一顆粒子系統都不建）",
    "arena.colosseum",
    0,
    2,
  );
  // ⛔⛔ **GH#694 的紅字**：出貨的 `WeatherRainFx` 在 `GPUParticleSystem.IsSupported`
  //     為真時走 GPU 路，⛔ 而全 repo **沒有任何地方** import
  //     `@babylonjs/core/Particles/webgl2ParticleSystem`（那支才會註冊 WebGL2 平台）。
  //     ⇒ 真瀏覽器（WebGL2）一律擲「The WebGL2ParticleSystem class is not available!」，
  //     而測試看不到：NullEngine 的 `IsSupported` 是 false ⇒ 測試量的是 CPU 那條路
  //     （`WeatherRainFx.ts` 的檔頭自己寫著這件事）。
  //     這一格就是**今天玩家會看到的**：擲骰中了、雨卻擲例外。
  await rainStep(
    "w2_shipped_path_throws",
    "⛔ 出貨路徑（未補 webgl2ParticleSystem import）：擲骰中了，`buildRain` 直接擲例外 ⇒ 一滴雨都沒有",
    "arena.colosseum",
    1,
    10,
  );
  // ⚠️ 下面每一張雨的圖，都是**台子補上那一行 import 之後**的樣子 ——
  //    ⛔ 它證明的是「雨本身畫得出來」，⛔ 不是「玩家今天看得到雨」。
  await import("@babylonjs/core/Particles/webgl2ParticleSystem");
  facts["webgl2PlatformImportedByHarness"] = true;
  await rainStep(
    "w2_rain_clear_outdoor",
    "（台子補了那一行 import 之後）rainChance 1 ＋ seed 7919：clear 級的**室外**圖也在機率池裡 —— #676 的核心",
    "arena.colosseum",
    1,
    130,
  );
  await rainStep(
    "w3_rain_wet_arena",
    "同一顆 seed 換成 rain 級場地（希干希納）：強度階梯由 WEATHER_KIND_WEIGHTS 決定",
    "arena.shiganshina",
    1,
    130,
  );
  await rainStep(
    "w4_indoor_never_rains",
    "室內圖（納薩力克）＋ rainChance 1：室外閘擋住 ⇒ 永遠不下（owner「室內請不要下雨」）",
    "arena.nazarick",
    1,
    20,
  );

  // ── 霧：無霧 → 起霧（同一份政策、同一格開關，⛔ 不是第二套天氣系統）──────
  await clear();
  // ⚠️ 霧堤是**平躺在 XZ 上**的霧片（`fogBankHeight` 1.2）——
  //    雨用的那個側視機位看到的是它的**邊緣**，量到的必然是 0。
  //    ⇒ 霧要換一個**俯視**機位，⛔ 不然量到的「看不見」是機位造成的。
  st.camera.position.set(cx, zone.boundaryRadius * 1.1, cz - zone.boundaryRadius * 0.55);
  st.camera.setTarget(new Vector3(cx, 0, cz));
  await st.waitFrames(4);
  await st.capture("w5_fog_off", "霧那一半的基線（**俯視**機位）：這一格還沒建霧堤");
  const fogArena = "arena.shiganshina";
  const fogLook = weatherLookFor({ ...shipped, rainChance: 0 }, fogArena, ON, SEED);
  const fog = buildFogBanks(st.scene, root, fogArena, zones, {
    policy: { ...shipped, rainChance: 0 },
    look: fogLook,
    // ⭐ **刻意**走「減少動態」那條出貨路：它把霧凍在 **t=0** 的姿勢。
    //    ⚠️ 理由是可重現性 —— 不凍的話霧堤的位置吃 `performance.now()`（90 秒漂移週期），
    //    同一張證據圖每跑一次都在不同相位，而「這一格量到 0」會分不出是
    //    **霧看不見** 還是 **這一刻霧剛好飄出畫面**。
    reducedMotion: true,
  });
  facts["w6_fog_on"] = { arenaId: fogArena, fogBanks: fogLook.fogBanks, built: fog !== null };
  await st.waitFrames(30);
  await st.capture(
    "w6_fog_on",
    `起霧（俯視、reducedMotion 凍在 t=0）：出貨 buildFogBanks 真的建了 ${fogLook.fogBanks} 片霧堤`,
  );
  return facts;
}

// ───────────────────── ② 幻之匕首：普攻 → 觸發 → 背後噴血 ─────────────────────

/**
 * GH#696 / #641。⚠️ 觸發率 3% ⇒ 用**固定 seed 7**（sim 決定性）掃到觸發那一 tick，
 * ⛔ 不是把機率改成 1 —— 改機率就不是出貨的那條路了。
 */
async function runDagger(st: Stage): Promise<Record<string, unknown>> {
  await loadWorkingTreeContent();
  const [
    { SimWorld },
    { SKELETON_ARENA },
    { spawnChampion },
    { grantItemFree },
    { Items },
    { VfxDefs },
    { VfxSystem },
    ids,
  ] = await Promise.all([
    import("@ggd/shared/sim/SimWorld"),
    import("@ggd/shared/sim/world/ArenaDef"),
    import("@ggd/shared/sim/spawnChampion"),
    import("@ggd/shared/sim/economy/shop"),
    import("@ggd/shared/sim/content/registry"),
    import("@ggd/shared/content/registries"),
    import("./VfxSystem"),
    import("@ggd/shared/ids"),
  ]);

  const DAGGER = "godie-i039";
  const MELEE = "godie-o02l";
  const binding = (Items.get(DAGGER as never).passive ?? [])[0]?.effects.find(
    (e: { kind: string }) => e.kind === "spawnVfx",
  ) as { kind: string; vfxId: string } | undefined;
  if (binding === undefined) {
    throw new Error("godie-i039 的 passive 裡沒有 spawnVfx 綁定 —— 這一批的前提不成立 (GH#641)");
  }

  // ⭐ 這一段**逐字照抄出貨守衛** `daggerBloodSprayRenders.test.ts` 的擺法
  //    （種子 7、z 中心 +8、⛔ 不設 combatActive）—— 換座標就換 RNG 消耗序，
  //    「第幾 tick 擲中」是決定性的**結果**，⛔ 不是可以隨手改的佈景。
  const zone = SKELETON_ARENA.zones[0]!;
  const cz = zone.center.z + 8;
  const world = new SimWorld(SKELETON_ARENA, 7); // 種子 7：出貨守衛量到第 15 tick 擲中
  let seat = 0;
  const spawn = (team: 0 | 1, dx: number): number =>
    spawnChampion(world, {
      championId: MELEE as never,
      seatId: ids.asSeatId(seat++),
      teamId: ids.asTeamId(team),
      pos: { x: zone.center.x + dx, z: cz },
      zone: 0,
    }) as unknown as number;
  const holder = spawn(0, -0.6);
  const victim = spawn(1, 0.6);
  if (grantItemFree(world, holder as never, DAGGER as never) < 0) {
    throw new Error("幻之匕首沒進背包 —— 這一批的前提不成立");
  }
  world.nav.get(holder as never)!.attackTarget = victim as never;
  /**
   * ⚠️ 唯一與出貨守衛不同的一格，而且它**不碰擲骰**：兩邊血量墊高。
   * 理由是量到的 —— 瀏覽器載的是**全部**出貨內容（含 `config.combat-env` 等
   * 一整排 config），RNG 消耗序與 node 側只載 6 個集合的守衛不同 ⇒ 3% 落在
   * 更後面；而在那之前受害者已經被砍死，`attackTarget` 清掉 ⇒ 從此不再有普攻，
   * 於是「3,000 tick 一次都沒中」。墊血量只讓對打持續，⛔ 不改機率、⛔ 不改綁定。
   */
  for (const id of [holder, victim]) {
    const hp = world.health.get(id as never)!;
    hp.maxHp = 4_000_000;
    hp.hp = 4_000_000;
  }

  makeGround(st.scene, zone.center.x, cz, 24);
  const bodyA = makeBody(st.scene, "dagger-holder", new Color3(0.36, 0.31, 0.17));
  const bodyB = makeBody(st.scene, "dagger-victim", new Color3(0.22, 0.24, 0.3));
  const place = (): void => {
    const a = world.transform.get(holder as never)!.pos;
    const b = world.transform.get(victim as never)!.pos;
    bodyA.position.set(a.x, 0.925, a.z);
    bodyB.position.set(b.x, 0.925, b.z);
  };
  place();
  // 從側面看：攻擊者→受害者是 +x，血花往 +x 噴 ⇒ 側視最看得出「往背後」。
  st.camera.position.set(zone.center.x, 3.4, cz - 9);
  st.camera.setTarget(new Vector3(zone.center.x + 1.4, 1.5, cz));

  const vfx = new VfxSystem(st.scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
    vfxDoc: (key: string) => VfxDefs.tryGet(key) ?? null,
  } as never);

  const facts: Record<string, unknown> = { vfxId: binding.vfxId, seed: 7 };
  let clockMs = 0;
  /** 診斷：事件型別直方圖 —— 「一次都沒中」到底是沒打還是沒擲中，⛔ 不要用猜的。 */
  const eventHist: Record<string, number> = {};
  /** 走 n 個 sim tick，把**整份**事件餵進出貨的 handleEvent。回傳擲中的 tick（-1 = 沒有）。 */
  const step = (n: number): number => {
    let hit = -1;
    for (let i = 0; i < n; i++) {
      world.step(new Map());
      clockMs += 1000 / 30;
      for (const ev of world.events) {
        eventHist[ev.type] = (eventHist[ev.type] ?? 0) + 1;
        if (
          ev.type === "vfxSpawn" &&
          (ev.data as { vfxId?: string }).vfxId === binding.vfxId &&
          hit < 0
        ) {
          hit = world.tick;
        }
        vfx.handleEvent(ev as never, clockMs);
      }
      vfx.update(clockMs);
    }
    place();
    return hit;
  };

  await st.ready();
  await st.capture("d0_baseline_tick0", "基線：兩具替身站定，還沒開打");
  // 觸發前的安靜刀 —— 3% ⇒ 期望 ~33 刀一次，先走一段**沒有**血花的畫面當對照。
  step(20);
  await st.capture("d1_quiet_swings_tick20", "普攻已經在互砍 20 tick，3% 還沒擲中 —— 場上沒有血花");
  // ⚠️ 逐 tick 走到擲中那一格（⛔ 不寫死 tick 號：座標一動 RNG 消耗就不同，
  //    而「哪一 tick 擲中」是決定性的**結果**，不是這一頁的輸入）。
  let hitTick = -1;
  for (let i = 0; i < 4000 && hitTick < 0; i++) hitTick = step(1);
  facts["triggerTick"] = hitTick;
  facts["eventHist"] = { ...eventHist };
  facts["aliveAtTrigger"] = {
    holder: world.health.get(holder as never)?.alive,
    victim: world.health.get(victim as never)?.alive,
  };
  if (hitTick < 0) {
    throw new Error(
      `4000 tick 內 3% 一次都沒擲中 —— 事件直方圖 ${JSON.stringify(eventHist)}、` +
        `存活 ${JSON.stringify(facts["aliveAtTrigger"])}`,
    );
  }
  const pool = st.scene.particleSystems.filter((p) => p.name.startsWith(`vfx-${binding.vfxId}`));
  facts["poolNames"] = pool.map((p) => p.name);
  await st.waitFrames(2);
  await st.capture(
    "d2_trigger_spray_born",
    `3% 在第 ${hitTick} tick 擲中：出貨 vfxSpawn 落地，血花池 ${pool.map((p) => p.name).join(" / ") || "無"}`,
  );
  await st.waitFrames(8);
  step(5);
  await st.capture("d3_spray_0_2s", "噴血 ~0.2 秒：burst 全落在觸發幀，往受害者背後（+x）散開");
  await st.waitFrames(8);
  step(5);
  await st.capture("d4_spray_0_6s", "噴血 ~0.6 秒：拉伸 trace ＋ gravity -6 開始往下掉");
  await st.waitFrames(70);
  step(45);
  facts["aliveAfter"] = pool.reduce(
    (n, p) => n + ((p as unknown as { particles?: unknown[] }).particles?.length ?? 0),
    0,
  );
  await st.capture("d5_dissipated", "消散：血花壽命走完，畫面回到只有兩具替身");
  return facts;
}

// ───────────────────── ③ 脫困：互卡 2 秒 → 穿過去 ＋ 頭上冒字 ─────────────────────

/**
 * GH#677。⚠️ 這一批**故意**把兩件事分開量：
 *   · **穿過去**（`MovementSystem` 的 phasing）—— 替身座標逐 tick 從 sim 讀，看得見；
 *   · **頭上冒「脫困」**（`floatingText`）—— 事件真的發出來、真的進了出貨的
 *     `VfxSystem`，⭐ 但**畫面上一個像素都沒有**（見報告的紅字）。
 */
async function runStuckEscape(st: Stage): Promise<Record<string, unknown>> {
  await loadWorkingTreeContent();
  const [{ SimWorld }, { SKELETON_ARENA }, { DEFAULT_COMBAT_FEEL }, { VfxDefs }, { VfxSystem }, ids, stats, attrs] =
    await Promise.all([
      import("@ggd/shared/sim/SimWorld"),
      import("@ggd/shared/sim/world/ArenaDef"),
      import("@ggd/shared/sim/combatFeel"),
      import("@ggd/shared/content/registries"),
      import("./VfxSystem"),
      import("@ggd/shared/ids"),
      import("@ggd/shared/sim/stats/statTypes"),
      import("@ggd/shared/sim/stats/attributes"),
    ]);

  const world = new SimWorld(SKELETON_ARENA, 20260824);
  world.combatActive = true;
  world.combatFeel = DEFAULT_COMBAT_FEEL; // 出貨那一份 —— 保險絲預設開、N=2 秒

  const spawn = (seat: number, x: number, z: number): number => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp: 500000, maxHp: 500000, mana: 100, maxMana: 100, alive: true, shields: [] });
    world.team.set(id, { teamId: ids.asTeamId(0), seatId: ids.asSeatId(seat) });
    world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
    world.status.set(id, { effects: [] });
    const final = stats.zeroStats();
    final[stats.Stat.MoveSpeed] = 5.8;
    final[stats.Stat.AttackRange] = 1.6;
    final[stats.Stat.AttackSpeed] = 1;
    world.stats.set(id, { championId: "probe" as never, final, dirty: false, sources: [] });
    const slot = () => ({ abilityId: "probe.none" as never, rank: 0, cooldownRemainingTicks: 0 });
    world.abilities.set(id, {
      slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as never,
      exSlot: null,
      basicAttackCdTicks: 0,
      unspentPoints: 0,
    });
    world.champion.set(id, {
      championId: "probe" as never,
      level: 1,
      xp: 0,
      gold: 0,
      items: [],
      augments: [],
      statStacks: 0,
      attrBonus: attrs.zeroAttrBonus(),
      statCapstonePct: 0,
      pendingOrbSlots: 0,
      undoStack: [],
    });
    return id as unknown as number;
  };

  // 出貨守衛 `stuckEscape.test.ts` 逐字的那一組座標（教科書互卡）。
  const a = spawn(0, -44, -6);
  const b = spawn(1, -42.8, -6);
  makeGround(st.scene, -43.4, -6, 20);
  const bodyA = makeBody(st.scene, "stuck-a", new Color3(0.42, 0.28, 0.2));
  const bodyB = makeBody(st.scene, "stuck-b", new Color3(0.2, 0.3, 0.44));
  const place = (): void => {
    const pa = world.transform.get(a as never)!.pos;
    const pb = world.transform.get(b as never)!.pos;
    bodyA.position.set(pa.x, 0.925, pa.z);
    bodyB.position.set(pb.x, 0.925, pb.z);
  };
  place();
  st.camera.position.set(-43.4, 5.2, -13);
  st.camera.setTarget(new Vector3(-43.4, 1.2, -6));

  const vfx = new VfxSystem(st.scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
    vfxDoc: (key: string) => VfxDefs.tryGet(key) ?? null,
  } as never);

  const escaped = new Set<number>();
  let escapeTick = -1;
  let clockMs = 0;
  const step = (n: number, withOrders: boolean): void => {
    for (let i = 0; i < n; i++) {
      const m = new Map();
      if (withOrders && i === 0) {
        m.set(ids.asSeatId(0), { order: { kind: "move", point: { x: -38, z: -6 } }, commands: [] });
        m.set(ids.asSeatId(1), { order: { kind: "move", point: { x: -48, z: -6 } }, commands: [] });
      }
      world.step(m as never);
      clockMs += 1000 / 30;
      for (const ev of world.events) {
        const d = ev.data as { text?: string; caster?: number };
        if (ev.type === "floatingText" && d.text === "脫困" && d.caster !== undefined) {
          escaped.add(d.caster);
          if (escapeTick < 0) escapeTick = world.tick;
        }
        vfx.handleEvent(ev as never, clockMs);
      }
      vfx.update(clockMs);
    }
    place();
  };

  const posOf = (id: number): number => world.transform.get(id as never)!.pos.x;
  const startAx = posOf(a);
  const startBx = posOf(b);
  const facts: Record<string, unknown> = { startAx, startBx };

  await st.ready();
  await st.capture("s0_baseline_tick0", "基線：兩位隊友面對面，各自的終點在對方的另一邊");
  step(60, true);
  facts["stuckAx"] = posOf(a);
  facts["stuckBx"] = posOf(b);
  await st.capture(
    "s1_stuck_2s_tick60",
    `互卡 2 秒（門檻）：A x=${posOf(a).toFixed(2)}、B x=${posOf(b).toFixed(2)} —— 幾乎沒動，保險絲還沒跳`,
  );
  step(12, false);
  facts["escapeTick"] = escapeTick;
  facts["escapedCount"] = escaped.size;
  const liveText = (vfx as unknown as { floatingTextEntries: readonly { active: boolean }[] })
    .floatingTextEntries.filter((e) => e.active).length;
  facts["floatingTextPoolActive"] = liveText;
  await st.capture(
    "s2_fuse_fires",
    `保險絲跳（tick ${escapeTick}）：sim 真的發了 ${escaped.size} 則「脫困」floatingText，` +
      `出貨 VfxSystem 的池裡有 ${liveText} 個活著的字`,
  );
  // ⚠️ 30 tick 剛好等於他們走完全程 ⇒ 這一張會與 s4 **逐位元相同**（實測過）。
  //    要看到「正在穿過去」就得在半路上取樣。
  step(12, false);
  await st.capture(
    "s3_phasing_mid",
    `放行窗內、走到一半：軟分離對這一對停手 ⇒ 兩具身體**正在互相穿過**（A x=${posOf(a).toFixed(2)}、B x=${posOf(b).toFixed(2)}）`,
  );
  step(78, false);
  facts["endAx"] = posOf(a);
  facts["endBx"] = posOf(b);
  await st.capture(
    "s4_passed_through",
    `穿過去了：A x=${posOf(a).toFixed(2)}（出發時 B 在 ${startBx}）、` +
      `B x=${posOf(b).toFixed(2)}（出發時 A 在 ${startAx}）—— 兩人都走到對方的另一邊`,
  );
  return facts;
}

// ───────────────────── ④ 火圈：最後一個人類死 → 立即縮圈 ─────────────────────

/**
 * GH#659。⚠️ **誠實的分界**：`accelFireRingForBotOnly()`（誰算人類、哪個 zone 還在打）
 * 住 game-server 的 `MatchController`，⛔ 不在客戶端 bundle 裡 —— 這一頁量的是
 * 它**唯一那一行行為**（`ring.startTicks = world.fireRingTicks + round(sec×30)`，
 * sec 讀出貨 `config.arena-rules@1.botOnlyRingAccelSec`）之後，玩家**看到**什麼。
 * 縮圈曲線與畫面全部是出貨的（`fireRingSystem` 跑在 `world.step()` 裡）。
 */
async function runFireRing(st: Stage): Promise<Record<string, unknown>> {
  await loadWorkingTreeContent();
  const [{ SimWorld }, { SKELETON_ARENA }, fr, { Configs, VfxDefs }, { FireRingFx }] = await Promise.all([
    import("@ggd/shared/sim/SimWorld"),
    import("@ggd/shared/sim/world/ArenaDef"),
    import("@ggd/shared/sim/fireRing"),
    import("@ggd/shared/content/registries"),
    import("../render/vfx/FireRingFx"),
  ]);

  const matchDoc = Configs.tryGet("config.match") as unknown as
    | { match?: { fireRing?: Record<string, unknown>; combatMaxSec?: number } }
    | undefined;
  const ringCfg = matchDoc?.match?.fireRing;
  if (ringCfg === undefined) throw new Error("出貨 config.match 沒有 fireRing 區塊 —— 前提不成立");
  const arenaDoc = Configs.tryGet("arena-rules") as unknown as
    | { botOnlyRingAccelSec?: number; botOnlyRingAccelEnabled?: boolean }
    | undefined;
  const accelSec = arenaDoc?.botOnlyRingAccelSec ?? 0;

  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatActive = true;
  const rules = fr.fireRingRulesFromConfig(
    ringCfg as never,
    world.dt,
    matchDoc?.match?.combatMaxSec ?? 180,
  );
  fr.beginCombatFireRing(world, rules);

  const zone = SKELETON_ARENA.zones[0]!;
  makeGround(st.scene, zone.center.x, zone.center.z, zone.boundaryRadius * 2.3);
  // 俯視：半徑逐幀變小要在畫面上看得出來。
  st.camera.position.set(zone.center.x, zone.boundaryRadius * 1.55, zone.center.z - 6);
  st.camera.setTarget(new Vector3(zone.center.x, 0, zone.center.z));

  const ring = new FireRingFx(st.scene, {
    getScale: () => 1,
    vfxDocFor: (id: string) => VfxDefs.tryGet(id) ?? null,
  });

  let clockMs = 0;
  const frameOf = () => ({
    phase: "combat",
    fireRingTicks: world.fireRingTicks,
    fireRingRadius: fr.currentFireRingRadius(world, 0),
    zone: { x: zone.center.x, z: zone.center.z, r: zone.boundaryRadius },
  });
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      world.step(new Map());
      clockMs += 1000 / 30;
      ring.tick(clockMs, 1000 / 30, frameOf());
    }
  };

  const facts: Record<string, unknown> = {
    accelSec,
    accelEnabled: arenaDoc?.botOnlyRingAccelEnabled,
    shippedStartTicks: rules.startTicks,
    zoneRadius: zone.boundaryRadius,
  };

  await st.ready();
  step(90); // 開打 3 秒：出貨點火時間是 60 秒 ⇒ 火圈還在睡
  await st.waitFrames(3);
  facts["dormantRadius"] = fr.currentFireRingRadius(world, 0);
  await st.capture(
    "r0_humans_alive_dormant",
    `人類還在打：出貨點火 startTicks=${rules.startTicks}（60 秒），半徑仍是場界 ${zone.boundaryRadius} ⇒ FireRingFx 刻意不畫`,
  );

  // ⭐ 這一行＝ MatchController.accelFireRingForBotOnly 的**全部行為**
  //   （出貨值 botOnlyRingAccelSec=0 ⇒ 夾到「現在」＝立即點火）。
  const cap = world.fireRingTicks + Math.round(accelSec * 30);
  facts["clampedStartTicks"] = cap;
  rules.startTicks = Math.min(rules.startTicks, cap);
  await st.capture(
    "r1_last_human_dies",
    `最後一個人類死亡那一 tick：startTicks 被夾到 ${cap}（現在＋${accelSec} 秒）`,
  );

  step(30);
  await st.waitFrames(3);
  facts["radiusAt1s"] = fr.currentFireRingRadius(world, 0);
  await st.capture(
    "r2_shrink_1s",
    `+1 秒：半徑 ${fr.currentFireRingRadius(world, 0).toFixed(2)} < 場界 ⇒ 火圈帶亮起來（emitter ${ring.emitterCount} 具）`,
  );
  step(60);
  await st.waitFrames(3);
  facts["radiusAt3s"] = fr.currentFireRingRadius(world, 0);
  await st.capture("r3_shrink_3s", `+3 秒：半徑 ${fr.currentFireRingRadius(world, 0).toFixed(2)}`);
  step(150);
  await st.waitFrames(3);
  facts["radiusAt8s"] = fr.currentFireRingRadius(world, 0);
  await st.capture("r4_shrink_8s", `+8 秒：半徑 ${fr.currentFireRingRadius(world, 0).toFixed(2)} —— 逐幀變小`);
  step(240);
  await st.waitFrames(3);
  facts["radiusAt16s"] = fr.currentFireRingRadius(world, 0);
  await st.capture("r5_shrink_16s", `+16 秒：半徑 ${fr.currentFireRingRadius(world, 0).toFixed(2)}，接近第一段的 4.0 口袋`);
  return facts;
}

// ───────────────── ⑤ 四支經典（GH#695）：施放 → 演出 → 到期 ─────────────────

/**
 * 一支經典的**參數列**，⛔ 不是四份各自會腐爛的程式（第零守則⑨：N 個同型 = K 個
 * 模板 + 一張表）。四支的差別只有：放哪一支、敵人站哪、每一拍走幾個 tick，
 * 以及 20-002 那一格「先造出反彈情境」的動作。
 *
 * ⭐ 世界那一半**直接用出貨 audition 的 `buildBeamAuditionWorld`**（真的 `SimWorld`
 * ＋ 真的 `castAbility()` ＋ 目標型別由**文件自己的 `castType`** 推導），
 * ⛔ 這一頁不自己組一份第二個世界建構器。
 */
interface ClassicBeat {
  label: string;
  /** 這一拍**之前**要走的 sim tick 數（0 = 就地拍一張）。 */
  ticks: number;
  note: string;
  /** ⭐ 這一拍要先做的動作：施放，或（20-002）造出一次真的反彈。 */
  act?: "cast" | "reflectProbe";
}

interface ClassicSpec {
  abilityId: string;
  /**
   * ⚠️ 20-002 理想鄉MAX 的實作住 `passive.hooks onReflectSuccess` ⇒ 施放它**什麼
   * 都不會發生**。要看得到它，得先解鎖 EX、放 20-04（反彈 buff），再讓敵人打一發
   * **魔法**傷害 —— 反彈封包落地才是它的觸發器。
   */
  exAbilityId?: string;
  enemies: readonly { x: number; z: number }[];
  /** 相機：站位往前 `lookAhead`、拉高 `height`、退後 `back`。 */
  cam: { lookAhead: number; height: number; back: number };
  beats: readonly ClassicBeat[];
}

async function runClassic(st: Stage, spec: ClassicSpec): Promise<Record<string, unknown>> {
  const [
    { buildBeamAuditionWorld },
    { VfxSystem },
    { Models, VfxDefs },
    { AssetManager },
    { modelFxDocFor },
    { syncAbilityPassives },
  ] = await Promise.all([
    import("./beamAuditionWorld"),
    import("./VfxSystem"),
    import("@ggd/shared/content/registries"),
    import("../render/AssetManager"),
    import("../render/modelFxRig"),
    import("@ggd/shared/sim/abilities/abilityPassives"),
  ]);

  const { world, castOnce, casterId, enemyIds, casterPos } = await buildBeamAuditionWorld(
    spec.enemies,
    spec.abilityId as never,
  );

  const facts: Record<string, unknown> = { abilityId: spec.abilityId };
  if (spec.exAbilityId !== undefined) {
    // ⭐ 解鎖 EX 走**出貨的資料形狀**（`exSlot` rank 1 ＋ 出貨的 `syncAbilityPassives`），
    //    ⛔ 不是自己把 hook 塞進 `stats.sources` —— 那會變成一條虛構通道（失敗形態⑤）。
    const ab = world.abilities.get(casterId) as unknown as {
      exSlot: { abilityId: string; rank: number; cooldownRemainingTicks: number } | null;
    };
    ab.exSlot = { abilityId: spec.exAbilityId, rank: 1, cooldownRemainingTicks: 0 };
    syncAbilityPassives(world, casterId);
    const sc = world.stats.get(casterId) as unknown as { sources: { id?: string }[] };
    facts["exPassiveSources"] = sc.sources.map((s) => s.id).filter((s) => s !== undefined);
  }

  makeGround(st.scene, casterPos.x + spec.cam.lookAhead, casterPos.z, 46);
  const bodies = new Map<number, TransformNode>();
  bodies.set(
    casterId as unknown as number,
    makeBody(st.scene, "classic-caster", new Color3(0.36, 0.31, 0.17)),
  );
  enemyIds.forEach((id, i) =>
    bodies.set(id as unknown as number, makeBody(st.scene, `classic-foe-${i}`, new Color3(0.22, 0.24, 0.3))),
  );
  /** 替身座標**逐拍從 sim 讀**（⛔ 不是台子自己編的動畫）。 */
  const place = (): void => {
    for (const [id, node] of bodies) {
      const t = world.transform.get(id as never);
      if (t) node.position.set(t.pos.x, 0.925, t.pos.z);
    }
  };
  place();
  st.camera.position.set(casterPos.x + spec.cam.lookAhead, spec.cam.height, casterPos.z - spec.cam.back);
  st.camera.setTarget(new Vector3(casterPos.x + spec.cam.lookAhead, 1.2, casterPos.z));

  const assets = new AssetManager(st.scene);
  const vfx = new VfxSystem(st.scene, {
    entityPos: (id: number) => {
      const t = world.transform.get(id as never);
      return t ? { x: t.pos.x, z: t.pos.z } : null;
    },
    vfxDoc: (key: string) => VfxDefs.tryGet(key) ?? null,
    // ⭐ 出貨的兩個接縫（GameApp 同一份）—— ⛔ 不手挑欄位組 model doc（#607）。
    modelDocFor: (k: string) => modelFxDocFor(Models.tryGet(k) ?? null),
    loadModelContainer: (p: string) => assets.load(p),
  } as never);

  let clockMs = 0;
  const eventHist: Record<string, number> = {};
  /**
   * 走 n 個 sim tick，把**整份**事件餵進出貨的 `handleEvent`，每個 tick 畫 2 幀
   * （一個 tick = 33ms、一幀固定 16ms ⇒ 粒子時間跟 sim 時間對得上）。
   */
  const advance = async (ticks: number): Promise<void> => {
    for (let i = 0; i < ticks; i++) {
      world.step(new Map());
      clockMs += 1000 / 30;
      for (const ev of world.events) {
        eventHist[ev.type] = (eventHist[ev.type] ?? 0) + 1;
        vfx.handleEvent(ev as never, clockMs);
      }
      vfx.update(clockMs);
      place();
      await st.waitFrames(2); // ⭐ 每一 tick 都讓出事件迴圈 ⇒ glb 與貼圖才載得完
    }
  };

  /** ⚠️ 「畫面上有東西」要能歸因：這一拍場上有哪些粒子池與哪些模型節點。 */
  const stageCensus = (): Record<string, unknown> => ({
    tick: world.tick,
    particleSystems: st.scene.particleSystems.length,
    modelFxNodes: st.scene.transformNodes
      .filter((n) => n.name.startsWith("modelfx-"))
      .map((n) => {
        let vertices = 0;
        for (const m of n.getChildMeshes(false)) vertices += m.getTotalVertices();
        return { name: n.name, enabled: n.isEnabled(), vertices };
      }),
  });

  await st.ready();
  for (const beat of spec.beats) {
    if (beat.act === "cast") {
      castOnce();
      facts["castTick"] = world.tick;
    } else if (beat.act === "reflectProbe") {
      // ⭐ 造出一次**真的**反彈：敵人打一發魔法傷害 → 20-04 的 `onDamageTaken` hook
      //    排出 `incomingPct` 反彈封包 → 它落地 ⇒ `reflectHookSystem`（出貨 `step()`
      //    的 8b）發 `onReflectSuccess` ⇒ 20-002 的 hooks 才跑得起來。
      //    ⛔ 不直接呼叫 `fireHooks` —— 那會跳過四道閘，量到的就不是玩家會遇到的。
      const attacker = enemyIds[0]!;
      const before = world.health.get(attacker)!.hp;
      (world.damageQueue as unknown as Record<string, unknown>[]).push({
        source: attacker,
        target: casterId,
        amount: 200,
        type: "magic",
        crit: false,
        origin: "ability:audition-probe",
      });
      await advance(beat.ticks);
      facts["reflectDamageDealtToAttacker"] = before - world.health.get(attacker)!.hp;
      facts[`${beat.label}_census`] = stageCensus();
      await st.capture(beat.label, beat.note);
      continue;
    }
    await advance(beat.ticks);
    facts[`${beat.label}_census`] = stageCensus();
    await st.capture(beat.label, beat.note);
  }
  facts["eventHist"] = { ...eventHist };
  return facts;
}

/** 四支的**參數表**（⛔ 不是四份程式）。 */
const CLASSICS: Record<string, ClassicSpec> = {
  // 01-04 超究武神霸斬 —— targeted、castTime 1.833s（≈55 tick）、連斬七次 3.5 秒。
  omnislash: {
    abilityId: "godie-hart.r",
    enemies: [{ x: 3, z: 0 }, { x: 6, z: 1.5 }],
    cam: { lookAhead: 3, height: 7, back: 12 },
    beats: [
      { label: "o0_baseline", ticks: 2, note: "基線：克勞德與兩名敵人站定，還沒施放" },
      { label: "o1_windup", ticks: 40, note: "施放（出貨 castAbility，targeted）—— 1.833 秒詠唱走到一半", act: "cast" },
      { label: "o2_resolve", ticks: 22, note: "詠唱解算：無敵 3.5 秒＋鎖定敵人，spawnModelFx（imported.herocloudstrife）朝目標飛" },
      { label: "o3_combo_mid", ticks: 25, note: "連斬進行中：comboStrikes（family superff7）逐段落雷擊特效" },
      { label: "o4_combo_late", ticks: 35, note: "連斬後段：收尾前一拍" },
      { label: "o5_expired", ticks: 90, note: "到期：3.5 秒鎖定與無敵結束，畫面回到只有替身" },
    ],
  },
  // 20-002 理想鄉MAX —— ⚠️ 實作住 EX 的 `onReflectSuccess`：先放 20-04 再挨一發魔法傷害。
  avalon: {
    abilityId: "godie-e002.r",
    exAbilityId: "godie-e002.ex",
    enemies: [{ x: 5, z: 0 }],
    cam: { lookAhead: 2.5, height: 6.5, back: 11 },
    beats: [
      { label: "a0_baseline", ticks: 2, note: "基線：Saber 與一名敵人站定；EX 已解鎖（exSlot rank 1）但尚未觸發" },
      { label: "a1_avalon_up", ticks: 24, note: "放 20-04 永恆的理想鄉（castType self）：2 秒反彈 buff ＋ tpl-locust-strike 紅柱", act: "cast" },
      { label: "a2_reflect_hit", ticks: 3, note: "敵人打一發魔法傷害 ⇒ 反彈成功 ⇒ EX 的 onReflectSuccess 發動：七彩爆炸長在**被反彈者**身上", act: "reflectProbe" },
      { label: "a3_seven_hits", ticks: 14, note: "連續七斬進行中（delayed count 7 × 0.12 秒，每一段 fx.avalon.reflect-spark）" },
      { label: "a4_finisher", ticks: 22, note: "收尾：約束與勝利之劍 damageLine（前方直線）＋ 第二發七彩爆炸" },
      { label: "a5_expired", ticks: 70, note: "到期：反彈 buff 與所有爆炸走完" },
    ],
  },
  // 04-03 龍破斬 —— ground、castTime 1.233s（≈37 tick）、tpl-line-blast 直線飛行 ＋ 四段 delayed。
  dragonslave: {
    abilityId: "godie-h020.e",
    enemies: [{ x: 6, z: 0 }, { x: 9, z: 1.5 }],
    cam: { lookAhead: 4, height: 7.5, back: 13 },
    beats: [
      { label: "g0_baseline", ticks: 2, note: "基線：莉娜與兩名敵人站定" },
      { label: "g1_windup", ticks: 30, note: "施放（castType ground，落點在前方）—— 1.233 秒詠唱中", act: "cast" },
      { label: "g2_resolve", ticks: 12, note: "詠唱解算：tpl-line-blast 的火球出膛（preset 在載入時補齊 modelKey/speed/distance）" },
      { label: "g3_travel", ticks: 14, note: "飛行中：沿施放方向前進，途中 touch 判定" },
      { label: "g4_blast", ticks: 22, note: "落點爆炸：fx.prim.fire.explosion-lg ＋ damageArea 8 半徑 ＋ 四段 delayed 的後續" },
      { label: "g5_expired", ticks: 80, note: "到期：爆炸與延遲段全部走完" },
    ],
  },
  // 42-04 世界終結 —— skillshot、投射物 ＋ tpl-radial-burst 十二向 ＋ 三段 delayed。
  endworld: {
    abilityId: "godie-n003.r",
    enemies: [{ x: 5, z: 0 }, { x: 8, z: 2 }],
    cam: { lookAhead: 3.5, height: 8, back: 12 },
    beats: [
      { label: "e0_baseline", ticks: 2, note: "基線：兩名敵人站在施放方向上" },
      { label: "e1_windup", ticks: 30, note: "施放（castType skillshot，方向 +x）—— 1.233 秒詠唱中", act: "cast" },
      { label: "e2_resolve", ticks: 12, note: "詠唱解算：spawnProjectile（imported.wave）＋ tpl-radial-burst 十二向散開" },
      { label: "e3_burst", ticks: 14, note: "放射中：12 具沿 radial 路徑外擴，onTouch 減速" },
      { label: "e4_late", ticks: 25, note: "後段：三段 delayed 的後續傷害與 fx.prim.ice.nova" },
      { label: "e5_expired", ticks: 80, note: "到期：投射物與放射全部走完" },
    ],
  },
};

// ───────────────────────────── 入口 ─────────────────────────────

const SCENARIOS: Record<string, (st: Stage) => Promise<Record<string, unknown>>> = {
  weather: runWeather,
  dagger: runDagger,
  stuckescape: runStuckEscape,
  firering: runFireRing,
  ...Object.fromEntries(
    Object.entries(CLASSICS).map(([k, spec]) => [k, (st: Stage) => runClassic(st, spec)]),
  ),
};

/**
 * 跑一整批並把每一張 PNG POST 給 `shot-sink`。
 * @param sinkUrl 例：`http://127.0.0.1:39674/shot/weather_rain_visual-proof_20260825`
 */
export async function runFeatureProof(
  canvas: HTMLCanvasElement,
  scenario: string,
  sinkUrl: string,
): Promise<ProofRun> {
  const fn = SCENARIOS[scenario];
  if (fn === undefined) throw new Error(`未知的 scenario「${scenario}」`);
  const frames: ProofFrame[] = [];
  const st = makeStage(canvas, sinkUrl.replace(/\/$/, ""), frames);
  try {
    // ⭐ 量尺先自證。它擲例外 ⇒ 這一批的結論作廢，⛔ 不要交。
    const calib = await st.calibrate();
    const facts = await fn(st);
    const { w, h } = st.size();
    return { scenario, calibrate: calib, width: w, height: h, frames, facts };
  } finally {
    // ⚠️ 四批共用同一塊 canvas（同一次頁面載入 ⇒ 同一次內容載入），
    // 所以上一批的 Engine 一定要收掉，⛔ 不然下一批建不起來。
    st.dispose();
  }
}
