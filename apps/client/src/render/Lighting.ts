/**
 * Lighting — one hemispheric fill + one angled directional key light.
 *
 * ── ⭐ GH#362：光不再是寫死的常數，而且**它會動** ──────────────────────────
 * owner 2026-08-18：「**包含打光也應該有變化區別，不是靜態不會變動的光**」。
 *
 * 在這一版之前這個檔是六個常數，13 張場地共用同一顆不會動的太陽 —— 也就是
 * owner 抱怨的那個東西。現在它有兩個入口：
 *
 *   · `applyScenery(scenery)` —— 換場地時呼叫一次。顏色／角度／強度／波形
 *     全部來自 `arena@1` 的 `scenery.lighting`（內容，⛔ 不是程式）。
 *   · `animate(tSec)`         —— 每幀呼叫。把 `sceneryLightAt()` 這一刻算出來的
 *     強度／顏色／方向寫進兩盞燈。
 *
 * ⚠️ **波形是 shared 的純函式**（`content/schema/arenaScenery.ts`），這個檔只負責
 * 把結果寫進 Babylon。所以「光有沒有在動」可以逐點斷言，⛔ 不必開場景跑幀。
 *
 * ⚠️ `setShadowsEnabled` 的語意**一個位元組都沒變**：場景還是沒有 shadow-map
 * pass，這個開關仍然只是把主光調暗、補光補回來一點。它現在是**乘在**場景亮度
 * 上的倍率而不是絕對值，所以預設場地的數字仍然逐字是 0.9 / 0.25 與 0.75 / 0.95。
 */
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import {
  DEFAULT_SCENERY_LIGHTING,
  DEFAULT_SCENERY_PALETTE,
  hexToRgb01,
  sceneryLightAt,
  sceneryWave,
  type ArenaScenery,
  type SceneryLighting,
  type SceneryPalette,
  type WeatherLook,
} from "@ggd/shared/content";
import { airScatterFog } from "./airScatter";
import { qualityController } from "./QualityController";
// ⭐ GH#610 第二批 —— 雷擊補光與場地霧濃度。⚠️ 這個檔拿不到 `arena.id`
// （`applyScenery` 的呼叫端在 `GameApp.ts`），所以天氣是**訂閱**來的，
// ⛔ 不是參數。完整理由在 `render/weather.ts` 的檔頭。
import {
  currentWeather,
  lightningEnabled,
  lightningStrike,
  subscribeWeather,
  weatherPolicy,
} from "./weather";

/** 關掉「陰影」時主光剩多少（0.25 / 0.9 —— 出貨值的比例，逐字保留）。 */
const SHADOWS_OFF_KEY_MUL = 0.25 / 0.9;
/** 關掉「陰影」時補光補多少回來（0.95 / 0.75 —— 同上）。 */
const SHADOWS_OFF_FILL_MUL = 0.95 / 0.75;

export interface LightingHandle {
  setShadowsEnabled(on: boolean): void;
  /**
   * 換場地時套用這張圖的燈與配色。`undefined` = 退回出貨前那一組
   * （`DEFAULT_SCENERY_*`），所以沒宣告 `scenery` 的場地逐像素不變。
   * `animate` 為 false 時（後台政策）光停在波形的 t=0，顏色與角度照樣是這張圖的。
   */
  applyScenery(scenery: ArenaScenery | undefined, animate: boolean): void;
  /** 每幀。`tSec` 是連續的秒數（⛔ 不是 delta）—— 波形是絕對時間的純函式。 */
  animate(tSec: number): void;
}

export function setupLighting(scene: Scene): LightingHandle {
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);

  let lighting: SceneryLighting = DEFAULT_SCENERY_LIGHTING;
  let palette: SceneryPalette = DEFAULT_SCENERY_PALETTE;
  let animated = true;
  let shadows = true;
  /** 最後一次寫進去的時間點。⚠️ 換場地／切陰影時要用**同一個** t 重寫，
   *  否則光會跳回 0 那一幀（雷雨場地會突然閃一下白）。 */
  let lastT = 0;

  /**
   * ⭐ GH#610 空氣漫反射開不開。⚠️ 讀的是**解析過後**的那一格
   * （設定 × 畫質預設 × 適應梯子，判準全在 `render/airScatter.ts`），
   * ⛔ 不是玩家設定裡的三態原值。
   */
  let scatter = qualityController.getParams().airScatter;

  /** ⭐ GH#610 第二批 —— 這一場的天氣（訂閱來的；⛔ 這個檔拿不到 arena.id）。 */
  let weather: WeatherLook = currentWeather();

  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

  /** 把「這一刻的光」寫進兩盞燈。⚠️ 唯一寫燈的地方 —— 兩處寫會互相蓋掉。 */
  const write = (tSec: number): void => {
    const t = animated ? tSec : 0;
    const s = sceneryLightAt(lighting, t);
    // ⭐ 雷擊補光。⛔ 「這張圖有沒有雷」**不是**天氣文件的欄位 —— 它是場地自己
    // 宣告的 `scenery.lighting.wave === "storm"`（GH#362 就有了）。在天氣文件裡
    // 再開一格就是第二個住處，而它們一定會互相打架（「天氣說沒雷、燈在閃」）。
    // ⚠️ 只取波的正半邊：storm 波長時間貼在 −1（陰暗），負的那一半是「比平常更暗」，
    //    ⛔ 不是「往下閃」。
    const strike =
      lighting.wave === "storm" && lightningEnabled()
        ? lightningStrike(sceneryWave("storm", t, lighting.periodSec))
        : 0;
    const p = weatherPolicy();
    const keyFlash = 1 + (p.lightningKeyBoost - 1) * strike;
    // ⚠️ 補光跟得比主光少 —— 兩盞同幅度一起爆＝整個畫面在調亮度，那看起來像
    //    螢幕壞了，⛔ 不像「有一道光打進來」（同 `sceneryLightAt` 的 ×0.5）。
    const fillFlash = 1 + (p.lightningFillBoost - 1) * strike;
    sun.intensity = s.keyIntensity * (shadows ? 1 : SHADOWS_OFF_KEY_MUL) * keyFlash;
    sun.diffuse = new Color3(s.key.r, s.key.g, s.key.b);
    sun.direction.set(s.dir.x, s.dir.y, s.dir.z);
    hemi.intensity = s.fillIntensity * (shadows ? 1 : SHADOWS_OFF_FILL_MUL) * fillFlash;
    // ⭐ 空氣跟燈**同一個寫入點**：它的顏色就是這一刻的天光＋主光，所以分開寫
    // 一定會漂（雷雨閃一下，而空氣還是上一秒的顏色）。⚠️ `.set()` ⛔ 不是
    // `new Color3` —— 這一行每幀都會跑。
    //
    // ⭐ GH#610 第二批 —— **起霧是同一顆旋鈕轉大，⛔ 不是第二套 fog**：
    // 濃度 = 空氣漫反射的基礎值（玩家那一格）＋ 這張圖的天氣加成（內容那一格）。
    // ⇒ 兩格各自關得掉，而 `scene.fog` 只有一顆。
    const fog = airScatterFog(palette, s);
    const density = (scatter ? fog.density : 0) + weather.fogDensity;
    if (density > 0) {
      // 空氣被閃電照亮的那一半 —— 光在霧裡才看得見，少了它閃電會像一個沒有體積的濾鏡。
      const fogFlash = 1 + (p.lightningFogBoost - 1) * strike;
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogDensity = density;
      scene.fogColor.set(
        clamp01(fog.r * fogFlash),
        clamp01(fog.g * fogFlash),
        clamp01(fog.b * fogFlash),
      );
    } else {
      scene.fogMode = Scene.FOGMODE_NONE;
    }
  };

  const applyPalette = (): void => {
    const sky = hexToRgb01(palette.sky);
    const ground = hexToRgb01(palette.ground);
    const voidC = hexToRgb01(palette.void);
    hemi.diffuse = new Color3(sky.r, sky.g, sky.b);
    hemi.groundColor = new Color3(ground.r, ground.g, ground.b);
    // 圓盤外的底色。⚠️ 這是 `Renderer` 建構時設過一次的那一格 —— 改場地時
    // **必須**重寫，否則第一張圖的虛空色會跟著你走完整場比賽。
    scene.clearColor = new Color4(voidC.r, voidC.g, voidC.b, 1);
  };

  applyPalette();
  write(0);

  // 玩家在設定頁改「空氣漫反射」、或適應梯子降階 ⇒ 這一場立刻生效（同 shadows
  // 的待遇，⛔ 不用重開一場）。⚠️ `LightingHandle` 沒有 dispose 入口（拿著它的
  // 是 GameApp 的建構子），所以訂閱掛在 **scene 自己的生命週期**上 ——
  // ⛔ 少了下面那一行，每一場比賽都會多留一個指著已經 dispose 的 scene 的
  // listener，而它每次設定變動都會往一個死掉的場景寫霧。
  const offParams = qualityController.subscribe((p) => {
    if (p.airScatter === scatter) return;
    scatter = p.airScatter;
    write(lastT);
  });
  scene.onDisposeObservable.addOnce(() => offParams());

  // ⭐ GH#610 第二批 —— 換場地（`ArenaScene` 推 arena.id 進 store）或玩家改四格
  // 天氣開關時，這一場立刻生效。⚠️ 訂閱同樣掛在 **scene 的生命週期**上 ——
  // ⛔ 少了下面那一行，每一場比賽都會多留一個往死掉的場景寫霧的 listener。
  const offWeather = subscribeWeather((w) => {
    weather = w;
    write(lastT);
  });
  scene.onDisposeObservable.addOnce(() => offWeather());

  return {
    setShadowsEnabled(on: boolean): void {
      shadows = on;
      write(lastT);
    },
    applyScenery(scenery: ArenaScenery | undefined, animate: boolean): void {
      lighting = scenery?.lighting ?? DEFAULT_SCENERY_LIGHTING;
      palette = scenery?.palette ?? DEFAULT_SCENERY_PALETTE;
      animated = animate;
      applyPalette();
      write(lastT);
    },
    animate(tSec: number): void {
      lastT = tSec;
      // `none` 波形每幀寫同一組值 —— 便宜，但沒有意義，所以直接跳過。
      // ⚠️ 判準要看**兩個**欄位：`wave` 是 none 時亮度與角度都不動；
      //    政策關掉動畫時也一樣。⛔ 只看其中一個會讓另一半靜靜地繼續跑。
      if (!animated || lighting.wave === "none") return;
      write(tSec);
    },
  };
}
