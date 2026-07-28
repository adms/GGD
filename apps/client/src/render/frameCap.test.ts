/**
 * FPS 鎖 60 (task #23 / #266) —— owner:「FPS 鎖定60 節省client端資源，
 * 不然手機玩一場就很燙」。
 *
 * ⚠️ 這裡不斷言「設定值是不是 60」。設定值等於零證據 —— #23 的失敗形狀就是
 * 「加了一個設定但沒有人讀它」。這裡量的是**一秒鐘之內 `scene.render()`
 * 真的被呼叫了幾次**，做法是掛在 Babylon 自己的 `onAfterRenderObservable`
 * 上數次數，然後用一個假的 120 Hz 時鐘去驅動場景**出貨用的那個 frame()**
 * （production 的 `runRenderLoop` 呼叫的就是同一個 method）。
 *
 * 為什麼是 120 Hz：手機的 ProMotion / 高刷面板就是 120 Hz，而 rAF 是照面板
 * 頻率喚醒的。沒有上限的 loop 在那上面就是每秒 120 張 —— 那才是「很燙」。
 *
 * 覆蓋範圍與誠實的邊界：
 *   · StorePreview（大廳英靈殿 / 選角立繪 / 回合勝者卡）—— 這條 loop 在這次
 *     修改之前**完全沒有上限**，是四條裡唯一漏掉的一條；
 *   · LoginScene / IntermissionScene —— 本來就有軟上限，這裡把它釘住；
 *   · GameApp 的競技場 loop 無法在 headless 建構（Babylon engine / canvas /
 *     socket），所以它是靠「用同一份 `shouldRenderFrame`」來覆蓋的，下面
 *     直接對那個函式跑真實的面板時序。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { shouldRenderFrame, minFrameMs, MENU_FPS_CAP } from "./frameCap";
import { StorePreview } from "./StorePreview";
import { LoginScene } from "./menu/LoginScene";
import { IntermissionScene } from "./intermission/IntermissionScene";

// --- OffscreenCanvas 2D stub (幾個場景的塵埃需要 DynamicTexture) -------------
class StubGradient {
  addColorStop(): void {}
}
class StubCtx {
  fillStyle: unknown = "";
  globalAlpha = 1;
  createRadialGradient(): StubGradient {
    return new StubGradient();
  }
  createLinearGradient(): StubGradient {
    return new StubGradient();
  }
  clearRect(): void {}
  fillRect(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }
  putImageData(): void {}
}
class StubCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): StubCtx {
    return new StubCtx();
  }
}
let hadOffscreen: boolean;
beforeAll(() => {
  hadOffscreen = "OffscreenCanvas" in globalThis;
  if (!hadOffscreen) (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubCanvas;
});
afterAll(() => {
  if (!hadOffscreen) delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

/** 一台 120 Hz 面板一秒鐘會送來的 rAF 時刻（含第 0 張）。 */
const HZ120 = Array.from({ length: 121 }, (_, i) => (i * 1000) / 120);
/** 一台 60 Hz 面板同樣的一秒鐘。 */
const HZ60 = Array.from({ length: 61 }, (_, i) => (i * 1000) / 60);

/**
 * 掛上 Babylon 自己的 after-render observable 去數「真的畫了幾張」。
 * 這不是我們自己記的旗標 —— 是引擎完成一次 render 才會 fire 的東西。
 */
function countRenders(scene: Scene, drive: () => void): number {
  let n = 0;
  const obs = scene.onAfterRenderObservable.add(() => {
    n++;
  });
  drive();
  scene.onAfterRenderObservable.remove(obs);
  return n;
}

// ---------------------------------------------------------------------------
// 1) StorePreview —— 這次真正被修好的那一條
// ---------------------------------------------------------------------------
describe("StorePreview 的 render loop 被鎖在 60 (fps-cap-60)", () => {
  it("120 Hz 面板送 120 張，一秒內只畫約 60 張", () => {
    cover("fps-cap-60");
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera("probe-cam", new Vector3(0, 1, -4), scene);
    let clock = 0;
    const preview = new StorePreview(scene, undefined, { now: () => clock });
    const step = (preview as unknown as { frame(): void }).frame.bind(preview);

    const drawn = countRenders(scene, () => {
      for (const t of HZ120) {
        clock = t;
        step();
      }
    });

    // 上限是 60：允許 ±3 的相位誤差，但絕不可以接近 120
    expect(drawn).toBeGreaterThanOrEqual(55);
    expect(drawn).toBeLessThanOrEqual(64);
    preview.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("60 Hz 面板不會被 slack 誤殺成 30 fps", () => {
    cover("fps-cap-60");
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera("probe-cam", new Vector3(0, 1, -4), scene);
    let clock = 0;
    const preview = new StorePreview(scene, undefined, { now: () => clock });
    const step = (preview as unknown as { frame(): void }).frame.bind(preview);

    const drawn = countRenders(scene, () => {
      for (const t of HZ60) {
        clock = t;
        step();
      }
    });

    // 60 Hz 面板每一張都該畫 —— 這正是 FRAME_CAP_SLACK_MS 存在的理由
    expect(drawn).toBeGreaterThanOrEqual(58);
    preview.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("暫停時一張都不畫（#258 的省電閘沒有被上限機制吃掉）", () => {
    cover("fps-cap-60");
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera("probe-cam", new Vector3(0, 1, -4), scene);
    let clock = 0;
    const preview = new StorePreview(scene, undefined, { now: () => clock });
    const step = (preview as unknown as { frame(): void }).frame.bind(preview);
    preview.setPaused(true);

    const drawn = countRenders(scene, () => {
      for (const t of HZ120) {
        clock = t;
        step();
      }
    });
    expect(drawn).toBe(0);
    preview.dispose();
    scene.dispose();
    engine.dispose();
  });
});

// ---------------------------------------------------------------------------
// 2) 兩個選單場景 —— 本來就有上限，這裡釘住不准漂走
// ---------------------------------------------------------------------------
describe("選單場景的 render loop 也被鎖在 60 (fps-cap-60)", () => {
  it("LoginScene：120 Hz 面板一秒內只畫約 60 張", () => {
    cover("fps-cap-60");
    let clock = 0;
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      now: () => clock,
      epicFx: false,
    });
    const step = (scene as unknown as { frame(): void }).frame.bind(scene);
    const babylon = (scene as unknown as { scene: Scene }).scene;

    const drawn = countRenders(babylon, () => {
      for (const t of HZ120) {
        clock = t;
        step();
      }
    });
    expect(drawn).toBeGreaterThanOrEqual(55);
    expect(drawn).toBeLessThanOrEqual(64);
    scene.dispose();
  });

  it("IntermissionScene：120 Hz 面板一秒內只畫約 60 張", () => {
    cover("fps-cap-60");
    let clock = 0;
    const scene = new IntermissionScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      now: () => clock,
    });
    const step = (scene as unknown as { frame(): void }).frame.bind(scene);
    const babylon = (scene as unknown as { scene: Scene }).scene;

    const drawn = countRenders(babylon, () => {
      for (const t of HZ120) {
        clock = t;
        step();
      }
    });
    expect(drawn).toBeGreaterThanOrEqual(55);
    expect(drawn).toBeLessThanOrEqual(64);
    scene.dispose();
  });
});

// ---------------------------------------------------------------------------
// 3) 競技場 loop 用的同一份規則。GameApp 本身無法 headless 建構，所以這裡
//    直接對它呼叫的那個函式跑真實面板時序 —— 這是這條 loop 能拿到的最強證據。
// ---------------------------------------------------------------------------
describe("競技場 loop 的節流規則 (fps-cap-60)", () => {
  function countAllowed(times: readonly number[], cap: number): number {
    let last = -Infinity;
    let n = 0;
    for (const t of times) {
      if (!shouldRenderFrame(t, last, cap)) continue;
      last = t;
      n++;
    }
    return n;
  }

  it("cap 60 + 120 Hz 面板 → 一秒 60 張，不是 120", () => {
    cover("fps-cap-60");
    const n = countAllowed(HZ120, 60);
    expect(n).toBeGreaterThanOrEqual(55);
    expect(n).toBeLessThanOrEqual(64);
  });

  it("cap 60 + 60 Hz 面板 → 一秒 60 張（不會掉成 30）", () => {
    cover("fps-cap-60");
    expect(countAllowed(HZ60, 60)).toBeGreaterThanOrEqual(58);
  });

  it("cap 30 → 一秒約 30 張", () => {
    cover("fps-cap-60");
    const n = countAllowed(HZ120, 30);
    expect(n).toBeGreaterThanOrEqual(28);
    expect(n).toBeLessThanOrEqual(34);
  });

  it("cap 0（玩家選了「無上限」）→ 面板送幾張就畫幾張", () => {
    cover("fps-cap-60");
    expect(countAllowed(HZ120, 0)).toBe(HZ120.length);
  });

  it("選單/預覽場景共用的上限就是 60，不是某個抄歪的數字", () => {
    cover("fps-cap-60");
    expect(MENU_FPS_CAP).toBe(60);
    // slack 必須小於 120 Hz 的間隔 (8.33 ms)，否則高刷面板會偷渡回 120 fps
    expect(minFrameMs(MENU_FPS_CAP)).toBeGreaterThan(1000 / 120);
    // …也必須小於 60 Hz 的間隔，否則 60 Hz 面板會被砍半
    expect(minFrameMs(MENU_FPS_CAP)).toBeLessThan(1000 / 60);
  });
});
