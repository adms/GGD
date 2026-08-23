/**
 * 🖥️🖥️ GH#612 —— **分割畫面丟掉三個玩家的畫面回饋**。
 *
 * 舊行為錯了**兩個方向**，而兩個方向是同一個根因（沙發模式的「本機觀眾」是一個
 * **集合**，⛔ 不是一個 id）：
 *
 * | 方向 | 舊行為 | 玩家看到 |
 * |---|---|---|
 * | 該收的收不到 | `screenCueIsForViewer` 只拿 `hudStore.localEntityId`（第一格的主角） | ⭐ 沙發玩家 2/3/4 是主角時**整發丟掉** |
 * | 不該收的收到了 | 閃爍是一層 `position:fixed;inset:0`、震動只進 `viewports.primary` | ⭐ 指名 player 0 的那一發**蓋住全部四格** |
 *
 * ⚠️ 這裡建的是**四個真的 `ScreenFxLayer`**（出貨的那一個類別，⛔ 不是手搭的假
 * sink —— 第二守則失敗形態⑤），並且跑**出貨的**派送函式 `dispatchScreenCue`。
 * ⛔ 迴圈不在測試裡：迴圈住 `screenFx.ts`，正是為了讓它跑得到（`GameApp` 建構
 * 不出來 —— `new Engine(canvas)` 要真的 WebGL）。
 *
 * ⛔ 一個數字都沒有進斷言（第二守則：驗機制不驗數字）——「有沒有反應」是機制，
 * 「閃多亮」是 owner 的旋鈕。
 *
 * ── 突變紀錄（一批一條，最承重的那一行）─────────────────────────────────────
 *  · `screenCueViewportMask` 的 `viewers.map(...)` 換回「只看 primary」
 *    （`viewers.map((_, i) => i === 0 && (cue.broadcast || subjects.includes(viewers[0])))`）
 *    → 紅：「指名 player 2 的那一發只有第 3 格該有反應」與「player 0 的那一發
 *    ⛔ 不會蓋到 1/2/3」兩條同時紅。
 */
import { describe, it, expect, afterEach } from "vitest";
import { ScreenFxLayer } from "../vfx/ScreenFxLayer";
import {
  DEFAULT_SCREEN_FX_LIMITS,
  dispatchScreenCue,
  installSplitScreenCueRouter,
  screenCueIsForViewer,
} from "./screenFx";

/** 四格沙發：每一格的主角 entity id。 */
const VIEWERS = [10, 11, 12, 13];

/** sim 真的送的那個形狀（`sim/effects/clientCues.ts` 的 ScreenFlash/ShakeEvent）。 */
function cue(subjects: number[], broadcast = false): Record<string, unknown> & {
  broadcast: boolean;
  subjects: readonly number[];
} {
  return {
    broadcast,
    subjects,
    colorRgb: [255, 232, 160],
    peakAlpha: DEFAULT_SCREEN_FX_LIMITS.flashMaxAlpha,
    durationSec: DEFAULT_SCREEN_FX_LIMITS.flashMaxSec,
    amplitude: DEFAULT_SCREEN_FX_LIMITS.shakeMaxAmplitude,
    caster: 10,
    zone: 0,
  };
}

/** 四個**真的**圖層 + 四台各自的相機（`addShake` 是出貨接 `CameraRig` 的那個縫）。 */
function fourViewports(): { layers: ScreenFxLayer[]; shakes: number[] } {
  const shakes = [0, 0, 0, 0];
  const layers = shakes.map(
    (_, p) =>
      new ScreenFxLayer({
        host: null,
        limits: DEFAULT_SCREEN_FX_LIMITS,
        reducedMotion: false,
        addShake: () => {
          shakes[p]!++;
        },
      }),
  );
  return { layers, shakes };
}

let live: ScreenFxLayer[] = [];
afterEach(() => {
  for (const l of live) l.dispose();
  live = [];
  installSplitScreenCueRouter(false);
});

describe("分割畫面：每一格自己解算一次 (GH#612)", () => {
  it("★ 指名沙發玩家 2 的那一發 ⇒ 只有第 3 格閃、只有第 3 台相機抖", () => {
    const { layers, shakes } = fourViewports();
    live = layers;
    dispatchScreenCue("screenFlash", cue([VIEWERS[2]!]), VIEWERS, layers);
    dispatchScreenCue("screenShake", cue([VIEWERS[2]!]), VIEWERS, layers);
    expect(
      layers.map((l) => l.liveFlashes > 0),
      "⛔ 舊行為:觀眾判定只認得 player 0 ⇒ 這一發整個被丟掉",
    ).toEqual([false, false, true, false]);
    expect(shakes, "⛔ 舊行為:震動只進 viewports.primary").toEqual([0, 0, 1, 0]);
  });

  it("★ 指名 player 0 的那一發 ⛔ 不會蓋到 1/2/3", () => {
    const { layers, shakes } = fourViewports();
    live = layers;
    dispatchScreenCue("screenFlash", cue([VIEWERS[0]!]), VIEWERS, layers);
    dispatchScreenCue("screenShake", cue([VIEWERS[0]!]), VIEWERS, layers);
    expect(
      layers.map((l) => l.liveFlashes > 0),
      "⛔ 舊行為:全螢幕 overlay 蓋住四格 —— 另外三個人被閃了一下卻什麼事都沒發生",
    ).toEqual([true, false, false, false]);
    expect(shakes).toEqual([1, 0, 0, 0]);
  });

  it("全場的那一發（broadcast）每一格都要有 —— 包含還沒有主角的那一格", () => {
    const { layers } = fourViewports();
    live = layers;
    dispatchScreenCue("screenFlash", cue([], true), [VIEWERS[0]!, null, VIEWERS[2]!, null], layers);
    expect(layers.map((l) => l.liveFlashes > 0)).toEqual([true, true, true, true]);
  });

  it("逐格路由裝上之後，全螢幕那一層就沒有觀眾（⛔ 否則同一發會出現兩次）", () => {
    const c = cue([], true);
    expect(screenCueIsForViewer(c, VIEWERS[0]!), "沒裝路由 = 舊行為,全場那一發照樣過").toBe(true);
    installSplitScreenCueRouter(true);
    expect(screenCueIsForViewer(c, VIEWERS[0]!)).toBe(false);
  });
});
